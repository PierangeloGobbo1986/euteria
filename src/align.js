// Measures how far the full mix (Original Track) is shifted against the sum
// of the stems, and corrects it. Same method as measure_alignment_offset() in
// EUTERIA (Python): the stems summed together rebuild the mix, so the
// cross-correlation of the two energy envelopes peaks exactly at the offset.
// Here it protects against browsers whose decoders place one file differently
// from the others (Safari shifted a 44.1 kHz MP3 by one MP3 frame).

const COARSE_RATE = 4000; // Hz of the coarse search
const EXCERPT_SECONDS = 40; // central part of the song that is compared
const MAX_OFFSET_SECONDS = 5; // beyond this it is not a shift but another problem
// Below this nothing is corrected. Stricter than in EUTERIA (Python), where the
// stems have just been made from the same mix: here the check only catches
// decoders that move a track, and the stems of a real separation give 0.95 or
// more. Stems that do not add up to the mix must never move it.
const MIN_CONFIDENCE = 0.8;
const DEADBAND_SECONDS = 0.005; // inaudible: left untouched
const SMOOTH = 21; // envelope smoothing, in coarse samples

// Mono float copy of channels[*][from, from + n), summed over several tracks.
function monoSum(trackList, from, n) {
  const out = new Float32Array(n);
  for (const channels of trackList) {
    const scale = 1 / (32768 * channels.length);
    for (const ch of channels) {
      const end = Math.min(n, ch.length - from);
      for (let i = 0; i < end; i++) out[i] += ch[from + i] * scale;
    }
  }
  return out;
}

// Envelope: |x| averaged over `win` samples, then zero mean and unit spread.
function envelope(x, win) {
  const n = x.length;
  const out = new Float32Array(n);
  const half = win >> 1;
  let sum = 0;
  for (let i = 0; i < Math.min(n, half); i++) sum += Math.abs(x[i]);
  for (let i = 0; i < n; i++) {
    const add = i + half;
    const drop = i - half - 1;
    if (add < n) sum += Math.abs(x[add]);
    if (drop >= 0) sum -= Math.abs(x[drop]);
    out[i] = sum / win;
  }
  let mean = 0;
  for (let i = 0; i < n; i++) mean += out[i];
  mean /= n || 1;
  let variance = 0;
  for (let i = 0; i < n; i++) {
    out[i] -= mean;
    variance += out[i] * out[i];
  }
  const sd = Math.sqrt(variance / (n || 1));
  if (sd > 1e-9) for (let i = 0; i < n; i++) out[i] /= sd;
  return out;
}

function decimate(x, factor) {
  const n = Math.floor(x.length / factor);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < factor; j++) s += x[i * factor + j];
    out[i] = s / factor;
  }
  return out;
}

// In-place radix-2 FFT (inverse when `inverse` is true, without the 1/n).
function fft(re, im, inverse) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(angle);
    const wi = Math.sin(angle);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let j = 0; j < half; j++) {
        const a = i + j;
        const b = a + half;
        const vr = re[b] * cr - im[b] * ci;
        const vi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - vr;
        im[b] = im[a] - vi;
        re[a] += vr;
        im[a] += vi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

// Lag (in samples) at which `target` best matches `reference`, searched within
// ±maxLag with FFT cross-correlation. Returns {lag, score}; score ~ correlation.
function coarseLag(reference, target, maxLag) {
  const m = Math.min(reference.length, target.length);
  let size = 1;
  while (size < m + maxLag + 1) size <<= 1;
  const ar = new Float64Array(size), ai = new Float64Array(size);
  const br = new Float64Array(size), bi = new Float64Array(size);
  for (let i = 0; i < m; i++) {
    ar[i] = reference[i];
    br[i] = target[i];
  }
  fft(ar, ai, false);
  fft(br, bi, false);
  // conj(A) * B: its inverse peaks at the lag of target behind reference.
  for (let k = 0; k < size; k++) {
    const r = ar[k] * br[k] + ai[k] * bi[k];
    const i = ar[k] * bi[k] - ai[k] * br[k];
    ar[k] = r;
    ai[k] = i;
  }
  fft(ar, ai, true);
  let best = 0;
  let value = -Infinity;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    const v = Math.abs(ar[(lag + size) % size]);
    if (v > value) {
      value = v;
      best = lag;
    }
  }
  return { lag: best, score: value / size / m };
}

// How many samples the original is behind (positive) or ahead of (negative)
// the stems. Returns {offset, confidence}; offset 0 when unsure.
export function measureOffset(originalChannels, stemChannelList, sampleRate) {
  const length = Math.min(originalChannels[0].length, ...stemChannelList.map((c) => c[0].length));
  if (length < sampleRate * 2) return { offset: 0, confidence: 0 };
  const excerpt = Math.min(Math.round(EXCERPT_SECONDS * sampleRate), Math.floor(length * 0.7));
  const from = Math.floor((length - excerpt) / 2);
  const reference = monoSum(stemChannelList, from, excerpt);
  const target = monoSum([originalChannels], from, excerpt);

  const factor = Math.max(1, Math.round(sampleRate / COARSE_RATE));
  const coarseRate = sampleRate / factor;
  const maxLag = Math.min(Math.round(MAX_OFFSET_SECONDS * coarseRate), Math.floor(excerpt / factor / 4));
  const { lag, score } = coarseLag(envelope(decimate(reference, factor), SMOOTH), envelope(decimate(target, factor), SMOOTH), maxLag);
  if (score < MIN_CONFIDENCE) return { offset: 0, confidence: score };

  // Refinement at full resolution around the coarse peak, on 10 s.
  const centre = lag * factor;
  const span = factor * 4 + 8;
  const n = Math.min(excerpt, Math.round(10 * sampleRate));
  const start = Math.floor((excerpt - n) / 2);
  const ef = envelope(reference.subarray(start, start + n), SMOOTH);
  const tf = envelope(target.subarray(start, start + n), SMOOTH);
  let best = centre;
  let bestValue = -Infinity;
  for (let l = centre - span; l <= centre + span; l++) {
    let sum = 0;
    let count = 0;
    const a0 = Math.max(0, -l);
    const a1 = Math.min(n, n - l);
    for (let i = a0; i < a1; i++) {
      sum += ef[i] * tf[i + l];
      count++;
    }
    if (count > sampleRate && sum / count > bestValue) {
      bestValue = sum / count;
      best = l;
    }
  }
  return { offset: best, confidence: score };
}

// Shifts the channels by `offset` samples (positive: drop that many from the
// start; negative: delay with silence), keeping their length.
export function shiftChannels(channels, offset) {
  return channels.map((ch) => {
    const out = new Int16Array(ch.length);
    if (offset >= 0) out.set(ch.subarray(offset));
    else out.set(ch.subarray(0, ch.length + offset), -offset);
    return out;
  });
}

// Measures the original against the stems and corrects it when needed.
export function alignOriginal(tracks, sampleRate) {
  const original = tracks.find((t) => t.key === "original");
  const stems = tracks.filter((t) => t.key !== "original");
  if (!original || !stems.length) return { checked: false };
  const { offset, confidence } = measureOffset(
    original.channels,
    stems.map((t) => t.channels),
    sampleRate
  );
  const applied = confidence >= MIN_CONFIDENCE && Math.abs(offset) >= DEADBAND_SECONDS * sampleRate;
  if (applied) original.channels = shiftChannels(original.channels, offset);
  return { checked: true, offset, ms: (offset / sampleRate) * 1000, confidence, applied };
}
