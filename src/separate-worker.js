/*
 * Web Worker that separates a song into six stems with BS-RoFormer SW, the
 * model of EUTERIA (Python), on the graphics card through ONNX Runtime Web
 * and WebGPU.
 *
 * The model file is the BS-RoFormer SW checkpoint converted to ONNX without
 * its STFT (bs-roformer-web): it takes the spectrogram of 345 STFT frames and
 * returns the six masked spectrograms. The STFT and the inverse STFT run here
 * (src/stft.js), and the song is cut into overlapping chunks and put back
 * together as demix_track() does in EUTERIA (Python): two chunks over every
 * sample, linear fades a tenth of a chunk long, reflected edges.
 *
 * The model is downloaded once into the browser's private storage (OPFS).
 *
 * Messages: status, download, delete (model files), load (ONNX Runtime and
 * the session), separate. Progress goes out as {type: "progress", phase, ...}.
 */

import { Stft } from "./stft.js";

const STEMS = ["bass", "drums", "other", "vocals", "guitar", "piano"]; // order of the model output
const CHANNELS = 2;
const N_FFT = 2048;
const HOP = 512;
const BINS = N_FFT / 2 + 1;
const FRAMES = 345; // time size the model was converted with
const CHUNK = HOP * (FRAMES - 1); // 176128 samples, the inverse STFT length of 345 frames
const OVERLAP = 2; // num_overlap of EUTERIA (Python)
const STEP = CHUNK / OVERLAP;
const FADE = Math.floor(CHUNK / 10);
const BORDER = CHUNK - STEP;
const MODEL_DIR = "euteria-models";
const INPUTS = ["spec_real", "spec_imag"];
const OUTPUTS = ["out_spec_real", "out_spec_imag"];

let ort = null;
let runtimeKey = null;
let session = null;
let sessionKey = null;
let backend = null;

self.onmessage = async (event) => {
  const msg = event.data;
  try {
    let reply;
    if (msg.type === "status") reply = await status(msg.model);
    else if (msg.type === "download") reply = await download(msg.model);
    else if (msg.type === "delete") reply = await removeModel(msg.model);
    else if (msg.type === "load") reply = await load(msg);
    else if (msg.type === "separate") {
      const { result, transfer } = await separate(msg);
      self.postMessage({ type: "reply", id: msg.id, ...result }, transfer);
      return;
    } else throw new Error(`Unknown request ${msg.type}`);
    self.postMessage({ type: "reply", id: msg.id, ...reply });
  } catch (error) {
    self.postMessage({ type: "error", id: msg.id, message: String((error && error.message) || error) });
  }
};

const progress = (phase, data) => self.postMessage({ type: "progress", phase, ...data });

// ----- model files ----------------------------------------------------------------

async function modelsDir() {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(MODEL_DIR, { create: true });
}

async function fileHandle(dir, name) {
  try {
    return await dir.getFileHandle(name);
  } catch (_) {
    return null;
  }
}

// A model counts as present when its description file exists: that file is
// written only after the download is complete and checked.
async function status(model) {
  const dir = await modelsDir();
  const handle = await fileHandle(dir, model.file);
  const metaHandle = await fileHandle(dir, `${model.file}.json`);
  if (!handle || !metaHandle) return { cached: false };
  const meta = JSON.parse(await (await metaHandle.getFile()).text());
  const size = (await handle.getFile()).size;
  if (size !== meta.bytes || meta.url !== model.url) return { cached: false };
  return { cached: true, bytes: size, sha256: meta.sha256, savedAt: meta.savedAt };
}

async function download(model) {
  const dir = await modelsDir();
  await dir.removeEntry(`${model.file}.json`).catch(() => {});
  const handle = await dir.getFileHandle(model.file, { create: true });
  const access = await handle.createSyncAccessHandle();
  const t0 = performance.now();
  let bytes = 0;
  let total = 0;
  try {
    access.truncate(0);
    const response = await fetch(model.url);
    if (!response.ok) throw new Error(`The model download failed (HTTP ${response.status}).`);
    total = Number(response.headers.get("content-length")) || 0;
    const reader = response.body.getReader();
    let reported = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      access.write(value, { at: bytes });
      bytes += value.byteLength;
      const now = performance.now();
      if (now - reported > 250) {
        reported = now;
        progress("download", { done: bytes, total, ms: now - t0 });
      }
    }
    access.flush();
  } finally {
    access.close();
  }
  if (total && bytes !== total) throw new Error(`The model download stopped early (${bytes} of ${total} bytes).`);
  const downloadMs = performance.now() - t0;
  progress("verify", { done: bytes, total: bytes });
  const data = await (await handle.getFile()).arrayBuffer();
  const sha256 = hex(await crypto.subtle.digest("SHA-256", data));
  const meta = { bytes, sha256, url: model.url, savedAt: new Date().toISOString() };
  const metaHandle = await dir.getFileHandle(`${model.file}.json`, { create: true });
  const writer = await metaHandle.createSyncAccessHandle();
  try {
    const text = new TextEncoder().encode(JSON.stringify(meta));
    writer.truncate(0);
    writer.write(text, { at: 0 });
    writer.flush();
  } finally {
    writer.close();
  }
  return { cached: true, bytes, sha256, downloadMs };
}

async function removeModel(model) {
  if (session && sessionKey && sessionKey.startsWith(`${model.file}|`)) {
    await session.release().catch(() => {});
    session = null;
    sessionKey = null;
  }
  const dir = await modelsDir();
  await dir.removeEntry(`${model.file}.json`).catch(() => {});
  await dir.removeEntry(model.file).catch(() => {});
  return { cached: false };
}

function hex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ----- ONNX Runtime and the session ---------------------------------------------------

async function load({ model, runtime, ep }) {
  if (ort && runtimeKey !== runtime.key) throw new Error("Another ONNX Runtime is already loaded in this worker.");
  if (!ort) {
    ort = await import(runtime.base + runtime.bundle);
    ort.env.wasm.wasmPaths = runtime.base;
    ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
    ort.env.logLevel = "error";
    runtimeKey = runtime.key;
  }
  const key = `${model.file}|${ep}`;
  if (session && sessionKey === key) return { reused: true, backend };
  if (session) {
    await session.release().catch(() => {});
    session = null;
    sessionKey = null;
  }
  const dir = await modelsDir();
  const handle = await fileHandle(dir, model.file);
  if (!handle) throw new Error("The model is not downloaded.");
  const bytes = new Uint8Array(await (await handle.getFile()).arrayBuffer());
  let adapter = null;
  if (ep === "webgpu") {
    if (!navigator.gpu) throw new Error("WebGPU is not available in this browser.");
    const a = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!a) throw new Error("No graphics adapter for WebGPU.");
    const info = a.info || {};
    adapter = [info.vendor, info.architecture, info.description].filter(Boolean).join(" ") || "unknown";
    // Without 16-bit floats in the shaders the half-precision model does not
    // fail: it returns silence. Refuse it up front.
    if (model.half && !a.features.has("shader-f16")) {
      throw new Error("This graphics card cannot run the half-precision model: choose full precision (fp32).");
    }
  }
  const t0 = performance.now();
  session = await ort.InferenceSession.create(bytes, {
    executionProviders: [ep],
    // As bs-roformer-web found, this graph runs faster on WebGPU unoptimised.
    graphOptimizationLevel: "disabled",
    logSeverityLevel: 3, // errors only: the note on shape nodes kept on the CPU is expected
  });
  const createMs = performance.now() - t0;
  for (const name of INPUTS) if (!session.inputNames.includes(name)) throw new Error(`The model has no input "${name}".`);
  for (const name of OUTPUTS) if (!session.outputNames.includes(name)) throw new Error(`The model has no output "${name}".`);
  sessionKey = key;
  backend = { ep, adapter, ortVersion: ort.env.versions ? ort.env.versions.web || ort.env.versions.common : "" };
  return { reused: false, createMs, backend };
}

// ----- separation --------------------------------------------------------------------

// Linear fade in and out, as get_windowing_array() in EUTERIA (Python):
// torch.linspace includes both ends.
function chunkWindow() {
  const w = new Float32Array(CHUNK).fill(1);
  for (let i = 0; i < FADE; i++) {
    const v = FADE === 1 ? 0 : i / (FADE - 1);
    w[i] *= v;
    w[CHUNK - FADE + i] *= 1 - v;
  }
  return w;
}

// A backend that cannot run part of the graph may return zeros or NaN instead
// of failing: a sample of the output must be finite, and not silent when the
// input is not.
function checkOutput(out, input) {
  const re = out[OUTPUTS[0]].data;
  let energy = 0;
  for (let i = 0; i < re.length; i += 61) {
    const v = re[i];
    if (!Number.isFinite(v)) throw new Error("The graphics card returned invalid numbers: try the other runtime or full precision.");
    energy += v * v;
  }
  let inputEnergy = 0;
  for (let i = 0; i < input.length; i += 61) inputEnergy += input[i] * input[i];
  if (energy === 0 && inputEnergy > 1e-6) {
    throw new Error("The graphics card returned silence: try the other runtime or full precision.");
  }
}

// x[0, n) extended by `border` mirrored samples on both sides (torch "reflect").
function reflectPad(x, border) {
  const n = x.length;
  const out = new Float32Array(n + 2 * border);
  out.set(x, border);
  for (let k = 1; k <= border; k++) {
    out[border - k] = x[k];
    out[border + n - 1 + k] = x[n - 1 - k];
  }
  return out;
}

async function separate({ left, right, sampleRate }) {
  if (!session) throw new Error("The model is not loaded.");
  const t0 = performance.now();
  const n = left.length;
  if (right.length !== n) throw new Error("The two channels differ in length.");
  if (n < N_FFT) throw new Error("The song is too short.");
  const padded = n > 2 * BORDER;
  const mix = padded ? [reflectPad(left, BORDER), reflectPad(right, BORDER)] : [left, right];
  const total = mix[0].length;
  const result = STEMS.map(() => [new Float32Array(total), new Float32Array(total)]);
  const counter = new Float32Array(total);
  const baseWindow = chunkWindow();
  const window = new Float32Array(CHUNK);
  const stft = new Stft(N_FFT, HOP);
  const plane = BINS * FRAMES;
  const specRe = new Float32Array(CHANNELS * plane);
  const specIm = new Float32Array(CHANNELS * plane);
  const part = new Float32Array(CHUNK);
  const wave = new Float32Array(CHUNK);
  const chunks = Math.ceil(total / STEP);
  const times = { stft: 0, run: 0, istft: 0, firstRun: 0 };

  // The chunk starting at `start`, padded to CHUNK samples as demix_track() pads it.
  const fill = (x, start) => {
    const length = Math.min(CHUNK, total - start);
    if (length === CHUNK) return x.subarray(start, start + CHUNK);
    part.set(x.subarray(start, start + length));
    if (length > Math.floor(CHUNK / 2) + 1) {
      for (let j = 1; j < CHUNK - length + 1; j++) part[length - 1 + j] = x[start + length - 1 - j];
    } else {
      part.fill(0, length);
    }
    return part;
  };

  // Adds the model output of one chunk to the result.
  const accumulate = (out, start) => {
    const t = performance.now();
    const length = Math.min(CHUNK, total - start);
    window.set(baseWindow);
    if (start === 0) window.fill(1, 0, FADE);
    else if (start + CHUNK >= total) window.fill(1, CHUNK - FADE);
    const re = out[OUTPUTS[0]].data;
    const im = out[OUTPUTS[1]].data;
    for (let s = 0; s < STEMS.length; s++) {
      for (let c = 0; c < CHANNELS; c++) {
        stft.inverse(re, im, (s * CHANNELS + c) * plane, FRAMES, FRAMES, wave);
        const dst = result[s][c];
        for (let k = 0; k < length; k++) dst[start + k] += wave[k] * window[k];
      }
    }
    for (let k = 0; k < length; k++) counter[start + k] += window[k];
    for (const name of OUTPUTS) if (out[name].dispose) out[name].dispose();
    times.istft += performance.now() - t;
  };

  let previous = null;
  for (let j = 0; j < chunks; j++) {
    const start = j * STEP;
    let t = performance.now();
    for (let c = 0; c < CHANNELS; c++) {
      const frames = stft.forward(fill(mix[c], start), CHUNK, specRe, specIm, c * plane, FRAMES);
      if (frames !== FRAMES) throw new Error("Unexpected number of STFT frames.");
    }
    times.stft += performance.now() - t;
    t = performance.now();
    const feeds = {
      [INPUTS[0]]: new ort.Tensor("float32", specRe, [1, CHANNELS, BINS, FRAMES]),
      [INPUTS[1]]: new ort.Tensor("float32", specIm, [1, CHANNELS, BINS, FRAMES]),
    };
    const running = session.run(feeds);
    // The previous chunk is put together while the graphics card works.
    if (previous) accumulate(previous.out, previous.start);
    const out = await running;
    checkOutput(out, specRe);
    const runMs = performance.now() - t;
    times.run += runMs;
    if (j === 0) times.firstRun = runMs;
    previous = { out, start };
    progress("separate", { done: j + 1, total: chunks, ms: performance.now() - t0 });
  }
  accumulate(previous.out, previous.start);

  const stems = {};
  const transfer = [];
  for (let s = 0; s < STEMS.length; s++) {
    stems[STEMS[s]] = result[s].map((acc) => {
      for (let k = 0; k < total; k++) {
        const w = counter[k];
        acc[k] = w > 0 ? acc[k] / w : 0;
      }
      const channel = padded ? acc.slice(BORDER, BORDER + n) : acc;
      transfer.push(channel.buffer);
      return channel;
    });
    result[s] = null;
  }
  const wallMs = performance.now() - t0;
  return {
    result: { stems, sampleRate, chunks, wallMs, times, backend },
    transfer,
  };
}
