// EUTERIA Lab: Phase 0 tests on real devices.

import { Engine } from "../src/engine.js";
import { openProject, STEM_NAMES, sliderToGain, gainToSlider, stemsExportFileName } from "../src/project.js";
import { generateSong } from "../src/synth.js";
import { deviceReport } from "../src/device.js";

const $ = (id) => document.getElementById(id);
const SYNC_CLICK_SECONDS = 1.0;
const SPEED_SECONDS = 20;
const MARK_KEY = "euteria-lab-step";
const SYNC_FILES = { new: "sync-test.euteria", old: "sync-test-old.euteria" };
const MAX_EXPORTS = 10; // older exports leave the list, to keep the memory of phones free

const state = {
  device: null,
  context: null,
  engine: null,
  song: null, // {title, songName, duration, sampleRate}
  tracks: [], // per track: key, title, bus, length, gain, on, align, decodeMs, fileBytes, pcmBytes
  alignment: null,
  position: 0,
  playing: false,
  rate: 1,
  semitones: 0,
  loop: { on: false, start: 0, end: 0 },
  busy: false,
  exports: [], // {id, file, url, name, seconds, selected, tempo, key}
  crash: null,
  results: { opened: [], sync: [], stress: [], speed: [], exports: [], downloads: [], shares: [], errors: [], wakeLock: null },
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  const engine = await withTimeout(Engine.create(context), 15000, "The audio engine did not start. Tap Play, or reload the page and try again.");
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
  state.engine = engine;
  updateAudioStatus();
}

function updateAudioStatus() {
  const c = state.context;
  const e = state.engine;
  if (!c || !e || !e.info) return;
  const delay = ((e.info.delay / c.sampleRate) * 1000).toFixed(0);
  const session = "audioSession" in navigator ? ` · audio session: ${navigator.audioSession.type}` : "";
  $("audio-status").textContent = `${c.sampleRate} Hz · engine delay ${delay} ms${session}`;
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
  state.alignment = song.alignment || null;
  for (const t of song.tracks) engine.addTrack(t); // hands the PCM to the audio thread
  state.song = { title: song.title, songName: song.songName, duration: song.duration, sampleRate: song.sampleRate };
  state.position = 0;
  state.loop = { on: false, start: 0, end: 0 };
  engine.setLoop(false, 0, 0);
  engine.seek(0);
  renderTracks();
  updateUi();
}

function alignmentText(a) {
  if (!a || !a.checked) return "";
  if (a.applied) return `Original Track shifted by ${a.offset > 0 ? "+" : ""}${a.offset} samples (${a.ms.toFixed(1)} ms) to line up with the stems.`;
  if (a.confidence < 0.3) return "Original Track not compared with the stems (they do not resemble it enough).";
  return `Original Track already in line with the stems (${a.offset} samples).`;
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
      setStatus("load-status", key ? `Decoding ${key} (${done + 1}/${total})…` : "Lining up the tracks…");
    });
    const openMs = performance.now() - t0;
    let sync = null;
    if (label && label.startsWith("sync")) sync = measureSync(song, label);
    const pcm = song.tracks.reduce((s, t) => s + t.channels.reduce((a, c) => a + c.byteLength, 0), 0);
    loadIntoEngine(song);
    await state.engine.sync();
    unmark();
    const a = song.alignment;
    state.results.opened.push({
      title: song.title,
      tracks: song.tracks.length,
      duration: song.duration,
      fileMB: file.size / 1e6,
      pcmMB: pcm / 1e6,
      openMs,
      lengths: state.tracks.map((t) => `${t.key} ${t.align ? t.align.status : "n/a"}`),
      alignment: a && a.checked ? `${a.applied ? "corrected" : "unchanged"} ${a.offset} samples, confidence ${a.confidence.toFixed(2)}, ${Math.round(a.measureMs)} ms` : "not checked",
    });
    let text = `${song.title}: ${song.tracks.length} tracks, ${fmtTime(song.duration)}, opened in ${(openMs / 1000).toFixed(1)} s, ${fmtMB(pcm)} of audio in memory.`;
    const at = alignmentText(a);
    if (at) text += `\n${at}`;
    if (sync) {
      state.results.sync.push(sync);
      text += `\n${sync.label}: ${sync.ok ? "every track starts on the same sample" : "tracks are NOT aligned"} (offsets in samples: ${sync.offsets.map((o) => `${o.key} ${o.offset}`).join(", ")}).`;
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
function measureSync(song, label) {
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
  const a = song.alignment;
  return {
    label: label === "sync old" ? "Sync test, old format" : "Sync test",
    ok,
    offsets,
    corrected: a && a.applied ? a.offset : 0,
  };
}

async function openSyncTest(which) {
  try {
    setStatus("load-status", "Downloading the sync test file…");
    const response = await fetch(new URL(SYNC_FILES[which], import.meta.url));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    await openFile(new File([blob], SYNC_FILES[which]), which === "old" ? "sync old" : "sync");
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
        exact: "length exact",
        realigned: `length exact after removing ${a.trimStart} decoder samples`,
        mismatch: `length off by ${a.diff} samples`,
        unchecked: "length not checked",
      }[a.status];
      bits.push(`<span class="${a.status === "mismatch" ? "bad" : "good"}">${text}</span>`);
    }
    const al = state.alignment;
    if (t.key === "original" && al && al.checked && al.applied) {
      bits.push(`<span class="good">shifted ${al.offset > 0 ? "+" : ""}${al.offset} samples to match the stems</span>`);
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
    lp.on = !lp.on && lp.end - lp.start >= 0.25;
  } else if (which === "start") {
    lp.start = pos;
    if (lp.end - lp.start < 0.25) lp.end = Math.min(state.song.duration, pos + 8);
  } else if (which === "end") {
    lp.end = pos;
    if (lp.end - lp.start < 0.25) lp.start = Math.max(0, pos - 8);
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
    // A worker that crashed keeps the memory it was lent: that track is lost
    // until the song is opened again.
    if (!t.channels.length || t.channels.some((b) => !b.byteLength)) {
      state.results.errors.push(`${t.key}: track lost after a failed export, open the song again`);
      continue;
    }
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

const canShareFiles = (files) => {
  try {
    return !!(state.device && state.device.handheld && navigator.canShare && navigator.canShare({ files }));
  } catch (_) {
    return false;
  }
};

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
  mark(`MP3 export of ${stems.length} stems`);
  let lent = null;
  try {
    lent = await lendTracks(stems);
    setStatus("export-status", "Measuring the level…");
    const t0 = performance.now();
    const reply = await runWorker(
      {
        type: "export",
        tracks: lent,
        sampleRate: state.context.sampleRate,
        rate: state.rate,
        semitones: state.semitones,
        bitrate: 320,
      },
      (p) => setStatus("export-status", `${p.phase === "measure" ? "Measuring the level" : "Encoding"}… ${Math.round(p.fraction * 100)}%`)
    );
    lent = null;
    restoreTracks(reply.tracks);
    const totalMs = performance.now() - t0;
    const file = new File([reply.mp3], name, { type: "audio/mpeg" });
    for (const e of state.exports) e.selected = false; // the new one is the selection
    state.exports.unshift({
      id: Date.now(),
      file,
      url: URL.createObjectURL(file),
      name,
      seconds: reply.seconds,
      selected: true,
      tempo: Math.round(state.rate * 100),
      key: state.semitones,
    });
    while (state.exports.length > MAX_EXPORTS) URL.revokeObjectURL(state.exports.pop().url);
    renderExports();
    const lowered = reply.reductionDb >= 0.1 ? ` · lowered ${reply.reductionDb.toFixed(1)} dB to avoid clipping` : "";
    const fullNote = fullOn ? " · Original Track not included" : "";
    setStatus("export-status", `Added: ${name}\n${fmtTime(reply.seconds)} · ${fmtMB(file.size)} · ${(totalMs / 1000).toFixed(1)} s${lowered}${fullNote}`, "ok");
    state.results.exports.push({ name, seconds: reply.seconds, mb: file.size / 1e6, totalS: totalMs / 1000, reductionDb: reply.reductionDb });
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

function renderExports() {
  const box = $("exports");
  box.textContent = "";
  for (const e of state.exports) {
    const row = document.createElement("label");
    row.className = "export-item";
    const box2 = document.createElement("input");
    box2.type = "checkbox";
    box2.checked = e.selected;
    box2.addEventListener("change", () => {
      e.selected = box2.checked;
      updateExportActions();
    });
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = e.name;
    const meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent = `${fmtTime(e.seconds)} · ${fmtMB(e.file.size)} · tempo ${e.tempo}% · key ${e.key > 0 ? "+" : ""}${e.key}`;
    row.append(box2, name, meta);
    box.append(row);
  }
  updateExportActions();
}

function selectedExports() {
  return state.exports.filter((e) => e.selected);
}

function updateExportActions() {
  const chosen = selectedExports();
  $("export-actions").hidden = !state.exports.length;
  $("download").disabled = !chosen.length;
  $("download").textContent = chosen.length > 1 ? `Download ${chosen.length} files` : "Download selected";
  const share = $("share");
  share.hidden = !canShareFiles(chosen.length ? chosen.map((e) => e.file) : [new File([new Uint8Array(4)], "x.mp3", { type: "audio/mpeg" })]);
  share.disabled = !chosen.length;
  share.textContent = chosen.length > 1 ? `Share ${chosen.length} files…` : "Share selected…";
}

// One file after the other, each as its own download.
async function downloadSelected() {
  const chosen = selectedExports();
  for (let i = 0; i < chosen.length; i++) {
    const a = document.createElement("a");
    a.href = chosen[i].url;
    a.download = chosen[i].name;
    document.body.append(a);
    a.click();
    a.remove();
    if (i < chosen.length - 1) await sleep(600);
  }
  state.results.downloads.push(`${chosen.length} file(s)`);
  updateReport();
}

async function shareSelected() {
  const files = selectedExports().map((e) => e.file);
  if (!files.length) return;
  try {
    await navigator.share({ files, title: files.length === 1 ? files[0].name : `${files.length} files from EUTERIA` });
    state.results.shares.push(`${files.length} file(s) shared`);
  } catch (error) {
    if (error.name === "AbortError") state.results.shares.push("share sheet closed without sharing");
    else fail("Sharing", error, "export-status");
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
    setStatus("speed-status", "Running…");
    const reply = await runWorker({
      type: "speed",
      tracks: lent.map((t) => ({ ...t, on: true, gain: 1 })),
      sampleRate: state.context.sampleRate,
      rate: state.rate,
      semitones: state.semitones,
      seconds,
    });
    lent = null;
    restoreTracks(reply.tracks);
    unmark();
    const entry = {
      speed: reply.speed,
      worstMs: reply.worstBlockMs,
      blockMs: reply.blockMs,
      worstWindowMs: reply.worstWindowMs,
      windowMs: reply.windowMs,
      tracks: reply.tracks.length,
      rate: state.rate,
      semitones: state.semitones,
    };
    state.results.speed.push(entry);
    const load = (used, available) => `${Math.round((used / available) * 100)}%`;
    setStatus(
      "speed-status",
      `${reply.speed.toFixed(1)}× real time (the engine uses ${load(1, reply.speed)} of the time available)\n` +
        `slowest block: ${reply.worstBlockMs.toFixed(2)} of ${reply.blockMs.toFixed(2)} ms (${load(reply.worstBlockMs, reply.blockMs)})\n` +
        `slowest ${Math.round(reply.windowMs)} ms stretch: ${reply.worstWindowMs.toFixed(1)} ms (${load(reply.worstWindowMs, reply.windowMs)})\n` +
        `${entry.tracks} tracks, tempo ${Math.round(state.rate * 100)}%, key ${state.semitones >= 0 ? "+" : ""}${state.semitones}`,
      "ok"
    );
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
  $("sync-old").disabled = !idle;
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
    lines.push(`Audio: ${state.context.sampleRate} Hz · base latency ${state.context.baseLatency ? (state.context.baseLatency * 1000).toFixed(1) + " ms" : "n/a"}${e ? ` · engine latency in ${e.inputLatency} / out ${e.outputLatency} samples` : ""} · engine v2 (streaming)`);
  }
  if (state.crash) lines.push(`PREVIOUS ATTEMPT INTERRUPTED during: ${state.crash.step} (${state.crash.at})`);
  for (const o of r.opened) {
    lines.push(`Opened: ${o.title} · ${o.tracks} tracks · ${fmtTime(o.duration)} · file ${o.fileMB.toFixed(1)} MB · ${o.pcmMB.toFixed(0)} MB in memory · ${(o.openMs / 1000).toFixed(1)} s`);
    lines.push(`  lengths: ${o.lengths.join(", ")}`);
    lines.push(`  original vs stems: ${o.alignment}`);
  }
  for (const s of r.sync) lines.push(`${s.label}: ${s.ok ? "OK" : "FAILED"} · offsets ${s.offsets.map((o) => `${o.key} ${o.offset}`).join(", ")}${s.corrected ? ` · original corrected by ${s.corrected}` : ""}`);
  for (const s of r.stress) lines.push(`Stress: ${s.minutes} min × 7 tracks loaded · ${s.mb.toFixed(0)} MB · generated in ${s.genS.toFixed(1)} s`);
  for (const s of r.speed) lines.push(`Speed: ${s.speed.toFixed(1)}× real time · slowest block ${s.worstMs.toFixed(2)} of ${s.blockMs.toFixed(2)} ms · slowest ${Math.round(s.windowMs)} ms stretch ${s.worstWindowMs.toFixed(1)} ms · ${s.tracks} tracks · tempo ${Math.round(s.rate * 100)}% · key ${s.semitones}`);
  for (const x of r.exports) lines.push(`Export: ${x.name} · ${fmtTime(x.seconds)} · ${x.mb.toFixed(1)} MB · ${x.totalS.toFixed(1)} s${x.reductionDb >= 0.1 ? ` · lowered ${x.reductionDb.toFixed(1)} dB` : ""}`);
  for (const x of r.downloads) lines.push(`Download: ${x}`);
  for (const x of r.shares) lines.push(`Share: ${x}`);
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
    ["Share files", d.handheld ? (d.shareFiles ? "yes" : "no (download instead)") : "not used on computers"],
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
  // The taps that will produce sound also unlock audio on iOS.
  for (const id of ["sync", "sync-old", "stress", "play"]) $(id).addEventListener("click", unlockAudio);
  document.querySelector("label[for=file]").addEventListener("click", unlockAudio);
  $("file").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    openFile(file);
  });
  $("sync").addEventListener("click", () => openSyncTest("new"));
  $("sync-old").addEventListener("click", () => openSyncTest("old"));
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
  $("export").addEventListener("click", exportMp3);
  $("download").addEventListener("click", downloadSelected);
  $("share").addEventListener("click", shareSelected);
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
    // Sharing is offered on phones and tablets only: computers download.
    $("share-report").hidden = !(state.device.handheld && navigator.share);
  } catch (error) {
    fail("Device check", error);
  }
  updateReport();
}

// Hooks for the automated tests.
window.euteriaLab = { state, ensureAudio, openFile, runWorker, lendTracks, restoreTracks, loadIntoEngine, updateReport };

init();
