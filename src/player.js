// The player of the app: one audio context and one engine for the whole
// session, the song that is open, its tracks (the takes recorded over it
// included) and the practice controls (tempo, key, loop), and the MP3
// export. No user interface here: the page listens to `onupdate` (something
// shown changed) and `onsettings` (a setting worth saving changed).
//
// While a take is being recorded (src/recorder.js) nothing may move the song
// under it: jumps, tempo, key and the loop wait; Pause and Stop end the take.

import { Engine } from "./engine.js";
import { openProject, toInt16, TRACK_TITLES, STEM_NAMES, BOOST_CEILING, stemsExportFileName, isTake, takeStartSample } from "./project.js";
import { int16Peaks } from "./peaks.js";

export const MIN_LOOP = 0.25; // seconds, as the engine
export const TEMPO_RANGE = [0.5, 2];
export const KEY_RANGE = [-12, 12];
const NEW_LOOP_SECONDS = 8;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => (timer = setTimeout(() => reject(new Error(message)), ms)))]).finally(() =>
    clearTimeout(timer)
  );
}

async function isZip(file) {
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  return head[0] === 0x50 && head[1] === 0x4b;
}

// A plain audio file becomes a song with the Original Track only.
async function openAudio(file, context, onProgress) {
  onProgress(0, 1, "original");
  let buffer;
  try {
    buffer = await context.decodeAudioData(await file.arrayBuffer());
  } catch (_) {
    throw new Error(`This browser cannot read ${file.name}: it is neither an EUTERIA project nor an audio file it knows.`);
  }
  if (!buffer.length) throw new Error(`${file.name} contains no audio.`);
  const channels = toInt16(buffer, 0, buffer.length);
  const title = file.name.replace(/\.[^.]+$/, "") || "Song";
  onProgress(1, 1, null);
  return {
    manifest: null,
    title,
    songName: title,
    tracks: [{ key: "original", title: TRACK_TITLES.original, bus: "pitched", channels, length: buffer.length, gain: 1, on: true }],
    alignment: null,
    sampleRate: context.sampleRate,
    duration: buffer.length / context.sampleRate,
  };
}

export function runRenderWorker(message, onProgress) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./render-worker.js", import.meta.url));
    const transfer = [...(message.channels || [])];
    for (const t of message.tracks || []) transfer.push(...t.channels);
    worker.onmessage = (event) => {
      const m = event.data;
      if (m.type === "progress") {
        if (onProgress) onProgress(m);
        return;
      }
      worker.terminate();
      if (m.type === "error") reject(Object.assign(new Error(m.message), { tracks: m.tracks }));
      else resolve(m);
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "The export stopped."));
    };
    worker.postMessage(message, transfer);
  });
}

export class Player {
  constructor() {
    this.context = null;
    this.engine = null;
    this.enginePromise = null;
    this.song = null; // {title, songName, duration, sampleRate, kind, manifest, alignment}
    this.tracks = []; // display order: {key, title, bus, length, gain, on}
    this.position = 0;
    this.playing = false;
    this.rate = 1;
    this.semitones = 0;
    this.loop = { on: false, start: 0, end: 0 };
    this.busy = null; // null, "opening" or "exporting"
    this.recording = false; // a take is being recorded
    this.recordId = 0;
    this.lost = []; // tracks a failed export could not give back
    this.onupdate = null;
    this.onsettings = null;
    this.wakeLock = null;
    // The tracks whose waveform the page draws (null: every track); their
    // envelope is computed when the song opens.
    this.peakKeys = null;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && this.playing) this._wake(true);
    });
  }

  static supported() {
    return typeof AudioWorkletNode !== "undefined" && typeof WebAssembly === "object";
  }

  _update() {
    if (this.onupdate) this.onupdate();
  }

  _changed() {
    this._update();
    if (this.onsettings) this.onsettings();
  }

  // Creates and resumes the audio context. Call it synchronously at the start
  // of every tap that leads to sound: iOS starts audio only inside a gesture.
  unlock() {
    if (!this.context) {
      if ("audioSession" in navigator) {
        try {
          navigator.audioSession.type = "playback"; // plays even with the iPhone's silent switch on
        } catch (_) {}
      }
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.context = new AudioCtx({ latencyHint: "playback" });
    }
    if (this.context.state !== "running") this.context.resume().catch(() => {});
    return this.context;
  }

  async ensureEngine() {
    const context = this.unlock();
    if (this.engine) return context;
    if (!this.enginePromise) this.enginePromise = this._startEngine(context);
    try {
      await this.enginePromise;
    } catch (error) {
      this.enginePromise = null;
      throw error;
    }
    return context;
  }

  async _startEngine(context) {
    const engine = await withTimeout(Engine.create(context), 15000, "The audio engine did not start. Reload the page and try again.");
    engine.node.connect(context.destination);
    engine.onposition = (heard, playing) => {
      this.position = heard;
      if (this.playing && !playing) this._wake(false);
      this.playing = playing;
      this._update();
    };
    engine.onended = () => {
      this.playing = false;
      this._wake(false);
      this._changed();
    };
    this.engine = engine;
  }

  // ----- songs ------------------------------------------------------------

  // Opens a project (.euteria, .musicproj) or an audio file; the song that was
  // open is closed first, so that two songs are never in memory together.
  // onProgress(done, total, trackKey) is called before each track is decoded.
  async open(file, onProgress = () => {}) {
    if (this.busy) throw new Error("Wait for the current operation to finish.");
    this.busy = "opening";
    this._update();
    try {
      const context = await this.ensureEngine();
      await this.close();
      const project = await isZip(file);
      const song = project ? await openProject(file, context, onProgress) : await openAudio(file, context, onProgress);
      this._load(song, project ? "project" : "audio");
      await this.engine.sync();
      return this.song;
    } finally {
      this.busy = null;
      this._update();
    }
  }

  _load(song, kind) {
    const engine = this.engine;
    let wanted = new Set(song.tracks.map((t) => t.key).filter((k) => !this.peakKeys || this.peakKeys.includes(k)));
    if (!wanted.size) wanted = new Set([song.tracks[0].key]);
    this.tracks = song.tracks.map((t) => ({
      key: t.key,
      title: t.title,
      bus: t.bus,
      length: t.length,
      gain: t.gain,
      on: t.on,
      start: t.start || 0,
      take: t.take || null,
      align: t.align || null,
      peaks: wanted.has(t.key) ? int16Peaks(t.channels, t.length) : null,
    }));
    for (const t of song.tracks) engine.addTrack(t); // hands the PCM to the audio thread
    this.song = {
      title: song.title,
      songName: song.songName,
      duration: song.duration,
      sampleRate: song.sampleRate,
      kind,
      manifest: song.manifest || null,
      alignment: song.alignment || null,
    };
    this.lost = [];
    this.position = 0;
    this.playing = false;
    this.rate = 1;
    this.semitones = 0;
    this.loop = { on: false, start: 0, end: 0 };
    engine.setRate(1);
    engine.setSemitones(0);
    engine.setLoop(false, 0, 0);
    engine.seek(0);
  }

  // Frees the song's audio.
  async close() {
    if (!this.song || !this.engine) return;
    if (this.recording) this.engine.recStop(this.recordId);
    this.engine.pause();
    for (const t of this.tracks) this.engine.removeTrack(t.key);
    await this.engine.sync();
    this.song = null;
    this.tracks = [];
    this.position = 0;
    this.playing = false;
    this._wake(false);
    this._update();
  }

  get hasStems() {
    return this.tracks.some((t) => STEM_NAMES.includes(t.key));
  }

  get takes() {
    return this.tracks.filter((t) => t.take);
  }

  // ----- settings ------------------------------------------------------------

  settings() {
    const tracks = {};
    for (const t of this.tracks) tracks[t.key] = { on: t.on, gain: t.gain };
    return { v: 1, tracks, rate: this.rate, semitones: this.semitones, loop: { ...this.loop }, position: this.position };
  }

  // Applies saved settings (any part may be missing).
  apply(s) {
    if (!s || !this.song) return;
    if (s.tracks) {
      for (const t of this.tracks) {
        const v = s.tracks[t.key];
        if (!v) continue;
        if (typeof v.on === "boolean") t.on = v.on;
        if (isFinite(v.gain)) t.gain = clamp(+v.gain, 0, BOOST_CEILING);
        this.engine.setTrack(t.key, { on: t.on, gain: t.gain });
      }
    }
    if (isFinite(s.rate)) this.setRate(s.rate, true);
    if (isFinite(s.semitones)) this.setSemitones(s.semitones, true);
    if (s.loop) this.setLoop(s.loop, true);
    if (isFinite(s.position) && s.position < this.song.duration - 1) this.seek(s.position, true);
    this._update();
  }

  // ----- tracks ----------------------------------------------------------------

  track(key) {
    return this.tracks.find((t) => t.key === key) || null;
  }

  setTrackOn(key, on) {
    const t = this.track(key);
    if (!t || this.busy) return;
    t.on = !!on;
    this.engine.setTrack(key, { on: t.on });
    this._changed();
  }

  setTrackGain(key, gain) {
    const t = this.track(key);
    if (!t || this.busy) return;
    t.gain = clamp(+gain || 0, 0, BOOST_CEILING);
    this.engine.setTrack(key, { gain: t.gain });
    this._changed();
  }

  // Every stem on, the Original Track off; or the Original Track alone. The
  // takes stay as they are.
  allStems() {
    this._only((t) => STEM_NAMES.includes(t.key));
  }

  originalOnly() {
    this._only((t) => t.key === "original");
  }

  _only(test) {
    if (this.busy) return;
    for (const t of this.tracks) {
      if (t.take) continue;
      t.on = test(t);
      this.engine.setTrack(t.key, { on: t.on });
    }
    this._changed();
  }

  // ----- takes -------------------------------------------------------------------

  // track: {key, title, channels (Int16Array[], handed to the audio thread),
  // length, take (src/project.js takeFromManifest()), gain, on}.
  addTake(track) {
    if (!this.song) return;
    const sr = this.context.sampleRate;
    const start = takeStartSample(track.take, sr);
    const peaks = !this.peakKeys || this.peakKeys.includes(track.key) ? int16Peaks(track.channels, track.length) : null;
    const t = { key: track.key, title: track.title, bus: "pitched", length: track.length, gain: track.gain ?? 1, on: track.on ?? true, start, take: track.take, align: null, peaks };
    this.engine.addTrack({ key: t.key, bus: t.bus, channels: track.channels, length: t.length, gain: t.gain, on: t.on, start });
    this.tracks.push(t);
    this._changed();
  }

  removeTake(key) {
    const t = this.track(key);
    if (!t || !t.take || this.busy) return null;
    this.engine.removeTrack(key);
    this.tracks = this.tracks.filter((x) => x !== t);
    this._changed();
    return t;
  }

  // Moves a take earlier (ms < 0) or later, against where it was recorded.
  setTakeSync(key, ms) {
    const t = this.track(key);
    if (!t || !t.take || this.busy) return;
    t.take.syncMs = Math.round(+ms || 0);
    t.start = takeStartSample(t.take, this.context.sampleRate);
    this.engine.setTrack(key, { start: t.start });
    this._changed();
  }

  // ----- recording -------------------------------------------------------------------

  // Starts recording the engine's input, and playback if it was paused (from
  // the playhead, as play()). params: {latency, takes, minFirst, tail} (see
  // src/engine-processor.js). Resolves with the recording's id, or 0.
  async startRecording(params) {
    if (!this.song || this.busy || this.recording) return 0;
    this.unlock();
    try {
      await this.context.resume();
    } catch (_) {}
    let play = null;
    if (!this.playing) {
      play = this.position;
      if (play >= this.song.duration - 0.05) play = this.loop.on ? this.loop.start : 0;
      this.position = play;
    }
    const id = ++this.recordId;
    this.recording = true;
    this.engine.recStart({ ...params, id, play });
    this.playing = true;
    this._wake(true);
    this._update();
    return id;
  }

  // Ends the take now (its end arrives from the engine).
  stopRecording() {
    if (this.recording && this.engine) this.engine.recStop(this.recordId);
  }

  // The engine sent the end of the take.
  recordingEnded() {
    this.recording = false;
    this._update();
  }

  // ----- transport ---------------------------------------------------------------

  async play() {
    if (!this.song || this.busy) return;
    this.unlock();
    try {
      await this.context.resume();
    } catch (_) {}
    let at = this.position;
    if (at >= this.song.duration - 0.05) at = this.loop.on ? this.loop.start : 0;
    this.position = at;
    this.engine.play(at);
    this.playing = true;
    this._wake(true);
    this._update();
  }

  pause() {
    if (!this.engine || !this.playing) return;
    this.stopRecording();
    this.engine.pause();
    this.playing = false;
    this._wake(false);
    this._changed();
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  // Back to the start of the loop, or of the song.
  stop() {
    if (!this.song) return;
    this.stopRecording();
    this.engine.pause();
    this.playing = false;
    this._wake(false);
    this.recordingSeek = true; // the take is over: Stop may jump
    this.seek(this.loop.on ? this.loop.start : 0);
    this.recordingSeek = false;
  }

  // Jumps, tempo, key and loop wait while a take is recorded.
  get locked() {
    return this.recording && !this.recordingSeek;
  }

  seek(seconds, quiet = false) {
    if (!this.song || this.locked) return;
    this.position = clamp(+seconds || 0, 0, this.song.duration);
    this.engine.seek(this.position);
    if (quiet) return;
    this._changed();
  }

  skip(delta) {
    this.seek(this.position + delta);
  }

  setRate(rate, quiet = false) {
    if (this.locked) return;
    this.rate = Math.round(clamp(+rate || 1, TEMPO_RANGE[0], TEMPO_RANGE[1]) * 100) / 100;
    if (this.engine) this.engine.setRate(this.rate);
    if (!quiet) this._changed();
  }

  setSemitones(semitones, quiet = false) {
    if (this.locked) return;
    this.semitones = clamp(Math.round(+semitones || 0), KEY_RANGE[0], KEY_RANGE[1]);
    if (this.engine) this.engine.setSemitones(this.semitones);
    if (!quiet) this._changed();
  }

  // ----- loop ----------------------------------------------------------------------

  setLoop({ on, start, end }, quiet = false) {
    if (!this.song || this.locked) return;
    const d = this.song.duration;
    start = clamp(+start || 0, 0, d);
    end = clamp(+end || 0, 0, d);
    this.loop = { on: !!on && end - start >= MIN_LOOP, start, end };
    this.engine.setLoop(this.loop.on, start, end);
    if (!quiet) this._changed();
  }

  toggleLoop() {
    if (!this.song || this.locked) return;
    const d = this.song.duration;
    let { start, end, on } = this.loop;
    if (!on && end - start < MIN_LOOP) {
      start = Math.min(this.position, Math.max(0, d - NEW_LOOP_SECONDS));
      end = Math.min(d, start + NEW_LOOP_SECONDS);
    }
    this.setLoop({ on: !on, start, end });
  }

  // Moves one end of the loop; the other one moves too if the loop would
  // become shorter than MIN_LOOP.
  setLoopStart(seconds) {
    if (!this.song || this.locked) return;
    const d = this.song.duration;
    const start = clamp(+seconds || 0, 0, Math.max(0, d - MIN_LOOP));
    let end = this.loop.end;
    if (end - start < MIN_LOOP) end = Math.min(d, start + NEW_LOOP_SECONDS);
    this.setLoop({ on: this.loop.on, start, end });
  }

  setLoopEnd(seconds) {
    if (!this.song || this.locked) return;
    const d = this.song.duration;
    const end = clamp(+seconds || 0, Math.min(MIN_LOOP, d), d);
    let start = this.loop.start;
    if (end - start < MIN_LOOP) start = Math.max(0, end - NEW_LOOP_SECONDS);
    this.setLoop({ on: this.loop.on, start, end });
  }

  // ----- MP3 export ------------------------------------------------------------------

  // The stems and the takes that are on, as they sound now (volumes, tempo,
  // key), as an MP3 File named as EUTERIA (Python) names it. Without stems
  // on, the Original Track goes with the takes. The tracks are lent to the
  // export worker meanwhile (their memory is moved, not copied).
  async exportMp3(onProgress) {
    if (!this.song || this.busy || this.recording) throw new Error("Wait for the current operation to finish.");
    const stems = this.tracks.filter((t) => t.on && STEM_NAMES.includes(t.key)).map((t) => t.key);
    const takes = this.tracks.filter((t) => t.on && t.take);
    const fullOn = this.tracks.some((t) => t.on && t.key === "original");
    if (!stems.length && !takes.length) {
      let text;
      if (!this.hasStems && !this.takes.length) text = "This song has no stems: the export combines stems, and the Original Track alone is the file you already have.";
      else if (fullOn) text = "Exporting the Original Track alone is basically pointless: it is the file you already have. Switch on the stems or the takes you want to combine.";
      else text = "No track is switched on. Switch on the stems or the takes you want to combine.";
      throw Object.assign(new Error(text), { notice: true });
    }
    const withOriginal = !stems.length && fullOn;
    const keys = [...stems, ...(withOriginal ? ["original"] : []), ...takes.map((t) => t.key)];
    if (this.playing) this.pause();
    this.busy = "exporting";
    this._update();
    let lent = null;
    try {
      lent = await this._lend(keys);
      const t0 = performance.now();
      const reply = await runRenderWorker(
        { type: "export", tracks: lent, sampleRate: this.context.sampleRate, rate: this.rate, semitones: this.semitones, bitrate: 320, seconds: this.song.duration },
        onProgress
      );
      lent = null;
      this._restore(reply.tracks);
      const name = stemsExportFileName(this.song.songName, stems, [...(withOriginal ? ["Original"] : []), ...takes.map((t) => t.title)]);
      return {
        file: new File([reply.mp3], name, { type: "audio/mpeg" }),
        name,
        seconds: reply.seconds,
        reductionDb: reply.reductionDb,
        totalMs: performance.now() - t0,
        fullOn: fullOn && !withOriginal,
        tempo: Math.round(this.rate * 100),
        key: this.semitones,
      };
    } catch (error) {
      this._restore(error.tracks || lent || []);
      throw error;
    } finally {
      this.busy = null;
      this._update();
    }
  }

  async _lend(keys) {
    const tracks = await this.engine.takeTracks(keys);
    return tracks.map((t) => ({ ...t, channels: t.channels.map((a) => a.buffer) }));
  }

  _restore(tracks) {
    for (const t of tracks || []) {
      // A worker that crashed keeps the memory it was lent: that track is lost
      // until the song is opened again.
      if (!t.channels.length || t.channels.some((b) => !b.byteLength)) {
        if (!this.lost.includes(t.key)) this.lost.push(t.key);
        continue;
      }
      const meta = this.track(t.key);
      this.engine.addTrack({
        key: t.key,
        bus: t.bus,
        channels: t.channels.map((b) => new Int16Array(b)),
        length: t.length,
        gain: meta ? meta.gain : t.gain,
        on: meta ? meta.on : t.on,
        start: meta ? meta.start : t.start,
      });
    }
  }

  // ----- screen ----------------------------------------------------------------------

  // Keeps the screen on while playing.
  async _wake(on) {
    if (!on) {
      if (this.wakeLock) this.wakeLock.release().catch(() => {});
      this.wakeLock = null;
      return;
    }
    if (!("wakeLock" in navigator) || this.wakeLock) return;
    try {
      this.wakeLock = await navigator.wakeLock.request("screen");
      this.wakeLock.addEventListener("release", () => (this.wakeLock = null));
    } catch (_) {
      this.wakeLock = null;
    }
  }
}
