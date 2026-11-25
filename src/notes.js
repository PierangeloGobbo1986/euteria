// The notes of a song (2.21): a text over a bar or a run of bars ("play it
// loud, with distortion"), written in the lane of the notes, over the
// sections. They are kept with the grid (grid.notes: {lo, hi, text}, bar
// indexes, the last bar included), stay with their bars when the grid is
// rebuilt (as the chords and the sections), and are saved in
// manifest.music.notes as [{first_bar, last_bar, text}], which EUTERIA
// (Python) leaves alone. Notes may overlap (one for a section, one for a bar
// of it), but two never have the same bars: the lane stacks those that
// overlap, the longer over the shorter (noteRows()). They stay in EUTERIA:
// Copy and Paste leave them, and the chord chart for MuseScore has none.

export const MAX_NOTE = 2000; // characters

// One line of text: a note is written in one field, Return keeps it.
const clean = (text) =>
  String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NOTE);

// In order: by their first bar, the longer first.
const order = (a, b) => a.lo - b.lo || b.hi - a.hi;

// From manifest.music.notes (or the edits kept in this browser).
export function readNotes(list) {
  if (!Array.isArray(list)) return [];
  const byBars = new Map();
  for (const x of list) {
    if (!x || typeof x !== "object") continue;
    const lo = Number(x.first_bar);
    const hi = Number(x.last_bar);
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < 0 || hi < lo) continue;
    const text = clean(x.text);
    if (text) byBars.set(`${lo}:${hi}`, { lo, hi, text });
  }
  return [...byBars.values()].sort(order);
}

// As manifest.music.notes writes them.
export function notesFields(notes) {
  return (notes || []).map((n) => ({ first_bar: n.lo, last_bar: n.hi, text: n.text }));
}

// The note of bars lo..hi, exactly those, or null.
export function noteOf(notes, lo, hi) {
  return (notes || []).find((n) => n.lo === lo && n.hi === hi) || null;
}

// Bars lo..hi given the note `text` (empty: theirs taken away). A new list.
export function setNote(notes, lo, hi, text) {
  const a = Math.max(0, Math.min(lo, hi));
  const b = Math.max(a, Math.max(lo, hi));
  const t = clean(text);
  const out = (notes || []).filter((n) => !(n.lo === a && n.hi === b));
  if (t) out.push({ lo: a, hi: b, text: t });
  return out.sort(order);
}

// The notes moved by `shift` bars (the grid rebuilt); those that would start
// before the first bar cut there.
export function shiftNotes(notes, shift) {
  if (!shift) return notes || [];
  const out = [];
  for (const n of notes || []) {
    const hi = n.hi + shift;
    if (hi < 0) continue;
    out.push({ ...n, lo: Math.max(0, n.lo + shift), hi });
  }
  return readNotes(notesFields(out)); // two that now have the same bars: the last one stays
}

// The notes over bar i, the longer first.
export function notesAt(notes, i) {
  return (notes || []).filter((n) => n.lo <= i && i <= n.hi);
}

// The row of each note in their lane (0 at the top): those that overlap one
// under the other, the longer over the shorter. {rows (one for each note, in
// the order of the list), count (at least one)}.
export function noteRows(notes) {
  const ends = []; // the last bar taken in each row
  const rows = [];
  for (const n of notes || []) {
    let r = 0;
    while (r < ends.length && ends[r] >= n.lo) r++;
    ends[r] = n.hi;
    rows.push(r);
  }
  return { rows, count: Math.max(1, ends.length) };
}
