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
const WARMUP_BLOCKS = 64; // the first blocks also compile the code: not counted
const WINDOW_BLOCKS = 8; // 1024 samples, about what the audio output buffers
const EXPORT_PEAK_CEILING = Math.pow(10, -1 / 20); // -1 dBFS, as in EUTERIA (Python)
const MP3_CHUNK = 1152 * 16;

self.onmessage = async (event) => {
  const msg = event.data;
  try {
    if (msg.type === "speed") await speedTest(msg);
    else if (msg.type === "export") await exportSong(msg);
    else if (msg.type === "render") await renderSong(msg);
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
  const core = await self.EuteriaEngineCore.create(msg.sampleRate);
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

// Plays the song from `start` and calls onBlock(left, right, from, to, at) for
// every block of output that belongs to the song (the engine delay at the
// beginning is skipped), `outLength` output samples in all.
function renderPass(core, start, outLength, onBlock, onProgress) {
  const b0 = new Float32Array(BLOCK);
  const b1 = new Float32Array(BLOCK);
  const delay = core.delay;
  const total = outLength + delay;
  let lastReport = 0;
  core.play(start);
  for (let done = 0; done < total; done += BLOCK) {
    core.render(b0, b1, BLOCK);
    const first = done - delay;
    const from = Math.max(0, -first);
    const to = Math.min(BLOCK, outLength - first);
    if (to > from) onBlock(b0, b1, from, to, first + from);
    if (onProgress && done - lastReport > core.sampleRate * 5) {
      lastReport = done;
      onProgress(done / total);
    }
  }
}

function songLength(core, msg) {
  const start = msg.start || 0;
  const songSamples = msg.seconds != null ? Math.round(msg.seconds * msg.sampleRate) : Math.max(0, core.length - Math.round(start * msg.sampleRate));
  return Math.round(songSamples / core.rate);
}

// How fast the engine runs, and its slowest moments: the slowest single block
// and the slowest stretch of WINDOW_BLOCKS blocks, against the time playback
// gives them. Crackles come from those moments, not from the average.
async function speedTest(msg) {
  const core = await buildCore(msg);
  const blocks = Math.ceil(Math.round(msg.seconds * msg.sampleRate) / BLOCK);
  const b0 = new Float32Array(BLOCK);
  const b1 = new Float32Array(BLOCK);
  const stamps = new Float64Array(blocks + 1);
  core.play(msg.start || 0);
  for (let i = 0; i < blocks; i++) {
    stamps[i] = performance.now();
    core.render(b0, b1, BLOCK);
  }
  stamps[blocks] = performance.now();
  let worstBlock = 0;
  let worstWindow = 0;
  for (let i = Math.min(WARMUP_BLOCKS, blocks - 1); i < blocks; i++) {
    worstBlock = Math.max(worstBlock, stamps[i + 1] - stamps[i]);
    if (i + WINDOW_BLOCKS <= blocks) worstWindow = Math.max(worstWindow, stamps[i + WINDOW_BLOCKS] - stamps[i]);
  }
  const wallMs = stamps[blocks] - stamps[0];
  const blockMs = (BLOCK / msg.sampleRate) * 1000;
  const back = returnTracks(core);
  self.postMessage(
    {
      type: "speed",
      id: msg.id,
      seconds: (blocks * BLOCK) / msg.sampleRate,
      wallMs,
      speed: (blocks * blockMs) / wallMs,
      worstBlockMs: worstBlock,
      blockMs,
      worstWindowMs: worstWindow,
      windowMs: WINDOW_BLOCKS * blockMs,
      tracks: back.tracks,
    },
    back.transfer
  );
}

// Raw render for the automated tests: float samples, no peak correction.
async function renderSong(msg) {
  const core = await buildCore(msg);
  const outLength = songLength(core, msg);
  const left = new Float32Array(outLength);
  const right = new Float32Array(outLength);
  let peak = 0;
  renderPass(core, msg.start || 0, outLength, (b0, b1, from, to, at) => {
    left.set(b0.subarray(from, to), at);
    right.set(b1.subarray(from, to), at);
  });
  for (let i = 0; i < outLength; i++) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  const back = returnTracks(core);
  self.postMessage(
    { type: "render", id: msg.id, left: left.buffer, right: right.buffer, peak, delay: core.delay, tracks: back.tracks },
    [left.buffer, right.buffer, ...back.transfer]
  );
}

// The song as it sounds with the given volumes, tempo and key, as MP3. Two
// passes keep the memory flat whatever the length: the first finds the peak,
// the second renders the same audio again, lowers it under -1 dBFS if needed
// and encodes it block by block. As in EUTERIA (Python), the whole song is
// lowered rather than limited, which keeps the balance between the tracks
// exactly as it was.
async function exportSong(msg) {
  const core = await buildCore(msg);
  core.masterLimit = false;
  const sr = msg.sampleRate;
  const start = msg.start || 0;
  const outLength = songLength(core, msg);
  const progress = (phase, fraction) => self.postMessage({ type: "progress", id: msg.id, phase, fraction });

  const t0 = performance.now();
  let peak = 0;
  renderPass(
    core,
    start,
    outLength,
    (b0, b1, from, to) => {
      for (let i = from; i < to; i++) {
        const a = b0[i] < 0 ? -b0[i] : b0[i];
        const b = b1[i] < 0 ? -b1[i] : b1[i];
        if (a > peak) peak = a;
        if (b > peak) peak = b;
      }
    },
    (f) => progress("measure", f)
  );
  const scale = peak > EXPORT_PEAK_CEILING ? EXPORT_PEAK_CEILING / peak : 1;
  const reductionDb = scale < 1 ? 20 * Math.log10(1 / scale) : 0;

  const wasm = new URL("../lib/wasm-media-encoders/mp3.wasm", self.location.href).href;
  const encoder = await self.WasmMediaEncoder.createEncoder("audio/mpeg", wasm);
  encoder.configure({ sampleRate: sr, channels: 2, bitrate: msg.bitrate || 320 });
  const parts = [];
  let bytes = 0;
  const keep = (data) => {
    if (data.length) {
      parts.push(data.slice());
      bytes += data.length;
    }
  };
  const left = new Float32Array(MP3_CHUNK);
  const right = new Float32Array(MP3_CHUNK);
  let fill = 0;
  renderPass(
    core,
    start,
    outLength,
    (b0, b1, from, to) => {
      for (let i = from; i < to; i++) {
        left[fill] = b0[i] * scale;
        right[fill] = b1[i] * scale;
        if (++fill === MP3_CHUNK) {
          keep(encoder.encode([left, right]));
          fill = 0;
        }
      }
    },
    (f) => progress("encode", f)
  );
  if (fill) keep(encoder.encode([left.subarray(0, fill), right.subarray(0, fill)]));
  keep(encoder.finalize());
  const mp3 = new Uint8Array(bytes);
  let offset = 0;
  for (const p of parts) {
    mp3.set(p, offset);
    offset += p.length;
  }
  const totalMs = performance.now() - t0;
  const back = returnTracks(core);
  self.postMessage(
    { type: "export", id: msg.id, mp3: mp3.buffer, seconds: outLength / sr, peak, reductionDb, totalMs, tracks: back.tracks },
    [mp3.buffer, ...back.transfer]
  );
}
