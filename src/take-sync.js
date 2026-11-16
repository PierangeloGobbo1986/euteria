// How far a take is from the bars of the song: what Sync should be to put it
// in time. A take holds only what was played, not the song, so it cannot be
// lined up as the stems are (src/align.js: they add up to the mix); it is
// lined up with the grid instead. The attacks of the notes are found in the
// take (onsets()); a part played in time puts most of them at the same
// distance from a beat (or from an eighth note after it, straight or swung),
// and that distance is the delay the devices added (the sound on its way to the ears, the input
// on its way to the page), which the browser does not report in full
// (src/recorder.js). takeOffset() looks for it within one beat around
// CENTER_S, so that a whole beat cannot be mistaken for it, and answers only
// when one distance clearly wins: a solo full of syncopations, or eighth
// notes evenly on and off the beat, may give no answer.

const HOP_S = 0.002; // the envelope's step
const RISE_FRAMES = 4; // an attack: the envelope rising over 8 ms…
const MIN_RISE = 1.6; // …by this much (natural log of the energy: about 7 dB)
const PEAK_RADIUS_S = 0.03; // the strongest rise within 30 ms on each side
const REFRACTORY_S = 0.06; // attacks closer than this are one
const FLOOR_DB = 45; // attacks this much quieter than the loudest moment are noise

const LOW_S = -0.1; // a take early by more than this, or…
const HIGH_S = 0.3; // …late by more than this, is not looked for
const CENTER_S = 0.08; // the middle of the window looked in (one beat wide at most)
const STEP_S = 0.002;
const SIGMA_S = 0.012; // how near a beat an attack must be to count
const OFF_WEIGHT = 0.5; // an attack on an eighth note between two beats (straight or swung) counts half
const SWING = 2 / 3; // where a swung eighth note falls between two beats
const NEAR_S = 0.025;
const RIVAL_S = 0.04; // another answer must lie this far away…
const MIN_RATIO = 1.3; // …and score this much less
const MIN_NEAR = 6; // attacks near the beats at the answer, at least
const MIN_NEAR_SHARE = 0.4; // and this share of them all (weighted)

// The attacks of a take: [{t (seconds from its start), w (how strong)}].
// channels: Int16Array or Float32Array per channel, `length` samples.
export function onsets(channels, length, sampleRate) {
  const hop = Math.max(1, Math.round(sampleRate * HOP_S));
  const frames = Math.floor(length / hop);
  if (frames < RISE_FRAMES + 2) return [];
  // The energy of the signal's slope (attacks stand out from what sounds on),
  // in steps of 2 ms, as a log, smoothed over three steps.
  const raw = new Float32Array(frames);
  let prev = 0;
  for (let k = 0; k < frames; k++) {
    let e = 0;
    const base = k * hop;
    for (let i = 0; i < hop; i++) {
      let x = 0;
      for (let c = 0; c < channels.length; c++) x += channels[c][base + i];
      const d = x - prev;
      prev = x;
      e += d * d;
    }
    raw[k] = Math.log(e / hop + 1);
  }
  const env = new Float32Array(frames);
  let top = -Infinity;
  for (let k = 0; k < frames; k++) {
    env[k] = (raw[Math.max(0, k - 1)] + raw[k] + raw[Math.min(frames - 1, k + 1)]) / 3;
    if (env[k] > top) top = env[k];
  }
  const floor = top - (FLOOR_DB * Math.LN10) / 10;
  const rise = new Float32Array(frames);
  for (let k = RISE_FRAMES; k < frames; k++) rise[k] = env[k] - env[k - RISE_FRAMES];
  const radius = Math.round(PEAK_RADIUS_S / HOP_S);
  const refractory = Math.round(REFRACTORY_S / HOP_S);
  const out = [];
  let last = -Infinity;
  for (let k = RISE_FRAMES; k < frames; k++) {
    const v = rise[k];
    if (v < MIN_RISE || env[k] < floor || k - last < refractory) continue;
    let peak = true;
    for (let j = Math.max(0, k - radius); j <= Math.min(frames - 1, k + radius); j++) {
      if (rise[j] > v) {
        peak = false;
        break;
      }
    }
    if (!peak) continue;
    out.push({ t: ((k - RISE_FRAMES / 2 + 0.5) * hop) / sampleRate, w: v });
    last = k;
  }
  return out;
}

// The index of the beat nearest to x in `beats` (sorted).
function nearest(beats, x) {
  let lo = 0;
  let hi = beats.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (beats[mid] <= x) lo = mid;
    else hi = mid;
  }
  return Math.abs(beats[hi] - x) < Math.abs(beats[lo] - x) ? hi : lo;
}

// How far x is from the nearest beat, and from the nearest eighth note
// between two beats (straight: halfway; swung: two thirds of the way).
function distances(beats, x) {
  const j = nearest(beats, x);
  const onBeat = Math.abs(x - beats[j]);
  let off = Infinity;
  for (const i of [j - 1, j]) {
    if (i < 0 || i + 1 >= beats.length) continue;
    const span = beats[i + 1] - beats[i];
    off = Math.min(off, Math.abs(x - (beats[i] + span / 2)), Math.abs(x - (beats[i] + span * SWING)));
  }
  return [onBeat, off];
}

// How late (seconds; negative: early) the attacks `hits` ([{t (seconds of
// the song), w}]) are against the beats of the grid, or null when the take
// gives no clear answer. {offset, near (attacks near the beats), share}.
export function takeOffset(hits, beats) {
  if (!Array.isArray(beats) || beats.length < 8) return null;
  const periods = [];
  for (let i = 1; i < beats.length; i++) periods.push(beats[i] - beats[i - 1]);
  periods.sort((a, b) => a - b);
  const period = periods[periods.length >> 1];
  if (!(period > 0)) return null;
  const from = Math.max(LOW_S, CENTER_S - period / 2 + STEP_S);
  const to = Math.min(HIGH_S, CENTER_S + period / 2 - STEP_S);
  // The attacks that stay within the grid wherever they are moved to.
  const lo = beats[0] - period / 2 + HIGH_S;
  const hi = beats[beats.length - 1] + period / 2 + LOW_S;
  const list = hits.filter((h) => h.t >= lo && h.t <= hi);
  if (list.length < MIN_NEAR) return null;
  const total = list.reduce((s, h) => s + h.w, 0);
  const k = (d) => Math.exp(-(d * d) / (2 * SIGMA_S * SIGMA_S));
  const scores = [];
  for (let L = from; L <= to + 1e-9; L += STEP_S) {
    let s = 0;
    for (const h of list) {
      const [onBeat, off] = distances(beats, h.t - L);
      s += h.w * (k(onBeat) + OFF_WEIGHT * k(off));
    }
    scores.push({ L, s });
  }
  let best = scores[0];
  for (const c of scores) if (c.s > best.s) best = c;
  // At an edge of the window, the answer may lie outside it.
  if (best.L - from < 0.01 || to - best.L < 0.01) return null;
  let rival = 0;
  for (const c of scores) if (Math.abs(c.L - best.L) >= RIVAL_S && c.s > rival) rival = c.s;
  if (rival > 0 && best.s < MIN_RATIO * rival) return null;
  let near = 0;
  let nearWeight = 0;
  for (const h of list) {
    const [onBeat, off] = distances(beats, h.t - best.L);
    if (Math.min(onBeat, off) <= NEAR_S) {
      near++;
      nearWeight += h.w;
    }
  }
  const share = total > 0 ? nearWeight / total : 0;
  if (near < MIN_NEAR || share < MIN_NEAR_SHARE) return null;
  return { offset: best.L, near, share };
}

// The takes of one recording ([{onsets (onsets() of each), take: {start,
// syncMs}}]) against the beats of the grid: how many milliseconds late they
// are (negative: early), or null.
export function takesDelayMs(tracks, beats) {
  const hits = [];
  for (const t of tracks) {
    const at = t.take.start + (t.take.syncMs || 0) / 1000;
    for (const o of t.onsets || []) hits.push({ t: at + o.t, w: o.w });
  }
  const found = takeOffset(hits, beats);
  return found ? Math.round(found.offset * 1000) : null;
}
