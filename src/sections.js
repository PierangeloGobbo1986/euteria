// The sections of a song, its form: runs of whole bars with a name (Intro,
// Verse, Pre-chorus, Chorus, Bridge, Solo, Interlude, Outro), a letter of a
// jazz form (A to D) or a name typed. They are kept with the grid
// (grid.sections: {lo, hi, kind} or {lo, hi, label}, bar indexes, the last
// bar included, in order, never overlapping), stay with their bars when the
// grid is rebuilt (as the chords), and are saved in manifest.music.sections
// as [{first_bar, last_bar, kind} or {first_bar, last_bar, label}], which
// EUTERIA (Python) leaves alone. A name that comes back is numbered in order:
// Verse 1, Verse 2; A1, A2, B, A3.

import { tr } from "./i18n.js";

export const SECTION_KINDS = ["intro", "verse", "prechorus", "chorus", "bridge", "solo", "interlude", "outro"];
export const SECTION_LETTERS = ["A", "B", "C", "D"];
const MAX_LABEL = 24; // characters of a name typed

// A section's name in the language in use (without its number).
export function sectionName(s) {
  if (!s) return "";
  if (s.label) return s.label;
  switch (s.kind) {
    case "intro":
      return tr("Intro");
    case "verse":
      return tr("Verse");
    case "prechorus":
      return tr("Pre-chorus");
    case "chorus":
      return tr("Chorus");
    case "bridge":
      return tr("Bridge");
    case "solo":
      return tr("Solo");
    case "interlude":
      return tr("Interlude");
    case "outro":
      return tr("Outro");
    default:
      return s.kind || "";
  }
}

// The colour of a section's block in the timeline.
const COLORS = {
  intro: "#7d8fa3",
  verse: "#5b8fd6",
  prechorus: "#4fa9b3",
  chorus: "#d6a85f",
  bridge: "#a97fd1",
  solo: "#72bd73",
  interlude: "#8a9a8e",
  outro: "#b0838a",
  A: "#d6a85f",
  B: "#5b8fd6",
  C: "#a97fd1",
  D: "#72bd73",
};
export const sectionColor = (s) => (s && !s.label && COLORS[s.kind]) || "#98a3a4";

const isKind = (k) => SECTION_KINDS.includes(k) || SECTION_LETTERS.includes(k);
const cleanLabel = (text) => String(text || "").trim().replace(/\s+/g, " ").slice(0, MAX_LABEL);

// The sections as a list kept in order, without overlaps (a later one wins
// where two overlap) and without bars below 0.
function tidy(list) {
  let out = [];
  for (const s of list) out = place(out, s.lo, s.hi, s);
  return out;
}

// `list` with bars lo..hi given to `value` ({kind} or {label}; null: no
// section): the sections there are cut, what is left of them outside stays.
function place(list, lo, hi, value) {
  const out = [];
  for (const s of list) {
    if (s.hi < lo || s.lo > hi) {
      out.push(s);
      continue;
    }
    if (s.lo < lo) out.push({ ...s, hi: lo - 1 });
    if (s.hi > hi) out.push({ ...s, lo: hi + 1 });
  }
  if (value) out.push(value.label ? { lo, hi, label: value.label } : { lo, hi, kind: value.kind });
  return out.sort((a, b) => a.lo - b.lo);
}

// From manifest.music.sections (or the edits kept in this browser).
export function readSections(list) {
  if (!Array.isArray(list)) return [];
  const read = [];
  for (const x of list) {
    if (!x || typeof x !== "object") continue;
    const lo = Number(x.first_bar);
    const hi = Number(x.last_bar);
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < 0 || hi < lo) continue;
    if (typeof x.label === "string" && cleanLabel(x.label)) read.push({ lo, hi, label: cleanLabel(x.label) });
    else if (isKind(x.kind)) read.push({ lo, hi, kind: x.kind });
  }
  return tidy(read);
}

// As manifest.music.sections writes them.
export function sectionsFields(sections) {
  return (sections || []).map((s) => (s.label ? { first_bar: s.lo, last_bar: s.hi, label: s.label } : { first_bar: s.lo, last_bar: s.hi, kind: s.kind }));
}

// Bars lo..hi made a section: value {kind} (one of SECTION_KINDS or
// SECTION_LETTERS) or {label} (a name typed); null takes the sections there
// away. A new list.
export function setSection(sections, lo, hi, value) {
  const a = Math.max(0, Math.min(lo, hi));
  const b = Math.max(a, Math.max(lo, hi));
  let v = null;
  if (value && value.label && cleanLabel(value.label)) v = { label: cleanLabel(value.label) };
  else if (value && isKind(value.kind)) v = { kind: value.kind };
  return place(sections || [], a, b, v);
}

// The sections moved by `shift` bars (the grid rebuilt), those that would
// start before the first bar cut there.
export function shiftSections(sections, shift) {
  if (!shift) return sections || [];
  const out = [];
  for (const s of sections || []) {
    const lo = s.lo + shift;
    const hi = s.hi + shift;
    if (hi < 0) continue;
    out.push({ ...s, lo: Math.max(0, lo), hi });
  }
  return out;
}

// Index in `sections` of the one holding bar `i`, or -1.
export function sectionIndexAt(sections, i) {
  const list = sections || [];
  for (let k = 0; k < list.length; k++) if (list[k].lo <= i && i <= list[k].hi) return k;
  return -1;
}

// What each section shows: its name, numbered when it comes back (Verse 1,
// Verse 2; A1, A2). One title per section, in order.
export function sectionTitles(sections) {
  const list = sections || [];
  const key = (s) => (s.label ? `label:${s.label.toLowerCase()}` : `kind:${s.kind}`);
  const total = new Map();
  for (const s of list) total.set(key(s), (total.get(key(s)) || 0) + 1);
  const seen = new Map();
  return list.map((s) => {
    const k = key(s);
    const n = (seen.get(k) || 0) + 1;
    seen.set(k, n);
    const name = sectionName(s);
    if (total.get(k) < 2) return name;
    return !s.label && SECTION_LETTERS.includes(s.kind) ? `${name}${n}` : `${name} ${n}`;
  });
}
