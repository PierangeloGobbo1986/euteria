// Finding the tempo and the chords of a song as it opens (a computer, Chrome
// or Edge with WebGPU): the beats and the downbeats (Beat This!,
// src/beats.js), the grid made from them (src/tempo.js), then the chords
// (BTC, kept as segments: src/chords.js), which go in the bars of a grid that
// has none. It runs once per song: the result is kept in the song
// (manifest.music.beat_tracking and chord_recognition, written by Save and
// by the separation) and, until then, in this browser; a song whose tempo was
// found before the chords were (EUTERIA Web 0.8) gets its chords only. The
// song plays meanwhile; Bars and Chords waits for it (app/editor.js), and so
// does a separation. The progress is told in the line under the bar at the
// top, as the opening of the song. The models (about 191 MB and 12 MB) are
// downloaded the first time and kept in the browser.
//
// On a phone, and in the browsers that cannot run it, nothing runs: the grid
// is the one the song brings, or one made by hand.

import { BeatTracker, config, songAudio } from "../src/beats.js";
import { gridFromBeats } from "../src/tempo.js";
import { segmentsFrom } from "../src/chords.js";
import { detectBrowser, detectHandheld } from "../src/device.js";
import { tr, trn } from "../src/i18n.js";

const $ = (id) => document.getElementById(id);
const VERSION = () => self.EUTERIA_VERSION || "";
// A grid whose beats stray further than this from one tempo is said to vary.
const DRIFT_MS = 60;

// Computer, Chrome or Edge, WebGPU: as the separation (app/separate.js).
function detectionSupport(phoneLayout) {
  if (phoneLayout || detectHandheld()) return false;
  const browser = detectBrowser();
  if (!(browser.name === "Chrome" || browser.name === "Edge")) return false;
  return "gpu" in navigator;
}

// The detection kept in a project (manifest.music.beat_tracking, with its
// chords from manifest.music.chord_recognition as `chords`), or null.
export function readAnalysis(manifest) {
  const music = manifest && manifest.music;
  const a = music && music.beat_tracking;
  if (!(a && typeof a === "object" && Array.isArray(a.beats))) return null;
  const c = music.chord_recognition;
  return c && typeof c === "object" && Array.isArray(c.segments) ? { ...a, chords: c } : { ...a };
}

const ms3 = (list) => list.map((t) => Math.round(t * 1000) / 1000);

export class TempoDetection {
  // ctx: {app, player, phone, notice(text, kind, ms), apply(analysis, fit)
  // (the result, for the song open; returns {filled, kept}: how many bars got
  // a chord, and whether they were left to Suggest chords), refreshPage()}.
  constructor(ctx) {
    this.ctx = ctx;
    this.supported = false;
    this.job = null; // {song, tracker, done (a promise), text}
    this.shown = ""; // the last line said, not to cover another message
  }

  init() {
    this.supported = detectionSupport(this.ctx.phone);
  }

  get running() {
    return !!this.job;
  }

  // Resolves when no detection is running.
  async idle() {
    while (this.job) await this.job.done.catch(() => {});
  }

  // The line under the bar at the top, unless it says something else now.
  say(text, kind = "", ms = 0) {
    const el = $("notice");
    if (!el.hidden && el.textContent && el.textContent !== this.shown) return;
    this.shown = text;
    this.ctx.notice(text, kind, ms);
  }

  // Runs on `song` (just opened from `file`, named `name`): the tempo and the
  // chords, or (tempo: false, the song has its tempo already) the chords only.
  start(song, file, name, { tempo = true } = {}) {
    this.cancel();
    if (!this.supported || !song) return;
    const tracker = new BeatTracker();
    const job = { song, tracker, tempo, model: null };
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
      model === config.model
        ? tr("Downloading the tempo model (about {mb} MB, only the first time)…", { mb: model.approxMB })
        : tr("Downloading the chord model (about {mb} MB, only the first time)…", { mb: model.approxMB })
    );
    await job.tracker.download(model);
  }

  async _run(job, file, name) {
    const { player, app } = this.ctx;
    const current = () => this.job === job && player.song === job.song && !job.cancelled;
    let stage = job.tempo ? "tempo" : "chords";
    let analysis = job.tempo ? null : app.analysis;
    let fit = null;
    try {
      this.say(job.tempo ? tr("Finding the tempo of {name}…", { name }) : tr("Finding the chords of {name}…", { name }));
      const audio = await songAudio(job.song, file);
      if (!current()) return;
      const tracker = job.tracker;
      tracker.onprogress = (m) => current() && this._progress(m, name, job);
      if (job.tempo) {
        await this._model(job, config.model);
        if (!current()) return;
        const result = await tracker.detect(audio.slice());
        if (!current()) return;
        fit = gridFromBeats(result.beats, result.downbeats, job.song.duration);
        analysis = {
          version: 1,
          model: config.model.key,
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
      // The chords; should they fail, the tempo found stays.
      stage = "chords";
      let chordError = null;
      try {
        this.say(tr("Finding the chords of {name}…", { name }));
        await this._model(job, config.chordModel);
        if (!current()) return;
        const result = await tracker.chords(audio);
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
      this.job = null;
      const { filled, kept } = this.ctx.apply(analysis, fit) || { filled: 0, kept: false };
      const chordsSaid = chordError
        ? tr("The chords could not be found: {error}", { error: chordError })
        : filled
          ? trn(filled, "Chord suggested in {n} bar: check it by ear.", "Chords suggested in {n} bars: check them by ear.")
          : kept
            ? tr("Suggest chords, in Bars and Chords, fills the empty bars with the chords found.")
            : tr("No chords found in this song.");
      if (!job.tempo) this.say(chordsSaid, chordError ? "error" : "ok", 10000);
      else if (!fit) this.say(tr("No steady beat found in this song: Bars and Chords works by hand."), "", 8000);
      else {
        const v = { bpm: fit.bpm.toFixed(1), meter: fit.meter };
        const tempoSaid =
          fit.quality.driftMs > DRIFT_MS
            ? tr("Tempo found: {bpm} BPM in {meter} on average. It varies in this song: check the grid, towards the end above all.", v)
            : tr("Tempo found: {bpm} BPM in {meter}. Bars and Chords is ready.", v);
        this.say(`${tempoSaid} ${chordsSaid}`, chordError ? "error" : "ok", 10000);
      }
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
      this.ctx.refreshPage();
    }
  }

  _progress(m, name, job) {
    const chords = job.model === config.chordModel;
    if (m.phase === "download") {
      const mb = (b) => Math.round(b / 1e6);
      const v = m.total ? { done: mb(m.done), total: mb(m.total) } : { done: mb(m.done), total: job.model.approxMB };
      if (chords) {
        this.say(m.total ? tr("Downloading the chord model (only the first time): {done} of {total} MB", v) : tr("Downloading the chord model (only the first time): {done} of about {total} MB", v));
      } else {
        this.say(m.total ? tr("Downloading the tempo model (only the first time): {done} of {total} MB", v) : tr("Downloading the tempo model (only the first time): {done} of about {total} MB", v));
      }
    } else if (m.phase === "verify") {
      this.say(chords ? tr("Checking the chord model downloaded…") : tr("Checking the tempo model downloaded…"));
    } else if (m.phase === "spectrogram" || m.phase === "analyse") {
      // The spectrogram is the first tenth of the work, the model the rest.
      const part = m.total ? m.done / m.total : 0;
      const pct = Math.round((m.phase === "spectrogram" ? part * 0.1 : 0.1 + part * 0.9) * 100);
      this.say(tr("Finding the tempo of {name}: {pct}%", { name, pct }));
    } else if (m.phase === "chords-spectrogram" || m.phase === "chords-analyse") {
      // The spectrogram is about half of the work on a graphics card.
      const part = m.total ? m.done / m.total : 0;
      const pct = Math.round((m.phase === "chords-spectrogram" ? part * 0.5 : 0.5 + part * 0.5) * 100);
      this.say(tr("Finding the chords of {name}: {pct}%", { name, pct }));
    }
  }
}
