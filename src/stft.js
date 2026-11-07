// Short-time Fourier transforms computed as torch.stft and torch.istft compute
// them with center=True, reflect padding, a periodic Hann window, no
// normalisation and one-sided spectra: the settings of BS-RoFormer, the
// separation model of EUTERIA.

// Real FFT of size n (a power of two), through a complex FFT of size n / 2.
class RealFFT {
  constructor(n) {
    if (n < 4 || n & (n - 1)) throw new Error("The FFT size must be a power of two.");
    const h = n >> 1;
    this.h = h;
    const bits = Math.round(Math.log2(h));
    this.rev = new Uint32Array(h);
    for (let i = 0; i < h; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      this.rev[i] = r;
    }
    // exp(-2πik/h), for the complex FFT.
    this.cr = new Float64Array(h >> 1);
    this.ci = new Float64Array(h >> 1);
    for (let k = 0; k < h >> 1; k++) {
      this.cr[k] = Math.cos((2 * Math.PI * k) / h);
      this.ci[k] = -Math.sin((2 * Math.PI * k) / h);
    }
    // exp(-2πik/n), to split the half-size transform into the real one.
    this.wr = new Float64Array(h + 1);
    this.wi = new Float64Array(h + 1);
    for (let k = 0; k <= h; k++) {
      this.wr[k] = Math.cos((2 * Math.PI * k) / n);
      this.wi[k] = -Math.sin((2 * Math.PI * k) / n);
    }
    this.re = new Float64Array(h);
    this.im = new Float64Array(h);
    this.Xr = new Float64Array(h + 1); // last forward() result
    this.Xi = new Float64Array(h + 1);
  }

  // In-place complex FFT of size h on re/im, already in bit-reversed order.
  // The inverse uses the conjugate twiddles and does not scale.
  _fft(inverse) {
    const { h, re, im, cr, ci } = this;
    const sign = inverse ? -1 : 1;
    for (let i = 0; i < h; i += 2) {
      const ar = re[i];
      const ai = im[i];
      re[i] = ar + re[i + 1];
      im[i] = ai + im[i + 1];
      re[i + 1] = ar - re[i + 1];
      im[i + 1] = ai - im[i + 1];
    }
    for (let size = 4; size <= h; size <<= 1) {
      const half = size >> 1;
      const step = h / size;
      for (let j = 0, k = 0; j < half; j++, k += step) {
        const wr = cr[k];
        const wi = sign * ci[k];
        for (let a = j; a < h; a += size) {
          const b = a + half;
          const xr = re[b] * wr - im[b] * wi;
          const xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr;
          im[b] = im[a] - xi;
          re[a] += xr;
          im[a] += xi;
        }
      }
    }
  }

  // X = rfft(x) for n real samples; the h + 1 bins land in this.Xr / this.Xi.
  forward(x) {
    const { h, rev, re, im, wr, wi, Xr, Xi } = this;
    for (let m = 0; m < h; m++) {
      const r = rev[m];
      re[r] = x[2 * m];
      im[r] = x[2 * m + 1];
    }
    this._fft(false);
    Xr[0] = re[0] + im[0];
    Xi[0] = 0;
    Xr[h] = re[0] - im[0];
    Xi[h] = 0;
    for (let k = 1; k < h; k++) {
      // E = (Z[k] + conj Z[h-k]) / 2, O = (Z[k] - conj Z[h-k]) / 2i, X = E + W^k O
      const zr = re[k];
      const zi = im[k];
      const yr = re[h - k];
      const yi = -im[h - k];
      const er = 0.5 * (zr + yr);
      const ei = 0.5 * (zi + yi);
      const or = 0.5 * (zi - yi);
      const oi = -0.5 * (zr - yr);
      Xr[k] = er + wr[k] * or - wi[k] * oi;
      Xi[k] = ei + wr[k] * oi + wi[k] * or;
    }
  }

  // x = irfft(X) for h + 1 bins, n samples into `out`. As numpy and torch do,
  // the imaginary parts of the first and the last bin are ignored.
  inverse(Xr, Xi, out) {
    const { h, rev, re, im, wr, wi } = this;
    for (let k = 0; k < h; k++) {
      // E = (X[k] + conj X[h-k]) / 2, O = (X[k] - conj X[h-k]) W^-k / 2, Z = E + iO
      const ar = Xr[k];
      const ai = k === 0 ? 0 : Xi[k];
      const br = Xr[h - k];
      const bi = k === 0 ? 0 : -Xi[h - k];
      const er = 0.5 * (ar + br);
      const ei = 0.5 * (ai + bi);
      const dr = 0.5 * (ar - br);
      const di = 0.5 * (ai - bi);
      const or = dr * wr[k] + di * wi[k];
      const oi = di * wr[k] - dr * wi[k];
      const r = rev[k];
      re[r] = er - oi;
      im[r] = ei + or;
    }
    this._fft(true);
    const s = 1 / h;
    for (let m = 0; m < h; m++) {
      out[2 * m] = re[m] * s;
      out[2 * m + 1] = im[m] * s;
    }
  }
}

// Periodic Hann window, as torch.hann_window(n).
function hannWindow(n) {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  return w;
}

const BLOCK = 16; // frames handled together

export class Stft {
  constructor(nFft = 2048, hop = 512) {
    this.nFft = nFft;
    this.hop = hop;
    this.bins = (nFft >> 1) + 1;
    this.fft = new RealFFT(nFft);
    this.window = hannWindow(nFft);
    this.frame = new Float64Array(nFft);
    this.envelopes = new Map(); // frames -> 1 / sum of squared windows
    this.ola = null;
    this.Xr = new Float64Array(this.bins);
    this.Xi = new Float64Array(this.bins);
  }

  // Number of frames for `length` samples.
  frames(length) {
    return 1 + Math.floor(length / this.hop);
  }

  // Spectrum of x[0, length): bin f of frame t goes to re/im[offset + f * stride + t].
  // Returns the number of frames. Frames are computed in small blocks, so that
  // the strided writes touch each cache line once per block.
  forward(x, length, re, im, offset, stride) {
    const { nFft, hop, bins, window, frame, fft } = this;
    const pad = nFft >> 1;
    if (length <= pad) throw new Error("Too short for the STFT.");
    const frames = this.frames(length);
    const last = 2 * (length - 1);
    const { blockRe, blockIm } = this._block();
    for (let t0 = 0; t0 < frames; t0 += BLOCK) {
      const nb = Math.min(BLOCK, frames - t0);
      for (let b = 0; b < nb; b++) {
        const start = (t0 + b) * hop - pad;
        if (start >= 0 && start + nFft <= length) {
          for (let m = 0; m < nFft; m++) frame[m] = x[start + m] * window[m];
        } else {
          for (let m = 0; m < nFft; m++) {
            let j = start + m;
            if (j < 0) j = -j;
            else if (j >= length) j = last - j;
            frame[m] = x[j] * window[m];
          }
        }
        fft.forward(frame);
        blockRe.set(fft.Xr, b * bins);
        blockIm.set(fft.Xi, b * bins);
      }
      for (let f = 0; f < bins; f++) {
        const p = offset + f * stride + t0;
        for (let b = 0, q = f; b < nb; b++, q += bins) {
          re[p + b] = blockRe[q];
          im[p + b] = blockIm[q];
        }
      }
    }
    return frames;
  }

  _block() {
    if (!this.blockRe) {
      this.blockRe = new Float64Array(BLOCK * this.bins);
      this.blockIm = new Float64Array(BLOCK * this.bins);
    }
    return this;
  }

  // 1 / (sum of the squared windows) over the samples istft() returns.
  _envelope(frames) {
    let inv = this.envelopes.get(frames);
    if (inv) return inv;
    const { nFft, hop, window } = this;
    const total = nFft + hop * (frames - 1);
    const sum = new Float64Array(total);
    for (let t = 0; t < frames; t++) {
      for (let m = 0; m < nFft; m++) sum[t * hop + m] += window[m] * window[m];
    }
    const pad = nFft >> 1;
    const length = hop * (frames - 1);
    inv = new Float64Array(length);
    for (let i = 0; i < length; i++) {
      const e = sum[i + pad];
      if (e < 1e-11) throw new Error("The STFT window does not overlap enough.");
      inv[i] = 1 / e;
    }
    this.envelopes.set(frames, inv);
    return inv;
  }

  // Signal from `frames` frames read at re/im[offset + f * stride + t], as
  // torch.istft without `length`: hop * (frames - 1) samples into `out`.
  // Returns the number of samples.
  inverse(re, im, offset, stride, frames, out) {
    const { nFft, hop, bins, window, fft, Xr, Xi } = this;
    const total = nFft + hop * (frames - 1);
    if (!this.ola || this.ola.length < total) this.ola = new Float64Array(total);
    const ola = this.ola;
    ola.fill(0, 0, total);
    const y = this.frame;
    const { blockRe, blockIm } = this._block();
    for (let t0 = 0; t0 < frames; t0 += BLOCK) {
      const nb = Math.min(BLOCK, frames - t0);
      for (let f = 0; f < bins; f++) {
        const p = offset + f * stride + t0;
        for (let b = 0, q = f; b < nb; b++, q += bins) {
          blockRe[q] = re[p + b];
          blockIm[q] = im[p + b];
        }
      }
      for (let b = 0; b < nb; b++) {
        const q = b * bins;
        for (let f = 0; f < bins; f++) {
          Xr[f] = blockRe[q + f];
          Xi[f] = blockIm[q + f];
        }
        fft.inverse(Xr, Xi, y);
        const base = (t0 + b) * hop;
        for (let m = 0; m < nFft; m++) ola[base + m] += y[m] * window[m];
      }
    }
    const inv = this._envelope(frames);
    const pad = nFft >> 1;
    const length = hop * (frames - 1);
    for (let i = 0; i < length; i++) out[i] = ola[i + pad] * inv[i];
    return length;
  }
}
