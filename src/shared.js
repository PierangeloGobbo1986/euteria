// The analysis of a song shared on its own (3.1): its bars, sections and
// chords and its details, without any audio, in a small file
// (.euteria-analysis, JSON) for whoever has the same recording (app/app.js:
// Share analysis, Analysis from a file; the community, 3.3). The notes stay
// in EUTERIA: they are not in it.
//
// Imported (3.2), it goes onto the song's own bars: the tempo, the meter and
// the bars of the song stay, as its own tempo detection (or the hand) made
// them on its own copy of the recording, so that silence before the music,
// another master or another rip change nothing; the chords and the sections
// are pasted one bar after the other, in the order the analysis has them,
// from the bar of the song nearest in time to the first bar the analysis
// marks (pasteShared()). The arrows of the import then move them, a beat
// (the chords) or a bar (the chords and the sections) at a time, from where
// they were pasted (shiftPaste()). A song with no bars yet takes those of the
// analysis as they are. A song whose tempo is twice, half or another than the
// analysis', or whose meter is another, is told so.
//
// The file: {format: "euteria-analysis", version, app, created, details
// (those of the song given: src/musicxml.js DETAIL_FIELDS, the title always),
// duration (s), music (as manifest.music has them, src/grid.js musicFields(),
// without the notes)}. A file of 3.1 also has a fingerprint of the recording
// (how its sound rises, 50 times a second), no longer needed: it is left
// unread.

import { readGrid, musicFields, rebuildGrid, emptyGrid, beatsPerBar, nearestBar, chordsInMeter, slotCount } from "./grid.js";
import { DETAIL_FIELDS, creditOf } from "./musicxml.js";
import { tr } from "./i18n.js";

export const ANALYSIS_EXT = ".euteria-analysis";
export const ANALYSIS_FORMAT = "euteria-analysis";
export const ANALYSIS_VERSION = 1;

// Whether a file is one, by its name.
export const isAnalysisFile = (file) => !!file && typeof file.name === "string" && file.name.toLowerCase().endsWith(ANALYSIS_EXT);

const r3 = (t) => Math.round(t * 1000) / 1000;

// The file of an analysis: details (the title always), duration (s), grid
// (src/grid.js), app (who made it).
export function analysisJson({ details, duration, grid, app }) {
  const music = musicFields(grid);
  delete music.notes;
  const given = {};
  for (const k of DETAIL_FIELDS) if (details && details[k]) given[k] = details[k];
  return {
    format: ANALYSIS_FORMAT,
    version: ANALYSIS_VERSION,
    app,
    created: new Date().toISOString(),
    details: given,
    duration: r3(duration),
    music,
  };
}

// An analysis as an object ({format, music…}, as analysisJson() makes it,
// read from a file or from the community) checked and read: {details,
// duration, music, app}; an Error with what is wrong, said, when it is not
// one.
export function analysisFrom(v) {
  if (!v || typeof v !== "object" || v.format !== ANALYSIS_FORMAT || !v.music || typeof v.music !== "object") throw new Error(tr("This file is not an EUTERIA analysis."));
  if (+v.version > ANALYSIS_VERSION) throw new Error(tr("This analysis was made by a newer EUTERIA: update the app to read it."));
  const details = {};
  for (const k of DETAIL_FIELDS) {
    const c = creditOf(v.details && v.details[k]);
    if (c) details[k] = c;
  }
  return { details, duration: +v.duration > 0 ? +v.duration : null, music: v.music, app: String(v.app || "") };
}

// The text of a file read back (analysisFrom()).
export function readShared(text) {
  let v = null;
  try {
    v = JSON.parse(text);
  } catch (_) {
    v = null;
  }
  return analysisFrom(v);
}

// Whether the bars of a grid come at a steady tempo (every grid EUTERIA Web
// makes): within 20 ms of those its tempo and first bar give.
function steady(grid) {
  if (!(grid.bpm > 0) || grid.bars.length < 2) return false;
  const period = (beatsPerBar(grid.meter) * 60) / grid.bpm;
  return grid.bars.every((t, i) => Math.abs(t - (grid.bars[0] + i * period)) < 0.02);
}

// The first bar an analysis marks: the first with a chord or where a
// section starts (-1: none).
function firstMarked(grid) {
  let first = Infinity;
  for (const i of grid.chords.keys()) if (i >= 0) first = Math.min(first, i);
  for (const s of grid.sections) first = Math.min(first, s.lo);
  return Number.isFinite(first) ? first : -1;
}

// How the tempo of the song (`bpm`) stands to the analysis' (`theirs`):
// "double", "half", "other" (more than 3% apart) or "" (the same).
export function tempoAgainst(bpm, theirs) {
  if (!(bpm > 0) || !(theirs > 0)) return "";
  const r = bpm / theirs;
  if (Math.abs(r - 2) < 0.1) return "double";
  if (Math.abs(r - 0.5) < 0.05) return "half";
  return Math.abs(r - 1) > 0.03 ? "other" : "";
}

// The chords and the sections within the `bars` bars of a grid.
function within(chords, sections, bars) {
  const c = new Map();
  for (const [i, slots] of chords) if (i >= 0 && i < bars) c.set(i, slots);
  const s = [];
  for (const sec of sections) {
    if (sec.hi < 0 || sec.lo >= bars) continue;
    s.push({ ...sec, lo: Math.max(0, sec.lo), hi: Math.min(bars - 1, sec.hi) });
  }
  return { chords: c, sections: s };
}

// An analysis (analysisFrom()) put onto `current` (the song's grid, its
// audio `duration` seconds long). The song with bars keeps them (its tempo,
// meter, numbers and notes): the analysis' chords (in the song's meter) and
// sections are pasted from the song's bar nearest in time to the analysis'
// first marked bar on. A song without bars takes the analysis' (built again
// from its tempo and first beat when steady, else as they are). {grid, built
// (true: rebuilt from tempo and anchor; null: as the song had it), base
// ({chords, sections} as pasted: what shiftPaste() moves), tempo (the song's
// against the analysis', tempoAgainst()), meter (the analysis' when it is
// another), empty (no chords nor sections in it)}.
export function pasteShared(shared, current, duration) {
  const src = readGrid({ music: shared.music }, Infinity);
  const empty = !src.chords.size && !src.sections.length;
  if (!current.bars.length) {
    if (!src.bars.length) return { grid: { ...current, meter: src.meter, bpm: src.bpm }, built: false, base: { chords: new Map(), sections: [] }, tempo: "", meter: "", empty };
    let grid;
    let built = false;
    if (steady(src)) {
      grid = rebuildGrid({ ...emptyGrid(), bpm: src.bpm, meter: src.meter, firstBeat: src.firstBeat, offset: src.offset, chords: src.chords, sections: src.sections, beats: src.beats, bars: src.bars, notes: [] }, duration);
      delete grid.shift;
      built = true;
    } else {
      const keep = (t) => t <= duration + 1e-6;
      grid = { ...emptyGrid(), bpm: src.bpm, meter: src.meter, firstBeat: src.firstBeat, offset: src.offset, beats: src.beats.filter(keep), bars: src.bars.filter(keep), chords: src.chords, sections: src.sections };
    }
    const base = { chords: grid.chords, sections: grid.sections };
    const fit = within(grid.chords, grid.sections, grid.bars.length);
    return { grid: { ...grid, ...fit, notes: current.notes || [] }, built, base, tempo: "", meter: "", empty };
  }
  const first = firstMarked(src);
  const k = first >= 0 && first < src.bars.length ? nearestBar(current.bars, src.bars[first]) - first : 0;
  const chords = new Map();
  for (const [i, slots] of chordsInMeter(src.chords, current.meter)) chords.set(i + k, slots);
  // The base keeps what falls before the first bar or past the last, so
  // that the arrows can bring it back.
  const base = { chords, sections: src.sections.map((s) => ({ ...s, lo: s.lo + k, hi: s.hi + k })) };
  const fit = within(base.chords, base.sections, current.bars.length);
  return {
    grid: { ...current, chords: fit.chords, sections: fit.sections },
    built: null,
    base,
    tempo: tempoAgainst(current.bpm, src.bpm),
    meter: src.meter !== current.meter ? src.meter : "",
    empty,
  };
}

// The chords and sections pasted (base) moved by `bars` bars (the chords and
// the sections) and `beats` beats (the chords: a slot of the bar, a beat in
// 4/4 and 3/4, half a bar in 6/8), within the `count` bars of a grid in
// `meter`: {chords, sections}.
export function shiftPaste(base, { bars = 0, beats = 0 }, count, meter) {
  const n = slotCount(meter);
  const step = bars * n + beats;
  const chords = new Map();
  for (const [i, slots] of base.chords) {
    for (let s = 0; s < slots.length && s < n; s++) {
      if (!slots[s]) continue;
      const at = i * n + s + step;
      if (at < 0 || at >= count * n) continue;
      const bar = Math.floor(at / n);
      const row = chords.get(bar) || new Array(n).fill("");
      const j = at - bar * n;
      row[j] = row[j] ? `${row[j]} ${slots[s]}` : slots[s];
      chords.set(bar, row);
    }
  }
  const moved = base.sections.map((s) => ({ ...s, lo: s.lo + bars, hi: s.hi + bars }));
  return within(chords, moved, count);
}
