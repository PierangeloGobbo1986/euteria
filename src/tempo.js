// The grid of a song made from the beats and downbeats the tempo detection
// found (src/beats-worker.js): one tempo for the whole song, the beats fitted
// on a straight line (beat k at a + k T); the meter, from the number of beats
// between downbeats seen most often; the anchor, a bar start on that line
// near the first downbeat. The line is fitted first on the middle of the
// song and then widened step by step, each beat numbered by the line of the
// step before: a beat missed, a spurious one, or a tempo drifting slowly do
// not shift the numbering. The grid of EUTERIA has one tempo: in a song whose
// tempo drifts (a live recording) the fit is the best straight line, and
// `driftMs` says how far the beats stray from it.

const median = (list) => {
  const s = [...list].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2;
};

function mode(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  let best = null;
  let count = 0;
  for (const [v, c] of counts) if (c > count || (c === count && v < best)) [best, count] = [v, c];
  return { value: best, share: values.length ? count / values.length : 0 };
}

// Least squares fit of t = a + T k.
function fitLine(points) {
  const n = points.length;
  let sk = 0;
  let st = 0;
  let skk = 0;
  let skt = 0;
  for (const { k, t } of points) {
    sk += k;
    st += t;
    skk += k * k;
    skt += k * t;
  }
  const den = n * skk - sk * sk;
  if (n < 2 || !(den > 0)) return null;
  const T = (n * skt - sk * st) / den;
  return { a: (st - T * sk) / n, T };
}

// The beats of [lo, hi] numbered by `line` (the nearest whole k), those
// within `tol` periods of it, one per number (the nearest).
function numbered(beats, lo, hi, line, tol) {
  const byK = new Map();
  for (let i = lo; i <= hi; i++) {
    const t = beats[i];
    const k = Math.round((t - line.a) / line.T);
    const off = Math.abs(t - (line.a + k * line.T));
    if (off > tol * line.T) continue;
    const had = byK.get(k);
    if (!had || off < had.off) byK.set(k, { k, t, off });
  }
  return [...byK.values()];
}

// The meters of EUTERIA's grid, from the beats in a bar: two beats are
// taken as the dotted quarters of a 6/8 (the grid counts its eighths).
function meterFor(perBar) {
  if (perBar === 3) return { meter: "3/4", sub: 1 };
  if (perBar === 2) return { meter: "6/8", sub: 3 };
  if (perBar === 6) return { meter: "6/8", sub: 1 };
  return { meter: "4/4", sub: 1 };
}

const r3 = (x) => Math.round(x * 1000) / 1000;

// beats, downbeats: times in seconds; duration of the song. Null when there
// are too few beats to tell a tempo.
export function gridFromBeats(beatTimes, downbeatTimes, duration) {
  const beats = [...beatTimes].filter((t) => t >= 0 && t <= duration).sort((a, b) => a - b);
  const n = beats.length;
  if (n < 8) return null;
  const T0 = median(beats.slice(1).map((t, i) => t - beats[i]));
  if (!(T0 > 0)) return null;

  // The middle of the song first, then wider and wider.
  const mid = n >> 1;
  let lo = Math.max(0, mid - 8);
  let hi = Math.min(n - 1, mid + 8);
  let line = { a: beats[mid], T: T0 };
  for (;;) {
    const pts = numbered(beats, lo, hi, line, 0.3);
    const fitted = pts.length >= 4 ? fitLine(pts) : null;
    if (fitted && fitted.T > 0) line = fitted;
    if (lo === 0 && hi === n - 1) break;
    const grow = Math.max(4, Math.ceil((hi - lo + 1) * 0.25));
    lo = Math.max(0, lo - grow);
    hi = Math.min(n - 1, hi + grow);
  }
  // The whole song, the beats far from the line left out.
  let pts = numbered(beats, 0, n - 1, line, 0.3);
  for (const tol of [0.25, 0.2]) {
    const fitted = fitLine(pts);
    if (!fitted || !(fitted.T > 0)) return null;
    line = fitted;
    pts = numbered(beats, 0, n - 1, line, tol);
  }
  if (pts.length < 8) return null;
  const fitted = fitLine(pts);
  if (fitted && fitted.T > 0) line = fitted;
  const { a, T } = line;
  const offs = pts.map((p) => Math.abs(p.t - (a + p.k * T))).sort((x, y) => x - y);
  const p95 = offs[Math.min(offs.length - 1, Math.floor(offs.length * 0.95))];

  // The downbeats numbered on the line.
  const downs = [...downbeatTimes].filter((t) => t >= 0 && t <= duration).sort((x, y) => x - y);
  const dk = [...new Set(downs.map((t) => Math.round((t - a) / T)))].sort((x, y) => x - y);
  let perBar = 4;
  let agreement = 0;
  if (dk.length >= 2) {
    const gaps = dk.slice(1).map((v, i) => v - dk[i]).filter((g) => g >= 2 && g <= 8);
    if (gaps.length) ({ value: perBar, share: agreement } = mode(gaps));
  }
  const { meter, sub } = meterFor(perBar);
  // The bar starts: the numbers with the remainder most downbeats have; the
  // anchor is the one at or before the first downbeat (or the first beat).
  const rem = (v) => ((v % perBar) + perBar) % perBar;
  const phase = dk.length ? mode(dk.map(rem)).value : rem(pts[0].k);
  let first = dk.length ? dk[0] : pts[0].k;
  first -= rem(first - phase);
  let anchor = a + T * first;
  while (anchor < 0) anchor += perBar * T;
  return {
    bpm: r3((60 / T) * sub),
    meter,
    anchor: Math.round(anchor * 1e6) / 1e6,
    beatsPerBar: perBar,
    quality: {
      beats: n,
      used: pts.length,
      driftMs: Math.round(p95 * 1000),
      downbeatAgreement: Math.round(agreement * 100) / 100,
    },
  };
}
