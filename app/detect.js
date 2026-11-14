// Finding the tempo of a song as it opens (a computer, Chrome or Edge with
// WebGPU): the beats and the downbeats (Beat This!, src/beats.js), then the
// grid made from them (src/tempo.js). It runs once per song: the result is
// kept in the song (manifest.music.beat_tracking, written by Save and by the
// separation) and, until then, in this browser. The song plays meanwhile;
// Bars and Chords waits for it (app/editor.js), and so does a separation.
// The progress is told in the line under the bar at the top, as the opening
// of the song. The model (about 191 MB) is downloaded the first time and kept
// in the browser.
//
// On a phone, and in the browsers that cannot run it, nothing runs: the grid
// is the one the song brings, or one made by hand.

import { BeatTracker, config, songAudio } from "../src/beats.js";
import { gridFromBeats } from "../src/tempo.js";
import { detectBrowser, detectHandheld } from "../src/device.js";
import { tr } from "../src/i18n.js";

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

// The tempo detection kept in a project (manifest.music.beat_tracking), or null.
export function readAnalysis(manifest) {
  const a = manifest && manifest.music && manifest.music.beat_tracking;
  return a && typeof a === "object" && Array.isArray(a.beats) ? a : null;
}

const ms3 = (list) => list.map((t) => Math.round(t * 1000) / 1000);

export class TempoDetection {
  // ctx: {app, player, phone, notice(text, kind, ms), apply(analysis, fit)
  // (the result, for the song open), refreshPage()}.
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

  // Runs on `song` (just opened from `file`, named `name`) unless it has
  // a result already.
  start(song, file, name) {
    this.cancel();
    if (!this.supported || !song) return;
    const tracker = new BeatTracker();
    const job = { song, tracker };
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

  async _run(job, file, name) {
    const { player } = this.ctx;
    const current = () => this.job === job && player.song === job.song && !job.cancelled;
    try {
      this.say(tr("Finding the tempo of {name}…", { name }));
      const audio = await songAudio(job.song, file);
      if (!current()) return;
      const tracker = job.tracker;
      tracker.onprogress = (m) => current() && this._progress(m, name);
      const status = await tracker.status();
      if (!status.cached) {
        this.say(tr("Downloading the tempo model (about {mb} MB, only the first time)…", { mb: config.model.approxMB }));
        await tracker.download();
      }
      if (!current()) return;
      const result = await tracker.detect(audio);
      if (!current()) return;
      const fit = gridFromBeats(result.beats, result.downbeats, job.song.duration);
      const analysis = {
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
      this.job = null;
      this.ctx.apply(analysis, fit);
      if (!fit) this.say(tr("No steady beat found in this song: Bars and Chords works by hand."), "", 8000);
      else {
        const v = { bpm: fit.bpm.toFixed(1), meter: fit.meter };
        this.say(
          fit.quality.driftMs > DRIFT_MS
            ? tr("Tempo found: {bpm} BPM in {meter} on average. It varies in this song: check the grid, towards the end above all.", v)
            : tr("Tempo found: {bpm} BPM in {meter}. Bars and Chords is ready.", v),
          "ok",
          8000
        );
      }
    } catch (error) {
      if (!current()) return;
      this.job = null;
      this.say(tr("The tempo could not be found: {error} Bars and Chords works by hand.", { error: (error && error.message) || error }), "error", 10000);
    } finally {
      job.tracker.terminate();
      if (this.job === job) this.job = null;
      this.ctx.refreshPage();
    }
  }

  _progress(m, name) {
    if (m.phase === "download") {
      const mb = (b) => Math.round(b / 1e6);
      this.say(
        m.total
          ? tr("Downloading the tempo model (only the first time): {done} of {total} MB", { done: mb(m.done), total: mb(m.total) })
          : tr("Downloading the tempo model (only the first time): {done} of about {total} MB", { done: mb(m.done), total: config.model.approxMB })
      );
    } else if (m.phase === "verify") {
      this.say(tr("Checking the tempo model downloaded…"));
    } else if (m.phase === "spectrogram" || m.phase === "analyse") {
      // The spectrogram is the first tenth of the work, the model the rest.
      const part = m.total ? m.done / m.total : 0;
      const pct = Math.round((m.phase === "spectrogram" ? part * 0.1 : 0.1 + part * 0.9) * 100);
      this.say(tr("Finding the tempo of {name}: {pct}%", { name, pct }));
    }
  }
}
