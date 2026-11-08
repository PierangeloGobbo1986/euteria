// Separating the instruments of a song in the app (full mode: a computer with
// Chrome or Edge and WebGPU), as EUTERIA (Python) does: BS-RoFormer SW on the
// graphics card (src/separation.js, src/separate-worker.js), at 44.1 kHz with
// chunks overlapping by half, the choices validated on the test page. The six
// stems are encoded to MP3 320 kbps (src/encode-worker.js) and written with
// the Original Track, the grid, the chords and the practice settings in an
// EUTERIA project (.euteria), which then opens in the player.
//
// Where the project goes is asked first, so that a separation left to run on
// its own is saved when it ends. The takes recorded over the song go into the
// new project with it. The model (336 MB, or 669 MB at full
// precision for graphics cards without 16-bit floats) is downloaded the first
// time and kept in the browser.

import { Separator, config, decodeAt } from "../src/separation.js";
import { openZip } from "../src/zip.js";
import { buildProject } from "../src/zipwrite.js";
import { newProjectManifest, newProjectId, savedManifest, manifestBytes, withTakes } from "../src/manifest.js";
import { STEM_NAMES, TRACK_TITLES, checkAlignment } from "../src/project.js";
import { detectBrowser, detectHandheld, webgpuInfo } from "../src/device.js";
import { fmtTime, extensionOf, safeName } from "./controls.js";
import { countEvent } from "./counter.js";

// The separation of the app: the fastest runtime measured on the test page,
// the rate the model was trained at, the overlap of EUTERIA (Python).
const SEPARATION = { runtime: "1.31-opt", rate: 44100, overlap: 0.5 };
// Formats of the Original Track kept as they are (every browser decodes
// them); any other is encoded to MP3, so that the project opens everywhere.
const KEPT = ["mp3", "m4a", "aac", "mp4", "m4b"];
const $ = (id) => document.getElementById(id);

const stopped = () => Object.assign(new Error("Stopped."), { stopped: true });

// What this browser can do: {ok, reason}. Full mode needs a computer, Chrome
// or Edge (they write files where the user chooses) and WebGPU. The graphics
// card itself is asked for only when a separation starts: asking wakes the
// discrete graphics card of a laptop that has two.
function separationSupport(phoneLayout) {
  if (phoneLayout || detectHandheld()) return { ok: false, reason: "phone" };
  const browser = detectBrowser();
  if (!(browser.name === "Chrome" || browser.name === "Edge") || !("showSaveFilePicker" in window)) return { ok: false, reason: "browser" };
  if (!("gpu" in navigator)) return { ok: false, reason: "gpu" };
  return { ok: true, model: null };
}

// The model for this graphics card: half precision where its shaders have
// 16-bit floats, full precision elsewhere.
async function modelForGpu() {
  const gpu = await webgpuInfo();
  if (!gpu.available || gpu.fallback) throw new Error(UNSUPPORTED.gpu);
  return gpu.shaderF16 ? config.models.fp16 : config.models.fp32;
}

const UNSUPPORTED = {
  phone: "To separate the instruments, open the song in EUTERIA on a computer, with Chrome or Edge.",
  browser: "Separating the instruments needs Chrome or Edge on a computer.",
  gpu: "Separating the instruments needs a graphics card this browser can use (WebGPU): it is not available here.",
};

// A few workers encode at once, each a stem at a time.
function encodeAll(jobs, onDone, signal) {
  const count = Math.max(1, Math.min(3, Math.floor((navigator.hardwareConcurrency || 2) / 2), jobs.length));
  const results = new Array(jobs.length);
  let next = 0;
  let done = 0;
  const workers = [];
  return new Promise((resolve, reject) => {
    const finish = (error) => {
      for (const w of workers) w.terminate();
      signal.encoders = null;
      if (error) reject(error);
      else resolve(results);
    };
    signal.encoders = () => finish(stopped());
    const feed = (worker) => {
      if (next >= jobs.length) return;
      const i = next++;
      const job = jobs[i];
      worker.onmessage = (event) => {
        const m = event.data;
        if (m.type === "progress") return;
        if (m.type === "error") return finish(new Error(`The ${job.title} could not be encoded: ${m.message}`));
        results[i] = { bytes: m.bytes, info: m.info };
        onDone(++done, jobs.length);
        if (done === jobs.length) finish(null);
        else feed(worker);
      };
      worker.postMessage({ id: i, left: job.left, right: job.right, sampleRate: job.sampleRate, bitrate: 320 }, [job.left.buffer, job.right.buffer]);
      job.left = job.right = null;
    };
    for (let k = 0; k < count; k++) {
      const worker = new Worker(new URL("../src/encode-worker.js", import.meta.url));
      worker.onerror = (event) => finish(new Error(event.message || "The encoder stopped."));
      workers.push(worker);
      feed(worker);
    }
  });
}

export class SeparationFlow {
  // ctx: {app, player, phone, notice(text, kind, ms), openFile(file, handle)
  // (resolves with the song), practiceState(), refreshPage(), takes()
  // (resolves with {takes, members}: the takes of the song, for the new
  // project)}.
  constructor(ctx) {
    this.ctx = ctx;
    this.support = null;
    this.running = false;
    this.separator = null;
    this.signal = null;
    this.status = null; // {text, kind}
    this.fraction = 0;
    this.wakeLock = null;
    this.onLeave = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    $("sep-stop").addEventListener("click", () => this.stop());
    $("sep-close").addEventListener("click", () => {
      this.status = null;
      this.refresh();
    });
  }

  init() {
    this.support = separationSupport(this.ctx.phone);
    this.ctx.refreshPage();
  }

  // The open song can be separated: it has no stems yet.
  get applicable() {
    const { player } = this.ctx;
    return !!player.song && !player.hasStems;
  }

  get supported() {
    return !!(this.support && this.support.ok);
  }

  get reason() {
    return this.support && !this.support.ok ? UNSUPPORTED[this.support.reason] || "" : "";
  }

  say(text, kind = "", fraction = null) {
    this.status = { text, kind };
    if (fraction !== null) this.fraction = fraction;
    this.refresh();
  }

  // ----- the run ---------------------------------------------------------------------

  async start() {
    const { app, player } = this.ctx;
    if (this.running || !this.applicable || !this.supported || player.busy) return;
    const song = player.song;
    const cur = app.current;
    // Where the project goes: asked first, while the click allows it.
    let target;
    try {
      target = await window.showSaveFilePicker({
        id: "euteria-songs",
        suggestedName: `${safeName(song.title)}.euteria`,
        types: [{ description: "EUTERIA project", accept: { "application/x-euteria": [".euteria"] } }],
      });
    } catch (error) {
      if (!error || error.name !== "AbortError") this.say(`The project cannot be saved there: ${(error && error.message) || error}`, "error");
      return;
    }
    this.running = true;
    this.signal = { stopped: false, encoders: null };
    const signal = this.signal;
    const t0 = performance.now();
    window.addEventListener("beforeunload", this.onLeave);
    this.keepAwake(true);
    this.say("Reading the song…", "", 0);
    try {
      const carried = await this.ctx.takes();
      // The Original Track as a file: the audio file itself, or the member
      // of the project.
      let original;
      let info = null;
      let originalName = cur.file.name;
      let ext = extensionOf(cur.file.name);
      if (song.kind === "audio" || !song.manifest) {
        original = new Uint8Array(await cur.file.arrayBuffer());
      } else {
        const audio = song.manifest.audio || {};
        const member = audio.original_member;
        original = await (await openZip(cur.file)).bytes(member);
        info = (audio.tracks || {})[member] || null;
        originalName = audio.original_filename || member;
        ext = extensionOf(member); // the format of the audio itself
      }
      const keepOriginal = KEPT.includes(ext);

      // The model, on the graphics card (the automated tests give a small one
      // in support.model).
      const model = this.support.model || (await modelForGpu());
      const separator = (this.separator = new Separator());
      separator.onprogress = (m) => this.progress(m, model);
      const status = await separator.status(model);
      if (!status.cached) {
        this.say(`Downloading the separation model (about ${model.approxMB} MB, only the first time)…`, "", 0);
        await separator.download(model);
      }
      if (signal.stopped) throw stopped();
      this.say("Preparing the model on the graphics card…", "", 0);
      await separator.load(model, config.runtimes[SEPARATION.runtime], config.ep, config.rewrite);
      if (signal.stopped) throw stopped();

      // The song at 44.1 kHz, trimmed as the player trims it.
      this.say("Reading the song…", "", 0);
      const rate = SEPARATION.rate;
      const buffer = await decodeAt(original.slice().buffer, rate);
      const align = checkAlignment(buffer.length, info, rate);
      const pick = (c) => buffer.getChannelData(Math.min(c, buffer.numberOfChannels - 1)).slice(align.trimStart, align.trimStart + align.length);
      const left = pick(0);
      const right = pick(1);
      this.seconds = left.length / rate;
      this.sepStart = performance.now();
      this.say("Separating the instruments…", "", 0);
      const result = await separator.separate(left, right, rate, SEPARATION.overlap);
      separator.terminate();
      this.separator = null;
      if (signal.stopped) throw stopped();
      const sepSeconds = (performance.now() - this.sepStart) / 1000;

      // Encoded to MP3: the six stems, and the Original Track unless it is
      // kept as it is.
      const jobs = STEM_NAMES.map((stem) => ({ key: stem, title: `${TRACK_TITLES[stem].toLowerCase()} stem`, left: result.stems[stem][0], right: result.stems[stem][1], sampleRate: rate }));
      if (!keepOriginal) jobs.push({ key: "original", title: "Original Track", left: result.input[0], right: result.input[1], sampleRate: rate });
      result.stems = null;
      this.say("Saving the stems as MP3…", "", 0);
      const encoded = await encodeAll(jobs, (done, total) => this.say(`Saving the stems as MP3… ${done} of ${total}`, "", done / total), signal);
      if (signal.stopped) throw stopped();

      // The project.
      this.say("Writing the project…", "", 1);
      const members = [];
      const tracks = {};
      const stems = {};
      jobs.forEach((job, i) => {
        const name = job.key === "original" ? "audio/original.mp3" : `audio/stems/${job.key}.mp3`;
        if (job.key !== "original") stems[job.key] = name;
        tracks[name] = encoded[i].info;
        members.push({ name, data: encoded[i].bytes });
      });
      const originalMember = keepOriginal ? `audio/original.${ext}` : "audio/original.mp3";
      if (keepOriginal) members.push({ name: originalMember, data: original });
      if (keepOriginal && info) tracks[originalMember] = info;
      const state = this.ctx.practiceState();
      // Every stem is on, the Original Track off, as after a separation in
      // EUTERIA (Python).
      state.tracks = [
        { key: "original", on: false, gain: 1 },
        ...STEM_NAMES.map((k) => ({ key: k, on: true, gain: 1 })),
        ...player.takes.map((t) => ({ key: t.key, on: t.on, gain: t.gain })),
      ];
      const grid = app.grid;
      let manifest;
      if (song.kind === "audio" || !song.manifest) {
        manifest = newProjectManifest({ id: newProjectId(), title: song.title, fileName: originalName, member: originalMember, grid, state });
      } else {
        manifest = savedManifest(song.manifest, grid, state);
        manifest.format_version = 4;
        manifest.variant = "web";
      }
      manifest.audio = { ...(manifest.audio || {}), original_filename: originalName, original_member: originalMember, stems: Object.fromEntries(STEM_NAMES.map((k) => [k, stems[k]])), transposed_member: null, transposed_stems: {}, tracks };
      withTakes(manifest, carried.takes);
      manifest.separation = {
        status: "done",
        model: model.file,
        quality: "standard",
        error: null,
        job_id: null,
        separated_with: "EUTERIA Web",
        sample_rate: rate,
        overlap: SEPARATION.overlap,
      };
      const blob = await buildProject([
        { name: "manifest.json", data: manifestBytes(manifest) },
        ...members.filter((m) => m.name === originalMember),
        ...members.filter((m) => m.name !== originalMember),
        ...carried.members,
      ]);
      const w = await target.createWritable();
      try {
        await w.write(blob);
        await w.close();
      } catch (error) {
        await w.abort().catch(() => {});
        throw error;
      }
      const saved = await target.getFile();
      const back = JSON.parse(await (await openZip(saved)).text("manifest.json"));
      if (back.project_id !== manifest.project_id) throw new Error("the file read back is not the one written");
      countEvent("separation-done");

      // The separated song, in the player.
      this.running = false;
      this.cleanUp();
      const total = (performance.now() - t0) / 1000;
      const opened = await this.ctx.openFile(saved, target);
      this.say(
        `Separated in ${fmtTime(sepSeconds)} (${(this.seconds / sepSeconds).toFixed(1)}× real time), ${fmtTime(total)} in all. Saved in ${saved.name}${opened ? ": the six stems are in the tracks." : "."}`,
        "ok",
        1
      );
    } catch (error) {
      const wasStopped = signal.stopped || (error && (error.stopped || error.message === "Stopped."));
      this.running = false;
      this.cleanUp();
      // Nothing was written: the empty file chosen goes away.
      try {
        if ((await target.getFile()).size === 0 && target.remove) await target.remove();
      } catch (_) {}
      this.say(wasStopped ? "Separation stopped: nothing was saved." : `The separation failed: ${(error && error.message) || error}`, wasStopped ? "" : "error", 0);
      countEvent(wasStopped ? "separation-stopped" : "separation-failed");
    }
  }

  progress(m, model) {
    if (!this.running) return;
    if (m.phase === "download") {
      const left = m.total && m.done ? ((m.total - m.done) * m.ms) / m.done / 1000 : 0;
      const mb = (b) => `${Math.round(b / 1e6)} MB`;
      this.say(
        `Downloading the separation model (only the first time): ${mb(m.done)}${m.total ? ` of ${mb(m.total)}` : ` of about ${model.approxMB} MB`}${left ? ` · about ${fmtTime(left)} left` : ""}`,
        "",
        m.total ? m.done / m.total : 0
      );
    } else if (m.phase === "verify") {
      this.say("Checking the model downloaded…", "", 1);
    } else if (m.phase === "separate") {
      const left = ((m.total - m.done) * m.ms) / m.done / 1000;
      const speed = ((m.done / m.total) * this.seconds) / (m.ms / 1000);
      this.say(`Separating the instruments: ${Math.round((m.done / m.total) * 100)}% · ${speed.toFixed(1)}× real time · about ${fmtTime(left)} left`, "", m.done / m.total);
    }
  }

  stop() {
    if (!this.running || !this.signal) return;
    this.signal.stopped = true;
    if (this.separator) this.separator.terminate(); // the pending call fails with "Stopped."
    if (this.signal.encoders) this.signal.encoders();
    this.say("Stopping…");
  }

  cleanUp() {
    if (this.separator) this.separator.terminate();
    this.separator = null;
    window.removeEventListener("beforeunload", this.onLeave);
    this.keepAwake(false);
    this.ctx.refreshPage();
  }

  // The computer does not go to sleep while the separation runs.
  async keepAwake(on) {
    try {
      if (on && !this.wakeLock && navigator.wakeLock) this.wakeLock = await navigator.wakeLock.request("screen");
      else if (!on && this.wakeLock) {
        await this.wakeLock.release();
        this.wakeLock = null;
      }
    } catch (_) {
      this.wakeLock = null;
    }
  }

  // ----- the page -------------------------------------------------------------------------

  refresh() {
    const panel = $("sep-panel");
    const show = this.running || !!this.status;
    panel.hidden = !show;
    if (!show) return;
    const text = $("sep-text");
    const s = this.status || { text: "", kind: "" };
    if (text.textContent !== s.text) text.textContent = s.text;
    const cls = `sep-text ${s.kind}`.trim();
    if (text.className !== cls) text.className = cls;
    $("sep-fill").style.width = `${Math.round(Math.max(0, Math.min(1, this.fraction)) * 1000) / 10}%`;
    $("sep-bar").hidden = !this.running;
    $("sep-stop").hidden = !this.running;
    $("sep-close").hidden = this.running;
  }
}
