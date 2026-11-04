/*
 * Web Worker that encodes audio to MP3, CBR, with LAME compiled to
 * WebAssembly: the stems of a song separated in the app (stereo, 320 kbps),
 * its Original Track when the file it came from is not an MP3 or AAC file,
 * and the takes recorded in the app (mono or stereo).
 *
 * This build of LAME writes no LAME tag, so the gapless information goes in
 * the project's manifest instead (audio.tracks, as EUTERIA (Python) writes
 * it): LAME delays the audio by 576 samples and pads the end to a whole frame
 * of 1152 samples; src/project.js trims both when the song opens, whatever
 * the browser's decoder does with them.
 *
 * Message: {id, left, right (null: mono), sampleRate, bitrate}, the channels
 * as Float32Array or Int16Array; replies {type: "done", id, bytes, info, crc}
 * and gives the channels back (their memory was lent).
 */
"use strict";

importScripts("../lib/wasm-media-encoders/WasmMediaEncoder.min.js");

const ENCODER_DELAY = 576;
const FRAME = 1152;
const STEP = FRAME * 32;
const KBPS = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = ~0 >>> 0;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

// A slice of a channel as floats (16-bit samples are scaled).
function floats(channel, from, to, scratch) {
  if (channel instanceof Float32Array) return channel.subarray(from, to);
  const n = to - from;
  const out = scratch.subarray(0, n);
  for (let i = 0; i < n; i++) out[i] = channel[from + i] / 32768;
  return out;
}

self.onmessage = async (event) => {
  const { id, left, right = null, sampleRate, bitrate = 320 } = event.data;
  try {
    const wasm = new URL("../lib/wasm-media-encoders/mp3.wasm", self.location.href).href;
    const encoder = await self.WasmMediaEncoder.createEncoder("audio/mpeg", wasm);
    const channels = right ? 2 : 1;
    encoder.configure({ sampleRate, channels, bitrate });
    const parts = [];
    let size = 0;
    const keep = (data) => {
      if (data.length) {
        parts.push(data.slice()); // the encoder reuses its output memory
        size += data.length;
      }
    };
    const n = left.length;
    const scratch = [new Float32Array(STEP), new Float32Array(STEP)];
    let reported = 0;
    for (let i = 0; i < n; i += STEP) {
      const end = Math.min(n, i + STEP);
      const block = [floats(left, i, end, scratch[0])];
      if (right) block.push(floats(right, i, end, scratch[1]));
      keep(encoder.encode(block));
      const now = performance.now();
      if (now - reported > 200) {
        reported = now;
        self.postMessage({ type: "progress", id, done: end, total: n });
      }
    }
    keep(encoder.finalize());
    const bytes = new Uint8Array(size);
    let at = 0;
    for (const p of parts) {
      bytes.set(p, at);
      at += p.length;
    }
    const frames = countFrames(bytes);
    const info = {
      codec: "mp3",
      bitrate_kbps: bitrate,
      sample_rate: sampleRate,
      channels,
      frames: n,
      encoder_delay: ENCODER_DELAY,
      padding: frames * FRAME - ENCODER_DELAY - n,
    };
    const transfer = [bytes.buffer, left.buffer];
    if (right) transfer.push(right.buffer);
    self.postMessage({ type: "done", id, bytes, info, crc: crc32(bytes), left, right }, transfer);
  } catch (error) {
    self.postMessage({ type: "error", id, message: String((error && error.message) || error) });
  }
};

// The MPEG audio frames of `bytes`, from their headers.
function countFrames(bytes) {
  let p = 0;
  let frames = 0;
  while (p + 4 <= bytes.length) {
    if (bytes[p] !== 0xff || (bytes[p + 1] & 0xe0) !== 0xe0) {
      p++;
      continue;
    }
    const version = (bytes[p + 1] >> 3) & 3;
    const rate = (RATES[version] || [])[(bytes[p + 2] >> 2) & 3];
    const kbps = KBPS[(bytes[p + 2] >> 4) & 15];
    if (!rate || !kbps) {
      p++;
      continue;
    }
    const padding = (bytes[p + 2] >> 1) & 1;
    const samples = version === 3 ? 1152 : 576;
    frames += samples / FRAME;
    p += Math.floor(((samples / 8) * kbps * 1000) / rate) + padding;
  }
  return Math.round(frames);
}
