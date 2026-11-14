// The chords found by BTC (src/beats-worker.js) kept as segments, and put in
// the bars of a grid.
//
// Segments: the probabilities of the 170 chords per frame, averaged over 5
// frames (about half a second) so that the chord of a frame does not flicker,
// the most likely chord of each frame, frames in a row with the same chord
// joined: [start, end, label, p] (seconds, BTC's label as "A:min7", "C" or
// "N", the mean probability of that chord over the segment). That is what a
// song keeps (manifest.music.chord_recognition), a few kilobytes.
//
// Bars: the chords of a bar are taken by family (a root and its triad: C, C6,
// Cmaj7 and C7 are one family, Cm, Cm6, Cm7 and Cm(maj7) another, then the
// diminished ones, aug, sus2, sus4), as BTC shares its belief among the
// chords of a family. The family whose segments cover most of the bar,
// weighted by their probability, is the bar's if it covers enough (a third),
// written as its chord that covers most; two chords (half a bar each) when each
// half has a clear family of its own that the whole bar would hide (4/4 and
// 6/8; not 3/4). No chord ("N"), an unknown one ("X") or no clear one: the bar
// stays empty. The names are spelled in the key of
// the song, estimated from all its chords (src/chordnames.js): Bb7 in F, A#
// nowhere but in sharp keys.

import { keyFrom, nameChord } from "./chordnames.js";

export const ROOTS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const QUALITIES = ["min", "maj", "dim", "aug", "min6", "maj6", "min7", "minmaj7", "maj7", "7", "dim7", "hdim7", "sus2", "sus4"];
// Each quality as it is written after the root.
const SUFFIX = { min: "m", maj: "", dim: "dim", aug: "aug", min6: "m6", maj6: "6", min7: "m7", minmaj7: "m(maj7)", maj7: "maj7", 7: "7", dim7: "dim7", hdim7: "m7b5", sus2: "sus2", sus4: "sus4" };
const N = 169; // no chord
const X = 168; // a chord not in the vocabulary

// BTC's label of class c (idx2voca_chord).
export function labelOf(c) {
  if (c === N) return "N";
  if (c === X) return "X";
  const q = QUALITIES[c % 14];
  return ROOTS[Math.floor(c / 14)] + (q === "maj" ? "" : `:${q}`);
}

// {pc, quality} of a label, or null for N, X or a label not BTC's.
export function parseLabel(label) {
  const m = /^([A-G]#?)(?::(\w+))?$/.exec(label || "");
  if (!m) return null;
  const pc = ROOTS.indexOf(m[1]);
  const quality = m[2] || "maj";
  return pc >= 0 && quality in SUFFIX ? { pc, quality } : null;
}

const SMOOTH = 2; // frames on each side
const round = (x, d) => Math.round(x * 10 ** d) / 10 ** d;

// Segments from the worker's result {probs, times, frames, classes, hop}.
export function segmentsFrom({ probs, times, frames, classes, hop }) {
  const out = [];
  if (!frames) return out;
  const best = new Int16Array(frames);
  const bestP = new Float32Array(frames);
  const avg = new Float64Array(classes);
  for (let f = 0; f < frames; f++) {
    avg.fill(0);
    const a = Math.max(0, f - SMOOTH);
    const b = Math.min(frames - 1, f + SMOOTH);
    for (let g = a; g <= b; g++) {
      const o = g * classes;
      for (let c = 0; c < classes; c++) avg[c] += probs[o + c];
    }
    let k = 0;
    for (let c = 1; c < classes; c++) if (avg[c] > avg[k]) k = c;
    best[f] = k;
    bestP[f] = avg[k] / (b - a + 1);
  }
  // Each frame from halfway after the previous one to halfway before the next.
  const edge = (f) => (f <= 0 ? Math.max(0, times[0] - hop / 2) : f >= frames ? times[frames - 1] + hop / 2 : (times[f - 1] + times[f]) / 2);
  let start = 0;
  for (let f = 1; f <= frames; f++) {
    if (f < frames && best[f] === best[start]) continue;
    let p = 0;
    for (let g = start; g < f; g++) p += bestP[g];
    out.push([round(edge(start), 3), round(edge(f), 3), labelOf(best[start]), round(p / (f - start), 2)]);
    start = f;
  }
  return out;
}

// The key of the song from its segments (weighted by their length and
// probability), or null.
export function keyOfSegments(segments) {
  const chords = [];
  for (const [a, b, label, p] of segments) {
    const c = parseLabel(label);
    if (c) chords.push({ pc: c.pc, suffix: SUFFIX[c.quality], bass: null, weight: (b - a) * p });
  }
  return keyFrom(chords);
}

// How much of [a, b) each label covers, weighted by its probability: a Map
// label → share (0 to 1).
function shares(segments, a, b) {
  const out = new Map();
  if (!(b > a)) return out;
  // The first segment that may reach a (they are in order).
  let lo = 0;
  let hi = segments.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (segments[mid][1] <= a) lo = mid + 1;
    else hi = mid;
  }
  for (let i = lo; i < segments.length && segments[i][0] < b; i++) {
    const [s, e, label, p] = segments[i];
    const over = Math.min(b, e) - Math.max(a, s);
    if (over > 0) out.set(label, (out.get(label) || 0) + (over * p) / (b - a));
  }
  return out;
}

const FAMILY = { maj: "M", maj6: "M", maj7: "M", 7: "M", min: "m", min6: "m", min7: "m", minmaj7: "m", dim: "o", dim7: "o", hdim7: "o", aug: "+", sus2: "s2", sus4: "s4" };

// The family that covers most of a span, and its chord that covers most:
// {label, share} (share: the family's).
function top(labels) {
  const families = new Map();
  for (const [label, share] of labels) {
    const c = parseLabel(label);
    const key = c ? `${c.pc}${FAMILY[c.quality]}` : label;
    const f = families.get(key) || { share: 0, label: null, best: 0 };
    f.share += share;
    if (share > f.best) {
      f.best = share;
      f.label = label;
    }
    families.set(key, f);
  }
  let out = { label: null, share: 0 };
  for (const f of families.values()) if (f.share > out.share) out = { label: f.label, share: f.share };
  return out;
}

const ENOUGH = 0.33; // the share a family needs to be written in a bar
const HALF = 0.45; // the share each half needs for two chords in a bar
const GAIN = 0.15; // and how much better two chords must fit than one

// The chords of the bars of `grid` ({bars, beats, meter, bpm}) from the
// segments, for the bars `want(i)` accepts: a Map bar index → text, the
// names spelled in the song's key.
export function barChords(segments, grid, { duration = Infinity, want = () => true } = {}) {
  const out = new Map();
  const bars = grid.bars || [];
  if (!segments || !segments.length || !bars.length) return out;
  const key = keyOfSegments(segments);
  const name = (label) => {
    const c = parseLabel(label);
    return c ? nameChord(c.pc, SUFFIX[c.quality], key) : "";
  };
  const perBar = Number(String(grid.meter || "4/4").split("/")[0]) || 4;
  const halves = perBar % 2 === 0;
  // The last bar lasts as long as the one before it.
  const fallback = bars.length > 1 ? bars[bars.length - 1] - bars[bars.length - 2] : grid.bpm ? (60 / grid.bpm) * perBar : 2;
  for (let i = 0; i < bars.length; i++) {
    if (!want(i)) continue;
    const a = bars[i];
    const b = Math.min(duration, i + 1 < bars.length ? bars[i + 1] : a + fallback);
    if (!(b > a)) continue;
    const whole = top(shares(segments, a, b));
    let text = whole.share >= ENOUGH ? name(whole.label) : "";
    if (halves) {
      const m = (a + b) / 2;
      const h1 = top(shares(segments, a, m));
      const h2 = top(shares(segments, m, b));
      const n1 = h1.share >= HALF ? name(h1.label) : "";
      const n2 = h2.share >= HALF ? name(h2.label) : "";
      if (n1 && n2 && n1 !== n2 && (h1.share + h2.share) / 2 >= whole.share + GAIN) text = `${n1} ${n2}`;
    }
    if (text) out.set(i, text);
  }
  return out;
}
