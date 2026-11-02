// The bar grid and the chords of a song as EUTERIA (Python) keeps them in
// manifest.music: the times of the beats and of the bars in seconds, the
// shift of the bar numbers (bar_number_offset: the first bar is number
// offset + 1) and the chords, one per bar, keyed by the bar's index. The
// grid is edited here too: rebuilt from its anchor (the first beat of a
// bar), tempo and meter, or cleared, as in EUTERIA (Python).

export const METER_BEATS = { "4/4": 4, "3/4": 3, "6/8": 6 };
export const METERS = Object.keys(METER_BEATS);
export const BPM_RANGE = [20, 400];
export const DEFAULT_BPM = 180; // EUTERIA (Python), for a song without one

// build_grid() of EUTERIA (Python): beats from `anchor` at `bpm`, both ways,
// and a bar every `meter` beats, within the song.
export function buildGrid(anchor, bpm, meter, duration) {
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

// The grid of a project (an audio file has none): {beats, bars, offset,
// chords: Map(bar index -> text), meter, bpm, firstBeat}. As in EUTERIA
// (Python), the saved beats and bars are the grid; a project saved without
// them has none.
export function readGrid(manifest, duration) {
  const m = (manifest && manifest.music) || {};
  const chords = new Map();
  for (const [k, v] of Object.entries(m.chords && typeof m.chords === "object" ? m.chords : {})) {
    if (!/^-?\d+$/.test(String(k).trim()) || typeof v !== "string" || !v.trim()) continue;
    chords.set(parseInt(k, 10), v.trim());
  }
  const offset = Number.isInteger(+m.bar_number_offset) ? +m.bar_number_offset : 0;
  return {
    beats: times(m.beats, duration),
    bars: times(m.bars, duration),
    offset,
    chords,
    meter: METER_BEATS[m.time_signature] ? m.time_signature : "4/4",
    bpm: +m.bpm > 0 ? +m.bpm : null,
    firstBeat: +m.first_beat >= 0 ? +m.first_beat : 0,
  };
}

export const emptyGrid = () => ({ beats: [], bars: [], offset: 0, chords: new Map(), meter: "4/4", bpm: null, firstBeat: 0 });

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
// `bpm`, `meter` already changed): a new grid. EUTERIA (Python) keeps the
// chords and the bar numbers on the same indexes; here they stay with the
// bars they belong to, measured at the anchor, so that a bar appearing or
// vanishing at the start of the song (the anchor moved by a few hundredths,
// the tempo changed) shifts nothing.
export function rebuildGrid(old, duration) {
  const { beats, bars } = buildGrid(old.firstBeat, old.bpm, old.meter, duration);
  let shift = 0;
  const before = nearestBar(old.bars, old.firstBeat);
  const after = nearestBar(bars, old.firstBeat);
  if (before >= 0 && after >= 0) shift = after - before;
  const chords = new Map();
  for (const [i, text] of old.chords) chords.set(i + shift, text);
  return { ...old, beats, bars, chords, offset: old.offset - shift, shift };
}

// No grid and no chords (EUTERIA (Python): Clean).
export const clearedGrid = (old) => ({ ...old, beats: [], bars: [], chords: new Map(), offset: 0 });

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
  if (edits.chords && typeof edits.chords === "object") {
    out.chords = new Map();
    for (const [k, v] of Object.entries(edits.chords)) if (/^-?\d+$/.test(k) && typeof v === "string" && v.trim()) out.chords.set(+k, v.trim());
  }
  if (edits.empty) {
    out.beats = [];
    out.bars = [];
  } else if (edits.built && out.bpm) {
    Object.assign(out, buildGrid(out.firstBeat, out.bpm, out.meter, duration));
  }
  return out;
}

const r6 = (t) => Math.round(t * 1e6) / 1e6;

// The grid as manifest.music writes it (EUTERIA (Python) _save_music_settings).
export function musicFields(grid) {
  return {
    bpm: grid.bpm,
    time_signature: grid.meter,
    first_beat: r6(grid.firstBeat),
    beats: grid.beats.map(r6),
    bars: grid.bars.map(r6),
    bar_number_offset: grid.offset,
    chords: Object.fromEntries([...grid.chords].sort((a, b) => a[0] - b[0]).map(([k, v]) => [String(k), v])),
  };
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
