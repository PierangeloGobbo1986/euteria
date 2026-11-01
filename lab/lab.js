// EUTERIA Lab: Phase 0 tests on real devices.

import { Engine } from "../src/engine.js";
import {
  openProject,
  STEM_NAMES,
  sliderToGain,
  gainToSlider,
  stemsExportFileName,
} from "../src/project.js";
import { generateSong } from "../src/synth.js";
import { deviceReport } from "../src/device.js";

const $ = (id) => document.getElementById(id);
const SYNC_CLICK_SECONDS = 1.0;
const SPEED_SECONDS = 20;
const MARK_KEY = "euteria-lab-step";

const state = {
  device: null,
  context: null,
  engine: null,
  song: null, // {title, songName, duration, sampleRate}
  tracks: [], // per track: key, title, bus, length, gain, on, align, decodeMs, fileBytes, pcmBytes
  position: 0,
  playing: false,
  rate: 1,
  semitones: 0,
  loop: { on: false, start: 0, end: 0 },
  preset: "default",
  busy: false,
  lastExport: null,
  crash: null,
  results: { opened: [], sync: null, stress: [], speed: [], exports: [], errors: [], wakeLock: null },
};

// ----- small helpers ----------------------------------------------------------

function fmtTime(s, tenths = false) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return tenths ? `${m}:${sec.toFixed(1).padStart(4, "0")}` : `${m}:${String(Math.floor(sec)).padStart(2, "0")}`;
}
const fmtMB = (bytes) => `${(bytes / 1e6).toFixed(bytes < 1e7 ? 1 : 0)} MB`;
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

function setStatus(id, text, kind = "") {
  const el = $(id);
  el.textContent = text;
  el.className = `status ${kind}`.trim();
}

function mark(step) {
  try {
    localStorage.setItem(MARK_KEY, JSON.stringify({ step, at: new Date().toISOString() }));
  } catch (_) {}
}
function unmark() {
  try {
    localStorage.removeItem(MARK_KEY);
  } catch (_) {}
}
function previousCrash() {
  try {
    const value = localStorage.getItem(MARK_KEY);
    localStorage.removeItem(MARK_KEY);
    return value ? JSON.parse(value) : null;
  } catch (_) {
    return null;
  }
}

function fail(where, error, statusId) {
  const message = (error && error.message) || String(error);
  state.results.errors.push(`${where}: ${message}`);
  if (statusId) setStatus(statusId, `${where} failed: ${message}`, "error");
  console.error(error);
  updateReport();
}

// ----- audio ------------------------------------------------------------------

// Creates and resumes the audio context. Called synchronously at the start of
// every tap that leads to sound: iOS only lets audio start inside a user gesture.
function unlockAudio() {
  if (!state.context) {
    if ("audioSession" in navigator) {
      try {
        navigator.audioSession.type = "playback"; // plays even with the iPhone's silent switch on
      } catch (_) {}
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    state.context = new AudioCtx({ latencyHint: "playback" });
  }
  if (state.context.state !== "running") state.context.resume().catch(() => {});
  return state.context;
}

function withTimeout(promise, ms, message) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms))]);
}

let enginePromise = null;
async function ensureAudio() {
  const context = unlockAudio();
  if (state.engine) return context;
  if (!enginePromise) enginePromise = startEngine(context);
  try {
    await enginePromise;
  } catch (error) {
    enginePromise = null;
    throw error;
  }
  return context;
}

async function startEngine(context) {
  const engine = await withTimeout(
    Engine.create(context, { preset: state.preset }),
    15000,
    "The audio engine did not start. Tap Play, or reload the page and try again."
  );
  engine.node.connect(context.destination);
  engine.onposition = (heard, playing) => {
    state.position = heard;
    state.playing = playing;
    scheduleUi();
  };
  engine.onended = () => {
    state.playing = false;
    releaseWakeLock();
    scheduleUi();
  };
  engine.onlatency = () => updateAudioStatus();
  state.engine = engine;
  updateAudioStatus();
}

function updateAudioStatus() {
  const c = state.context;
  const e = state.engine;
  if (!c || !e) return;
  const latency = e.info ? `${((e.info.delay / c.sampleRate) * 1000).toFixed(0)} ms engine delay` : "";
  const session = "audioSession" in navigator ? ` · audio session: ${navigator.audioSession.type}` : "";
  $("audio-status").textContent = `${c.sampleRate} Hz · ${latency}${session}`;
}

let wakeLock = null;
async function requestWakeLock() {
  if (!("wakeLock" in navigator) || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => (wakeLock = null));
    state.results.wakeLock = "screen kept on during playback";
  } catch (error) {
    state.results.wakeLock = `not granted (${error.message})`;
  }
  updateReport();
}
function releaseWakeLock() {
  if (wakeLock) wakeLock.release().catch(() => {});
  wakeLock = null;
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && state.playing) requestWakeLock();
});

// ----- loading songs -------------------------------------------------------------

function loadIntoEngine(song) {
  const engine = state.engine;
  engine.pause();
  for (const t of state.tracks) engine.removeTrack(t.key);
  state.tracks = song.tracks.map((t) => ({
    key: t.key,
    title: t.title,
    bus: t.bus,
    length: t.length,
    gain: t.gain,
    on: t.on,
    align: t.align || null,
    decodeMs: t.decodeMs ?? null,
    fileBytes: t.fileBytes ?? null,
    pcmBytes: t.channels.reduce((sum, c) => sum + c.byteLength, 0),
  }));
  for (const t of song.tracks) engine.addTrack(t); // hands the PCM to the audio thread
  state.song = { title: song.title, songName: song.songName, duration: song.duration, sampleRate: song.sampleRate };
  state.position = 0;
  state.loop = { on: false, start: 0, end: 0 };
  engine.setLoop(false, 0, 0);
  engine.seek(0);
  state.lastExport = null;
  $("share").hidden = true;
  $("download").hidden = true;
  setStatus("export-status", "");
  renderTracks();
  updateUi();
}

async function openFile(file, label) {
  if (!file || state.busy) return;
  state.busy = true;
  updateUi();
  try {
    const context = await ensureAudio();
    mark(`opening ${label || file.name}`);
    const t0 = performance.now();
    const song = await openProject(file, context, (done, total, key) => {
      setStatus("load-status", key ? `Decoding ${key} (${done + 1}/${total})…` : "Loading…");
    });
    const openMs = performance.now() - t0;
    let sync = null;
    if (label === "sync test") sync = measureSync(song);
    const pcm = song.tracks.reduce((s, t) => s + t.channels.reduce((a, c) => a + c.byteLength, 0), 0);
    loadIntoEngine(song);
    await state.engine.sync();
    unmark();
    const aligned = state.tracks.filter((t) => t.align && t.align.status !== "mismatch").length;
    const entry = {
      title: song.title,
      tracks: song.tracks.length,
      duration: song.duration,
      fileMB: file.size / 1e6,
      pcmMB: pcm / 1e6,
      openMs,
      alignment: state.tracks.map((t) => `${t.key} ${t.align ? t.align.status + (t.align.diff ? ` (${t.align.diff > 0 ? "+" : ""}${t.align.diff})` : "") : "n/a"}`),
    };
    state.results.opened.push(entry);
    let text = `${song.title}: ${song.tracks.length} tracks, ${fmtTime(song.duration)}, opened in ${(openMs / 1000).toFixed(1)} s, ${fmtMB(pcm)} of audio in memory.`;
    if (aligned < state.tracks.length) text += `\nSome tracks did not match their expected length: see below.`;
    if (sync) {
      state.results.sync = sync;
      text += `\nSync test: ${sync.ok ? "every track starts on the same sample" : "tracks are NOT aligned"} (offsets in samples: ${sync.offsets.map((o) => `${o.key} ${o.offset}`).join(", ")}).`;
    }
    setStatus("load-status", text, sync && !sync.ok ? "error" : "ok");
  } catch (error) {
    unmark();
    fail("Opening the song", error, "load-status");
  } finally {
    state.busy = false;
    updateUi();
    updateReport();
  }
}

// Every track of the sync test project has a click at exactly 1.000 s.
function measureSync(song) {
  const offsets = song.tracks.map((t) => {
    const ch = t.channels[0];
    const expected = Math.round(SYNC_CLICK_SECONDS * song.sampleRate);
    const from = Math.max(0, expected - Math.round(0.1 * song.sampleRate));
    const to = Math.min(ch.length, expected + Math.round(0.1 * song.sampleRate));
    let best = from;
    let peak = -1;
    for (let i = from; i < to; i++) {
      const a = Math.abs(ch[i]);
      if (a > peak) {
        peak = a;
        best = i;
      }
    }
    return { key: t.key, offset: best - expected };
  });
  const ok = offsets.every((o) => Math.abs(o.offset) <= 3);
  return { ok, offsets };
}

async function openSyncTest() {
  try {
    setStatus("load-status", "Downloading the sync test file…");
    const response = await fetch(new URL("sync-test.euteria", import.meta.url));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    await openFile(new File([blob], "sync-test.euteria"), "sync test");
  } catch (error) {
    fail("Sync test", error, "load-status");
  }
}

// ----- track list ----------------------------------------------------------------

function renderTracks() {
  const box = $("tracks");
  box.textContent = "";
  for (const t of state.tracks) {
    const row = document.createElement("div");
    row.className = "track";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "toggle";
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = t.title;
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "200";
    slider.value = String(gainToSlider(t.gain));
    slider.setAttribute("aria-label", `${t.title} volume`);
    const level = document.createElement("div");
    level.className = "level";
    const info = document.createElement("div");
    info.className = "info";
    const paint = () => {
      toggle.textContent = t.on ? "On" : "Off";
      toggle.classList.toggle("on", t.on);
      level.textContent = `${slider.value}%`;
    };
    toggle.addEventListener("click", () => {
      t.on = !t.on;
      state.engine.setTrack(t.key, { on: t.on });
      paint();
    });
    slider.addEventListener("input", () => {
      t.gain = sliderToGain(+slider.value);
      state.engine.setTrack(t.key, { gain: t.gain });
      paint();
    });
    const bits = [];
    if (t.fileBytes != null) bits.push(fmtMB(t.fileBytes));
    if (t.decodeMs != null) bits.push(`decoded in ${Math.round(t.decodeMs)} ms`);
    if (t.align) {
      const a = t.align;
      const text = {
        exact: "aligned exactly",
        realigned: `aligned (${a.trimStart} decoder samples removed)`,
        mismatch: `length off by ${a.diff} samples`,
        unchecked: "length not checked",
      }[a.status];
      bits.push(`<span class="${a.status === "mismatch" ? "bad" : "good"}">${text}</span>`);
    }
    info.innerHTML = bits.join(" · ");
    paint();
    row.append(toggle, name, slider, level, info);
    box.append(row);
  }
}

// ----- transport ------------------------------------------------------------------

async function playPause() {
  if (!state.engine || !state.song) return;
  unlockAudio();
  await state.context.resume();
  if (state.playing) {
    state.engine.pause();
    state.playing = false;
    releaseWakeLock();
  } else {
    if (state.position >= state.song.duration - 0.05) state.position = state.loop.on ? state.loop.start : 0;
    state.engine.play(state.position);
    state.playing = true;
    requestWakeLock();
  }
  updateUi();
}

function stop() {
  if (!state.engine) return;
  state.engine.pause();
  state.engine.seek(0);
  state.playing = false;
  state.position = 0;
  releaseWakeLock();
  updateUi();
}

function setLoopFromButtons(which) {
  if (!state.song) return;
  const lp = state.loop;
  const pos = state.position;
  if (which === "toggle") {
    if (!lp.on && !(lp.end > lp.start)) {
      lp.start = Math.max(0, pos);
      lp.end = Math.min(state.song.duration, pos + 8);
    }
    lp.on = !lp.on && lp.end > lp.start;
  } else if (which === "start") {
    lp.start = pos;
    if (lp.end <= lp.start) lp.end = Math.min(state.song.duration, pos + 8);
  } else if (which === "end") {
    lp.end = pos;
    if (lp.start >= lp.end) lp.start = Math.max(0, pos - 8);
  }
  state.engine.setLoop(lp.on, lp.start, lp.end);
  updateUi();
}

// ----- export -------------------------------------------------------------------

function runWorker(message, onProgress) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../src/render-worker.js", import.meta.url));
    const transfer = [];
    for (const t of message.tracks || []) transfer.push(...t.channels);
    worker.onmessage = (event) => {
      const m = event.data;
      if (m.type === "progress") {
        if (onProgress) onProgress(m);
        return;
      }
      worker.terminate();
      if (m.type === "error") {
        const error = new Error(m.message);
        error.tracks = m.tracks;
        reject(error);
      } else resolve(m);
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "worker error"));
    };
    worker.postMessage(message, transfer);
  });
}

function restoreTracks(tracks) {
  for (const t of tracks || []) {
    const meta = state.tracks.find((m) => m.key === t.key);
    state.engine.addTrack({
      key: t.key,
      bus: t.bus,
      channels: t.channels.map((b) => new Int16Array(b)),
      length: t.length,
      gain: meta ? meta.gain : t.gain,
      on: meta ? meta.on : t.on,
    });
  }
}

async function lendTracks(keys) {
  const tracks = await state.engine.takeTracks(keys);
  return tracks.map((t) => ({ ...t, channels: t.channels.map((a) => a.buffer) }));
}

async function exportMp3() {
  if (!state.song || state.busy) return;
  const stems = state.tracks.filter((t) => t.on && STEM_NAMES.includes(t.key)).map((t) => t.key);
  const fullOn = state.tracks.some((t) => t.on && t.key === "original");
  if (!stems.length) {
    setStatus(
      "export-status",
      fullOn
        ? "Exporting the Original Track is basically pointless: it is the file you already have. Switch on the stems you want to combine."
        : "No stem is selected. Switch on the stems you want to combine.",
      "error"
    );
    return;
  }
  if (state.playing) await playPause();
  const name = stemsExportFileName(state.song.songName, stems);
  state.busy = true;
  updateUi();
  $("share").hidden = true;
  $("download").hidden = true;
  mark(`MP3 export of ${stems.length} stems`);
  let lent = null;
  try {
    lent = await lendTracks(stems);
    setStatus("export-status", "Rendering…");
    const t0 = performance.now();
    const reply = await runWorker(
      {
        type: "export",
        tracks: lent,
        sampleRate: state.context.sampleRate,
        preset: state.preset,
        rate: state.rate,
        semitones: state.semitones,
        bitrate: 320,
      },
      (p) => setStatus("export-status", `${p.phase === "render" ? "Rendering" : "Encoding"}… ${Math.round(p.fraction * 100)}%`)
    );
    lent = null;
    restoreTracks(reply.tracks);
    const totalMs = performance.now() - t0;
    const file = new File([reply.mp3], name, { type: "audio/mpeg" });
    state.lastExport = file;
    const url = URL.createObjectURL(file);
    const download = $("download");
    download.href = url;
    download.download = name;
    download.hidden = false;
    let canShare = false;
    try {
      canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
    } catch (_) {}
    $("share").hidden = !canShare;
    const lowered = reply.reductionDb >= 0.1 ? ` · lowered ${reply.reductionDb.toFixed(1)} dB to avoid clipping` : "";
    const fullNote = fullOn ? " · Original Track not included" : "";
    setStatus(
      "export-status",
      `${name}\n${fmtTime(reply.seconds)} · ${fmtMB(file.size)} · render ${(reply.renderMs / 1000).toFixed(1)} s · encode ${(reply.encodeMs / 1000).toFixed(1)} s · total ${(totalMs / 1000).toFixed(1)} s${lowered}${fullNote}`,
      "ok"
    );
    state.results.exports.push({
      name,
      seconds: reply.seconds,
      mb: file.size / 1e6,
      renderS: reply.renderMs / 1000,
      encodeS: reply.encodeMs / 1000,
      totalS: totalMs / 1000,
      reductionDb: reply.reductionDb,
    });
    unmark();
  } catch (error) {
    unmark();
    restoreTracks(error.tracks || (lent ? lent : []));
    fail("MP3 export", error, "export-status");
  } finally {
    state.busy = false;
    updateUi();
    updateReport();
  }
}

async function shareExport() {
  const file = state.lastExport;
  if (!file) return;
  try {
    await navigator.share({ files: [file], title: file.name });
    state.results.shared = "share sheet opened";
  } catch (error) {
    if (error.name !== "AbortError") fail("Sharing", error, "export-status");
  }
  updateReport();
}

// ----- stress and speed tests ------------------------------------------------------

async function stressTest() {
  if (state.busy) return;
  const minutes = +$("stress-min").value;
  state.busy = true;
  updateUi();
  try {
    const context = await ensureAudio();
    mark(`stress test with ${minutes} min`);
    setStatus("stress-status", `Generating ${minutes} min × 7 tracks…`);
    await nextFrame();
    const t0 = performance.now();
    const song = generateSong(minutes, context.sampleRate);
    const genMs = performance.now() - t0;
    const pcm = song.tracks.reduce((s, t) => s + t.channels.reduce((a, c) => a + c.byteLength, 0), 0);
    loadIntoEngine(song);
    await state.engine.sync();
    unmark();
    state.results.stress.push({ minutes, mb: pcm / 1e6, genS: genMs / 1000 });
    setStatus("stress-status", `Loaded ${minutes} min × 7 tracks: ${fmtMB(pcm)} of audio in memory (generated in ${(genMs / 1000).toFixed(1)} s). Press play to listen.`, "ok");
  } catch (error) {
    unmark();
    fail("Stress test", error, "stress-status");
  } finally {
    state.busy = false;
    updateUi();
    updateReport();
  }
}

async function speedTest() {
  if (!state.song || state.busy) return;
  if (state.playing) await playPause();
  state.busy = true;
  updateUi();
  mark("speed test");
  let lent = null;
  try {
    lent = await lendTracks(null);
    const seconds = Math.min(SPEED_SECONDS, state.song.duration);
    const lines = [];
    for (const preset of ["default", "cheaper"]) {
      setStatus("speed-status", `Running (${preset === "default" ? "Default" : "Lighter"})…`);
      const reply = await runWorker({
        type: "speed",
        tracks: lent.map((t) => ({ ...t, on: true, gain: 1 })),
        sampleRate: state.context.sampleRate,
        preset,
        rate: state.rate,
        semitones: state.semitones,
        seconds,
      });
      lent = reply.tracks;
      const entry = { preset, speed: reply.speed, tracks: reply.tracks.length, rate: state.rate, semitones: state.semitones, seconds };
      state.results.speed.push(entry);
      lines.push(`${preset === "default" ? "Default" : "Lighter"}: ${reply.speed.toFixed(1)}× real time`);
    }
    restoreTracks(lent);
    lent = null;
    unmark();
    setStatus("speed-status", `${lines.join(" · ")}\n(${state.tracks.length} tracks, tempo ${Math.round(state.rate * 100)}%, key ${state.semitones >= 0 ? "+" : ""}${state.semitones})`, "ok");
  } catch (error) {
    unmark();
    restoreTracks(error.tracks || lent || []);
    fail("Speed test", error, "speed-status");
  } finally {
    state.busy = false;
    updateUi();
    updateReport();
  }
}

// ----- UI state -------------------------------------------------------------------

let uiScheduled = false;
function scheduleUi() {
  if (uiScheduled) return;
  uiScheduled = true;
  requestAnimationFrame(() => {
    uiScheduled = false;
    updateUi();
  });
}

let seeking = false;
function updateUi() {
  const loaded = !!state.song;
  const idle = !state.busy;
  $("play").disabled = !loaded || !idle;
  $("stop").disabled = !loaded || !idle;
  $("seek").disabled = !loaded || !idle;
  $("export").disabled = !loaded || !idle;
  $("speed").disabled = !loaded || !idle;
  $("stress").disabled = !idle;
  $("sync").disabled = !idle;
  $("play").textContent = state.playing ? "❚❚" : "▶";
  $("play").setAttribute("aria-label", state.playing ? "Pause" : "Play");
  const duration = loaded ? state.song.duration : 0;
  $("time").textContent = `${fmtTime(state.position, true)} / ${fmtTime(duration)}`;
  if (!seeking && duration > 0) $("seek").value = String(Math.round((state.position / duration) * 1000));
  $("tempo-out").textContent = `${Math.round(state.rate * 100)}%`;
  $("key-out").textContent = `${state.semitones > 0 ? "+" : ""}${state.semitones} st`;
  const lp = state.loop;
  $("loop").textContent = lp.on ? "Loop on" : "Loop off";
  $("loop").classList.toggle("on", lp.on);
  $("loop-out").textContent = lp.end > lp.start ? `${fmtTime(lp.start, true)} – ${fmtTime(lp.end, true)}` : "";
}

// ----- report -------------------------------------------------------------------

function updateReport() {
  const d = state.device;
  const r = state.results;
  const lines = [];
  lines.push(`EUTERIA Lab report · ${new Date().toLocaleString()}`);
  if (d) {
    lines.push(`Device: ${d.handheld ? "phone/tablet" : "computer"} · ${d.platform} · ${d.browser.name} ${d.browser.version} (${d.browser.engine})`);
    lines.push(`Mode: ${d.mode === "full" ? "FULL" : "LISTENING"}`);
    lines.push(`CPU cores: ${d.cores ?? "?"} · memory: ${d.memoryGB ? d.memoryGB + " GB" : "not reported"} · screen ${d.screen}`);
    lines.push(`AudioWorklet ${d.audioWorklet ? "yes" : "NO"} · WASM SIMD ${d.wasmSimd ? "yes" : "no"} · audio session ${d.audioSession ? "yes" : "no"} · wake lock ${d.wakeLock ? "yes" : "no"}`);
    lines.push(`Share files ${d.shareFiles ? "yes" : "no"} · save picker ${d.savePicker ? "yes" : "no"} · private storage ${d.opfs ? "yes" : "no"}${d.storage ? ` · quota ${d.storage.quotaGB.toFixed(1)} GB, persisted ${d.storage.persisted ? "yes" : "no"}` : ""}`);
    lines.push(
      d.gpu.available
        ? `WebGPU: ${[d.gpu.vendor, d.gpu.architecture, d.gpu.description].filter(Boolean).join(" ") || "available"}${d.gpu.fallback ? " (software fallback)" : ""} · f16 ${d.gpu.shaderF16 ? "yes" : "no"} · max buffer ${d.gpu.maxBufferMB} MB · max storage binding ${d.gpu.maxStorageBindingMB} MB`
        : `WebGPU: no (${d.gpu.reason})`
    );
  }
  if (state.context) {
    const e = state.engine && state.engine.info;
    lines.push(`Audio: ${state.context.sampleRate} Hz · base latency ${state.context.baseLatency ? (state.context.baseLatency * 1000).toFixed(1) + " ms" : "n/a"}${e ? ` · engine latency in ${e.inputLatency} / out ${e.outputLatency} samples` : ""}`);
  }
  if (state.crash) lines.push(`PREVIOUS ATTEMPT INTERRUPTED during: ${state.crash.step} (${state.crash.at})`);
  for (const o of r.opened) {
    lines.push(`Opened: ${o.title} · ${o.tracks} tracks · ${fmtTime(o.duration)} · file ${o.fileMB.toFixed(1)} MB · ${o.pcmMB.toFixed(0)} MB in memory · ${(o.openMs / 1000).toFixed(1)} s`);
    lines.push(`  alignment: ${o.alignment.join(", ")}`);
  }
  if (r.sync) lines.push(`Sync test: ${r.sync.ok ? "OK" : "FAILED"} · offsets ${r.sync.offsets.map((o) => `${o.key} ${o.offset}`).join(", ")}`);
  for (const s of r.stress) lines.push(`Stress: ${s.minutes} min × 7 tracks loaded · ${s.mb.toFixed(0)} MB · generated in ${s.genS.toFixed(1)} s`);
  for (const s of r.speed) lines.push(`Speed: ${s.preset} ${s.speed.toFixed(1)}× real time · ${s.tracks} tracks · tempo ${Math.round(s.rate * 100)}% · key ${s.semitones}`);
  for (const x of r.exports) lines.push(`Export: ${x.name} · ${fmtTime(x.seconds)} · ${x.mb.toFixed(1)} MB · render ${x.renderS.toFixed(1)} s · encode ${x.encodeS.toFixed(1)} s · total ${x.totalS.toFixed(1)} s${x.reductionDb >= 0.1 ? ` · lowered ${x.reductionDb.toFixed(1)} dB` : ""}`);
  if (r.shared) lines.push(`Share: ${r.shared}`);
  if (r.wakeLock) lines.push(`Wake lock: ${r.wakeLock}`);
  for (const e of r.errors) lines.push(`ERROR ${e}`);
  const notes = $("notes").value.trim();
  if (notes) lines.push(`Notes: ${notes}`);
  if (d) lines.push(`UA: ${d.userAgent}`);
  $("report").value = lines.join("\n");
}

async function copyReport() {
  updateReport();
  const text = $("report").value;
  try {
    await navigator.clipboard.writeText(text);
    setStatus("copy-status", "Report copied: paste it in the chat.", "ok");
  } catch (_) {
    $("report").select();
    const ok = document.execCommand && document.execCommand("copy");
    setStatus("copy-status", ok ? "Report copied: paste it in the chat." : "Select the text above and copy it by hand.", ok ? "ok" : "error");
  }
}

async function shareReport() {
  updateReport();
  try {
    await navigator.share({ title: "EUTERIA Lab report", text: $("report").value });
  } catch (error) {
    if (error.name !== "AbortError") setStatus("copy-status", "Sharing is not available here: use Copy report.", "error");
  }
}

// ----- device card -----------------------------------------------------------------

function renderDevice(d) {
  const mode = $("mode");
  mode.textContent = d.mode === "full" ? "Full mode: this computer can import and separate songs" : "Listening mode";
  mode.className = `mode ${d.mode}`;
  const facts = [
    ["Browser", `${d.browser.name} ${d.browser.version}`],
    ["Device", `${d.handheld ? "Phone or tablet" : "Computer"} · ${d.platform}`],
    ["CPU cores", d.cores ?? "not reported"],
    ["Memory", d.memoryGB ? `${d.memoryGB} GB` : "not reported"],
    ["Audio engine", d.audioWorklet ? "supported" : "NOT supported"],
    ["Silent switch", d.audioSession ? "handled (plays with the switch on)" : "not applicable"],
    ["Share files", d.shareFiles ? "yes" : "no (download instead)"],
    ["WebGPU", d.gpu.available ? (d.gpu.description || d.gpu.vendor || "yes") + (d.gpu.fallback ? " (software)" : "") : "no"],
  ];
  const dl = $("device");
  dl.textContent = "";
  for (const [k, v] of facts) {
    const dt = document.createElement("dt");
    dt.textContent = k;
    const dd = document.createElement("dd");
    dd.textContent = String(v);
    dl.append(dt, dd);
  }
}

// ----- wiring ------------------------------------------------------------------------

function wire() {
  $("file").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    openFile(file);
  });
  // The taps that will produce sound also unlock audio on iOS.
  for (const id of ["sync", "stress", "play"]) $(id).addEventListener("click", unlockAudio);
  document.querySelector("label[for=file]").addEventListener("click", unlockAudio);
  $("sync").addEventListener("click", openSyncTest);
  $("play").addEventListener("click", playPause);
  $("stop").addEventListener("click", stop);
  const seek = $("seek");
  seek.addEventListener("input", () => {
    seeking = true;
    if (!state.song) return;
    state.position = (+seek.value / 1000) * state.song.duration;
    $("time").textContent = `${fmtTime(state.position, true)} / ${fmtTime(state.song.duration)}`;
  });
  seek.addEventListener("change", () => {
    seeking = false;
    if (!state.song) return;
    state.position = (+seek.value / 1000) * state.song.duration;
    state.engine.seek(state.position);
    updateUi();
  });
  $("tempo").addEventListener("input", (e) => {
    state.rate = +e.target.value / 100;
    if (state.engine) state.engine.setRate(state.rate);
    updateUi();
  });
  const key = (delta) => {
    state.semitones = Math.max(-12, Math.min(12, state.semitones + delta));
    if (state.engine) state.engine.setSemitones(state.semitones);
    updateUi();
  };
  $("key-down").addEventListener("click", () => key(-1));
  $("key-up").addEventListener("click", () => key(+1));
  $("loop").addEventListener("click", () => setLoopFromButtons("toggle"));
  $("loop-start").addEventListener("click", () => setLoopFromButtons("start"));
  $("loop-end").addEventListener("click", () => setLoopFromButtons("end"));
  $("preset").addEventListener("change", (e) => {
    state.preset = e.target.value;
    if (state.engine) state.engine.setPreset(state.preset);
  });
  $("export").addEventListener("click", exportMp3);
  $("share").addEventListener("click", shareExport);
  $("stress").addEventListener("click", stressTest);
  $("speed").addEventListener("click", speedTest);
  $("copy").addEventListener("click", copyReport);
  $("share-report").addEventListener("click", shareReport);
  $("notes").addEventListener("input", updateReport);
  document.addEventListener("keydown", (e) => {
    const tag = (e.target && e.target.tagName) || "";
    if (["INPUT", "TEXTAREA", "SELECT"].includes(tag) || e.repeat) return;
    if (e.code === "Space") {
      e.preventDefault();
      playPause();
    } else if (e.key === "l" || e.key === "L") {
      setLoopFromButtons("toggle");
    }
  });
}

async function init() {
  wire();
  state.crash = previousCrash();
  if (state.crash) {
    const el = $("crash");
    el.hidden = false;
    el.textContent = `The page was closed or reloaded during: ${state.crash.step}. If you did not do it yourself, this device ran out of memory there.`;
  }
  updateUi();
  try {
    state.device = await deviceReport();
    renderDevice(state.device);
  } catch (error) {
    fail("Device check", error);
  }
  updateReport();
}

// Hooks for the automated tests.
window.euteriaLab = { state, ensureAudio, openFile, runWorker, lendTracks, restoreTracks, loadIntoEngine, updateReport };

init();
