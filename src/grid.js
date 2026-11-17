// The bar grid and the chords of a song as a project keeps them in
// manifest.music: the times of the beats and of the bars in seconds, the
// shift of the bar numbers (bar_number_offset: the first bar is number
// offset + 1), the chords keyed by the bar's index, and the sections of the
// song (its form, src/sections.js). The chords of a bar are kept beat by beat,
// as its slots: a text for each beat a chord may start on (four in 4/4, three
// in 3/4, two in 6/8 on its beats 1 and 4), "" where none starts. A project
// saved before EUTERIA Web 2.7.0 has one text a bar ("C G"): its chords are
// spread over the bar, two on beats 1 and 3 (spread()). The grid is edited
// here too: rebuilt from its anchor (the first beat of a bar), tempo and meter.

import { readSections, sectionsFields, shiftSections } from "./sections.js";

const METER_BEATS = { "4/4": 4, "3/4": 3, "6/8": 6 };
export const METERS = Object.keys(METER_BEATS);
// The beats of a bar a chord may start on, counted from 0: each beat in 4/4
// and 3/4; in 6/8 the two beats of the bar, on its eighth notes 1 and 4.
const SLOT_BEATS = { "4/4": [0, 1, 2, 3], "3/4": [0, 1, 2], "6/8": [0, 3] };
export const beatsPerBar = (meter) => METER_BEATS[meter] || 4;
export const slotBeats = (meter) => SLOT_BEATS[meter] || SLOT_BEATS["4/4"];
export const slotCount = (meter) => slotBeats(meter).length;
export const BPM_RANGE = [20, 400];
export const DEFAULT_BPM = 180; // EUTERIA (Python), for a song without one

// build_grid() of EUTERIA (Python): beats from `anchor` at `bpm`, both ways,
// and a bar every `meter` beats, within the song.
function buildGrid(anchor, bpm, meter, duration) {
  if (!(bpm > 0) || !(duration > 0)) return { beats: [], bars: [] };
  const perBar = METER_BEATS[meter] || 4;
  const period = 60 / bpm;
  const first = +anchor || 0;
  const beats = [];
  for (let i = Math.floor(-first / period) - 2; i <= Math.ceil((duration - first) / period) + 2; i++) {
    const t = first + i * period;
    if (t >= 0 && t <= duration) beats.push(t);
  }
  const barPeriod = perBar * period;
  const bars = [];
  for (let i = Math.floor(-first / barPeriod) - 2; i <= Math.ceil((duration - first) / barPeriod) + 2; i++) {
    const t = first + i * barPeriod;
    if (t >= 0 && t <= duration) bars.push(t);
  }
  return { beats, bars };
}

const times = (list, duration) =>
  (Array.isArray(list) ? list.map(Number) : []).filter((t) => Number.isFinite(t) && t >= 0 && t <= duration + 1e-6).sort((a, b) => a - b);

// The words of a chord text: the chords one after the other.
export const chordWords = (text) => String(text || "").trim().split(/\s+/).filter(Boolean);

// `words` (chords, one after the other) spread over `n` slots: k chords take
// n / k slots each, the first ones a slot more when they do not divide
// evenly (in 4/4 two chords on beats 1 and 3, three on 1, 3 and 4); with more
// chords than slots, the last slots take two (the changes quicken toward the
// end of a bar).
export function spread(words, n) {
  const out = new Array(Math.max(0, n)).fill("");
  const k = words.length;
  if (!k || !n) return out;
  if (k <= n) {
    const base = Math.floor(n / k);
    const extra = n % k;
    let at = 0;
    for (let i = 0; i < k; i++) {
      out[at] = words[i];
      at += base + (i < extra ? 1 : 0);
    }
  } else {
    const base = Math.floor(k / n);
    const extra = k % n;
    let w = 0;
    for (let j = 0; j < n; j++) {
      const take = base + (j >= n - extra ? 1 : 0);
      out[j] = words.slice(w, w + take).join(" ");
      w += take;
    }
  }
  return out;
}

// A bar's chords as the slots of `meter`, or null when it has none: from the
// text of a whole bar (a project saved before 2.7.0) spread over it, or from
// slots, moved to those of another meter by where they fall in the bar (two
// chords landing in one slot share it).
export function toSlots(value, meter) {
  const n = slotCount(meter);
  let out;
  if (typeof value === "string") out = spread(chordWords(value), n);
  else if (Array.isArray(value)) {
    const list = value.map((v) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : ""));
    if (list.length === n) out = list;
    else {
      out = new Array(n).fill("");
      list.forEach((text, j) => {
        if (!text) return;
        const to = Math.min(n - 1, Math.round((j * n) / list.length));
        out[to] = out[to] ? `${out[to]} ${text}` : text;
      });
    }
  } else return null;
  return out.some(Boolean) ? out : null;
}

// The chords of a project, or of the edits kept in this browser ({bar index:
// slots, or a text}), as the slots of `meter`: Map(bar index -> slots).
function readChords(fields, meter) {
  const chords = new Map();
  if (!fields || typeof fields !== "object") return chords;
  for (const [k, v] of Object.entries(fields)) {
    if (!/^-?\d+$/.test(String(k).trim())) continue;
    const slots = toSlots(v, meter);
    if (slots) chords.set(parseInt(k, 10), slots);
  }
  return chords;
}

// The chords moved to the slots of another meter.
export function chordsInMeter(chords, meter) {
  const out = new Map();
  for (const [i, slots] of chords) {
    const s = toSlots(slots, meter);
    if (s) out.set(i, s);
  }
  return out;
}

// Every chord text of the chords (for the key they are in).
export function chordTexts(chords) {
  const out = [];
  for (const slots of chords.values()) for (const text of slots) if (text) out.push(text);
  return out;
}

// The grid of a project (an audio file has none): {beats, bars, offset,
// chords: Map(bar index -> slots), sections, meter, bpm, firstBeat}. The
// saved beats and bars are the grid; a project saved without them has none.
export function readGrid(manifest, duration) {
  const m = (manifest && manifest.music) || {};
  const meter = METER_BEATS[m.time_signature] ? m.time_signature : "4/4";
  const offset = Number.isInteger(+m.bar_number_offset) ? +m.bar_number_offset : 0;
  return {
    beats: times(m.beats, duration),
    bars: times(m.bars, duration),
    offset,
    chords: readChords(m.chords, meter),
    sections: readSections(m.sections),
    meter,
    bpm: +m.bpm > 0 ? +m.bpm : null,
    firstBeat: +m.first_beat >= 0 ? +m.first_beat : 0,
  };
}

export const emptyGrid = () => ({ beats: [], bars: [], offset: 0, chords: new Map(), sections: [], meter: "4/4", bpm: null, firstBeat: 0 });

// Index of the bar starting nearest to `t` (-1 without bars).
export function nearestBar(bars, t) {
  if (!bars.length) return -1;
  let lo = 0;
  let hi = bars.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo > 0 && t - bars[lo - 1] < bars[lo] - t ? lo - 1 : lo;
}

// The grid rebuilt from its anchor, tempo and meter (fields `firstBeat`,
// `bpm`, `meter` already changed): a new grid. The chords (and the
// sections) stay with the bars they belong to, measured at the anchor, so
// that a bar appearing or vanishing at the start of the song (the anchor
// moved by a few hundredths, the tempo changed) shifts nothing; with another
// meter they move to its slots.
export function rebuildGrid(old, duration) {
  const { beats, bars } = buildGrid(old.firstBeat, old.bpm, old.meter, duration);
  let shift = 0;
  const before = nearestBar(old.bars, old.firstBeat);
  const after = nearestBar(bars, old.firstBeat);
  if (before >= 0 && after >= 0) shift = after - before;
  const chords = new Map();
  for (const [i, slots] of chordsInMeter(old.chords, old.meter)) chords.set(i + shift, slots);
  const sections = shiftSections(old.sections, shift);
  return { ...old, beats, bars, chords, sections, offset: old.offset - shift, shift };
}

// The grid fitted to a song that grew (a take recorded past its end: it goes
// on at its tempo) or went back (the bars past the end go; the chords stay
// with their bars, for when it grows again); the same grid if nothing
// changes.
export function extendGrid(grid, duration) {
  if (!grid.bars.length || !grid.beats.length || !(grid.bpm > 0)) return grid;
  const period = 60 / grid.bpm;
  const barPeriod = (METER_BEATS[grid.meter] || 4) * period;
  const fit = (list, step) => {
    const out = list.filter((t) => t <= duration + 1e-9);
    const last = out.length ? out[out.length - 1] : list[0] - step;
    for (let k = 1; last + k * step <= duration + 1e-9; k++) out.push(last + k * step);
    return out;
  };
  const beats = fit(grid.beats, period);
  const bars = fit(grid.bars, barPeriod);
  const same = (a, b) => a.length === b.length && a[a.length - 1] === b[b.length - 1];
  if (same(beats, grid.beats) && same(bars, grid.bars)) return grid;
  return { ...grid, beats, bars };
}

// A grid at `bpm` in `meter`, its first bar at 0 s, over `duration` seconds:
// the one an empty project starts with.
export function newGrid(bpm, meter, duration) {
  return { ...emptyGrid(), bpm, meter, firstBeat: 0, ...buildGrid(0, bpm, meter, duration) };
}

// The edits of a grid as this browser keeps them until they are saved in the
// project: everything but the beats and the bars, which are rebuilt from them
// (`built`), or the project's own.
export function gridEdits(grid, built) {
  return {
    built: !!built,
    bpm: grid.bpm,
    meter: grid.meter,
    firstBeat: grid.firstBeat,
    offset: grid.offset,
    chords: Object.fromEntries(grid.chords),
    sections: sectionsFields(grid.sections),
    empty: !grid.bars.length,
  };
}

export function applyGridEdits(grid, edits, duration) {
  if (!edits || typeof edits !== "object") return grid;
  const out = { ...grid };
  if (+edits.bpm > 0) out.bpm = +edits.bpm;
  if (METER_BEATS[edits.meter]) out.meter = edits.meter;
  if (+edits.firstBeat >= 0) out.firstBeat = +edits.firstBeat;
  if (Number.isInteger(edits.offset)) out.offset = edits.offset;
  if (edits.chords && typeof edits.chords === "object") out.chords = readChords(edits.chords, out.meter);
  else if (out.meter !== grid.meter) out.chords = chordsInMeter(out.chords, out.meter);
  if (Array.isArray(edits.sections)) out.sections = readSections(edits.sections);
  if (edits.empty) {
    out.beats = [];
    out.bars = [];
  } else if (edits.built && out.bpm) {
    Object.assign(out, buildGrid(out.firstBeat, out.bpm, out.meter, duration));
  }
  return out;
}

const r6 = (t) => Math.round(t * 1e6) / 1e6;

// The grid as manifest.music writes it: the chords of each bar as its slots.
export function musicFields(grid) {
  return {
    bpm: grid.bpm,
    time_signature: grid.meter,
    first_beat: r6(grid.firstBeat),
    beats: grid.beats.map(r6),
    bars: grid.bars.map(r6),
    bar_number_offset: grid.offset,
    chords: Object.fromEntries([...grid.chords].sort((a, b) => a[0] - b[0]).map(([k, v]) => [String(k), v])),
    sections: sectionsFields(grid.sections),
  };
}

// How long bar i lasts: to the next bar; the last one as long as the one
// before it (or as the tempo says).
export function barLength(grid, i) {
  const bars = grid.bars;
  if (i + 1 < bars.length) return bars[i + 1] - bars[i];
  if (bars.length > 1) return bars[bars.length - 1] - bars[bars.length - 2];
  return grid.bpm ? (60 / grid.bpm) * beatsPerBar(grid.meter) : 2;
}

// The times the slots of bar i start at (its beats a chord may start on).
export function slotTimes(grid, i) {
  const a = grid.bars[i];
  const len = barLength(grid, i);
  const per = beatsPerBar(grid.meter);
  return slotBeats(grid.meter).map((b) => a + (len * b) / per);
}

// The slot of bar i that time t falls in (the first one before its start).
export function slotAt(grid, i, t) {
  const at = slotTimes(grid, i);
  let k = 0;
  for (let j = 1; j < at.length; j++) if (t >= at[j] - 1e-9) k = j;
  return k;
}

// The number shown on bar `index`.
export const barNumber = (grid, index) => index + 1 + grid.offset;

// Index of the last bar that starts at or before `t` (-1 before the first).
export function barAt(grid, t) {
  const bars = grid.bars;
  let lo = 0;
  let hi = bars.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid] <= t + 1e-9) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}
