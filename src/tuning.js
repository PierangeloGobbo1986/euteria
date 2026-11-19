// The tuning of a song (2.18): how far its notes lie from those of the equal
// temperament with A at 440 Hz, in cents (−50 to +50, as a tuner shows it).
//
// Frames of about 0.19 s of the music (a Hann window, each frame half over
// the one before); in each, the peaks of the spectrum between 80 Hz and
// 2 kHz within 40 dB of the strongest, their frequency refined by a parabola
// through the log magnitudes of the peak's bin and its two neighbours (less
// the small bias a Hann window gives it). Each peak's distance from the
// nearest note, in cents, goes into a histogram that wraps around (−50 and
// +50 are the same place: a note 50 cents sharp is the next one 50 cents
// flat), weighted by the peak's strength against the frame's strongest.
// Smoothed over a few cents, its highest point is the tuning, which the mean
// of the distances within 10 cents of it refines (again from the mean found,
// a few times). The overtones of a note in tune are in tune too, but for the
// 5th and the 7th (14 and 31 cents flat), which only make smaller bumps
// further away. Confidence: the share of the weight near the tuning, against
// what an even spread would put there (drums and noise spread their peaks
// evenly). Checked on notes made out of tune on purpose, with vibrato,
// chords, noise and drums, and on recordings moved by known amounts: within
// about 1.5 cents.

import { RealFFT, hannWindow } from "./stft.js";

export const TUNING = {
  reference: 440, // Hz: the A the cents are counted from
  range: 50, // cents either way: the correction (Tempo and key) and the tuning found
  seconds: 0.186, // the frame (8192 samples at 44.1 kHz)
  fMin: 80, // Hz: lower, the bins are too wide for a cent
  fMax: 2000, // Hz: higher, overtones off the notes (stretched pianos, the 7th and beyond)
  floorDb: -40, // peaks this far under the frame's strongest, at most
  silenceDb: -55, // frames quieter than this (RMS, against full scale) are left out
  bins: 10, // bins of the histogram in a cent
  smooth: 6, // cents either way: the smoothing of the histogram
  near: 10, // cents either way: the tuning refined, and its share of the weight
  rounds: 5, // the refinement, again from the mean found
  minWeight: 40, // the weight of 40 frames' strongest peaks, at least, for a result
  minConfidence: 0.12, // under it, no tuning (noise alone gives about 0.1)
  excerpt: 8, // seconds: the excerpts of a long song...
  most: 96, // ...up to this many seconds of it in all (a song as long or shorter: whole)
};

const SPAN = 100 * TUNING.bins; // the histogram: −50 to +50 cents

// The parts of a track of `length` samples measured: the whole of it, or
// excerpts spread over it. [from, to] sample ranges.
export function tuningExcerpts(length, sampleRate) {
  const most = Math.round(TUNING.most * sampleRate);
  if (length <= most) return length > 0 ? [[0, length]] : [];
  const n = Math.round(TUNING.most / TUNING.excerpt);
  const size = Math.round(TUNING.excerpt * sampleRate);
  const out = [];
  for (let i = 0; i < n; i++) {
    const from = Math.max(0, Math.min(length - size, Math.round(((i + 0.5) * length) / n - size / 2)));
    out.push([from, from + size]);
  }
  return out;
}

// A to cents, either way, and back.
export const tuningHz = (cents) => TUNING.reference * 2 ** ((+cents || 0) / 1200);
// A distance in cents brought back to −50..50 (the nearest note).
export const wrapCents = (c) => c - 100 * Math.round(c / 100);

export class TuningMeter {
  constructor(sampleRate) {
    const n = 2 ** Math.round(Math.log2(sampleRate * TUNING.seconds));
    this.sampleRate = sampleRate;
    this.n = n;
    this.hop = n >> 1;
    this.fft = new RealFFT(n);
    this.window = hannWindow(n);
    this.frame = new Float64Array(n);
    this.mag = new Float64Array((n >> 1) + 1);
    this.kMin = Math.max(3, Math.ceil((TUNING.fMin * n) / sampleRate));
    this.kMax = Math.min((n >> 1) - 3, Math.floor((TUNING.fMax * n) / sampleRate));
    this.hist = new Float64Array(SPAN);
    this.weight = 0;
    this.frames = 0;
    this.peaks = 0;
    this.rest = new Float32Array(0); // samples waiting for the next frame
    // The sum of the squares a frame needs (a Hann window keeps 3/8 of the power).
    this.silence = n * 0.375 * 10 ** (TUNING.silenceDb / 10);
    this.floor = 10 ** (TUNING.floorDb / 20);
  }

  // Mono samples (−1 to 1), the next ones of an excerpt; any length.
  add(samples) {
    const { n, hop } = this;
    let x = samples;
    if (this.rest.length) {
      x = new Float32Array(this.rest.length + samples.length);
      x.set(this.rest);
      x.set(samples, this.rest.length);
    }
    let at = 0;
    for (; at + n <= x.length; at += hop) this._frame(x, at);
    this.rest = x.slice(at);
  }

  // The excerpt ends: the next samples do not go on from these.
  gap() {
    this.rest = new Float32Array(0);
  }

  _frame(x, at) {
    const { n, frame, window, mag, kMin, kMax } = this;
    let power = 0;
    for (let i = 0; i < n; i++) {
      const v = x[at + i] * window[i];
      frame[i] = v;
      power += v * v;
    }
    if (power < this.silence) return;
    this.fft.forward(frame);
    const { Xr, Xi } = this.fft;
    let top = 0;
    for (let k = kMin - 2; k <= kMax + 2; k++) {
      const m = Math.hypot(Xr[k], Xi[k]);
      mag[k] = m;
      if (k >= kMin && k <= kMax && m > top) top = m;
    }
    if (!top) return;
    const least = top * this.floor;
    const toCents = 1200 / Math.LN2;
    const binHz = this.sampleRate / n;
    this.frames++;
    for (let k = kMin; k <= kMax; k++) {
      const m = mag[k];
      if (m < least || m <= mag[k - 1] || m < mag[k + 1] || m <= mag[k - 2] || m < mag[k + 2]) continue;
      const a = Math.log(mag[k - 1]);
      const b = Math.log(m);
      const c = Math.log(mag[k + 1]);
      const d = a - 2 * b + c;
      if (!(d < 0)) continue;
      let p = (0.5 * (a - c)) / d;
      p -= (p * (0.25 - p * p)) / 3; // the parabola's bias with a Hann window
      const cents = wrapCents(toCents * Math.log(((k + p) * binHz) / TUNING.reference));
      let i = Math.floor((cents + 50) * TUNING.bins);
      if (i >= SPAN) i -= SPAN;
      else if (i < 0) i += SPAN;
      const w = m / top;
      this.hist[i] += w;
      this.weight += w;
      this.peaks++;
    }
  }

  // {cents (−50 to 50, to a tenth), confidence (0 to 1), frames, peaks}, or
  // null: too little music measured, or no clear tuning in it.
  result() {
    const { hist } = this;
    if (this.weight < TUNING.minWeight) return null;
    const at = (i) => hist[((i % SPAN) + SPAN) % SPAN];
    // The highest point of the histogram smoothed (a triangle), round the circle.
    const r = TUNING.smooth * TUNING.bins;
    let best = -1;
    let pos = 0;
    for (let i = 0; i < SPAN; i++) {
      let s = 0;
      for (let j = -r; j <= r; j++) s += at(i + j) * (r + 1 - Math.abs(j));
      if (s > best) {
        best = s;
        pos = i;
      }
    }
    // The mean of the distances near it, again from the mean found.
    const near = TUNING.near * TUNING.bins;
    let wsum = 0;
    for (let round = 0; round < TUNING.rounds; round++) {
      const c0 = Math.round(pos);
      let sum = 0;
      wsum = 0;
      for (let j = -near; j <= near; j++) {
        const w = at(c0 + j);
        sum += w * j;
        wsum += w;
      }
      pos = c0 + (wsum ? sum / wsum : 0);
    }
    const cents = wrapCents((pos + 0.5) / TUNING.bins - 50);
    const even = (2 * TUNING.near) / 100; // the share an even spread puts near any point
    const confidence = Math.max(0, Math.min(1, (wsum / this.weight - even) / (1 - even)));
    if (confidence < TUNING.minConfidence) return null;
    return { cents: Math.round(cents * 10) / 10 || 0, confidence: Math.round(confidence * 100) / 100, frames: this.frames, peaks: this.peaks };
  }
}
