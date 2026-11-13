// Stem separation in the browser, for the full mode: BS-RoFormer SW, the
// model of EUTERIA (Python), runs in src/separate-worker.js on the graphics
// card. This module holds the model and runtime choices, talks to the worker,
// and measures how close two separations are.

import { tr } from "./i18n.js";

const HF = "https://huggingface.co/elicwhite/bs-roformer-sw-6stem-onnx/resolve/main/";
const CDN = "https://cdn.jsdelivr.net/npm/onnxruntime-web@";

// The model converted to ONNX by bs-roformer-web (MIT), downloaded once.
const MODELS = {
  fp16: { key: "fp16", file: "bs_roformer_sw_6stem_fp16.onnx", url: `${HF}bs_roformer_sw_6stem_fp16.onnx`, approxMB: 336, half: true },
  fp32: { key: "fp32", file: "bs_roformer_sw_6stem_fp32.onnx", url: `${HF}bs_roformer_sw_6stem_fp32.onnx`, approxMB: 669, half: false },
};

// Two ONNX Runtime Web builds: the one bs-roformer-web validated this model
// with (WebGPU through JavaScript kernels), and a recent release (native
// WebGPU kernels), the latter also with the graph optimiser on. `key` names
// the build: one worker holds one build.
const ORT_124 = { key: "1.24", base: `${CDN}1.24.0-dev.20251116-b39e144322/dist/`, bundle: "ort.all.min.mjs" };
const ORT_131 = { key: "1.31", base: `${CDN}1.31.1/dist/`, bundle: "ort.webgpu.min.mjs" };
const RUNTIMES = {
  "1.24": { ...ORT_124, id: "1.24", graph: "disabled", label: "ONNX Runtime 1.24", profile: true },
  "1.31": { ...ORT_131, id: "1.31", graph: "disabled", label: "ONNX Runtime 1.31" },
  "1.31-opt": { ...ORT_131, id: "1.31-opt", graph: "all", label: "ONNX Runtime 1.31, graph optimised" },
};

// Number of chunks a separation of `samples` samples takes.
export function chunksFor(samples, overlap = 0.5) {
  const chunk = 512 * 344;
  const step = Math.round(chunk * (1 - overlap));
  const border = chunk - step;
  const total = samples > 2 * border ? samples + 2 * border : samples;
  return Math.ceil(total / step);
}

// Settings the automated tests can change (local files, the CPU instead of
// WebGPU, fewer chunks in the comparison).
export const config = { models: MODELS, runtimes: RUNTIMES, ep: "webgpu", rewrite: true, benchChunks: 6, benchProfileChunk: 2 };

export class Separator {
  constructor() {
    this.worker = null;
    this.runtime = null;
    this.pending = new Map();
    this.nextId = 1;
    this.onprogress = null;
  }

  // A worker can hold one ONNX Runtime build: a different one needs a new worker.
  _worker(runtimeKey) {
    if (this.worker && runtimeKey && this.runtime && this.runtime !== runtimeKey) this.terminate();
    if (!this.worker) {
      this.worker = new Worker(new URL("./separate-worker.js", import.meta.url), { type: "module" });
      this.worker.onmessage = (event) => this._receive(event.data);
      this.worker.onerror = (event) => this._failAll(new Error(event.message || tr("The separation worker stopped.")));
      this.runtime = null;
    }
    if (runtimeKey) this.runtime = runtimeKey;
    return this.worker;
  }

  _receive(m) {
    if (m.type === "progress") {
      if (this.onprogress) this.onprogress(m);
      return;
    }
    const call = this.pending.get(m.id);
    if (!call) return;
    this.pending.delete(m.id);
    // The worker's errors for the user, in the language in use.
    if (m.type === "error") call.reject(new Error(m.text ? tr(m.text, m.vars) : m.message));
    else call.resolve(m);
  }

  _failAll(error) {
    for (const call of this.pending.values()) call.reject(error);
    this.pending.clear();
  }

  _call(message, transfer = [], runtimeKey = null) {
    const worker = this._worker(runtimeKey);
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ ...message, id }, transfer);
    });
  }

  status(model) {
    return this._call({ type: "status", model });
  }

  download(model) {
    return this._call({ type: "download", model });
  }

  remove(model) {
    return this._call({ type: "delete", model });
  }

  load(model, runtime, ep, rewrite = true) {
    const { key, base, bundle } = runtime;
    return this._call({ type: "load", model, runtime: { key, base, bundle }, ep, graph: runtime.graph, rewrite }, [], key);
  }

  // Float32 channels at `sampleRate` (handed over to the worker); resolves
  // with {stems: {bass: [left, right], ...}, chunks, wallMs, times, backend}.
  // `overlap` is the share of each chunk the next one covers again: 0.5 as in
  // EUTERIA (Python), or 0.25.
  separate(left, right, sampleRate, overlap = 0.5) {
    return this._call({ type: "separate", left, right, sampleRate, overlap }, [left.buffer, right.buffer]);
  }

  // The first `maxChunks` chunks only, timed; chunk `profileChunk` also
  // profiled on the graphics card when the runtime can do it.
  benchmark(left, right, sampleRate, { overlap = 0.5, maxChunks = 6, profileChunk = -1 } = {}) {
    return this._call({ type: "benchmark", left, right, sampleRate, overlap, maxChunks, profileChunk }, [left.buffer, right.buffer]);
  }

  terminate() {
    if (this.worker) this.worker.terminate();
    this.worker = null;
    this.runtime = null;
    this._failAll(new Error("Stopped."));
  }
}

// Decodes an audio file at `rate`, whatever rate it was recorded at.
export async function decodeAt(arrayBuffer, rate) {
  const context = new OfflineAudioContext(1, 1, rate);
  return context.decodeAudioData(arrayBuffer);
}

// How close the separation `est` is to `ref` (arrays of channels, same rate,
// 16-bit or float): the best lag within +-maxLag samples (on 10 s from the
// middle), then over the whole length at that lag the correlation, the
// scale-invariant SDR (10 log10 of r^2 / (1 - r^2)) and the level of `est`
// against `ref` in dB.
export function compareStem(ref, est, sampleRate, maxLag = 64) {
  const n = Math.min(ref[0].length, est[0].length);
  const span = Math.min(n - 2 * maxLag, Math.round(10 * sampleRate));
  let lag = 0;
  if (span > sampleRate) {
    const from = Math.floor((n - span) / 2);
    let best = -Infinity;
    const a = ref[0];
    const b = est[0];
    for (let l = -maxLag; l <= maxLag; l++) {
      let sum = 0;
      for (let i = from; i < from + span; i++) sum += a[i] * b[i + l];
      if (sum > best) {
        best = sum;
        lag = l;
      }
    }
  }
  let srr = 0;
  let see = 0;
  let sre = 0;
  const lo = Math.max(0, -lag);
  const hi = Math.min(n, n - lag);
  for (let c = 0; c < Math.min(ref.length, est.length); c++) {
    const a = ref[c];
    const b = est[c];
    for (let i = lo; i < hi; i++) {
      const x = a[i];
      const y = b[i + lag];
      srr += x * x;
      see += y * y;
      sre += x * y;
    }
  }
  const corr = srr > 0 && see > 0 ? sre / Math.sqrt(srr * see) : 0;
  const r2 = Math.min(corr * corr, 1 - 1e-12);
  return {
    lag,
    corr,
    siSdr: 10 * Math.log10(r2 / (1 - r2)),
    levelDb: srr > 0 && see > 0 ? 10 * Math.log10(see / srr) : -Infinity,
  };
}
