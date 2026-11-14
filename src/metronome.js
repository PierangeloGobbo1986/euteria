// The metronome: its settings, kept in this browser for every song, and its
// clicks for the song open, which the audio engine plays as the song comes
// out (src/engine-core.js), so they follow its tempo, the loop and every jump.
//
// The clicks are the beats of the grid, each on the beat found in the song
// (app.analysis.beats, Beat This!) when there is one near it, so that the
// metronome stays with a recording whose tempo moves (a live one above all),
// as the grid alone, one steady tempo, would not. Each beat of the bar is an
// accent, a beat or silent, as set for the meter; the bars may alternate
// between some with the clicks and some without (play, mute); a count-in
// plays the bars before the song starts, every beat, the first accented,
// whatever the settings. Two bars of beats are added before the first beat of
// the grid, for a count-in at the start of the song.

import { METERS } from "./grid.js";

const KEY = "euteria-metronome";
const BEATS = { "4/4": 4, "3/4": 3, "6/8": 6 };
export const ACCENT = 1;
export const BEAT = 0;
export const SILENT = 2;
export const COUNT_IN = [0, 1, 2];
export const MAX_BARS = 16; // for play and mute

export const beatsPerBar = (meter) => BEATS[meter] || 4;

function defaultPattern(meter) {
  return Array.from({ length: beatsPerBar(meter) }, (_, i) => (i === 0 ? ACCENT : BEAT));
}

export function defaultMetronome() {
  return {
    on: false,
    volume: 60, // percent
    patterns: Object.fromEntries(METERS.map((m) => [m, defaultPattern(m)])),
    play: 4, // bars with the clicks…
    mute: 0, // …then bars without (0: always on)
    countIn: 0, // bars before the song starts
  };
}

// The settings as kept, checked, or the defaults.
export function loadMetronome() {
  const s = defaultMetronome();
  try {
    const kept = JSON.parse(localStorage.getItem(KEY) || "null");
    if (kept && typeof kept === "object") {
      s.on = !!kept.on;
      if (Number.isFinite(kept.volume)) s.volume = Math.max(0, Math.min(100, Math.round(kept.volume)));
      for (const m of METERS) {
        const p = kept.patterns && kept.patterns[m];
        if (Array.isArray(p) && p.length === beatsPerBar(m) && p.every((v) => v === ACCENT || v === BEAT || v === SILENT)) s.patterns[m] = p.slice();
      }
      if (Number.isInteger(kept.play)) s.play = Math.max(1, Math.min(MAX_BARS, kept.play));
      if (Number.isInteger(kept.mute)) s.mute = Math.max(0, Math.min(MAX_BARS, kept.mute));
      if (COUNT_IN.includes(kept.countIn)) s.countIn = kept.countIn;
    }
  } catch (_) {}
  return s;
}

export function saveMetronome(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch (_) {}
}

// The next state of a beat's button: accent, beat, silent, accent…
export const nextBeatKind = (k) => (k === ACCENT ? BEAT : k === BEAT ? SILENT : ACCENT);

// Index of the first value of `list` (sorted) >= t.
function lowerBound(list, t) {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// The clicks of a grid ({beats, bars, meter, bpm}), with the beats found
// (`found`, seconds, or null) and the pattern of the meter (one kind per beat
// of the bar): {times (seconds), kinds, firsts (1: the first beat of a bar),
// bar (seconds of a bar)}, or null for a grid without beats.
export function metronomeClicks(grid, found, pattern) {
  const beats = grid && grid.beats ? grid.beats : [];
  const bars = grid && grid.bars ? grid.bars : [];
  if (beats.length < 2) return null;
  const perBar = beatsPerBar(grid.meter);
  const period = grid.bpm > 0 ? 60 / grid.bpm : (beats[beats.length - 1] - beats[0]) / (beats.length - 1);
  const kinds = pattern && pattern.length === perBar ? pattern : defaultPattern(grid.meter);
  const ref = bars.length ? bars[0] : beats[0];
  // The place of a beat in its bar, from the first bar, both ways.
  const place = (t) => (((Math.round((t - ref) / period) % perBar) + perBar) % perBar);
  const hits = Array.isArray(found) && found.length ? found : null;
  const tol = 0.3 * period;
  const lead = [];
  for (let k = 2 * perBar; k >= 1; k--) lead.push(beats[0] - k * period);
  const all = lead.concat(beats);
  const n = all.length;
  const times = new Float64Array(n);
  const kindOf = new Uint8Array(n);
  const firsts = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let t = all[i];
    // On the beat found nearest, if near enough.
    if (hits && i >= lead.length) {
      const j = lowerBound(hits, t);
      let best = null;
      for (const c of [j - 1, j]) if (c >= 0 && c < hits.length && Math.abs(hits[c] - t) < tol && (best === null || Math.abs(hits[c] - t) < Math.abs(best - t))) best = hits[c];
      if (best !== null) t = best;
    }
    const p = place(all[i]);
    times[i] = t;
    kindOf[i] = kinds[p];
    firsts[i] = p === 0 ? 1 : 0;
  }
  // In order, should a beat found have moved past its neighbour.
  for (let i = 1; i < n; i++) if (times[i] <= times[i - 1]) times[i] = times[i - 1] + 1e-4;
  return { times, kinds: kindOf, firsts, bar: perBar * period };
}
