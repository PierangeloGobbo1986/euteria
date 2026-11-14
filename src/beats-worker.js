/*
 * Web Worker that finds the beats and the downbeats of a song with Beat This!
 * (Foscarin, Schlüter and Widmer, ISMIR 2024, MIT licence): its "final0"
 * model converted to ONNX (musetric/beat-this-onnx), on the graphics card
 * through ONNX Runtime Web and WebGPU.
 *
 * As the beat_this package does it (Audio2Beats, without the DBN): the
 * log-mel spectrogram of the song (src/melspec.js) is cut into windows of
 * 1500 frames (30 s) overlapping by 6 frames at each side, the last one
 * ending at the end of the song (split_piece); the model gives a beat and a
 * downbeat logit per frame; the windows are joined keeping the earlier one
 * where they overlap, without their 6 border frames (aggregate_prediction,
 * keep_first); a beat is a frame whose logit is above 0 and the highest
 * within 3 frames, adjacent ones merged, and each downbeat moves to the
 * nearest beat (Postprocessor "minimal").
 *
 * The model file is downloaded once into the browser's private storage
 * (src/model-store.js). Messages: status, download, detect ({audio: mono
 * Float32Array at 22050 Hz, model, runtime, ep}). Progress goes out as
 * {type: "progress", phase, done, total}. The errors the user may meet go out
 * with their English text and its values ({text, vars}), said by the page in
 * its own language (src/i18n.js).
 */

import { logMel, MEL } from "./melspec.js";
import { modelStatus, downloadModel, modelBytes, fail } from "./model-store.js";

const CHUNK = 1500; // frames the model takes
const BORDER = 6; // frames of each window discarded at its edges
const RADIUS = 3; // a peak is the highest logit within 3 frames on each side

let ort = null;
let runtimeKey = null;
let session = null;
let sessionKey = null;
let backend = null; // "webgpu", or "wasm" when the graphics card could not run it

self.onmessage = async (event) => {
  const msg = event.data;
  try {
    let reply;
    if (msg.type === "status") reply = await modelStatus(msg.model);
    else if (msg.type === "download") reply = await downloadModel(msg.model, progress);
    else if (msg.type === "detect") reply = await detect(msg);
    else throw new Error(`Unknown request ${msg.type}`);
    self.postMessage({ type: "reply", id: msg.id, ...reply });
  } catch (error) {
    self.postMessage({ type: "error", id: msg.id, message: String((error && error.message) || error), text: (error && error.text) || null, vars: (error && error.vars) || null });
  }
};

const progress = (phase, data) => self.postMessage({ type: "progress", phase, ...data });

// ----- ONNX Runtime and the session ---------------------------------------------------

async function load(model, runtime, ep) {
  if (ort && runtimeKey !== runtime.key) throw new Error("Another ONNX Runtime is already loaded in this worker.");
  if (!ort) {
    ort = await import(runtime.base + runtime.bundle);
    ort.env.wasm.wasmPaths = runtime.base;
    ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
    ort.env.logLevel = "error";
    runtimeKey = runtime.key;
  }
  const key = `${model.file}|${ep}`;
  if (session && sessionKey === key) return;
  if (session) {
    await session.release().catch(() => {});
    session = null;
    sessionKey = null;
  }
  // The graphics card; should it fail, the CPU (much slower, but it works).
  const bytes = await modelBytes(model);
  let lastError = null;
  for (const provider of ep === "webgpu" ? ["webgpu", "wasm"] : [ep]) {
    try {
      if (provider === "webgpu") {
        if (!navigator.gpu) throw fail("WebGPU is not available in this browser.");
        const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
        if (!adapter) throw fail("No graphics adapter for WebGPU.");
      }
      session = await ort.InferenceSession.create(bytes, { executionProviders: [provider], graphOptimizationLevel: "all", logSeverityLevel: 3 });
      backend = provider;
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!session) throw lastError;
  const names = session.outputNames;
  if (!session.inputNames.length || !names.includes("beat") || !names.includes("downbeat")) {
    throw new Error("The beat tracking model does not have the inputs and outputs expected.");
  }
  sessionKey = key;
}

// ----- detection -----------------------------------------------------------------------

// split_piece of beat_this: the first frame of each window (it may start
// before the song, padded with zeros), the last one ending at the end.
function windowStarts(frames) {
  const step = CHUNK - 2 * BORDER;
  const starts = [];
  for (let s = -BORDER; s < frames - BORDER; s += step) starts.push(s);
  if (frames > step) starts[starts.length - 1] = frames - (CHUNK - BORDER);
  return starts;
}

async function detect({ audio, model, runtime, ep }) {
  const t0 = performance.now();
  progress("load", {});
  await load(model, runtime, ep);
  const loadMs = performance.now() - t0;

  const mel = logMel(audio, (done, total) => progress("spectrogram", { done, total }));
  const frames = mel.frames;
  const bands = MEL.bands;
  const starts = windowStarts(frames);
  const beat = new Float32Array(frames).fill(-1000);
  const downbeat = new Float32Array(frames).fill(-1000);
  const filled = new Uint8Array(frames);
  const input = new Float32Array(CHUNK * bands);
  const t1 = performance.now();
  progress("analyse", { done: 0, total: starts.length });
  for (let w = 0; w < starts.length; w++) {
    const start = starts[w];
    // The window, zeros outside the song (as zeropad() and the padding to
    // 1500 frames of a short song).
    input.fill(0);
    const from = Math.max(0, start);
    const to = Math.min(frames, start + CHUNK);
    if (to > from) input.set(mel.data.subarray(from * bands, to * bands), (from - start) * bands);
    const out = await session.run({ [session.inputNames[0]]: new ort.Tensor("float32", input, [1, CHUNK, bands]) });
    const b = out.beat.data;
    const d = out.downbeat.data;
    // keep_first: frames already given by an earlier window stay as they are.
    for (let i = BORDER; i < CHUNK - BORDER; i++) {
      const t = start + i;
      if (t < 0 || t >= frames || filled[t]) continue;
      if (!Number.isFinite(b[i]) || !Number.isFinite(d[i])) throw fail("The graphics card returned invalid numbers.");
      beat[t] = b[i];
      downbeat[t] = d[i];
      filled[t] = 1;
    }
    for (const t of Object.values(out)) if (t.dispose) t.dispose();
    progress("analyse", { done: w + 1, total: starts.length });
  }
  const beats = peaks(beat);
  const downbeats = snapDownbeats(peaks(downbeat), beats);
  return {
    beats,
    downbeats,
    frames,
    windows: starts.length,
    backend,
    loadMs,
    analyseMs: performance.now() - t1,
    totalMs: performance.now() - t0,
  };
}

// Times (s) of the frames whose logit is above 0 and the highest within
// RADIUS frames, groups of adjacent ones replaced by their mean
// (deduplicate_peaks, width 1).
function peaks(logits) {
  const n = logits.length;
  const frames = [];
  for (let t = 0; t < n; t++) {
    const v = logits[t];
    if (!(v > 0)) continue;
    let top = true;
    for (let k = Math.max(0, t - RADIUS); k <= Math.min(n - 1, t + RADIUS); k++) {
      if (logits[k] > v) {
        top = false;
        break;
      }
    }
    if (top) frames.push(t);
  }
  const out = [];
  if (!frames.length) return out;
  let p = frames[0];
  let c = 1;
  for (let i = 1; i < frames.length; i++) {
    const p2 = frames[i];
    if (p2 - p <= 1) {
      c += 1;
      p += (p2 - p) / c;
    } else {
      out.push(p);
      p = p2;
      c = 1;
    }
  }
  out.push(p);
  return out.map((f) => f / MEL.fps);
}

// Each downbeat at the nearest beat (the earlier one of two as near, as
// numpy's argmin), without duplicates.
function snapDownbeats(downbeats, beats) {
  if (!beats.length) return downbeats;
  const out = new Set();
  let j = 0;
  for (const d of downbeats) {
    while (j + 1 < beats.length && Math.abs(beats[j + 1] - d) < Math.abs(beats[j] - d)) j++;
    out.add(beats[j]);
  }
  return [...out].sort((a, b) => a - b);
}
