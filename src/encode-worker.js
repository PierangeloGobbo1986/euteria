/*
 * Web Worker that encodes stereo audio to MP3, 320 kbps CBR, with LAME
 * compiled to WebAssembly: the stems of a song separated in the app, and its
 * Original Track when the file it came from is not an MP3 or AAC file.
 *
 * This build of LAME writes no LAME tag, so the gapless information goes in
 * the project's manifest instead (audio.tracks, as EUTERIA (Python) writes
 * it): LAME delays the audio by 576 samples and pads the end to a whole frame
 * of 1152 samples; src/project.js trims both when the song opens, whatever
 * the browser's decoder does with them.
 *
 * Message: {id, left, right, sampleRate, bitrate}; replies {type: "done", id,
 * bytes, info} and gives the channels back (their memory was lent).
 */
"use strict";

importScripts("../lib/wasm-media-encoders/WasmMediaEncoder.min.js");

const ENCODER_DELAY = 576;
const FRAME = 1152;
const STEP = FRAME * 32;
const KBPS = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

self.onmessage = async (event) => {
  const { id, left, right, sampleRate, bitrate = 320 } = event.data;
  try {
    const wasm = new URL("../lib/wasm-media-encoders/mp3.wasm", self.location.href).href;
    const encoder = await self.WasmMediaEncoder.createEncoder("audio/mpeg", wasm);
    encoder.configure({ sampleRate, channels: 2, bitrate });
    const parts = [];
    let size = 0;
    const keep = (data) => {
      if (data.length) {
        parts.push(data.slice()); // the encoder reuses its output memory
        size += data.length;
      }
    };
    const n = left.length;
    let reported = 0;
    for (let i = 0; i < n; i += STEP) {
      keep(encoder.encode([left.subarray(i, i + STEP), right.subarray(i, i + STEP)]));
      const now = performance.now();
      if (now - reported > 200) {
        reported = now;
        self.postMessage({ type: "progress", id, done: Math.min(n, i + STEP), total: n });
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
      channels: 2,
      frames: n,
      encoder_delay: ENCODER_DELAY,
      padding: frames * FRAME - ENCODER_DELAY - n,
    };
    self.postMessage({ type: "done", id, bytes, info, left, right }, [bytes.buffer, left.buffer, right.buffer]);
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
