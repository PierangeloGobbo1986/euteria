// The player of the app: one audio context and one engine for the whole
// session, the song that is open, its tracks (the takes recorded over it
// included) and the practice controls (tempo, key, loop), and the MP3
// export. No user interface here: the page listens to `onupdate` (something
// shown changed) and `onsettings` (a setting worth saving changed).
//
// While a take is being recorded (src/recorder.js) nothing may move the song
// under it: jumps, tempo, key and the loop wait; Pause and Stop end the take.
//
// A track may be cut in clips (src/clips.js, setClips()): its `clips`, in
// samples of its own audio, null while it plays whole.

import { Engine } from "./engine.js";
import { openProject, toInt16, TRACK_TITLES, STEM_NAMES, BOOST_CEILING, stemsExportFileName, takeStartSample, inTrackOrder, gainToSlider } from "./project.js";
import { int16Peaks, PEAK_BUCKET } from "./peaks.js";
import { clipsOf, clipsEnd, normalize, sameClips, bake, EDGE_FADE_SECONDS } from "./clips.js";
import { tr } from "./i18n.js";

export const MIN_LOOP = 0.25; // seconds, as the engine
const TEMPO_RANGE = [0.5, 2];
export const KEY_RANGE = [-12, 12];
const NEW_LOOP_SECONDS = 8;
const GROW_SECONDS = 10; // a take past the end: the song grows by this much at a time
const MIN_CLIP_SECONDS = 0.02; // the shortest a clip may be

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
    throw new Error(tr("This browser cannot read {name}: it is neither an EUTERIA project nor an audio file it knows.", { name: file.name }));
  }
  if (!buffer.length) throw new Error(tr("{name} contains no audio.", { name: file.name }));
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
      reject(new Error(event.message || tr("The export stopped.")));
    };
    worker.postMessage(message, transfer);
  });
}

// From before the song's sound, playback starts this long before it (seconds).
const COUNT_LEAD_SECONDS = 0.05;

// First index of `list` (sorted) whose value is >= t.
function lowerBound(list, t) {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
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
    // The metronome as the engine has it (setMetronome()), and the bars of
    // count-in before playback and recording start.
    this.metronome = null;
    this.loopPasses = 0; // times the loop went round, as the engine counts them
    this.onloop = null; // (count): the loop went round count times
    this.countIn = 0;
    this.busy = null; // null, "opening" or "exporting"
    this.recording = false; // a take is being recorded
    this.recordingSeek = false; // Stop's jump, allowed while the take ends
    this.recordId = 0;
    this.lost = []; // tracks a failed export could not give back
    // Takes out of the song that an undo may bring back (stashTake()): key ->
    // {track, index, pcm (a promise of {channels, length}, or of null)}.
    this.stash = new Map();
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
    const engine = await withTimeout(Engine.create(context), 15000, tr("The audio engine did not start. Reload the page and try again."));
    engine.node.connect(context.destination);
    engine.onposition = (heard, playing, passes) => {
      this.position = heard;
      if (this.playing && !playing) this._wake(false);
      this.playing = playing;
      // A take recorded past the end makes the song longer: it grows ahead
      // of the playhead, GROW_SECONDS at a time, and takes the take's exact
      // length once the take is added (updateDuration()).
      if (this.recording && this.song && heard > this.song.duration - 1) {
        this.song.duration = Math.ceil((heard + 1) / GROW_SECONDS) * GROW_SECONDS;
      }
      // The loop went round (the speed trainer, app.js).
      if (Number.isFinite(passes)) {
        if (passes > this.loopPasses && this.onloop) this.onloop(passes - this.loopPasses);
        this.loopPasses = passes;
      }
      this._update();
    };
    engine.onended = () => {
      this.playing = false;
      this._wake(false);
      this._changed();
    };
    this.engine = engine;
    if (this.metronome) engine.setMetronome(this.metronome);
  }

  // The metronome (src/metronome.js, src/engine-core.js): {on, volume (0 to
  // 2), play, mute, random, silence (0 the clicks, 1 the clicks and the
  // tracks, 2 the tracks), seed (optional), and the clicks: times, kinds,
  // firsts, bar}; clicks null: none (no song).
  setMetronome({ on, volume, play, mute, random = false, silence = 0, seed, clicks }) {
    const m = { on: !!on && !!clicks, volume, play, mute, random: !!random, silence };
    if (Number.isFinite(seed)) m.seed = seed;
    if (clicks !== undefined) {
      m.times = clicks ? clicks.times : new Float64Array(0);
      m.kinds = clicks ? clicks.kinds : new Uint8Array(0);
      m.firsts = clicks ? clicks.firsts : new Uint8Array(0);
      m.bar = clicks ? clicks.bar : 0;
    } else if (this.metronome) {
      for (const k of ["times", "kinds", "firsts", "bar"]) if (k in this.metronome) m[k] = this.metronome[k];
      m.on = !!on && !!(this.metronome.times && this.metronome.times.length);
    }
    this.metronome = m;
    if (this.engine) this.engine.setMetronome(m);
  }

  // ----- songs ------------------------------------------------------------

  // Opens a project (.euteria, .musicproj) or an audio file; the song that was
  // open is closed first, so that two songs are never in memory together.
  // onProgress(done, total, trackKey) is called before each track is decoded.
  async open(file, onProgress = () => {}) {
    if (this.busy) throw new Error(tr("Wait for the current operation to finish."));
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
    if (!wanted.size && song.tracks.length) wanted = new Set([song.tracks[0].key]);
    this.tracks = song.tracks.map((t) => ({
      key: t.key,
      title: t.title,
      bus: t.bus,
      length: t.length,
      gain: t.gain,
      on: t.on,
      start: t.start || 0,
      clips: t.clips || null,
      take: t.take || null,
      align: t.align || null,
      peaks: wanted.has(t.key) ? int16Peaks(t.channels, t.length) : null,
    }));
    for (const t of song.tracks) engine.addTrack(t); // hands the PCM to the audio thread
    // duration: as long as the longest track, takes included; baseDuration:
    // the song's own (its audio, or the length an empty project was given).
    this.song = {
      title: song.title,
      songName: song.songName,
      duration: song.duration,
      baseDuration: song.baseDuration ?? song.duration,
      sampleRate: song.sampleRate,
      kind,
      manifest: song.manifest || null,
      alignment: song.alignment || null,
    };
    this.lost = [];
    this.stash.clear();
    this.position = 0;
    this.playing = false;
    this.rate = 1;
    this.semitones = 0;
    this.loop = { on: false, start: 0, end: 0 };
    engine.setRate(1);
    engine.setSemitones(0);
    engine.setLoop(false, 0, 0);
    engine.setMinLength(this.song.baseDuration);
    engine.seek(0);
  }

  // The song's length: its own, or longer where a take goes past it.
  // Returns whether it changed.
  _updateDuration() {
    if (!this.song) return false;
    const sr = this.context.sampleRate;
    let end = this.song.baseDuration;
    for (const t of this.tracks) end = Math.max(end, (t.start + clipsEnd(t.clips, t.length)) / sr);
    if (Math.abs(end - this.song.duration) < 1e-9) return false;
    this.song.duration = end;
    return true;
  }

  // The same, told to the page (a take recorded or not, past the end).
  updateDuration() {
    if (this._updateDuration()) this._changed();
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
    this.stash.clear();
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
    return { v: 1, tracks, order: this.tracks.map((t) => t.key), rate: this.rate, semitones: this.semitones, loop: { ...this.loop }, position: this.position };
  }

  // Applies saved settings (any part may be missing).
  apply(s) {
    if (!s || !this.song) return;
    if (Array.isArray(s.order)) this.tracks = inTrackOrder(this.tracks, s.order);
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

  // Puts a track at another place in the list: the rows of the timeline and
  // the cards follow, and the keys 1 to 9. Returns whether it moved.
  moveTrack(key, to) {
    const from = this.tracks.findIndex((t) => t.key === key);
    if (from < 0 || this.busy) return false;
    to = clamp(Math.round(to), 0, this.tracks.length - 1);
    if (to === from) return false;
    const [t] = this.tracks.splice(from, 1);
    this.tracks.splice(to, 0, t);
    this._changed();
    return true;
  }

  // The tracks in the order of `keys` (undo and redo); those it does not name
  // after them.
  setOrder(keys) {
    if (!this.song || this.busy) return;
    this.tracks = inTrackOrder(this.tracks, keys);
    this._changed();
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
  // length, take (src/project.js takeFromManifest()), gain, on}. A take
  // pasted from the drums plays with them (take.bus), not transposed.
  addTake(track) {
    if (!this.song) return;
    const sr = this.context.sampleRate;
    const start = takeStartSample(track.take, sr);
    const peaks = !this.peakKeys || this.peakKeys.includes(track.key) ? int16Peaks(track.channels, track.length) : null;
    const bus = track.take.bus === "drums" ? "drums" : "pitched";
    const t = { key: track.key, title: track.title, bus, length: track.length, gain: track.gain ?? 1, on: track.on ?? true, start, clips: null, take: track.take, align: null, peaks };
    this.engine.addTrack({ key: t.key, bus: t.bus, channels: track.channels, length: t.length, gain: t.gain, on: t.on, start });
    this.tracks.push(t);
    this._updateDuration();
    this._changed();
  }

  removeTake(key) {
    const t = this.track(key);
    if (!t || !t.take || this.busy) return null;
    this.engine.removeTrack(key);
    this.tracks = this.tracks.filter((x) => x !== t);
    this._updateDuration();
    this._changed();
    return t;
  }

  // ----- takes kept aside, for undo -------------------------------------------------
  //
  // A take deleted, or a recording undone, leaves the song but stays in
  // memory: its audio comes back from the audio thread (as for the export) and
  // waits in `stash`, so that an undo puts it back as it was, where it was
  // (unstashTake()). The page lets go of what no undo or redo can bring back
  // any more (dropStash()); a song that closes, of all of it.

  // Takes take `key` out of the song, into the stash. Returns its track, or
  // null.
  stashTake(key) {
    const t = this.track(key);
    if (!t || !t.take || this.busy || !this.engine) return null;
    const index = this.tracks.indexOf(t);
    this.tracks.splice(index, 1);
    const entry = { track: t, index, pcm: null };
    entry.pcm = this.engine.takeTracks([key]).then(
      ([back]) => (back && back.channels.length ? { channels: back.channels, length: back.length } : null),
      () => null
    );
    this.stash.set(key, entry);
    this._updateDuration();
    this._changed();
    return t;
  }

  // Puts take `key` back from the stash, at `index` in the tracks (else where
  // it was), as it was. before(track, channels): called with its audio before
  // the audio thread takes it. Resolves with its track, or null if it cannot
  // come back (not in the stash, its audio lost).
  async unstashTake(key, { index = null, before = null } = {}) {
    const entry = this.stash.get(key);
    if (!entry || !this.song || this.track(key)) return null;
    const pcm = await entry.pcm;
    if (this.stash.get(key) !== entry || !this.song || this.track(key)) return null;
    this.stash.delete(key);
    if (!pcm) return null;
    const t = entry.track;
    if (before) before(t, pcm.channels);
    this.engine.addTrack({ key, bus: t.bus, channels: pcm.channels, length: pcm.length, gain: t.gain, on: t.on, start: t.start, clips: t.clips });
    this.tracks.splice(clamp(index ?? entry.index, 0, this.tracks.length), 0, t);
    this._updateDuration();
    this._changed();
    return t;
  }

  // Lets go of the takes in the stash but those of `keep` (a Set of keys).
  dropStash(keep = new Set()) {
    for (const key of [...this.stash.keys()]) if (!keep.has(key)) this.stash.delete(key);
  }

  // The memory the stash holds (bytes).
  get stashBytes() {
    let sum = 0;
    for (const { track } of this.stash.values()) sum += track.length * ((track.take && track.take.channels) || 2) * 2;
    return sum;
  }

  // ----- clips -------------------------------------------------------------------------

  // The shortest a clip may be, in samples.
  get minClip() {
    return Math.round(MIN_CLIP_SECONDS * (this.context ? this.context.sampleRate : 48000));
  }

  // The clips of track `key` (src/clips.js, samples of its own audio; null:
  // the track whole). Returns whether they changed.
  setClips(key, clips) {
    const t = this.track(key);
    if (!t || this.busy || this.recording) return false;
    const next = normalize(clips, t.length, 1);
    if (sameClips(next, t.clips)) return false;
    t.clips = next;
    this.engine.setTrack(key, { clips: next });
    this._updateDuration();
    this._changed();
    return true;
  }

  // Copy (app/app.js): clips `indexes` of track `key` as one piece of audio
  // that sounds as they do in it (src/clips.js bake()), its audio copied
  // from the audio thread while it goes on playing: {channels, length,
  // start (the song sample where it begins)}, or null (no such track or
  // clips, the track gone meanwhile).
  async copyClips(key, indexes) {
    const t = this.track(key);
    if (!t || this.busy || !this.engine) return null;
    const all = clipsOf(t.clips, t.length);
    const list = [...new Set(indexes)].sort((a, b) => a - b).map((i) => all[i]).filter(Boolean);
    if (!list.length) return null;
    const start = t.start;
    const audio = [];
    for (const c of list) {
      const channels = await this.engine.copyTrack(key, c.from, c.to);
      if (!channels || this.track(key) !== t) return null;
      audio.push(channels);
    }
    const edge = Math.max(1, Math.round(EDGE_FADE_SECONDS * this.context.sampleRate));
    const piece = bake(list, audio, t.length, edge);
    return { channels: piece.channels, length: piece.length, start: start + piece.at };
  }

  // Moves a take earlier (ms < 0) or later, against where it was recorded.
  setTakeSync(key, ms) {
    const t = this.track(key);
    if (!t || !t.take || this.busy) return;
    t.take.syncMs = Math.round(+ms || 0);
    t.start = takeStartSample(t.take, this.context.sampleRate);
    this.engine.setTrack(key, { start: t.start });
    this._updateDuration();
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
    let countEnd = null;
    if (!this.playing) {
      play = this.position;
      if (play >= this.song.duration - 0.05) play = this.loop.on ? this.loop.start : 0;
      const start = this._countStart(play);
      play = start.at;
      countEnd = start.end;
      this.position = play;
    }
    const id = ++this.recordId;
    this.recording = true;
    this.engine.recStart({ ...params, id, play, countIn: play === null ? 0 : this.countIn, countEnd });
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

  // Where the song's own sound begins (seconds): the first stretch of the
  // tracks (takes left out) that is not near silence, from their envelopes; 0
  // without any (an empty project, a track whose envelope is not kept).
  firstSound() {
    let first = null;
    for (const t of this.tracks) {
      if (t.take || !t.peaks) continue;
      const { min, max } = t.peaks;
      const n = max.length;
      const level = new Uint8Array(n);
      for (let i = 0; i < n; i++) level[i] = Math.max(Math.abs(min[i]), Math.abs(max[i]));
      const sorted = Uint8Array.from(level).sort();
      const ref = sorted[Math.min(n - 1, Math.floor(n * 0.99))];
      const limit = Math.max(2, ref * 0.04);
      // Three buckets in a row (about 15 ms), so that a click or a pop is not
      // the start; in the clips of the track, the first that has one.
      for (const c of clipsOf(t.clips, t.length)) {
        const a = Math.ceil(c.from / PEAK_BUCKET);
        const b = Math.min(n, Math.floor(c.to / PEAK_BUCKET));
        let at = -1;
        for (let i = a; i + 2 < b; i++) {
          if (level[i] >= limit && level[i + 1] >= limit && level[i + 2] >= limit) {
            at = i;
            break;
          }
        }
        if (at < 0) continue;
        const time = ((t.start || 0) + c.at + at * PEAK_BUCKET - c.from) / this.song.sampleRate;
        if (first === null || time < first) first = time;
        break;
      }
    }
    return first === null ? 0 : first;
  }

  // A start with a count-in: where playback starts, and the downbeat the
  // count-in ends on (song seconds), so that it counts the bars of the song.
  // From before the song's sound, the silence before it is skipped and the
  // count-in ends on the downbeat of the bar the sound begins in: notes just
  // before a downbeat (a pickup) count towards it, and sound with the last
  // beats of the count-in. From the playhead later on, or from the loop's
  // start, it ends on the downbeat of the bar that starts there, or else of
  // the next one: the song comes in at the playhead, the count-in going on
  // over it up to that downbeat. {at, end}; end null: the count-in ends at
  // `at` (the metronome has no bars, or the loop none from its start).
  _countStart(at) {
    if (!(this.countIn > 0) || !this.song) return { at, end: null };
    let from = at;
    if (this.loop.on) {
      if (at < this.loop.start || at >= this.loop.end) at = from = this.loop.start;
    } else {
      const sound = this.firstSound();
      const lead = Math.max(0, sound - COUNT_LEAD_SECONDS);
      if (at < lead) {
        at = lead;
        from = sound;
      }
    }
    const end = this._downbeatFrom(from);
    if (end === null || (this.loop.on && end >= this.loop.end)) return { at, end: null };
    return { at, end };
  }

  // The first downbeat of the metronome's clicks from `t` on, one up to half a
  // beat before `t` included (a bar that starts just before it); null
  // without clicks in bars.
  _downbeatFrom(t) {
    const m = this.metronome;
    const times = m && m.times;
    if (!times || times.length < 2 || !(m.bar > 0) || !m.firsts) return null;
    const k = clamp(lowerBound(times, t), 1, times.length - 1);
    const beat = times[k] - times[k - 1];
    for (let i = lowerBound(times, t - beat / 2); i < times.length; i++) if (m.firsts[i]) return times[i];
    return null;
  }

  async play() {
    if (!this.song || this.busy) return;
    this.unlock();
    try {
      await this.context.resume();
    } catch (_) {}
    let at = this.position;
    if (at >= this.song.duration - 0.05) at = this.loop.on ? this.loop.start : 0;
    const start = this._countStart(at);
    at = start.at;
    this.position = at;
    this.engine.play(at, this.countIn, start.end);
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
  // on, the Original Track goes with the takes, or alone: then only with its
  // tempo, key or volume changed, as it is it would be the file the user has.
  // The tracks are lent to the export worker meanwhile (their memory is
  // moved, not copied).
  async exportMp3(onProgress) {
    if (!this.song || this.busy || this.recording) throw new Error(tr("Wait for the current operation to finish."));
    const stems = this.tracks.filter((t) => t.on && STEM_NAMES.includes(t.key)).map((t) => t.key);
    const takes = this.tracks.filter((t) => t.on && t.take);
    const original = this.tracks.find((t) => t.on && t.key === "original");
    const fullOn = !!original;
    // As the fields show them: tempo in whole percent, volume in percent; or
    // cut in clips.
    const changed = fullOn && (Math.round(this.rate * 100) !== 100 || this.semitones !== 0 || gainToSlider(original.gain) !== 100 || !!original.clips);
    if (!stems.length && !takes.length && !changed) {
      let text;
      if (!fullOn) text = tr("No track is switched on. Switch on the tracks you want to export.");
      else if (this.tracks.some((t) => t.key !== "original"))
        text = tr("The Original Track as it is would be the file you already have: change its tempo, key or volume to export it, or switch on other tracks.");
      else text = tr("The Original Track as it is would be the file you already have: change its tempo, key or volume to export it.");
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
        clips: meta ? meta.clips : t.clips,
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
