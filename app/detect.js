// Finding the tempo and the chords of a song, when asked, on every device
// whose browser can run it (the separation alone stays with computers): a
// computer with Chrome or Edge and a graphics card WebGPU can use runs the
// full model of Beat This! (about 191 MB) on it; a phone or a tablet, another
// browser, or a computer whose graphics card WebGPU cannot use, its small
// model (about 10 MB) on the CPU. Detect tempo (the Song analysis card) finds the beats and the
// downbeats (Beat This!, src/beats.js) and makes a new grid from them
// (src/tempo.js); Detect chords (Song analysis) finds the chords (BTC, kept
// as segments: src/chords.js) and writes them in the bars, finding the tempo
// first for a song without a grid. The result is kept in the song
// (manifest.music.beat_tracking and chord_recognition, written by Save and by
// the separation) and, until then, in this browser; pressed again, the
// buttons use it, with no new analysis (app/app.js). The song plays
// meanwhile; Bars and Chords waits for it (app/editor.js), and so does a
// separation. The progress is told in the band of the messages, under the
// transport (app/app.js notice()). The models (the tempo's, 191 or 10 MB; the
// chords', 12 MB) are downloaded the first time and kept in the browser.
//
// In a browser that cannot run it (no workers, no WebAssembly), nothing
// runs: the grid is the one the song brings, or one made by hand.

import { BeatTracker, config, detectionPlan, songAudio } from "../src/beats.js";
import { gridFromBeats } from "../src/tempo.js";
import { segmentsFrom } from "../src/chords.js";
import { detectBrowser, detectHandheld, webgpuInfo } from "../src/device.js";
import { tr, trn } from "../src/i18n.js";

const $ = (id) => document.getElementById(id);
const VERSION = () => self.EUTERIA_VERSION || "";
// A grid whose beats stray further than this from one tempo is said to vary.
const DRIFT_MS = 60;

// Any browser with workers and WebAssembly (and its private storage, where
// the models are kept).
function detectionSupport() {
  return typeof Worker !== "undefined" && typeof WebAssembly === "object" && !!(navigator.storage && navigator.storage.getDirectory);
}

// The small model on the CPU: a phone or a tablet (little memory, and its
// storage kept for photos), or a browser without WebGPU. The full model on
// the graphics card: a computer with Chrome or Edge and WebGPU, if WebGPU
// finds a graphics card there (TempoDetection._light()).
function lightDetection(phoneLayout) {
  if (phoneLayout || detectHandheld()) return true;
  const browser = detectBrowser();
  if (!(browser.name === "Chrome" || browser.name === "Edge")) return true;
  return !navigator.gpu;
}

// What a detection found: the beats ({beats, downbeats…}) and the chords
// (`chords`: {segments…}), either or both.
export const hasBeats = (a) => !!(a && Array.isArray(a.beats));
export const hasChords = (a) => !!(a && a.chords && Array.isArray(a.chords.segments));

// The detection kept in a project (manifest.music.beat_tracking, with its
// chords from manifest.music.chord_recognition as `chords`), or null.
export function readAnalysis(manifest) {
  const music = manifest && manifest.music;
  if (!music) return null;
  const a = music.beat_tracking && typeof music.beat_tracking === "object" && Array.isArray(music.beat_tracking.beats) ? { ...music.beat_tracking } : {};
  const c = music.chord_recognition;
  if (c && typeof c === "object" && Array.isArray(c.segments)) a.chords = c;
  return hasBeats(a) || hasChords(a) ? a : null;
}

const ms3 = (list) => list.map((t) => Math.round(t * 1000) / 1000);

export class TempoDetection {
  // ctx: {app, player, phone, notice(text, kind, ms), apply(analysis, fit,
  // {tempo, chords}) (the result, for the song open: a new grid, the chords
  // written in its bars; returns how many bars got a chord), finished()
  // (after every run, whatever its end), refreshPage()}.
  constructor(ctx) {
    this.ctx = ctx;
    this.supported = false;
    this.light = true; // the small model on the CPU (else the full one on the graphics card)
    this.gpu = null; // a promise: true if WebGPU finds no graphics card it can use
    this.job = null; // {song, tracker, done (a promise), text}
    this.shown = ""; // the last line said, not to cover another message
  }

  init() {
    this.supported = detectionSupport();
    this.light = lightDetection(this.ctx.phone);
  }

  get running() {
    return !!this.job;
  }

  // The small model (true) or the full one, for the detection starting. The
  // graphics card is asked for then, the first time (asking wakes the
  // discrete graphics card of a laptop that has two): without one WebGPU can
  // use, or with only its software stand-in, the small model on the CPU
  // (faster there than the full one). The full model runs where config.ep
  // says (the tests: the CPU, with no graphics card asked for).
  async _light() {
    if (this.light || config.ep !== "webgpu") return this.light;
    if (!this.gpu) this.gpu = webgpuInfo().then((gpu) => !gpu.available || gpu.fallback);
    this.light = await this.gpu;
    return this.light;
  }

  // Resolves when no detection is running.
  async idle() {
    while (this.job) await this.job.done.catch(() => {});
  }

  // The band of the messages, unless it says something else now; progress:
  // the part done (0 to 1), its bar.
  say(text, kind = "", ms = 0, progress = null) {
    const el = $("notice");
    if (!el.hidden && el.textContent && el.textContent !== this.shown) return;
    this.shown = text;
    this.ctx.notice(text, kind, ms, progress);
  }

  // Runs on `song` (open from `file`, named `name`): the tempo (a new grid),
  // the chords, or both; write: the chords (found now, or kept in the song)
  // written in the bars at the end.
  start(song, file, name, { tempo = false, chords = false, write = chords } = {}) {
    this.cancel();
    if (!this.supported || !song || !(tempo || chords)) return;
    const tracker = new BeatTracker();
    const job = { song, tracker, tempo, chords, write, model: null };
    job.done = this._run(job, file, name);
    this.job = job;
    this.ctx.refreshPage();
  }

  cancel() {
    const job = this.job;
    if (!job) return;
    this.job = null;
    job.cancelled = true;
    job.tracker.terminate();
    if (this.shown && $("notice").textContent === this.shown) this.ctx.notice("");
    this.ctx.refreshPage();
  }

  // The model `model` in the browser, downloaded the first time.
  async _model(job, model) {
    job.model = model;
    const status = await job.tracker.status(model);
    if (status.cached) return;
    this.say(
      model !== config.chordModel
        ? tr("Downloading the tempo model (about {mb} MB, only the first time)…", { mb: model.approxMB })
        : tr("Downloading the chord model (about {mb} MB, only the first time)…", { mb: model.approxMB }),
      "",
      0,
      0
    );
    await job.tracker.download(model);
  }

  async _run(job, file, name) {
    const { player, app } = this.ctx;
    const current = () => this.job === job && player.song === job.song && !job.cancelled;
    let stage = job.tempo ? "tempo" : "chords";
    let analysis = app.analysis ? { ...app.analysis } : {};
    let fit = null;
    try {
      this.say(job.tempo ? tr("Finding the tempo of {name}…", { name }) : tr("Finding the chords of {name}…", { name }), "", 0, 0);
      const audio = await songAudio(job.song, file);
      if (!current()) return;
      const tracker = job.tracker;
      tracker.onprogress = (m) => current() && this._progress(m, name, job);
      const plan = detectionPlan(await this._light());
      if (!current()) return;
      if (job.tempo) {
        await this._model(job, plan.model);
        if (!current()) return;
        const result = await tracker.detect(job.chords ? audio.slice() : audio, plan);
        if (!current()) return;
        fit = gridFromBeats(result.beats, result.downbeats, job.song.duration);
        // The chords found before stay: they do not depend on the beats.
        analysis = {
          ...(analysis.chords ? { chords: analysis.chords } : {}),
          version: 1,
          model: plan.model.key,
          detected_with: `EUTERIA Web ${VERSION()}`.trim(),
          detected_at: new Date().toISOString(),
          bpm: fit ? fit.bpm : null,
          time_signature: fit ? fit.meter : null,
          first_beat: fit ? fit.anchor : null,
          beats_per_bar: fit ? fit.beatsPerBar : null,
          drift_ms: fit ? fit.quality.driftMs : null,
          backend: result.backend,
          seconds: Math.round(result.totalMs / 100) / 10,
          beats: ms3(result.beats),
          downbeats: ms3(result.downbeats),
        };
      }
      // The chords (after the tempo: should they fail, the tempo found stays).
      let chordError = null;
      if (job.chords && (!job.tempo || fit)) {
        stage = "chords";
        try {
          this.say(tr("Finding the chords of {name}…", { name }), "", 0, 0);
          await this._model(job, config.chordModel);
          if (!current()) return;
          const result = await tracker.chords(audio, plan);
          if (!current()) return;
          analysis = {
            ...analysis,
            chords: {
              version: 1,
              model: config.chordModel.key,
              detected_with: `EUTERIA Web ${VERSION()}`.trim(),
              detected_at: new Date().toISOString(),
              backend: result.backend,
              seconds: Math.round(result.totalMs / 100) / 10,
              segments: segmentsFrom(result),
            },
          };
        } catch (error) {
          if (!current()) return;
          if (!job.tempo) throw error;
          chordError = (error && error.message) || String(error);
        }
      }
      this.job = null;
      const write = job.write && !chordError && (!job.tempo || !!fit);
      const written = this.ctx.apply(analysis, fit, { tempo: job.tempo, chords: write }) || 0;
      const said = [];
      if (job.tempo) {
        if (!fit) said.push(tr("No steady beat found in this song: Bars and Chords works by hand."));
        else {
          const v = { bpm: fit.bpm.toFixed(1), meter: fit.meter };
          said.push(
            fit.quality.driftMs > DRIFT_MS
              ? tr("Tempo found: {bpm} BPM in {meter} on average. It varies in this song: check the grid, towards the end above all.", v)
              : tr("Tempo found: {bpm} BPM in {meter}. Bars and Chords is ready.", v)
          );
        }
      }
      if (job.write && (!job.tempo || fit)) {
        said.push(
          chordError
            ? tr("The chords could not be found: {error}", { error: chordError })
            : written
              ? trn(written, "Chord found in {n} bar: check it by ear.", "Chords found in {n} bars: check them by ear.")
              : tr("No chords found in this song.")
        );
      }
      this.say(said.join(" "), chordError ? "error" : job.tempo && !fit ? "" : "ok", 10000);
    } catch (error) {
      if (!current()) return;
      this.job = null;
      const err = { error: (error && error.message) || error };
      this.say(
        stage === "tempo" ? tr("The tempo could not be found: {error} Bars and Chords works by hand.", err) : tr("The chords could not be found: {error}", err),
        "error",
        10000
      );
    } finally {
      job.tracker.terminate();
      if (this.job === job) this.job = null;
      if (this.ctx.finished) this.ctx.finished();
      this.ctx.refreshPage();
    }
  }

  _progress(m, name, job) {
    const chords = job.model === config.chordModel;
    if (m.phase === "download") {
      const mb = (b) => Math.round(b / 1e6);
      const v = m.total ? { done: mb(m.done), total: mb(m.total) } : { done: mb(m.done), total: job.model.approxMB };
      const part = Math.min(1, m.total ? m.done / m.total : m.done / (job.model.approxMB * 1e6));
      if (chords) {
        this.say(m.total ? tr("Downloading the chord model (only the first time): {done} of {total} MB", v) : tr("Downloading the chord model (only the first time): {done} of about {total} MB", v), "", 0, part);
      } else {
        this.say(m.total ? tr("Downloading the tempo model (only the first time): {done} of {total} MB", v) : tr("Downloading the tempo model (only the first time): {done} of about {total} MB", v), "", 0, part);
      }
    } else if (m.phase === "verify") {
      this.say(chords ? tr("Checking the chord model downloaded…") : tr("Checking the tempo model downloaded…"), "", 0, 1);
    } else if (m.phase === "spectrogram" || m.phase === "analyse") {
      // The spectrogram is the first tenth of the work, the model the rest.
      const part = m.total ? m.done / m.total : 0;
      const pct = Math.round((m.phase === "spectrogram" ? part * 0.1 : 0.1 + part * 0.9) * 100);
      this.say(tr("Finding the tempo of {name}: {pct}%", { name, pct }), "", 0, pct / 100);
    } else if (m.phase === "chords-spectrogram" || m.phase === "chords-analyse") {
      // The spectrogram is about half of the work on a graphics card.
      const part = m.total ? m.done / m.total : 0;
      const pct = Math.round((m.phase === "chords-spectrogram" ? part * 0.5 : 0.5 + part * 0.5) * 100);
      this.say(tr("Finding the chords of {name}: {pct}%", { name, pct }), "", 0, pct / 100);
    }
  }
}
