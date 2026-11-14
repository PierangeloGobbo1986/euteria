// Tempo detection (computer, Chrome or Edge with WebGPU): the beats and the
// downbeats of a song found by Beat This! in src/beats-worker.js, from the
// song as the player has it (its Original Track, at 22050 Hz, mono). This
// module holds the model and runtime choices and talks to the worker; the
// grid made from the beats is in src/tempo.js.

import { tr } from "./i18n.js";
import { openZip } from "./zip.js";
import { checkAlignment, STEM_NAMES } from "./project.js";
import { decodeAt } from "./separation.js";
import { MEL } from "./melspec.js";

// The "final0" model of Beat This! (MIT), converted to ONNX for the browser
// with a fixed window of 1500 frames (musetric/beat-this-onnx, MIT).
const MODEL = {
  key: "beat-this-final0",
  file: "beat_this_final0.onnx",
  url: "https://huggingface.co/musetric/beat-this-onnx/resolve/main/beat_this.onnx",
  approxMB: 191,
};
// The ONNX Runtime Web build the separation uses (WebGPU).
const RUNTIME = { key: "1.31", base: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/", bundle: "ort.webgpu.min.mjs" };

// Settings the automated tests can change (a stand-in model, local files,
// the CPU instead of WebGPU).
export const config = { model: MODEL, runtime: RUNTIME, ep: "webgpu" };

export class BeatTracker {
  constructor() {
    this.worker = null;
    this.pending = new Map();
    this.nextId = 1;
    this.onprogress = null;
  }

  _worker() {
    if (!this.worker) {
      this.worker = new Worker(new URL("./beats-worker.js", import.meta.url), { type: "module" });
      this.worker.onmessage = (event) => this._receive(event.data);
      this.worker.onerror = (event) => this._failAll(new Error(event.message || tr("The tempo detection stopped.")));
    }
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
    if (m.type === "error") call.reject(new Error(m.text ? tr(m.text, m.vars) : m.message));
    else call.resolve(m);
  }

  _failAll(error) {
    for (const call of this.pending.values()) call.reject(error);
    this.pending.clear();
  }

  _call(message, transfer = []) {
    const worker = this._worker();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ ...message, id }, transfer);
    });
  }

  status(model = config.model) {
    return this._call({ type: "status", model });
  }

  download(model = config.model) {
    return this._call({ type: "download", model });
  }

  // `audio`: mono Float32Array at 22050 Hz (handed over to the worker).
  // Resolves with {beats, downbeats} (seconds), and timings.
  detect(audio, model = config.model) {
    const { key, base, bundle } = config.runtime;
    return this._call({ type: "detect", audio, model, runtime: { key, base, bundle }, ep: config.ep }, [audio.buffer]);
  }

  terminate() {
    if (this.worker) this.worker.terminate();
    this.worker = null;
    this._failAll(Object.assign(new Error("Stopped."), { stopped: true }));
  }
}

// The song as the tempo detection takes it: its Original Track (or, in a
// project without it, its stems added together), mono, at 22050 Hz, lined
// up as the player lines it up. `file`: the audio file or the project.
export async function songAudio(song, file) {
  const rate = MEL.rate;
  const manifest = song.manifest;
  if (!manifest) return mono(await decodeAt(await file.arrayBuffer(), rate), 0, Infinity);
  const audio = manifest.audio || {};
  const tracks = audio.tracks || {};
  const zip = await openZip(file);
  const one = async (member) => {
    const buffer = await decodeAt((await zip.bytes(member)).slice().buffer, rate);
    const align = checkAlignment(buffer.length, tracks[member] || null, rate);
    return mono(buffer, align.trimStart, align.length);
  };
  if (audio.original_member && zip.has(audio.original_member)) return one(audio.original_member);
  const stems = STEM_NAMES.map((k) => (audio.stems || {})[k]).filter((m) => m && zip.has(m));
  if (!stems.length) throw new Error(tr("This song has no audio to find its tempo in."));
  let sum = null;
  for (const member of stems) {
    const x = await one(member);
    if (!sum) sum = x;
    else for (let i = 0; i < Math.min(sum.length, x.length); i++) sum[i] += x[i];
  }
  return sum;
}

// The mean of the channels of `buffer` from `start`, `length` samples.
function mono(buffer, start, length) {
  const n = Math.max(0, Math.min(length, buffer.length - start));
  const out = new Float32Array(n);
  const channels = buffer.numberOfChannels;
  for (let c = 0; c < channels; c++) {
    const src = buffer.getChannelData(c);
    for (let i = 0; i < n; i++) out[i] += src[start + i];
  }
  if (channels > 1) for (let i = 0; i < n; i++) out[i] /= channels;
  return out;
}
