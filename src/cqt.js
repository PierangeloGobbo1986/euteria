// The constant-Q spectrogram the chord model (BTC, src/chords.js) was trained
// on, computed as librosa 0.6.3 cqt() computes it with BTC's settings: mono
// audio at 22050 Hz, 144 bins from C1, 24 per octave, a frame every 2048
// samples, librosa's defaults otherwise (Hann window, filters normalised to
// unit sum, a sparsity of 0.01, "scale", reflected edges), in chunks of 10 s
// as BTC computes it, then log(|C| + 1e-6).
//
// The algorithm of librosa: the song halved in rate once at the start (early
// downsampling), then the top octave of filters applied to its spectrum, and
// the song halved again for each octave below, the same filters scaled by √2
// each time. Halving the rate is resampy's "kaiser_fast" filter at the ratio
// 1/2 (a fixed filter of 63 taps), the samples scaled by √2 and padded as
// librosa pads them. Checked against a copy of the librosa 0.6.3 code.

import { RealFFT } from "./stft.js";

export const CQT = {
  rate: 22050,
  hop: 2048,
  bins: 144,
  perOctave: 24,
  octaves: 6,
  fMin: 32.70319566257483, // C1
  chunk: 220500, // 10 s, as BTC computes it
  fps: 22050 / 2048,
};

const N_FFT = 512; // the filters of the top octave fit in 512 samples at 11025 Hz
const SPARSITY = 0.01;
const Q = 1 / (Math.pow(2, 1 / CQT.perOctave) - 1);
const SQRT2 = Math.SQRT2;

// resampy 0.2.2 "kaiser_fast" (16 zero crossings, Kaiser window, roll-off
// 0.85) at a ratio of 1/2: output t = sum of TAPS[|d|] x[2t + d], d from -31
// to 31, zeros outside the signal. TAPS[d] = half_window[256 d] / 2.
const TAPS = Float64Array.from([
  0.425, 0.30830216341429795, 0.07112822013553705, -0.07787546517991395, -0.06044671226860248, 0.022072783704187256,
  0.04543999361054797, 0.0029370512798151307, -0.029324238635524285, -0.01336486165760501, 0.015058829243494012,
  0.015133034251801045, -0.004565985753428699, -0.01222965959319561, -0.0015866448511543474, 0.007705253572500525,
  0.004004295870063132, -0.003585845711763145, -0.003951449339819677, 0.0008230674910944656, 0.002770642601219793,
  0.0005016349864574512, -0.001462946434313953, -0.0008010197125761256, 0.0005340096838485508, 0.0006042688539506513,
  -7.16815794741729e-5, -0.00030959518741516387, -6.237981240086223e-5, 0.00010587823019916228, 4.994826634341643e-5,
  -1.852578272534118e-5,
]);
const REACH = TAPS.length - 1;

// librosa.resample(y, sr, sr / 2, res_type="kaiser_fast", scale=True): the
// resampy output (floor(n / 2) samples), padded with a zero to ceil(n / 2),
// times √2, kept in single precision as librosa keeps it.
export function halve(x) {
  const n = x.length;
  const out = new Float32Array(Math.ceil(n / 2));
  const m = n >> 1;
  for (let t = 0; t < m; t++) {
    const c = 2 * t;
    let acc = TAPS[0] * x[c];
    const lo = Math.min(REACH, c);
    const hi = Math.min(REACH, n - 1 - c);
    const both = Math.min(lo, hi);
    let d = 1;
    for (; d <= both; d++) acc += TAPS[d] * (x[c - d] + x[c + d]);
    for (let e = d; e <= lo; e++) acc += TAPS[e] * x[c - e];
    for (let e = d; e <= hi; e++) acc += TAPS[e] * x[c + e];
    out[t] = acc * SQRT2;
  }
  return out;
}

// The filters of the top octave at 11025 Hz in the frequency domain, as
// librosa's constant_q() and __cqt_filter_fft() build them: per filter its
// non-zero bins (of 257) after sparsify_rows(0.01).
let basis = null;
function topOctave() {
  if (basis) return basis;
  const sr = CQT.rate / 2;
  const fMinTop = CQT.fMin * Math.pow(2, (CQT.bins - CQT.perOctave) / CQT.perOctave);
  const keep = (N_FFT >> 1) + 1;
  basis = [];
  for (let k = 0; k < CQT.perOctave; k++) {
    const f = fMinTop * Math.pow(2, k / CQT.perOctave);
    const length = (Q * sr) / f;
    const freq = (Q * sr) / length;
    // np.arange(-ilen // 2, ilen // 2): from floor(-L/2) up to floor(L/2), excluded.
    const t0 = Math.floor(-length / 2);
    const count = Math.floor(length / 2) - t0;
    const re = new Float64Array(N_FFT);
    const im = new Float64Array(N_FFT);
    const lpad = Math.floor((N_FFT - count) / 2);
    let sum = 0;
    for (let j = 0; j < count; j++) {
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * j) / count); // periodic Hann
      const phase = (t0 + j) * 2 * Math.PI * (freq / sr);
      re[lpad + j] = w * Math.cos(phase);
      im[lpad + j] = w * Math.sin(phase);
      sum += Math.hypot(re[lpad + j], im[lpad + j]);
    }
    const scale = length / N_FFT / sum; // normalised to unit sum, then by length / n_fft
    // DFT of the filter (only the bins kept): sum_n b[n] exp(-2πikn/N).
    const Br = new Float64Array(keep);
    const Bi = new Float64Array(keep);
    for (let b = 0; b < keep; b++) {
      let sr2 = 0;
      let si = 0;
      for (let n = lpad; n < lpad + count; n++) {
        const a = (-2 * Math.PI * ((b * n) % N_FFT)) / N_FFT;
        const c = Math.cos(a);
        const s = Math.sin(a);
        sr2 += re[n] * c - im[n] * s;
        si += re[n] * s + im[n] * c;
      }
      Br[b] = sr2 * scale;
      Bi[b] = si * scale;
    }
    // sparsify_rows: drop the smallest values that add up to less than 1% of the row.
    const mags = new Float64Array(keep);
    let norm = 0;
    for (let b = 0; b < keep; b++) norm += mags[b] = Math.hypot(Br[b], Bi[b]);
    const sorted = Float64Array.from(mags).sort();
    let cum = 0;
    let threshold = sorted[0];
    for (let j = 0; j < keep; j++) {
      cum += sorted[j] / norm;
      if (!(cum < SPARSITY)) {
        threshold = sorted[j];
        break;
      }
    }
    const idx = [];
    for (let b = 0; b < keep; b++) if (mags[b] >= threshold) idx.push(b);
    basis.push({ idx: Uint16Array.from(idx), re: Float64Array.from(idx, (b) => Br[b]), im: Float64Array.from(idx, (b) => Bi[b]) });
  }
  return basis;
}

// The responses of the 24 filters to `y` (one octave): frames of 512
// samples every `hop`, centred, reflected edges (stft, window "ones").
// Writes |response| * scale into out[t * 144 + first + k] for t < frames.
function octave(y, hop, frames, first, scale, out, fft) {
  const filters = topOctave();
  const n = y.length;
  const half = N_FFT >> 1;
  const frame = new Float64Array(N_FFT);
  const period = 2 * (n - 1);
  for (let t = 0; t < frames; t++) {
    const start = t * hop - half;
    if (start >= 0 && start + N_FFT <= n) {
      for (let m = 0; m < N_FFT; m++) frame[m] = y[start + m];
    } else {
      for (let m = 0; m < N_FFT; m++) {
        let j = start + m;
        if (n === 1) j = 0;
        else {
          j %= period;
          if (j < 0) j += period;
          if (j >= n) j = period - j;
        }
        frame[m] = y[j];
      }
    }
    fft.forward(frame);
    const { Xr, Xi } = fft;
    const row = t * CQT.bins + first;
    for (let k = 0; k < filters.length; k++) {
      const { idx, re, im } = filters[k];
      let ar = 0;
      let ai = 0;
      for (let i = 0; i < idx.length; i++) {
        const b = idx[i];
        ar += re[i] * Xr[b] - im[i] * Xi[b];
        ai += re[i] * Xi[b] + im[i] * Xr[b];
      }
      out[row + k] = Math.hypot(ar, ai) * scale;
    }
  }
}

// Frames of a chunk of `n` samples.
export const cqtFrames = (n) => 1 + Math.floor(n / CQT.hop);

// librosa 0.6.3 cqt(y, sr=22050, hop_length=2048, n_bins=144,
// bins_per_octave=24), as log(|C| + 1e-6): frames x 144 values, frame after
// frame (BTC's feature.T).
export function logCqt(y) {
  const fft = new RealFFT(N_FFT);
  const sr = CQT.rate / 2;
  // Early downsampling: once, to 11025 Hz (hop 1024).
  let x = halve(y);
  let hop = CQT.hop >> 1;
  const levels = [];
  for (let i = 0; i < CQT.octaves; i++) {
    if (i > 0) {
      x = halve(x);
      hop >>= 1;
    }
    levels.push({ x, hop, frames: 1 + Math.floor(x.length / hop) });
  }
  const frames = Math.min(...levels.map((l) => l.frames));
  const out = new Float32Array(frames * CQT.bins);
  for (let i = 0; i < CQT.octaves; i++) {
    const { x: xi, hop: hi } = levels[i];
    // Octave i from the top: bins 120 - 24 i to 143 - 24 i, the filters scaled
    // by √2 per octave down.
    octave(xi, hi, frames, CQT.bins - CQT.perOctave * (i + 1), Math.pow(SQRT2, i), out, fft);
  }
  // scale=True: divided by the square root of each filter's length at 11025 Hz.
  const inv = new Float64Array(CQT.bins);
  for (let b = 0; b < CQT.bins; b++) inv[b] = 1 / Math.sqrt((Q * sr) / (CQT.fMin * Math.pow(2, b / CQT.perOctave)));
  for (let t = 0; t < frames; t++) {
    const row = t * CQT.bins;
    for (let b = 0; b < CQT.bins; b++) out[row + b] = Math.log(out[row + b] * inv[b] + 1e-6);
  }
  return { data: out, frames };
}
