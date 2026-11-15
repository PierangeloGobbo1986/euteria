// Tempo and chord detection, wherever the browser can run it: the beats and
// the downbeats of a song found by Beat This!, and its chords by BTC, in
// src/beats-worker.js, from the song as the player has it (its Original
// Track, at 22050 Hz, mono). A computer with a graphics card WebGPU can use
// runs the full model of Beat This! on it; a phone or a tablet, or another
// browser or computer, its small model on the CPU (app/detect.js). This module
// holds the model and runtime choices and talks to the worker; the grid made
// from the beats is in src/tempo.js, the chords of the bars in src/chords.js.

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
// The small model of Beat This! ("small0", 2.1 million parameters, MIT),
// converted to ONNX by others (huggingface.co/ashudesai/songbird-models;
// input [batch, time, 128], any time) and fixed here (its table of positions
// was cut at 300 frames: models/beat-this/fix_rotary.py), kept with the app:
// for phones and tablets, and for browsers and computers without a graphics
// card WebGPU can use, on the CPU.
const SMALL_MODEL = {
  key: "beat-this-small0",
  file: "beat_this_small0.onnx",
  url: new URL("../models/beat-this/small0.onnx", import.meta.url).href,
  sha256: "463a3dabe3764aa1367ea70cf815a54335cc826674f212b723e890fdccbab6be",
  bytes: 10401044,
  approxMB: 10,
  // Its beats come from a logit of -1 (measured on test songs: more beats
  // found on bare clicks and a waltz, as precise on a band).
  beatThreshold: -1,
};
// BTC's large-vocabulary model (MIT), converted to ONNX (models/btc), kept
// with the app; the mean and deviation of the features it was trained with.
const CHORD_MODEL = {
  key: "btc-large-voca",
  file: "btc_large_voca.onnx",
  url: new URL("../models/btc/btc_large_voca.onnx", import.meta.url).href,
  sha256: "02184caa013dfcf9cccfe71712ff5e595a6e047b7d1f79dbeec79e6b219c4e30",
  bytes: 11945151,
  approxMB: 12,
  mean: -2.2279878897355596,
  std: 1.7191329394436938,
};
// The ONNX Runtime Web build the separation uses (WebGPU, and the CPU should
// the graphics card fail); for the CPU alone, its lighter build (half the
// download: no WebGPU in it).
const RUNTIME = { key: "1.31", base: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/", bundle: "ort.webgpu.min.mjs" };
const CPU_RUNTIME = { key: "1.31-wasm", base: RUNTIME.base, bundle: "ort.wasm.min.mjs" };

// Settings the automated tests can change (a stand-in model, local files,
// the CPU instead of WebGPU).
export const config = { model: MODEL, smallModel: SMALL_MODEL, chordModel: CHORD_MODEL, runtime: RUNTIME, cpuRuntime: CPU_RUNTIME, ep: "webgpu" };

// How a detection runs: the full model on the graphics card, or (`light`)
// the small one on the CPU. {model (of the beats), ep, runtime}.
export function detectionPlan(light) {
  return light ? { model: config.smallModel, ep: "wasm", runtime: config.cpuRuntime } : { model: config.model, ep: config.ep, runtime: config.runtime };
}

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
  // Resolves with {beats, downbeats} (seconds), and timings. `plan`: as
  // detectionPlan() gives it (by default, the full model).
  detect(audio, plan = detectionPlan(false)) {
    const { key, base, bundle } = plan.runtime;
    return this._call({ type: "detect", audio, model: plan.model, runtime: { key, base, bundle }, ep: plan.ep }, [audio.buffer]);
  }

  // The chords: `audio` as for detect(). Resolves with {probs (frames x 170,
  // the probability of each of BTC's chords per frame), times (s, the middle
  // of each frame), frames, classes, hop (s)}, and timings.
  chords(audio, plan = detectionPlan(false)) {
    const { key, base, bundle } = plan.runtime;
    return this._call({ type: "chords", audio, model: config.chordModel, runtime: { key, base, bundle }, ep: plan.ep }, [audio.buffer]);
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
