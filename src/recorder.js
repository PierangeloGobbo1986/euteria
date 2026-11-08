// Recording takes over the song: the input chosen (the microphone of the
// device, or an audio interface such as a guitar processor on USB) is
// recorded by the audio engine while the song plays (src/engine-processor.js)
// and kept as a track of the song, a "take". No user interface here: the page
// shows `state`, `devices` and `level`, and listens to `onchange`.
//
// - Inputs: the browser names them only once the page may use the
//   microphone, so the list asks for that permission first. The input chosen
//   is kept in this browser (by name too: Safari renames the ids).
// - Lining up: each input sample comes tied to the moment of the song the
//   engine sent out at the same time. The devices add a delay of their own
//   (the sound on its way to the ears, the input on its way to the page),
//   which the browser reports in part; what it misses is corrected with the
//   take's Sync, remembered for the next takes from the same input.
// - Tempo and key: a take recorded while the song played slower, faster or
//   transposed is brought back to the song's own tempo and key
//   (src/render-worker.js), so that it then follows them as the stems do.
// - With the loop on, each pass is a take, up to three, then playback stops
//   (a first pass shorter than a second does not count).
// - Level: a take comes in far quieter than a mastered song, so once recorded
//   it is raised to sit a little under the song, its peaks held under full
//   scale (src/level.js).
// - While it is recorded, its waveform is kept as it comes in (`live`), for the
//   timeline.
// - Each take is encoded to MP3 at once (src/encode-worker.js), ready for
//   Save and Share project.
// - On iPhone the audio session plays and records while the input is open,
//   and only plays again once it is closed.

import { runRenderWorker } from "./player.js";
import { takeKey, takeMember } from "./project.js";
import { resamplePoly } from "./resample.js";
import { integratedLoudness, takeGain, levelChannels } from "./level.js";
import { PEAK_BUCKET } from "./peaks.js";

const INPUT_KEY = "euteria.input";
const SYNC_KEY = "euteria.inputSync";
const LOOP_TAKES = 3;
const MIN_TAKE_SECONDS = 1;
const KEEP_OPEN_MS = 20000; // the input stays open a while after a take, ready for the next one
const CHECK_MS = 8000; // the level shown after an input is chosen
const MP3_RATES = [32000, 44100, 48000];
const LIVE_ZOOM = 32; // the most the waveform of a take being recorded is enlarged

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function load(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch (_) {
    return null;
  }
}

function keep(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_) {}
}

function newId() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// The two channels are the same signal (a mono input given as stereo).
function sameChannels(a, b) {
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 1) return false;
  return true;
}

// The passes of a recording: [{k0, k1, song0}], input samples k0..k1 heard
// with the song from song sample song0 on. U0: the song sample (along the
// playback path, loop passes counted on) heard when input sample 0 was
// played; r: song samples per input sample (the tempo).
function passes(frames, U0, r, loop) {
  if (!loop || !loop.on) return [{ k0: 0, k1: frames, song0: U0 }];
  const span = loop.b - loop.a;
  const out = [];
  let k0 = 0;
  for (let m = 0; k0 < frames && m < 100000; m++) {
    const kb = Math.ceil((loop.b + m * span - U0) / r);
    const k1 = Math.min(frames, Math.max(k0, kb));
    if (k1 > k0) out.push({ k0, k1, song0: U0 + k0 * r - m * span });
    k0 = k1;
  }
  return out;
}

// Encodes channels (Int16Array or Float32Array, one or two) to MP3.
function encodeMp3(channels, sampleRate, bitrate) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./encode-worker.js", import.meta.url));
    worker.onmessage = (event) => {
      const m = event.data;
      if (m.type === "progress") return;
      worker.terminate();
      if (m.type === "error") reject(new Error(m.message));
      else resolve(m);
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "The encoder stopped."));
    };
    const [left, right = null] = channels;
    const transfer = [left.buffer];
    if (right) transfer.push(right.buffer);
    worker.postMessage({ id: 1, left, right, sampleRate, bitrate }, transfer);
  });
}

// What went wrong opening an input, said plainly.
function inputError(error) {
  const name = error && error.name;
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "EUTERIA may not use the microphone. Allow it for this site in the browser's settings, then press Record again.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No input to record from was found: connect a microphone or an audio interface.";
  if (name === "NotReadableError" || name === "AbortError") return "The input cannot be read: another app may be using it.";
  return `The input could not be opened. ${(error && error.message) || error}`;
}

export class Recorder {
  // phone: less memory for the takes of a song.
  constructor(player, { phone = false } = {}) {
    this.player = player;
    this.budget = phone ? 180e6 : 1.5e9; // bytes of takes in memory, per song
    this.devices = this.listFrom([]); // [{id, label}], the default input first (id "")
    this.named = false; // the browser gave the inputs' names
    this.choice = load(INPUT_KEY) || { id: "", label: "" };
    this.syncs = load(SYNC_KEY) || {};
    this.input = null; // {id, stream, node, label, latency}
    this.state = "idle"; // idle, opening, recording, finishing
    this.level = 0; // the input's peak lately, 0..1
    this.current = null; // the recording under way
    this.closeTimer = null;
    this.encoding = new Set(); // takes being encoded
    this.onchange = null;
    this.onmessage = null; // (text, kind)
    this.ontakes = null; // (tracks, reason, raisedDb) takes added
    this.onlevel = null;
    this.live = null; // the waveform of the take being recorded
    this.onlive = null; // live changed
    // Tests: an AudioNode factory used instead of the microphone, and the
    // delay of the devices.
    this.testInput = null;
    this.latencyOverride = null;
    this.idleWaiters = [];
    if (Recorder.supported() && navigator.mediaDevices.addEventListener) {
      navigator.mediaDevices.addEventListener("devicechange", () => this.refresh());
    }
  }

  static supported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && navigator.mediaDevices.enumerateDevices) && typeof AudioWorkletNode !== "undefined";
  }

  changed() {
    if (this.onchange) this.onchange();
  }

  setState(state) {
    this.state = state;
    if (state === "idle") for (const w of this.idleWaiters.splice(0)) w();
    this.changed();
  }

  say(text, kind = "") {
    if (this.onmessage) this.onmessage(text, kind);
  }

  get busy() {
    return this.state !== "idle";
  }

  // ----- inputs ---------------------------------------------------------------------

  listFrom(inputs) {
    const list = [];
    let defaultName = "";
    for (const d of inputs) {
      if (d.deviceId === "communications") continue;
      if (d.deviceId === "default") {
        defaultName = (d.label || "").replace(/^Default\s*-\s*/i, "");
        continue;
      }
      if (!d.deviceId) continue;
      list.push({ id: d.deviceId, label: d.label || `Input ${list.length + 1}` });
    }
    return [{ id: "", label: defaultName ? `Default (${defaultName})` : "Default input" }, ...list];
  }

  // The inputs again. ask: may ask the permission that gives their names
  // (the default input, or the one chosen, is opened for that, and its level
  // shown for a few seconds).
  async refresh({ ask = false } = {}) {
    if (!Recorder.supported()) return;
    try {
      let inputs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput");
      if (ask && !inputs.some((d) => d.label) && !this.busy) {
        await this.check();
        inputs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput");
      }
      // Without their names the inputs cannot be told apart: the default one only.
      this.named = inputs.some((d) => d.label);
      this.devices = this.listFrom(this.named ? inputs : []);
      // The input chosen, found again by its name if its id changed.
      const c = this.choice;
      if (c.id && !this.devices.some((d) => d.id === c.id) && c.label) {
        const same = this.devices.find((d) => d.label === c.label);
        if (same) this.choose(same.id, { quiet: true });
      }
    } catch (error) {
      if (ask) this.say(inputError(error), "error");
    }
    this.changed();
  }

  // The input shown in the list: the one chosen if it is there.
  get selected() {
    const c = this.choice;
    return this.devices.some((d) => d.id === c.id) ? c.id : "";
  }

  choose(id, { quiet = false } = {}) {
    const device = this.devices.find((d) => d.id === id);
    this.choice = { id: id || "", label: device && id ? device.label : "" };
    keep(INPUT_KEY, this.choice);
    if (!quiet && !this.busy) this.check();
    this.changed();
  }

  // Opens the input chosen for a few seconds: its level shows that it works.
  async check() {
    if (this.busy) return;
    try {
      if (this.input && this.input.id !== this.choice.id) this.close();
      await this.open();
      this.keepOpen(CHECK_MS);
    } catch (error) {
      this.say(inputError(error), "error");
    }
  }

  // ----- the input open ------------------------------------------------------------

  sessionRecord() {
    try {
      if ("audioSession" in navigator) navigator.audioSession.type = "play-and-record";
    } catch (_) {}
  }

  sessionPlay() {
    try {
      if ("audioSession" in navigator) navigator.audioSession.type = "playback"; // plays even with the iPhone's silent switch on
    } catch (_) {}
  }

  getStream(id) {
    return navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: id ? { exact: id } : undefined,
        // The sound as it is: these are made for calls, and spoil music.
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: { ideal: 2 },
      },
      video: false,
    });
  }

  // Opens the input chosen and connects it to the engine.
  async open() {
    const player = this.player;
    await player.ensureEngine();
    const engine = player.engine;
    engine.onrecord = (m) => this.receive(m);
    clearTimeout(this.closeTimer);
    const want = this.choice.id;
    if (this.input && this.input.id === want) return this.input;
    this.close();
    let node;
    let stream = null;
    let label;
    let latency = 0;
    let id = want;
    if (this.testInput) {
      node = this.testInput(player.context);
      label = "Test input";
    } else {
      this.sessionRecord();
      try {
        try {
          stream = await this.getStream(want);
        } catch (error) {
          if (!want || !error || !["OverconstrainedError", "NotFoundError"].includes(error.name)) throw error;
          this.say("The input chosen is not connected: EUTERIA records from the default input.", "error");
          id = "";
          stream = await this.getStream("");
        }
      } catch (error) {
        this.sessionPlay();
        throw error;
      }
      const track = stream.getAudioTracks()[0];
      label = (track && track.label) || "";
      const settings = track && track.getSettings ? track.getSettings() : {};
      latency = isFinite(settings.latency) ? settings.latency : 0;
      node = player.context.createMediaStreamSource(stream);
      if (track) track.addEventListener("ended", () => this.lost(stream));
    }
    node.connect(engine.node);
    engine.setMeter(true);
    this.input = { id, stream, node, label, latency };
    if (!this.named && !this.testInput) this.refresh();
    this.changed();
    return this.input;
  }

  close() {
    clearTimeout(this.closeTimer);
    const input = this.input;
    if (!input) return;
    this.input = null;
    try {
      input.node.disconnect();
    } catch (_) {}
    if (input.stream) for (const t of input.stream.getTracks()) t.stop();
    if (this.player.engine) this.player.engine.setMeter(false);
    this.level = 0;
    if (!this.testInput) this.sessionPlay();
    this.changed();
  }

  keepOpen(ms = KEEP_OPEN_MS) {
    clearTimeout(this.closeTimer);
    this.closeTimer = setTimeout(() => {
      if (!this.busy) this.close();
    }, ms);
  }

  // The input went away (unplugged): the take ends there.
  lost(stream) {
    if (!this.input || this.input.stream !== stream) return;
    if (this.state === "recording") {
      this.say("The input was disconnected: the take ends there.", "error");
      this.player.stopRecording();
    } else this.close();
  }

  // ----- recording --------------------------------------------------------------------

  // Bytes the takes of the open song take in memory.
  usedBytes() {
    return this.player.takes.reduce((sum, t) => sum + t.length * (t.take.channels || 2) * 2, 0);
  }

  // No room left for a take of a second (stereo).
  get full() {
    const sr = this.player.context ? this.player.context.sampleRate : 48000;
    return this.budget - this.usedBytes() < sr * 4 * MIN_TAKE_SECONDS;
  }

  syncFor(label) {
    const v = +this.syncs[label || ""];
    return isFinite(v) ? Math.round(v) : 0;
  }

  rememberSync(label, ms) {
    this.syncs[label || ""] = Math.round(ms);
    keep(SYNC_KEY, this.syncs);
  }

  // Starts a take: opens the input, then records (and plays, if paused).
  async start() {
    const player = this.player;
    if (this.busy || !player.song || player.busy || player.recording) return false;
    if (this.full) {
      this.say("There is no more room for takes in this song: delete one with its ✕ first.", "error");
      return false;
    }
    this.setState("opening");
    let input;
    try {
      input = await this.open();
    } catch (error) {
      this.say(inputError(error), "error");
      this.setState("idle");
      return false;
    }
    const song = player.song;
    if (!song || player.busy || player.recording) {
      this.keepOpen();
      this.setState("idle");
      return false;
    }
    const ctx = player.context;
    const sr = ctx.sampleRate;
    const seconds = (ctx.baseLatency || 0) + (ctx.outputLatency || 0) + (input.latency || 0);
    const latency = this.latencyOverride != null ? this.latencyOverride : Math.round(seconds * sr);
    this.current = { id: 0, song, label: input.label, sync: this.syncFor(input.label), begin: null, chunks: [], frames: 0, bytes: 0, full: false, gain: 0 };
    const cur = this.current;
    this.state = "recording";
    const id = await player.startRecording({
      latency,
      takes: player.loop.on ? LOOP_TAKES : 0,
      minFirst: Math.round(MIN_TAKE_SECONDS * sr),
      tail: latency + 256,
    });
    if (!id) {
      this.current = null;
      this.keepOpen();
      this.setState("idle");
      return false;
    }
    cur.id = id;
    this.changed();
    return true;
  }

  // Ends the take (the end arrives from the engine).
  stop() {
    if (this.state === "recording") this.player.stopRecording();
  }

  receive(m) {
    if (m.type === "level") {
      this.level = m.peak;
      if (this.onlevel) this.onlevel(m.peak);
      return;
    }
    const cur = this.current;
    if (!cur || (cur.id && m.id !== cur.id)) return;
    if (m.type === "rec-begin") {
      cur.begin = m;
      this.startLive(cur);
    } else if (m.type === "rec-data") {
      const chunk = m.channels.map((b) => new Int16Array(b));
      cur.chunks.push(chunk);
      cur.frames += m.frames;
      cur.bytes += m.frames * 2 * m.channels.length;
      this.addLive(chunk, m.frames);
      if (!cur.full && this.usedBytes() + cur.bytes >= this.budget) {
        cur.full = true;
        this.player.stopRecording();
      }
    } else if (m.type === "rec-end") this.finish(cur, m);
  }

  // end: the engine's "rec-end" ({reason, inHops, outHops}: the loudness of
  // the input and of what played, every 100 ms).
  async finish(cur, end) {
    const player = this.player;
    const reason = end.reason;
    this.current = null;
    player.recordingEnded();
    if (reason === "loop") player.stop(); // every pass recorded: back to the start of the loop
    this.setState("finishing");
    try {
      cur.gain = takeGain(integratedLoudness(end.inHops || []), integratedLoudness(end.outHops || []));
      const tracks = cur.begin && cur.frames ? await this.takesFrom(cur) : [];
      if (cur.song !== player.song) return; // the song was closed meanwhile
      for (const t of tracks) player.addTake(t);
      this.endLive(); // before the takes are drawn: their rows replace it
      if (this.ontakes) this.ontakes(tracks, cur.full ? "full" : reason, cur.gain);
    } catch (error) {
      this.say(`The take could not be kept. ${(error && error.message) || error}`, "error");
    } finally {
      this.endLive();
      this.keepOpen();
      this.setState("idle");
    }
  }

  // ----- the take as it comes in ----------------------------------------------------

  // Its waveform for the timeline, as src/peaks.js makes it but 16-bit:
  // buckets of PEAK_BUCKET samples of the song (an input recorded while the
  // song plays slower or faster fills a bucket with more or fewer samples),
  // from `offset` seconds of the song on, Sync included. It begins where
  // playback started with the take (before, the stretcher is getting ready).
  // With the loop on, each pass starts again from the start of the loop.
  startLive(cur) {
    const b = cur.begin;
    const r = b.rate;
    const sr = b.sampleRate;
    const U0 = b.e0 - b.latency * r; // the song sample (along the playback path) heard with input sample 0
    const from = b.from !== null && b.from !== undefined && b.from > U0 ? b.from : U0;
    const span = b.loop.b - b.loop.a;
    this.live = {
      min: new Int16Array(4096),
      max: new Int16Array(4096),
      filled: 0,
      peak: 0, // the loudest sample of the pass so far
      offset: from / sr + cur.sync / 1000,
      skip: Math.ceil((from - U0) / r), // input samples before it
      per: PEAK_BUCKET / r,
      count: 0,
      lo: 32767,
      hi: -32768,
      frame: 0,
      // The input sample where the next pass of the loop begins.
      nextPass: b.loop.on && span > 0 ? Math.max(0, (b.loop.b - U0) / r) : Infinity,
      passFrames: span / r,
      passOffset: b.loop.a / sr + cur.sync / 1000,
    };
    this.liveChanged();
  }

  addLive(chunk, frames) {
    const v = this.live;
    if (!v) return;
    const L = chunk[0];
    const R = chunk[1] || chunk[0];
    for (let i = 0; i < frames; i++, v.frame++) {
      if (v.frame < v.skip) continue;
      if (v.frame >= v.nextPass) {
        v.filled = 0;
        v.peak = 0;
        v.count = 0;
        v.lo = 32767;
        v.hi = -32768;
        v.offset = v.passOffset;
        v.nextPass += v.passFrames;
      }
      const l = L[i];
      const r = R[i];
      if (l < v.lo) v.lo = l;
      if (l > v.hi) v.hi = l;
      if (r < v.lo) v.lo = r;
      if (r > v.hi) v.hi = r;
      if (++v.count >= v.per) {
        if (v.filled === v.min.length) {
          const min = new Int16Array(v.min.length * 2);
          const max = new Int16Array(v.max.length * 2);
          min.set(v.min);
          max.set(v.max);
          v.min = min;
          v.max = max;
        }
        v.min[v.filled] = v.lo;
        v.max[v.filled] = v.hi;
        v.filled++;
        v.peak = Math.max(v.peak, -v.lo, v.hi);
        v.count -= v.per;
        v.lo = 32767;
        v.hi = -32768;
      }
    }
    this.liveChanged();
  }

  endLive() {
    if (!this.live) return;
    this.live = null;
    this.liveChanged();
  }

  liveChanged() {
    if (this.onlive) this.onlive();
  }

  // What the timeline draws: {offset, peaks, scale}, or null. The waveform is
  // drawn as large as it can be (up to LIVE_ZOOM times), so that a quiet input,
  // which the take's level will raise anyway, shows as clearly as a loud one;
  // scale turns its 16-bit values into the 8-bit ones of the other rows.
  liveView() {
    const v = this.live;
    if (!v) return null;
    const zoom = Math.max(1, Math.min(LIVE_ZOOM, (0.8 * 32768) / Math.max(1, v.peak)));
    return { offset: v.offset, peaks: { min: v.min.subarray(0, v.filled), max: v.max.subarray(0, v.filled) }, scale: zoom / 256 };
  }

  // The recording as takes of the song: [{key, title, channels, length,
  // take}], each lined up, at the song's own tempo and key.
  async takesFrom(cur) {
    const player = this.player;
    const begin = cur.begin;
    const sr = begin.sampleRate;
    const n = cur.frames;
    let channels = [];
    for (let c = 0; c < begin.channels; c++) {
      const all = new Int16Array(n);
      let at = 0;
      for (const chunk of cur.chunks) {
        all.set(chunk[c], at);
        at += chunk[c].length;
      }
      channels.push(all);
    }
    cur.chunks = null;
    if (channels.length === 2 && sameChannels(channels[0], channels[1])) channels = [channels[0]];
    const r = begin.rate;
    const U0 = begin.e0 - begin.latency * r;
    const end = cur.song.duration * sr;
    const pieces = [];
    passes(n, U0, r, begin.loop).forEach((p, i) => {
      let { k0, k1, song0 } = p;
      // The take begins where playback started with it, and never before the song.
      const from = Math.max(0, i === 0 && begin.from !== null && begin.from !== undefined ? begin.from : 0);
      if (song0 < from) {
        const cut = Math.ceil((from - song0) / r);
        k0 += cut;
        song0 += cut * r;
      }
      const over = song0 + (k1 - k0) * r - end;
      if (over > 0) k1 -= Math.floor(over / r);
      if ((k1 - k0) * r >= MIN_TAKE_SECONDS * sr) pieces.push({ k0, k1, song0 });
    });
    const numbers = player.takes.map((t) => +((/(\d+)\s*$/.exec(t.title) || [])[1] || 0));
    let next = Math.max(0, ...numbers) + 1;
    const out = [];
    for (const p of pieces) {
      let parts = channels.map((c) => c.slice(p.k0, p.k1));
      let length = p.k1 - p.k0;
      if (r !== 1 || begin.semitones !== 0) {
        const reply = await runRenderWorker({ type: "convert", channels: parts.map((c) => c.buffer), length, sampleRate: sr, rate: 1 / r, semitones: -begin.semitones });
        parts = reply.channels.map((b) => new Int16Array(b));
        length = reply.length;
      }
      if (cur.gain >= 0.1) await levelChannels(parts, length, sr, cur.gain);
      const id = newId();
      const take = {
        id,
        title: `Take ${next++}`,
        member: takeMember(id),
        start: p.song0 / sr,
        syncMs: cur.sync,
        channels: parts.length,
        input: cur.label,
        recorded: new Date().toISOString(),
        tempoPercent: Math.round(r * 100),
        semitones: begin.semitones,
        info: null,
        saved: false,
        mp3: null,
        crc: null,
      };
      this.encode(take, parts.map((c) => c.slice()), sr);
      out.push({ key: takeKey(id), title: take.title, channels: parts, length, take });
    }
    return out;
  }

  // The take as MP3 (320 kbps stereo, 160 kbps mono), in the background.
  encode(take, channels, sampleRate) {
    const work = (async () => {
      let data = channels;
      let rate = sampleRate;
      if (!MP3_RATES.includes(rate)) {
        const to = rate % 44100 === 0 ? 44100 : 48000;
        data = channels.map((c) => resamplePoly(Float32Array.from(c, (v) => v / 32768), to, rate));
        rate = to;
      }
      const result = await encodeMp3(data, rate, data.length === 2 ? 320 : 160);
      take.mp3 = result.bytes;
      take.crc = result.crc;
      take.info = result.info;
    })();
    this.encoding.add(work);
    work
      .catch((error) => {
        take.error = (error && error.message) || String(error);
      })
      .finally(() => {
        this.encoding.delete(work);
        this.changed();
      });
  }

  // Resolves once no take is being recorded, lined up or encoded (a take
  // being recorded is ended first).
  async settle() {
    this.stop();
    if (this.busy) await new Promise((resolve) => this.idleWaiters.push(resolve));
    while (this.encoding.size) await Promise.allSettled([...this.encoding]);
    await sleep(0);
  }

  // Resolves once the takes recorded are lined up and encoded; a take being
  // recorded goes on.
  async encoded() {
    while (this.state === "finishing") await sleep(50);
    while (this.encoding.size) await Promise.allSettled([...this.encoding]);
  }
}
