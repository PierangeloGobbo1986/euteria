// Sample-rate conversion by a rational factor, computed as scipy.signal.
// resample_poly computes it (the converter EUTERIA (Python) uses): a Kaiser
// windowed FIR (beta 5, 10 zero crossings per side at the lower rate),
// zero phase, zeros outside the signal.

const filters = new Map();

function gcd(a, b) {
  while (b) [a, b] = [b, a % b];
  return a;
}

// Zeroth-order modified Bessel function of the first kind.
function besselI0(x) {
  let sum = 1;
  let term = 1;
  const q = (x * x) / 4;
  for (let k = 1; k < 200; k++) {
    term *= q / (k * k);
    sum += term;
    if (term < sum * 1e-17) break;
  }
  return sum;
}

// firwin(2 * halfLen + 1, 1 / max(up, down), window=("kaiser", 5.0)) * up
function filterFor(up, down) {
  const key = `${up}/${down}`;
  let h = filters.get(key);
  if (h) return h;
  const max = Math.max(up, down);
  const cutoff = 1 / max;
  const halfLen = 10 * max;
  const taps = 2 * halfLen + 1;
  h = new Float64Array(taps);
  const beta = 5;
  const i0beta = besselI0(beta);
  let sum = 0;
  for (let k = 0; k < taps; k++) {
    const m = k - halfLen;
    const x = cutoff * m;
    const sinc = m === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
    const r = (2 * k) / (taps - 1) - 1;
    const kaiser = besselI0(beta * Math.sqrt(Math.max(0, 1 - r * r))) / i0beta;
    h[k] = sinc * cutoff * kaiser;
    sum += h[k];
  }
  for (let k = 0; k < taps; k++) h[k] = (h[k] / sum) * up;
  h.halfLen = halfLen;
  filters.set(key, h);
  return h;
}

// x resampled by up / down; returns ceil(x.length * up / down) samples.
export function resamplePoly(x, up, down) {
  const g = gcd(up, down);
  up /= g;
  down /= g;
  if (up === 1 && down === 1) return Float32Array.from(x);
  const h = filterFor(up, down);
  const halfLen = h.halfLen;
  const n = x.length;
  const outLength = Math.ceil((n * up) / down);
  const y = new Float32Array(outLength);
  for (let m = 0; m < outLength; m++) {
    // y[m] = sum over i of x[i] h[m * down + halfLen - i * up]
    const centre = m * down;
    let i = Math.max(0, Math.ceil((centre - halfLen) / up));
    const last = Math.min(n - 1, Math.floor((centre + halfLen) / up));
    let k = centre + halfLen - i * up;
    let acc = 0;
    for (; i <= last; i++, k -= up) acc += x[i] * h[k];
    y[m] = acc;
  }
  return y;
}

// Every channel from rate `from` to rate `to`.
export function resampleChannels(channels, from, to) {
  if (from === to) return channels;
  return channels.map((c) => resamplePoly(c, to, from));
}
