// The spectrogram Beat This! (the beat and downbeat tracker of the tempo
// detection, src/beats-worker.js) was trained on, computed as its LogMelSpect
// computes it with torchaudio: mono audio at 22050 Hz, frames of 1024
// samples every 441 (50 a second) with a periodic Hann window and reflected
// edges, magnitudes divided by the square root of the frame length (the
// "frame_length" normalisation: torch.stft normalized), 128 mel bands of the
// Slaney scale from 30 Hz to 11 kHz without area normalisation, then
// log(1 + 1000 x).

import { RealFFT, hannWindow } from "./stft.js";

export const MEL = { rate: 22050, nFft: 1024, hop: 441, fMin: 30, fMax: 11000, bands: 128, fps: 50 };

// Hertz to mel and back on the Slaney scale (linear below 1 kHz, logarithmic
// above), as torchaudio and librosa compute it.
const F_SP = 200 / 3;
const MIN_LOG_HZ = 1000;
const MIN_LOG_MEL = MIN_LOG_HZ / F_SP;
const LOGSTEP = Math.log(6.4) / 27;
const hzToMel = (f) => (f >= MIN_LOG_HZ ? MIN_LOG_MEL + Math.log(f / MIN_LOG_HZ) / LOGSTEP : f / F_SP);
const melToHz = (m) => (m >= MIN_LOG_MEL ? MIN_LOG_HZ * Math.exp(LOGSTEP * (m - MIN_LOG_MEL)) : F_SP * m);

// The triangular filters of torchaudio.functional.melscale_fbanks (norm None,
// Slaney scale), each as its first frequency bin and its weights.
export function melFilters({ rate, nFft, fMin, fMax, bands } = MEL) {
  const bins = (nFft >> 1) + 1;
  const nyquist = Math.floor(rate / 2); // sample_rate // 2, as torchaudio
  const freqs = new Float64Array(bins);
  for (let k = 0; k < bins; k++) freqs[k] = (nyquist * k) / (bins - 1);
  const mMin = hzToMel(fMin);
  const mMax = hzToMel(fMax);
  const pts = new Float64Array(bands + 2);
  for (let i = 0; i < bands + 2; i++) pts[i] = melToHz(mMin + ((mMax - mMin) * i) / (bands + 1));
  const filters = [];
  for (let m = 0; m < bands; m++) {
    const lo = pts[m];
    const mid = pts[m + 1];
    const hi = pts[m + 2];
    const weights = [];
    let start = -1;
    for (let k = 0; k < bins; k++) {
      const down = (freqs[k] - lo) / (mid - lo);
      const up = (hi - freqs[k]) / (hi - mid);
      const w = Math.max(0, Math.min(down, up));
      if (w > 0) {
        if (start < 0) start = k;
        weights[k - start] = w;
      } else if (start >= 0) break;
    }
    filters.push({ start: Math.max(0, start), weights: Float64Array.from(weights) });
  }
  return filters;
}

// Number of frames of `length` samples.
export const melFrames = (length) => 1 + Math.floor(length / MEL.hop);

// The log-mel spectrogram of `signal` (Float32Array, mono, 22050 Hz): frames x
// 128 values, frame after frame. `onProgress(done, total)` now and then.
export function logMel(signal, onProgress = null) {
  const { nFft, hop, bands } = MEL;
  const length = signal.length;
  const pad = nFft >> 1;
  if (length <= pad) throw new Error("Too short for the spectrogram.");
  const frames = melFrames(length);
  const fft = new RealFFT(nFft);
  const window = hannWindow(nFft);
  const norm = 1 / Math.sqrt(nFft);
  const filters = melFilters();
  const bins = (nFft >> 1) + 1;
  const frame = new Float64Array(nFft);
  const mag = new Float64Array(bins);
  const out = new Float32Array(frames * bands);
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
        frame[m] = signal[j] * window[m];
      }
    }
    fft.forward(frame);
    const { Xr, Xi } = fft;
    for (let k = 0; k < bins; k++) mag[k] = Math.sqrt(Xr[k] * Xr[k] + Xi[k] * Xi[k]) * norm;
    const row = t * bands;
    for (let b = 0; b < bands; b++) {
      const { start: s, weights } = filters[b];
      let sum = 0;
      for (let i = 0; i < weights.length; i++) sum += mag[s + i] * weights[i];
      out[row + b] = Math.log1p(1000 * sum);
    }
    if (onProgress && (t & 1023) === 0) onProgress(t, frames);
  }
  return { data: out, frames, bands };
}
