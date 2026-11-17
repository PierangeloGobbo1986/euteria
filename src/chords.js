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
// Bars: the chords are put on the beats of each bar a chord may start on
// (its slots, src/grid.js: four in 4/4, three in 3/4, two in 6/8), taken by
// family (a root and its triad: C, C6, Cmaj7 and C7 are one family, Cm, Cm6,
// Cm7 and Cm(maj7) another, then the diminished ones, aug, sus2, sus4), as
// BTC shares its belief among the chords of a family. A bar is cut into runs
// of whole beats, each given the family that covers most of it, the cut that
// fits best once each change has paid its cost (barRuns()): little on beat 3
// of 4/4 (beat 4 of 6/8, half the bar), more on the other beats, so that a
// chord changes on a weak beat only when it clearly does, and a chord found
// for a moment does not change the bar. A run shorter than the bar must be
// clear (its family covering most of it, BTC sure enough of it); a whole bar
// needs a family that covers enough of it. Each run's chord is written on the
// beat where it starts, as the chord of its family BTC is surest of. No chord
// ("N"), an unknown one ("X") or no clear one: nothing is written there. BTC
// finds a change about a tenth of a second early, which is made up for. The
// names are spelled in the key of the song, estimated from all its chords
// (src/chordnames.js): Bb7 in F, A# nowhere but in sharp keys.

import { keyFrom, nameChord } from "./chordnames.js";
import { barLength, slotCount, slotTimes } from "./grid.js";

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

// How long each label lasts within [a, b): a Map label -> {t (seconds), tp
// (seconds times its probability)}.
function cover(segments, a, b) {
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
    if (over <= 0) continue;
    const c = out.get(label) || { t: 0, tp: 0 };
    c.t += over;
    c.tp += over * p;
    out.set(label, c);
  }
  return out;
}

const FAMILY = { maj: "M", maj6: "M", maj7: "M", 7: "M", min: "m", min6: "m", min7: "m", minmaj7: "m", dim: "o", dim7: "o", hdim7: "o", aug: "+", sus2: "s2", sus4: "s4" };

// The families of chords in a span (cover()): Map key -> {t, tp (as
// cover() says, the family's), labels (Map label -> tp)}. No chord ("N")
// and an unknown one ("X") are families of their own.
function families(labels) {
  const out = new Map();
  for (const [label, c] of labels) {
    const parsed = parseLabel(label);
    const key = parsed ? `${parsed.pc}${FAMILY[parsed.quality]}` : label;
    let f = out.get(key);
    if (!f) out.set(key, (f = { t: 0, tp: 0, labels: new Map() }));
    f.t += c.t;
    f.tp += c.tp;
    f.labels.set(label, (f.labels.get(label) || 0) + c.tp);
  }
  return out;
}

// BTC finds a change of chord a little early (its frames hear what comes,
// about 0.1 s): the segments are read this much later.
const LEAD_S = 0.08;
const ENOUGH = 0.4; // how much of a whole bar a family must cover to be written there
const CLEAR = 0.6; // and of a part of a bar
const SURE = 0.3; // how sure BTC must be of it (its mean probability there)
// What a change of chord costs on each slot of a bar (the first one is where
// the bar's chord is written anyway), in beats: the new family must cover
// that much more of the beats it takes than the old one would.
const CHANGE = { "4/4": [0, 0.8, 0.6, 0.8], "3/4": [0, 0.8, 0.7], "6/8": [0, 0.3] };

// One bar cut into runs of slots. spans: [{fam (families()), len (seconds)}],
// unit: the seconds of a slot; costs: CHANGE of the meter. A run shorter than
// the bar must be clear: its family covering at least CLEAR of it, BTC sure
// enough of it (SURE). Returns [{at (first slot), label (the family's chord
// BTC is surest of), share (of the run the family covers), sure, whole (the
// run is the bar)}], or [].
function barRuns(spans, unit, costs) {
  const n = spans.length;
  const best = new Array(n + 1).fill(-Infinity);
  const back = new Array(n + 1).fill(null);
  best[0] = 0;
  for (let q = 1; q <= n; q++) {
    for (let p = 0; p < q; p++) {
      if (best[p] === -Infinity) continue;
      const keys = new Set();
      let len = 0;
      for (let j = p; j < q; j++) {
        len += spans[j].len;
        for (const key of spans[j].fam.keys()) keys.add(key);
      }
      if (!(len > 0)) continue;
      const whole = p === 0 && q === n;
      for (const key of keys) {
        let t = 0;
        let tp = 0;
        for (let j = p; j < q; j++) {
          const f = spans[j].fam.get(key);
          if (f) {
            t += f.t;
            tp += f.tp;
          }
        }
        const share = t / len;
        const sure = t > 0 ? tp / t : 0;
        if (!whole && (share < CLEAR || sure < SURE)) continue;
        const total = best[p] + t / unit - (p > 0 ? costs[p] || 0 : 0);
        if (total > best[q]) {
          best[q] = total;
          back[q] = { p, key, share, sure };
        }
      }
    }
  }
  if (best[n] === -Infinity) return [];
  const runs = [];
  for (let q = n; q > 0; q = back[q].p) {
    const { p, key, share, sure } = back[q];
    const labels = new Map();
    for (let j = p; j < q; j++) {
      const f = spans[j].fam.get(key);
      if (f) for (const [label, v] of f.labels) labels.set(label, (labels.get(label) || 0) + v);
    }
    let label = null;
    let most = -Infinity;
    for (const [l, v] of labels) {
      if (v > most) {
        most = v;
        label = l;
      }
    }
    runs.unshift({ at: p, label, share, sure, whole: p === 0 && q === n });
  }
  return runs;
}

// The chords of the bars of `grid` ({bars, beats, meter, bpm}) from the
// segments, for the bars `want(i)` accepts: a Map bar index -> slots (src/grid.js),
// the names spelled in the song's key.
export function barChords(segments, grid, { duration = Infinity, want = () => true } = {}) {
  const out = new Map();
  const bars = grid.bars || [];
  if (!segments || !segments.length || !bars.length) return out;
  const key = keyOfSegments(segments);
  const name = (label) => {
    const c = parseLabel(label);
    return c ? nameChord(c.pc, SUFFIX[c.quality], key) : "";
  };
  const n = slotCount(grid.meter);
  const costs = CHANGE[grid.meter] || CHANGE["4/4"];
  for (let i = 0; i < bars.length; i++) {
    if (!want(i)) continue;
    const at = slotTimes(grid, i);
    const end = bars[i] + barLength(grid, i);
    const unit = (end - bars[i]) / n;
    const spans = [];
    for (let j = 0; j < n; j++) {
      const a = at[j];
      const b = Math.min(duration, j + 1 < n ? at[j + 1] : end);
      if (!(b > a) || !(unit > 0)) break;
      spans.push({ fam: families(cover(segments, a - LEAD_S, b - LEAD_S)), len: b - a });
    }
    if (!spans.length) continue;
    const slots = new Array(n).fill("");
    for (const run of barRuns(spans, unit, costs)) {
      if (run.whole && (run.share < ENOUGH || run.sure < SURE)) continue;
      const text = name(run.label);
      if (text) slots[run.at] = text;
    }
    if (slots.some(Boolean)) out.set(i, slots);
  }
  return out;
}
