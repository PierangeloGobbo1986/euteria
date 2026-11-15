// The metronome: its settings, kept in this browser for every song, and its
// clicks for the song open, which the audio engine plays as the song comes
// out (src/engine-core.js), so they follow its tempo, the loop and every jump.
//
// The metronome is only the click: the tempo and the bars of the song are
// the grid's (the Tempo and key card, Bars and Chords). While it follows the
// song, its clicks are the beats of the grid, each on the beat found in the
// song (app.analysis.beats, Beat This!) when there is one near it, so that
// the metronome stays with a recording whose tempo moves (a live one above
// all), as the grid alone, one steady tempo, would not. Set to a tempo of its
// own, or in a song without a grid, it clicks steadily at its BPM, from the
// anchor of the grid or from the start of the song.
//
// Each beat of the bar is a beat, an accent or silent, as set for the meter.
// The bars may alternate between some with the clicks and some silent (play,
// mute), or be silent at random in the same proportion; a silent bar
// silences the metronome, the tracks, or both. A count-in plays the bars
// before the song starts with the beats as set, also with the metronome off,
// outside that alternation (its bars are not counted in it). Two bars of
// beats come before the song, for a count-in at its start; the clicks go on
// past its end, for a take recorded beyond it.
//
// On and off and the count-in are not kept: every song opens with both off.

import { METERS } from "./grid.js";

const KEY = "euteria-metronome";
// The settings' version: what a silent bar silences was kept from 2.0 on (by
// default the metronome and the tracks; before, the metronome only).
const VERSION = 2;
const BEATS = { "4/4": 4, "3/4": 3, "6/8": 6 };
export const ACCENT = 1;
export const BEAT = 0;
export const SILENT = 2;
export const COUNT_IN = [0, 1, 2];
export const MAX_BARS = 16; // for play and mute
export const VOLUME_MAX = 200; // percent: 100 as loud as the click was up to 0.10, 200 twice
export const BPM_MIN = 20;
export const BPM_MAX = 400;
export const DEFAULT_BPM = 120; // its own tempo, before one is set
// What a silent bar silences: the metronome, the metronome and every track,
// or the tracks only (the click goes on).
export const SILENCE = ["metronome", "all", "tracks"];
const AFTER_END = 1800; // seconds of clicks past the end of the song

export const beatsPerBar = (meter) => BEATS[meter] || 4;

function defaultPattern(meter) {
  return Array.from({ length: beatsPerBar(meter) }, (_, i) => (i === 0 ? ACCENT : BEAT));
}

export function defaultMetronome() {
  return {
    on: false,
    volume: 100, // percent
    bpm: DEFAULT_BPM, // its own tempo
    patterns: Object.fromEntries(METERS.map((m) => [m, defaultPattern(m)])),
    play: 4, // bars with the clicks…
    mute: 0, // …then silent bars (0: always on)
    silence: "all", // what they silence
    random: false, // silent bars at random, in the same proportion
    countIn: 0, // bars before the song starts
  };
}

// The settings as kept, checked, or the defaults; off, without a count-in.
export function loadMetronome() {
  const s = defaultMetronome();
  try {
    const kept = JSON.parse(localStorage.getItem(KEY) || "null");
    if (kept && typeof kept === "object") {
      if (Number.isFinite(kept.volume)) s.volume = Math.max(0, Math.min(VOLUME_MAX, Math.round(kept.volume)));
      if (Number.isFinite(kept.bpm)) s.bpm = Math.max(BPM_MIN, Math.min(BPM_MAX, Math.round(kept.bpm * 10) / 10));
      for (const m of METERS) {
        const p = kept.patterns && kept.patterns[m];
        if (Array.isArray(p) && p.length === beatsPerBar(m) && p.every((v) => v === ACCENT || v === BEAT || v === SILENT)) s.patterns[m] = p.slice();
      }
      if (Number.isInteger(kept.play)) s.play = Math.max(1, Math.min(MAX_BARS, kept.play));
      if (Number.isInteger(kept.mute)) s.mute = Math.max(0, Math.min(MAX_BARS, kept.mute));
      if (kept.v === VERSION && SILENCE.includes(kept.silence)) s.silence = kept.silence;
      s.random = kept.random === true;
    }
  } catch (_) {}
  return s;
}

export function saveMetronome(s) {
  try {
    const kept = { ...s, v: VERSION };
    delete kept.on;
    delete kept.countIn;
    localStorage.setItem(KEY, JSON.stringify(kept));
  } catch (_) {}
}

// The next state of a beat's button: beat, accent, silent, beat…
export const nextBeatKind = (k) => (k === BEAT ? ACCENT : k === ACCENT ? SILENT : BEAT);

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

const patternFor = (meter, pattern) => (pattern && pattern.length === beatsPerBar(meter) ? pattern : defaultPattern(meter));

// The seconds the clicks must reach: past the end of the song.
export const clicksUntil = (duration) => (+duration > 0 ? +duration : 0) + AFTER_END;

// The clicks of a grid ({beats, bars, meter, bpm}), with the beats found
// (`found`, seconds, or null) and the pattern of the meter (one kind per beat
// of the bar), up to `until` seconds: {times (seconds), kinds, firsts (1: the
// first beat of a bar), bar (seconds of a bar)}, or null for a grid without
// beats. Past its last beat the grid goes on at its tempo.
export function metronomeClicks(grid, found, pattern, until = 0) {
  const beats = grid && grid.beats ? grid.beats : [];
  const bars = grid && grid.bars ? grid.bars : [];
  if (beats.length < 2) return null;
  const perBar = beatsPerBar(grid.meter);
  const period = grid.bpm > 0 ? 60 / grid.bpm : (beats[beats.length - 1] - beats[0]) / (beats.length - 1);
  const kinds = patternFor(grid.meter, pattern);
  const ref = bars.length ? bars[0] : beats[0];
  // The place of a beat in its bar, from the first bar, both ways.
  const place = (t) => (((Math.round((t - ref) / period) % perBar) + perBar) % perBar);
  const hits = Array.isArray(found) && found.length ? found : null;
  const tol = 0.3 * period;
  const lead = [];
  for (let k = 2 * perBar; k >= 1; k--) lead.push(beats[0] - k * period);
  const after = [];
  const last = beats[beats.length - 1];
  for (let k = 1; last + k * period <= until; k++) after.push(last + k * period);
  const all = lead.concat(beats, after);
  const n = all.length;
  const times = new Float64Array(n);
  const kindOf = new Uint8Array(n);
  const firsts = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let t = all[i];
    // On the beat found nearest, if near enough.
    if (hits && i >= lead.length && i < lead.length + beats.length) {
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

// Steady clicks at `bpm`, a bar starting at `anchor` (seconds), from two bars
// before the song (or the anchor, if earlier) up to `until`: as
// metronomeClicks().
export function steadyClicks({ bpm, meter, anchor = 0, until = 0 }, pattern) {
  if (!(bpm > 0)) return null;
  const perBar = beatsPerBar(meter);
  const period = 60 / bpm;
  const kinds = patternFor(meter, pattern);
  const start = Math.min(0, anchor) - 2 * perBar * period;
  const i0 = Math.ceil((start - anchor) / period - 1e-9);
  const i1 = Math.max(i0, Math.floor((Math.max(until, 0) - anchor) / period));
  const n = i1 - i0 + 1;
  const times = new Float64Array(n);
  const kindOf = new Uint8Array(n);
  const firsts = new Uint8Array(n);
  for (let j = 0; j < n; j++) {
    const i = i0 + j;
    const p = ((i % perBar) + perBar) % perBar;
    times[j] = anchor + i * period;
    kindOf[j] = kinds[p];
    firsts[j] = p === 0 ? 1 : 0;
  }
  return { times, kinds: kindOf, firsts, bar: perBar * period };
}
