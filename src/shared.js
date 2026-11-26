// The analysis of a song shared on its own (3.1): its bars, sections and
// chords and its details, without any audio, in a small file
// (.euteria-analysis, JSON) for whoever has the same recording, who imports
// it into their copy (app/app.js: Share analysis, Import analysis). The notes
// stay in EUTERIA: they are not in it.
//
// A fingerprint of the recording goes with it: how much its sound rises, 50
// times a second (soundPrint(): from the log-mel spectrogram the tempo
// detection reads, src/melspec.js), kept in 4 bits a frame (printOf()), and
// where its sound starts. On import the listener's copy gives its own, the
// two are lined up (lineUp(): the best of the lags within LAG_SECONDS; a
// song made of the same bars over and over lines up as well a bar away, so
// among lags almost as good the one nearest to where the two sounds start
// wins) and the grid moves by the difference (sharedGrid()): a copy with some
// tenths of a second of silence more or less at its start (another rip,
// another encoder) gets the bars where its music is. A copy that does not
// line up (another recording: a live version, another edit) is said so.
//
// The file: {format: "euteria-analysis", version, app, created, details
// (those of the song given: src/musicxml.js DETAIL_FIELDS, the title always),
// duration (s), music (as manifest.music has them, src/grid.js musicFields(),
// without the notes), fingerprint: {kind: "onsets", fps, frames, data (the
// frames two to a byte, base64), start (the frame its sound starts at)} or
// null (a song without audio)}.

import { MEL, melFilters } from "./melspec.js";
import { RealFFT, hannWindow } from "./stft.js";
import { readGrid, musicFields, rebuildGrid, emptyGrid, beatsPerBar, nearestBar } from "./grid.js";
import { shiftSections } from "./sections.js";
import { DETAIL_FIELDS, creditOf } from "./musicxml.js";
import { tr } from "./i18n.js";

export const ANALYSIS_EXT = ".euteria-analysis";
export const ANALYSIS_FORMAT = "euteria-analysis";
export const ANALYSIS_VERSION = 1;
export const PRINT_FPS = MEL.fps; // frames a second (50)
export const LAG_SECONDS = 30; // two copies line up within this much
export const MATCH = 0.5; // the likeness from which two copies are the same recording
const NEAR = 0.02; // the likeness a lag one second further from where the sounds start must have more
const START_DB = 45; // the sound starts where it comes within this of its loudest

// Whether a file is one, by its name.
export const isAnalysisFile = (file) => !!file && typeof file.name === "string" && file.name.toLowerCase().endsWith(ANALYSIS_EXT);

// The fingerprint of `signal` (mono, 22050 Hz, as src/beats.js songAudio()
// gives it): {print (printOf()), start (the frame its sound starts at)}.
export async function soundPrint(signal, onProgress = null) {
  const { curve, start } = await onsetCurve(signal, onProgress);
  return { print: printOf(curve), start };
}

// How much the sound of `signal` rises frame after frame (50 a second): what
// each mel band gained in log-magnitude, summed; and the frame its sound
// starts at (within START_DB of its loudest frame). The frames as
// src/melspec.js logMel() cuts them. Yields to the page now and then.
export async function onsetCurve(signal, onProgress = null) {
  const { nFft, hop, bands } = MEL;
  const length = signal.length;
  const pad = nFft >> 1;
  if (length <= pad) return { curve: new Float32Array(0), start: 0 };
  const frames = 1 + Math.floor(length / hop);
  const fft = new RealFFT(nFft);
  const window = hannWindow(nFft);
  const norm = 1 / Math.sqrt(nFft);
  const filters = melFilters();
  const bins = (nFft >> 1) + 1;
  const frame = new Float64Array(nFft);
  const mag = new Float64Array(bins);
  let prev = new Float64Array(bands);
  let cur = new Float64Array(bands);
  const out = new Float32Array(frames);
  const level = new Float32Array(frames);
  const last = 2 * (length - 1);
  for (let t = 0; t < frames; t++) {
    const start = t * hop - pad;
    if (start >= 0 && start + nFft <= length) {
      for (let m = 0; m < nFft; m++) frame[m] = signal[start + m] * window[m];
    } else {
      for (let m = 0; m < nFft; m++) {
        let j = start + m;
        if (j < 0) j = -j;
        else if (j >= length) j = last - j;
        frame[m] = signal[Math.max(0, Math.min(length - 1, j))] * window[m];
      }
    }
    let energy = 0;
    for (let m = 0; m < nFft; m++) energy += frame[m] * frame[m];
    level[t] = energy;
    fft.forward(frame);
    const { Xr, Xi } = fft;
    for (let k = 0; k < bins; k++) mag[k] = Math.sqrt(Xr[k] * Xr[k] + Xi[k] * Xi[k]) * norm;
    let rise = 0;
    for (let b = 0; b < bands; b++) {
      const { start: s, weights } = filters[b];
      let sum = 0;
      for (let i = 0; i < weights.length; i++) sum += mag[s + i] * weights[i];
      cur[b] = Math.log1p(1000 * sum);
      if (t > 0 && cur[b] > prev[b]) rise += cur[b] - prev[b];
    }
    out[t] = rise;
    [prev, cur] = [cur, prev];
    if ((t & 2047) === 2047) {
      if (onProgress) onProgress(t, frames);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  let loudest = 0;
  for (let t = 0; t < frames; t++) loudest = Math.max(loudest, level[t]);
  const floor = loudest * 10 ** (-START_DB / 10);
  let first = 0;
  while (first < frames - 1 && !(level[first] > floor && level[first] > 0)) first++;
  return { curve: out, start: first };
}

// The curve as the fingerprint keeps it: what rises above its own average
// over the second around it, in 16 steps (4 bits) up to the 98th percentile
// of what rises.
export function printOf(curve) {
  const n = curve.length;
  const half = PRINT_FPS >> 1;
  const sums = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) sums[i + 1] = sums[i] + curve[i];
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - half);
    const b = Math.min(n, i + half + 1);
    x[i] = Math.max(0, curve[i] - (sums[b] - sums[a]) / (b - a));
  }
  const rising = Float32Array.from(x.filter((v) => v > 0)).sort();
  const top = rising.length ? rising[Math.floor(0.98 * (rising.length - 1))] : 0;
  const q = new Uint8Array(n);
  if (top > 0) for (let i = 0; i < n; i++) q[i] = Math.min(15, Math.round((x[i] / top) * 15));
  return q;
}

function toBase64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(text) {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// The frames two to a byte (the first in the high half), and back.
export function packPrint(q) {
  const bytes = new Uint8Array((q.length + 1) >> 1);
  for (let i = 0; i < q.length; i++) bytes[i >> 1] |= (q[i] & 15) << (i & 1 ? 0 : 4);
  return toBase64(bytes);
}

export function unpackPrint(text, frames) {
  const bytes = fromBase64(text);
  const n = Math.min(frames, bytes.length * 2);
  const q = new Uint8Array(n);
  for (let i = 0; i < n; i++) q[i] = (bytes[i >> 1] >> (i & 1 ? 0 : 4)) & 15;
  return q;
}

// Smoothed over five frames (an onset falls between two frames as often as
// on one: two copies a fraction of a frame apart still line up), then mean
// 0, spread 1 (all 0 for a flat one).
const SMOOTH = [1, 2, 3, 2, 1];
function standard(raw) {
  const n = raw.length;
  const q = new Float32Array(n);
  const half = SMOOTH.length >> 1;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k < SMOOTH.length; k++) {
      const j = i + k - half;
      if (j >= 0 && j < n) s += SMOOTH[k] * raw[j];
    }
    q[i] = s;
  }
  let mean = 0;
  for (let i = 0; i < n; i++) mean += q[i];
  mean /= n || 1;
  let v = 0;
  for (let i = 0; i < n; i++) v += (q[i] - mean) ** 2;
  const sd = Math.sqrt(v / (n || 1));
  const out = new Float32Array(n);
  if (sd > 0) for (let i = 0; i < n; i++) out[i] = (q[i] - mean) / sd;
  return out;
}

// Where `b` (the fingerprint of the listener's copy) lines up best with `a`
// (that of the copy the analysis was made on): {lag (frames, between them
// too: b[i + lag] is a[i], so the listener's music comes lag / PRINT_FPS
// seconds later), score (how alike they are there, the correlation over what
// they share, 0 to 1), other (the best score of the lags more than a quarter
// of a second away), parts (the score over the first and the second half of
// what they share: one low, the other not, an edit that cuts or adds a
// passage)}. Lags need half of the shorter one shared. Among the peaks, one
// a second further from `near` (frames: where the two sounds start, one
// against the other) must be NEAR more alike to win: a song made of the same
// bars over and over lines up almost as well a bar away.
export function lineUp(a, b, { near = 0, maxLag = LAG_SECONDS * PRINT_FPS } = {}) {
  const za = standard(a);
  const zb = standard(b);
  const na = za.length;
  const nb = zb.length;
  const least = Math.max(1, Math.min(na, nb) >> 1);
  const lags = 2 * maxLag + 1;
  const corr = new Float32Array(lags).fill(-1);
  for (let k = 0; k < lags; k++) {
    const lag = k - maxLag;
    const i0 = Math.max(0, -lag);
    const i1 = Math.min(na, nb - lag);
    if (i1 - i0 < least) continue;
    let s = 0;
    for (let i = i0; i < i1; i++) s += za[i] * zb[i + lag];
    corr[k] = s / (i1 - i0);
  }
  const worth = (k) => corr[k] - (NEAR * Math.abs(k - maxLag - near)) / PRINT_FPS;
  let best = -1;
  for (let k = 0; k < lags; k++) {
    if (corr[k] <= -1 || (k > 0 && corr[k - 1] > corr[k]) || (k < lags - 1 && corr[k + 1] > corr[k])) continue; // a peak
    if (best < 0 || worth(k) > worth(best)) best = k;
  }
  if (best < 0) return { lag: 0, score: 0, other: 0, parts: [0, 0] };
  let frac = 0;
  if (best > 0 && best < lags - 1 && corr[best - 1] > -1 && corr[best + 1] > -1) {
    const [y0, y1, y2] = [corr[best - 1], corr[best], corr[best + 1]];
    const d = y0 - 2 * y1 + y2;
    if (d < 0) frac = Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / d));
  }
  const away = Math.round(PRINT_FPS / 4);
  let other = 0;
  for (let k = 0; k < lags; k++) if (Math.abs(k - best) > away) other = Math.max(other, corr[k]);
  const lag = best - maxLag;
  const i0 = Math.max(0, -lag);
  const i1 = Math.min(na, nb - lag);
  const mid = (i0 + i1) >> 1;
  const part = (from, to) => {
    let s = 0;
    let aa = 0;
    let bb = 0;
    for (let i = from; i < to; i++) {
      s += za[i] * zb[i + lag];
      aa += za[i] * za[i];
      bb += zb[i + lag] * zb[i + lag];
    }
    return aa > 0 && bb > 0 ? Math.max(0, s / Math.sqrt(aa * bb)) : 0;
  };
  return { lag: lag + frac, score: Math.max(0, Math.min(1, corr[best])), other, parts: [part(i0, mid), part(mid, i1)] };
}

const r3 = (t) => Math.round(t * 1000) / 1000;

// The file of an analysis: details (the title always), duration (s), grid
// (src/grid.js), print (soundPrint(), or null), app (who made it).
export function analysisJson({ details, duration, grid, print, app }) {
  const music = musicFields(grid);
  delete music.notes;
  const given = {};
  for (const k of DETAIL_FIELDS) if (details && details[k]) given[k] = details[k];
  return {
    format: ANALYSIS_FORMAT,
    version: ANALYSIS_VERSION,
    app,
    created: new Date().toISOString(),
    details: given,
    duration: r3(duration),
    music,
    fingerprint: print && print.print.length ? { kind: "onsets", fps: PRINT_FPS, frames: print.print.length, data: packPrint(print.print), start: print.start } : null,
  };
}

// The text of a file read back: {details, duration, music, print ({print,
// start}, or null), app}; an Error with what is wrong, said, when it is not
// one.
export function readShared(text) {
  let v = null;
  try {
    v = JSON.parse(text);
  } catch (_) {
    v = null;
  }
  if (!v || typeof v !== "object" || v.format !== ANALYSIS_FORMAT || !v.music || typeof v.music !== "object") throw new Error(tr("This file is not an EUTERIA analysis."));
  if (+v.version > ANALYSIS_VERSION) throw new Error(tr("This analysis was made by a newer EUTERIA: update the app to read it."));
  const details = {};
  for (const k of DETAIL_FIELDS) {
    const c = creditOf(v.details && v.details[k]);
    if (c) details[k] = c;
  }
  let print = null;
  const f = v.fingerprint;
  if (f && f.kind === "onsets" && +f.fps === PRINT_FPS && Number.isInteger(f.frames) && f.frames > 0 && typeof f.data === "string") {
    try {
      print = { print: unpackPrint(f.data, f.frames), start: Number.isInteger(f.start) && f.start >= 0 ? f.start : 0 };
    } catch (_) {
      print = null;
    }
  }
  return { details, duration: +v.duration > 0 ? +v.duration : null, music: v.music, print, app: String(v.app || "") };
}

// Whether the bars of a grid come at a steady tempo (every grid EUTERIA Web
// makes): within 20 ms of those its tempo and first bar give.
function steady(grid) {
  if (!(grid.bpm > 0) || grid.bars.length < 2) return false;
  const period = (beatsPerBar(grid.meter) * 60) / grid.bpm;
  return grid.bars.every((t, i) => Math.abs(t - (grid.bars[0] + i * period)) < 0.02);
}

// The grid of an analysis (readShared()) on a copy of its recording whose
// music comes `delta` seconds later (earlier if negative), `duration`
// seconds long: its bars moved, those before the start and past the end left
// out, the bar numbers, the chords and the sections staying with their bars.
// A grid at a steady tempo is built again from the first of its bars in the
// copy (built: kept as the detection keeps one, by its tempo and anchor);
// another keeps its own beats and bars. The notes of `current` (the song's
// grid) stay at the times they were. {grid, built}.
export function sharedGrid(shared, delta, duration, current) {
  const src = readGrid({ music: shared.music }, Infinity);
  const notesAt = (bars) =>
    current && current.bars.length && current.notes.length && bars.length
      ? current.notes
          .map((n) => ({ ...n, lo: nearestBar(bars, current.bars[Math.min(n.lo, current.bars.length - 1)]), hi: nearestBar(bars, current.bars[Math.min(n.hi, current.bars.length - 1)]) }))
          .filter((n, i, all) => n.hi >= n.lo && all.findIndex((m) => m.lo === n.lo && m.hi === n.hi) === i)
      : [];
  if (!src.bars.length) return { grid: { ...emptyGrid(), meter: src.meter, bpm: src.bpm, notes: [] }, built: false };
  if (steady(src)) {
    const period = (beatsPerBar(src.meter) * 60) / src.bpm;
    const zero = src.bars[0] + delta; // where the first bar of the analysis falls in the copy
    const first = Math.ceil(-zero / period - 1e-9); // the first bar in the copy, counted as the analysis counts them
    const chords = new Map();
    for (const [i, slots] of src.chords) chords.set(i - first, slots);
    const grid = rebuildGrid(
      { ...emptyGrid(), bpm: src.bpm, meter: src.meter, firstBeat: Math.max(0, zero + first * period), offset: src.offset + first, chords, sections: shiftSections(src.sections, -first), notes: [] },
      duration
    );
    delete grid.shift;
    grid.notes = notesAt(grid.bars);
    return { grid, built: true };
  }
  const moved = (list) => list.map((t) => t + delta);
  const bars = moved(src.bars);
  const first = bars.filter((t) => t < -1e-9).length;
  const keep = (t) => t >= -1e-9 && t <= duration + 1e-6;
  const chords = new Map();
  for (const [i, slots] of src.chords) chords.set(i - first, slots);
  const grid = {
    ...emptyGrid(),
    bpm: src.bpm,
    meter: src.meter,
    beats: moved(src.beats).filter(keep).map((t) => Math.max(0, t)),
    bars: bars.filter(keep).map((t) => Math.max(0, t)),
    offset: src.offset + first,
    chords,
    sections: shiftSections(src.sections, -first),
    firstBeat: Math.max(0, src.firstBeat + delta),
  };
  grid.notes = notesAt(grid.bars);
  return { grid, built: false };
}
