/*
 * Web Worker that runs the EUTERIA engine faster than real time, away from
 * the page: MP3 export, and the speed test of the Phase 0 lab page.
 *
 * The tracks are lent by the page (their memory is transferred, not copied)
 * and handed back in every reply.
 */
"use strict";

// The MP3 encoder goes first: it is a UMD bundle and must not see the
// `module`/`exports` placeholders that signalsmith-module.js declares.
importScripts(
  "../lib/wasm-media-encoders/WasmMediaEncoder.min.js",
  "../lib/signalsmith-stretch/signalsmith-module.js",
  "engine-core.js"
);

const BLOCK = 128; // samples per render call, as in an AudioWorklet
const EXPORT_PEAK_CEILING = Math.pow(10, -1 / 20); // -1 dBFS, as in EUTERIA (Python)
const MP3_CHUNK = 1152 * 16;

self.onmessage = async (event) => {
  const msg = event.data;
  try {
    if (msg.type === "speed") await speedTest(msg);
    else if (msg.type === "export" || msg.type === "render") await exportSong(msg);
  } catch (error) {
    // Hand the tracks back even when something failed.
    const transfer = [];
    const tracks = (msg.tracks || []).map((t) => {
      const channels = t.channels.filter((b) => b && b.byteLength);
      transfer.push(...channels);
      return { ...t, channels };
    });
    self.postMessage({ type: "error", id: msg.id, message: String((error && error.message) || error), tracks }, transfer);
  }
};

async function buildCore(msg) {
  const core = await self.EuteriaEngineCore.create(msg.sampleRate, msg.preset);
  for (const t of msg.tracks) {
    core.addTrack(t.key, t.bus, t.channels.map((b) => new Int16Array(b)), t.length, t.gain, t.on);
  }
  core.setRate(msg.rate || 1);
  core.setSemitones(msg.semitones || 0);
  if (msg.loop) core.setLoop(msg.loop.on, msg.loop.start, msg.loop.end);
  return core;
}

// Hands the tracks back to the page.
function returnTracks(core) {
  const transfer = [];
  const tracks = core.takeTracks().map((t) => {
    const channels = t.ch.map((a) => a.buffer);
    transfer.push(...channels);
    return { key: t.key, bus: t.bus, channels, length: t.length, gain: t.gain, on: t.on };
  });
  return { tracks, transfer };
}

async function speedTest(msg) {
  const core = await buildCore(msg);
  const total = Math.round(msg.seconds * msg.sampleRate);
  const b0 = new Float32Array(BLOCK);
  const b1 = new Float32Array(BLOCK);
  core.play(msg.start || 0);
  const t0 = performance.now();
  for (let done = 0; done < total; done += BLOCK) core.render(b0, b1, BLOCK);
  const wallMs = performance.now() - t0;
  const back = returnTracks(core);
  self.postMessage(
    {
      type: "speed",
      id: msg.id,
      seconds: msg.seconds,
      wallMs,
      speed: msg.seconds / (wallMs / 1000),
      latency: { input: core.inputLatency, output: core.outputLatency, delay: core.delay },
      tracks: back.tracks,
    },
    back.transfer
  );
}

// Renders the song as it sounds with the given tempo and key, from song time
// `start` (default 0) for `seconds` of song (default: to the end), then for
// "export" lowers it under -1 dBFS if needed and encodes it as MP3.
async function exportSong(msg) {
  const core = await buildCore(msg);
  const sr = msg.sampleRate;
  const start = msg.start || 0;
  const songSamples = msg.seconds != null ? Math.round(msg.seconds * sr) : Math.max(0, core.length - Math.round(start * sr));
  const outLength = Math.round(songSamples / core.rate);
  const delay = core.delay; // output samples before the first moment of the song is heard
  const left = new Float32Array(outLength);
  const right = new Float32Array(outLength);
  const b0 = new Float32Array(BLOCK);
  const b1 = new Float32Array(BLOCK);
  core.play(start);
  const t0 = performance.now();
  const total = outLength + delay;
  let lastReport = 0;
  for (let done = 0; done < total; done += BLOCK) {
    core.render(b0, b1, BLOCK);
    const first = done - delay; // output index of b0[0] in the song
    const from = Math.max(0, -first);
    const to = Math.min(BLOCK, outLength - first);
    if (to > from) {
      left.set(b0.subarray(from, to), first + from);
      right.set(b1.subarray(from, to), first + from);
    }
    if (done - lastReport > sr * 5) {
      lastReport = done;
      self.postMessage({ type: "progress", id: msg.id, phase: "render", fraction: done / total });
    }
  }
  const renderMs = performance.now() - t0;
  const back = returnTracks(core);

  let peak = 0;
  for (let i = 0; i < outLength; i++) {
    const a = Math.abs(left[i]);
    const b = Math.abs(right[i]);
    if (a > peak) peak = a;
    if (b > peak) peak = b;
  }
  let reductionDb = 0;
  if (msg.type === "export" && peak > EXPORT_PEAK_CEILING) {
    const scale = EXPORT_PEAK_CEILING / peak;
    for (let i = 0; i < outLength; i++) {
      left[i] *= scale;
      right[i] *= scale;
    }
    reductionDb = 20 * Math.log10(peak / EXPORT_PEAK_CEILING);
  }

  if (msg.type === "render") {
    self.postMessage(
      { type: "render", id: msg.id, left: left.buffer, right: right.buffer, peak, renderMs, delay, tracks: back.tracks },
      [left.buffer, right.buffer, ...back.transfer]
    );
    return;
  }

  const t1 = performance.now();
  const wasm = new URL("../lib/wasm-media-encoders/mp3.wasm", self.location.href).href;
  const encoder = await self.WasmMediaEncoder.createEncoder("audio/mpeg", wasm);
  encoder.configure({ sampleRate: sr, channels: 2, bitrate: msg.bitrate || 320 });
  const parts = [];
  let bytes = 0;
  for (let i = 0; i < outLength; i += MP3_CHUNK) {
    const j = Math.min(outLength, i + MP3_CHUNK);
    const out = encoder.encode([left.subarray(i, j), right.subarray(i, j)]);
    parts.push(out.slice());
    bytes += out.length;
    if (i % (MP3_CHUNK * 64) === 0) {
      self.postMessage({ type: "progress", id: msg.id, phase: "encode", fraction: i / outLength });
    }
  }
  const last = encoder.finalize();
  parts.push(last.slice());
  bytes += last.length;
  const mp3 = new Uint8Array(bytes);
  let offset = 0;
  for (const p of parts) {
    mp3.set(p, offset);
    offset += p.length;
  }
  const encodeMs = performance.now() - t1;
  self.postMessage(
    {
      type: "export",
      id: msg.id,
      mp3: mp3.buffer,
      seconds: outLength / sr,
      peak,
      reductionDb,
      renderMs,
      encodeMs,
      tracks: back.tracks,
    },
    [mp3.buffer, ...back.transfer]
  );
}
