// The bars and chords of a song as a chord chart in MusicXML 4.0, the file
// MuseScore (and the other notation programs) open, to edit and print: one
// staff of rhythm slashes, a slash a beat (a dotted quarter in 6/8), each
// chord over the beat it starts on (the slots of src/grid.js) as a chord
// symbol the program reads, plays and transposes; the title, the tempo, the
// meter, the key signature (from the chords, src/chordnames.js), the
// sections as rehearsal marks with a double bar line before them, a new line
// every few bars and at each section (system breaks, which MuseScore keeps).
//
// The chords are written as the song shows them now: in the key it is moved
// to (Key), in letters. A chord symbol is its root, its kind (major,
// minor-seventh, dominant…) and its degrees added, altered or left out, as
// MusicXML has them: MuseScore writes the symbol again from those, not from
// the text of the kind (G7(b9) is dominant with a flat 9 added, which
// MuseScore shows as G7♭9). A suffix that cannot be read so (7alt, a word of
// one's own) goes as the kind "other" with the suffix as its text, shown as
// typed; N.C. and the other words (x2, Coda) as words over the staff. A bar
// with only % repeats the chords of the bar before it.

import { beatsPerBar, slotBeats, chordWords, barNumber } from "./grid.js";
import { chordView, estimateKey, parseChord } from "./chordnames.js";
import { sectionTitles } from "./sections.js";

const DIVISIONS = 12; // per quarter note: eighths, sixteenths and thirds fit
const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
// The key signature of each major key, by its tonic (the keys written with
// flats as src/chordnames.js writes them: Gb, not F#).
const FIFTHS = [0, -5, 2, -3, 4, -1, -6, 1, -4, 3, -2, 5];

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ----- the chords ---------------------------------------------------------------------------

// A suffix with its brackets and commas gone and the signs written as letters:
// 7(b9,#11) as 7b9#11, Δ as maj7 (Δ9 as maj9), ø as m7b5.
function normalise(suffix) {
  return suffix
    .replace(/♭/g, "b")
    .replace(/♯/g, "#")
    .replace(/[−–]/g, "-")
    .replace(/[Δ∆^](?=\d)/g, "maj")
    .replace(/[Δ∆^]/g, "maj7")
    .replace(/[øØ]7?/g, "m7b5")
    .replace(/°/g, "dim")
    .replace(/[()[\],\s]/g, "");
}

const sign = (s) => (s === "#" || s === "+" ? 1 : s === "b" || s === "-" ? -1 : 0);

// What a chord's suffix says, as MusicXML writes it: {kind, text, degrees:
// [{value, alter, type}]}, or null when it cannot be read.
export function chordKind(suffix) {
  let s = normalise(suffix || "");
  if (s === "5") return { kind: "power", text: "5", degrees: [] };
  let m;
  let quality = "major"; // major, minor, minmaj, dim, dim7, half, aug
  let seventh = null; // "minor" (7) or "major" (maj7)
  let ext = 0; // 7, 9, 11, 13
  let six = false;
  const take = (re) => {
    m = re.exec(s);
    if (m) s = s.slice(m[0].length);
    return !!m;
  };
  // The quality.
  if (take(/^(?:m|mi|min|-)\/?(?:maj|ma|M)(7|9|11|13)/)) {
    quality = "minmaj";
    seventh = "major";
    ext = +m[1];
  } else if (take(/^(?:m|mi|min|-)7b5/)) quality = "half";
  else if (take(/^(?:dim|o)7/)) quality = "dim7";
  else if (take(/^(?:dim|o)/)) quality = "dim";
  else if (take(/^(?:aug|\+)/)) quality = "aug";
  else if (take(/^(?:min|mi|m|-)(?!aj|a7|a9)/)) quality = "minor";
  // The sixth, the seventh and what is over it.
  if (!seventh && !six) {
    if (take(/^(?:maj|ma|Maj|MA|M)(7|9|11|13)/)) {
      seventh = "major";
      ext = +m[1];
    } else if (take(/^(?:maj|ma|Maj|M)(?![a-z0-9])/)) {
      // Cmaj, CM: the major triad
    } else if (take(/^6\/?9/)) {
      six = true;
      ext = 9;
    } else if (take(/^6/)) six = true;
    else if (take(/^(7|9|11|13)/)) {
      seventh = "minor";
      ext = +m[1];
    }
  }
  // What follows: sus, add, no, alt, the alterations.
  const degrees = [];
  let sus = 0;
  let alt = false;
  let fifth = 0;
  while (s) {
    if (take(/^sus(2|4)?/)) sus = m[1] === "2" ? 2 : 4;
    else if (take(/^add([#b]?)(2|4|9|11|13)/)) degrees.push({ value: +m[2], alter: sign(m[1]), type: "add" });
    else if (take(/^(?:no|omit)(3|5)/)) degrees.push({ value: +m[1], alter: 0, type: "subtract" });
    else if (take(/^alt/)) alt = true;
    else if (take(/^([#b+-])5/)) fifth = sign(m[1]);
    else if (take(/^([#b+-])(9|11|13)/)) degrees.push({ value: +m[2], alter: sign(m[1]), type: "add" });
    else if (!seventh && !six && take(/^(7|9|11|13)/)) {
      seventh = "minor";
      ext = +m[1];
    } else return null;
  }
  if (alt) return null; // shown as typed (kind "other")
  let kind;
  const ninth = { 7: "seventh", 9: "ninth", 11: "11th", 13: "13th" };
  if (quality === "half") kind = "half-diminished";
  else if (quality === "dim7") kind = "diminished-seventh";
  else if (quality === "dim") kind = "diminished";
  else if (quality === "minmaj") {
    kind = "major-minor";
    for (const v of [9, 11, 13]) if (ext >= v) degrees.unshift({ value: v, alter: 0, type: "add" });
  } else if (quality === "aug") {
    if (seventh === "minor") kind = "augmented-seventh";
    else {
      kind = "augmented";
      if (seventh === "major") degrees.unshift({ value: 7, alter: 1, type: "add" });
    }
  } else if (six) {
    kind = quality === "minor" ? "minor-sixth" : "major-sixth";
    if (ext === 9) degrees.unshift({ value: 9, alter: 0, type: "add" });
  } else if (quality === "minor") kind = seventh === "major" ? "major-minor" : seventh ? `minor-${ninth[ext]}` : "minor";
  else if (seventh === "major") kind = `major-${ninth[ext]}`;
  else if (seventh === "minor") kind = ext === 7 ? "dominant" : `dominant-${ninth[ext]}`;
  else kind = "major";
  // A suspended chord: its kind, the seventh and what is over it added.
  if (sus) {
    if (!["major", "dominant", "dominant-ninth", "dominant-11th", "dominant-13th", "major-seventh", "major-ninth"].includes(kind)) return null;
    const over = seventh ? [7, 9, 11, 13].filter((v) => v <= ext) : [];
    for (const v of over.reverse()) degrees.unshift({ value: v, alter: v === 7 && seventh === "major" ? 1 : 0, type: "add" });
    kind = sus === 2 ? "suspended-second" : "suspended-fourth";
  }
  // The fifth raised (7#5: an augmented seventh) or lowered.
  if (fifth) {
    if (fifth > 0 && kind === "dominant") kind = "augmented-seventh";
    else if (fifth > 0 && kind === "major") kind = "augmented";
    else if (fifth < 0 && kind === "minor-seventh") kind = "half-diminished";
    else if (fifth < 0 && kind === "minor") kind = "diminished";
    else degrees.push({ value: 5, alter: fifth, type: "alter" });
  }
  const TEXT = {
    major: "",
    minor: "m",
    augmented: "+",
    diminished: "dim",
    dominant: "7",
    "major-seventh": "maj7",
    "minor-seventh": "m7",
    "diminished-seventh": "dim7",
    "augmented-seventh": "+7",
    "half-diminished": "m7b5",
    "major-minor": "m(maj7)",
    "major-sixth": "6",
    "minor-sixth": "m6",
    "dominant-ninth": "9",
    "major-ninth": "maj9",
    "minor-ninth": "m9",
    "dominant-11th": "11",
    "major-11th": "maj11",
    "minor-11th": "m11",
    "dominant-13th": "13",
    "major-13th": "maj13",
    "minor-13th": "m13",
    "suspended-second": "sus2",
    "suspended-fourth": "sus4",
  };
  return { kind, text: TEXT[kind] ?? "", degrees };
}

// A note as MusicXML spells it: its letter and its sharps or flats.
function step(n) {
  return { step: LETTERS[n.letter], alter: n.acc };
}

// A word of a chord text as an element of the chart: {harmony (XML)} for a
// chord, {words} for anything else (N.C., x2, Coda).
function chartWord(word) {
  const chord = parseChord(word);
  if (!chord) return { words: word };
  const root = step(chord.root);
  let x = `<harmony print-frame="no"><root><root-step>${root.step}</root-step>${root.alter ? `<root-alter>${root.alter}</root-alter>` : ""}</root>`;
  const k = chordKind(chord.suffix);
  if (k) x += `<kind text="${esc(k.text)}">${k.kind}</kind>`;
  else x += `<kind text="${esc(chord.suffix)}">other</kind>`;
  if (chord.bass) {
    const b = step(chord.bass);
    x += `<bass><bass-step>${b.step}</bass-step>${b.alter ? `<bass-alter>${b.alter}</bass-alter>` : ""}</bass>`;
  }
  if (k) {
    for (const d of k.degrees) {
      x += `<degree><degree-value>${d.value}</degree-value><degree-alter>${d.alter}</degree-alter><degree-type>${d.type}</degree-type></degree>`;
    }
  }
  return { harmony: `${x}</harmony>` };
}

// ----- the chart ----------------------------------------------------------------------------

// A slash of `dur` divisions: its type and dot.
const SLASH_TYPES = { 3: ["16th", false], 6: ["eighth", false], 9: ["eighth", true], 12: ["quarter", false], 18: ["quarter", true], 24: ["half", false], 36: ["half", true] };

function slash(dur) {
  const [type, dot] = SLASH_TYPES[dur];
  return `<note><pitch><step>B</step><octave>4</octave></pitch><duration>${dur}</duration><voice>1</voice><type>${type}</type>${dot ? "<dot/>" : ""}<stem>none</stem><notehead>slash</notehead></note>`;
}

const words = (text, offset = 0) =>
  `<direction placement="above"><direction-type><words>${esc(text)}</words></direction-type>${offset ? `<offset>${offset}</offset>` : ""}</direction>`;

// The tempo mark: the beat (a dotted quarter in 6/8, where the grid counts
// eighths) and how many a minute.
function tempoMark(bpm, meter) {
  if (!(bpm > 0)) return "";
  const r1 = (v) => Math.round(v * 10) / 10;
  if (meter === "6/8") {
    const per = r1(bpm / 3);
    return `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><beat-unit-dot/><per-minute>${per}</per-minute></metronome></direction-type><sound tempo="${r1(bpm / 2)}"/></direction>`;
  }
  return `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${r1(bpm)}</per-minute></metronome></direction-type><sound tempo="${r1(bpm)}"/></direction>`;
}

// The key signature from the chords, in the key of now.
function keySignature(texts, shift) {
  const key = estimateKey(texts);
  if (!key) return { fifths: 0, mode: "major" };
  const tonic = (((key.pc + shift) % 12) + 12) % 12;
  return { fifths: FIFTHS[(tonic + (key.minor ? 3 : 0)) % 12], mode: key.minor ? "minor" : "major" };
}

// The bar's slots as written in the chart: a bar with % alone takes the
// chords of the one before it.
function barSlots(grid, i, before) {
  const slots = grid.chords.get(i);
  if (slots && slots[0] && slots[0].trim() === "%" && !slots.slice(1).some(Boolean)) return before;
  return slots || null;
}

// The chart of a song: {title, grid (src/grid.js), shift (semitones: the key
// of now), barsPerLine, software (who wrote it)} -> the text of a .musicxml
// file. Every bar of the grid, from the first.
export function chartXml({ title = "", grid, shift = 0, barsPerLine = 4, software = "EUTERIA Web", date = new Date() }) {
  const meter = grid.meter || "4/4";
  const per = beatsPerBar(meter);
  const beatType = meter === "6/8" ? 8 : 4;
  const beatDiv = meter === "6/8" ? DIVISIONS / 2 : DIVISIONS; // a beat of the grid, in divisions
  const starts = slotBeats(meter).map((b) => b * beatDiv);
  const barDiv = per * beatDiv;
  const texts = [];
  for (const slots of grid.chords.values()) for (const t of slots) if (t) texts.push(t);
  const view = chordView(texts, shift, { letters: true });
  const key = keySignature(texts, shift);
  const titles = sectionTitles(grid.sections || []);
  const sectionAt = new Map((grid.sections || []).map((s, k) => [s.lo, k]));
  const lines = Math.max(1, Math.round(+barsPerLine) || 4);
  const n = grid.bars.length;
  const measures = [];
  let before = null;
  let inLine = 0;
  for (let i = 0; i < n; i++) {
    const section = sectionAt.get(i);
    const newLine = i > 0 && (section !== undefined || inLine >= lines);
    if (section !== undefined || i === 0) inLine = 0;
    let x = "";
    if (newLine) {
      x += '<print new-system="yes"/>';
      inLine = 0;
    }
    if (i === 0) {
      x += `<attributes><divisions>${DIVISIONS}</divisions><key><fifths>${key.fifths}</fifths><mode>${key.mode}</mode></key><time><beats>${per}</beats><beat-type>${beatType}</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>`;
      x += tempoMark(grid.bpm, meter);
    }
    if (section !== undefined && titles[section]) {
      x += `<direction placement="above"><direction-type><rehearsal enclosure="rectangle">${esc(titles[section])}</rehearsal></direction-type></direction>`;
    }
    const slots = barSlots(grid, i, before);
    before = slots;
    for (let k = 0; k < starts.length; k++) {
      const dur = (k + 1 < starts.length ? starts[k + 1] : barDiv) - starts[k];
      const list = slots && slots[k] ? chordWords(view.show(slots[k])) : [];
      if (!list.length) {
        x += slash(dur);
        continue;
      }
      // Several chords on one beat: one slash, the chords at their offset in it.
      const part = dur / list.length;
      list.forEach((w, j) => {
        const el = chartWord(w);
        const offset = Math.round(j * part);
        if (el.harmony) x += offset ? el.harmony.replace("</harmony>", `<offset>${offset}</offset></harmony>`) : el.harmony;
        else x += words(el.words, offset);
      });
      x += slash(dur);
    }
    // A double bar line before a section, the final one at the end.
    if (i === n - 1) x += '<barline location="right"><bar-style>light-heavy</bar-style></barline>';
    else if (sectionAt.has(i + 1)) x += '<barline location="right"><bar-style>light-light</bar-style></barline>';
    measures.push(`<measure number="${esc(barNumber(grid, i))}">${x}</measure>`);
    inLine++;
  }
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">',
    '<score-partwise version="4.0">',
    `<work><work-title>${esc(title)}</work-title></work>`,
    `<identification><encoding><software>${esc(software)}</software><encoding-date>${day}</encoding-date></encoding></identification>`,
    '<part-list><score-part id="P1"><part-name print-object="no">Chords</part-name><score-instrument id="P1-I1"><instrument-name>Piano</instrument-name></score-instrument><midi-instrument id="P1-I1"><midi-channel>1</midi-channel><midi-program>1</midi-program></midi-instrument></score-part></part-list>',
    `<part id="P1">`,
    ...measures,
    "</part>",
    "</score-partwise>",
    "",
  ].join("\n");
}
