// The bar grid and the chords of a song as EUTERIA (Python) keeps them in
// manifest.music: the times of the beats and of the bars in seconds, the
// shift of the bar numbers (bar_number_offset: the first bar is number
// offset + 1) and the chords, one per bar, keyed by the bar's index.

export const METER_BEATS = { "4/4": 4, "3/4": 3, "6/8": 6 };

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
// chords: Map(bar index -> text), meter, bpm}. As in EUTERIA (Python), the
// saved beats and bars are the grid; a project saved without them has none.
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
    meter: typeof m.time_signature === "string" ? m.time_signature : "4/4",
    bpm: +m.bpm > 0 ? +m.bpm : null,
  };
}

export const emptyGrid = () => ({ beats: [], bars: [], offset: 0, chords: new Map(), meter: "4/4", bpm: null });

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
