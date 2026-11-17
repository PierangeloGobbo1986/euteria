// Chord names as they are typed in the bars, read and transposed, so that the
// chords follow the key of the song (Key, in semitones): the bars keep them
// in the song's own key, the timeline and the chord field show them in the
// key of now.
//
// A chord is a root (C to B, or DO to SI, typed DO, Do or do), # or b (♯ or ♭;
// after DO to SI, B too), what follows it
// (m, maj7, 7(b9), sus4, ø, 6/9 and so on, left as it is) and a bass after
// "/". A word that is not a chord (N.C., %, x2, Coda, Solo) stays as it is;
// so does the chord's own text when the song is not transposed. The new names
// are spelled from the key of the song, estimated from its chords (Krumhansl's
// profiles) and taken as a major key (a minor one as its relative major): the
// notes of the key, then the others as b2, b3, b5, b6 and b7 (in G: Bb7, not
// A#7), raised instead for diminished and half-diminished chords, which lead
// up (in C: C#°7, D#°7, F#ø7, G#°7), and for a minor chord a tritone above
// the tonic (F#m7 in C). A bass is spelled from its chord (D7/F#). Names that
// would need Cb, Fb, E#, B# or a double sharp or flat are written as the key
// writes its black keys (in Db: D, not Ebb).

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
// The Italian names in capitals, so that the m of a minor chord stands out (REm7).
const ITALIAN = ["DO", "RE", "MI", "FA", "SOL", "LA", "SI"];
const NATURAL = [0, 2, 4, 5, 7, 9, 11];
// How many letters a note is above the tonic, by semitones: 1 b2 2 b3 3 4 b5 5 b6 6 b7 7,
// and raised: 1 #1 2 #2 3 4 #4 5 #5 6 #6 7.
const LOWERED = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6];
const RAISED = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
const note = (letter, acc) => ({ letter, acc, pc: (NATURAL[letter] + acc + 12) % 12 });
const FLATS = [note(0, 0), note(1, -1), note(1, 0), note(2, -1), note(2, 0), note(3, 0), note(4, -1), note(4, 0), note(5, -1), note(5, 0), note(6, -1), note(6, 0)];
const SHARPS = [note(0, 0), note(0, 1), note(1, 0), note(1, 1), note(2, 0), note(3, 0), note(3, 1), note(4, 0), note(4, 1), note(5, 0), note(5, 1), note(6, 0)];
// The tonic of each major key as it is usually written (Db, Gb).
const TONIC = FLATS;
// Major keys whose black keys are written with flats: F, Bb, Eb, Ab, Db, Gb; C too.
const FLAT_SIDE = new Set([0, 5, 10, 3, 8, 1, 6]);

const ROOT_LETTER = /^([A-G])([#b♯♭]?)/;
const ROOT_ITALIAN = /^(do|re|mi|fa|sol|la|si)([#b♯♭]?)/i;
// What may follow the root: qualities, extensions, alterations, brackets.
const SUFFIX = /^(?:maj|Maj|MAJ|ma|Ma|M|min|mi|m|dim|aug|sus|add|alt|omit|no|o|°|ø|Ø|Δ|∆|\^|\+|-|−|–|[0-9]|#|b|♯|♭|\(|\)|,|\.|\/(?=[0-9#b♯♭(]))*$/;

function readNote(m, italian) {
  const letter = italian ? ITALIAN.indexOf(m[1].toUpperCase()) : LETTERS.indexOf(m[1]);
  const a = m[2];
  return note(letter, a === "#" || a === "♯" ? 1 : a === "b" || a === "B" || a === "♭" ? -1 : 0);
}

// A chord name: {root, suffix, bass, italian, glyphs} or null. Italian names
// first, so that DO7 is C7 (and Faug, not a FA chord, F augmented).
export function parseChord(text) {
  for (const italian of [true, false]) {
    const re = italian ? ROOT_ITALIAN : ROOT_LETTER;
    const m = re.exec(text);
    if (!m) continue;
    let rest = text.slice(m[0].length);
    let bass = null;
    const slash = rest.lastIndexOf("/");
    if (slash >= 0) {
      const b = re.exec(rest.slice(slash + 1));
      if (b && b[0].length === rest.length - slash - 1) {
        bass = readNote(b, italian);
        rest = rest.slice(0, slash);
      }
    }
    if (!SUFFIX.test(rest)) continue;
    // Solo, Mio: Italian names do not take "o" for diminished.
    if (italian && /^o/.test(rest)) continue;
    return { root: readNote(m, italian), suffix: rest, bass, italian, glyphs: /[♯♭]/.test(text) };
  }
  return null;
}

// What a chord's suffix says of it.
function quality(s) {
  const half = /ø|Ø|^(?:m|mi|min|-|−|–)7?\(?b5/.test(s);
  const dim = !half && /^(?:dim|o|°)/.test(s);
  const minor = !half && !dim && /^(?:m(?!a)|-|−|–)/.test(s);
  const aug = /^(?:aug|\+)/.test(s) || /#5|\+5/.test(s);
  const dim7 = dim && /^(?:dim|o|°)7/.test(s);
  const six = !dim7 && /6/.test(s);
  return { half, dim, minor, aug, dim7, six };
}

// The notes of a chord, for the key: [interval, weight] (the root counts double).
function tones(s) {
  const q = quality(s);
  const third = /sus2/.test(s) ? 2 : /sus/.test(s) ? 5 : q.dim || q.half || q.minor ? 3 : 4;
  const fifth = q.dim || q.half ? 6 : q.aug ? 8 : 7;
  const out = [[0, 2], [third, 1], [fifth, 1]];
  if (/maj7|ma7|Maj7|M7|Δ|∆|\^/.test(s)) out.push([11, 1]);
  else if (q.dim7) out.push([9, 1]);
  else if (/7/.test(s) || q.half) out.push([10, 1]);
  else if (q.six) out.push([9, 1]);
  else if (/9|11|13/.test(s) && !/add/.test(s)) out.push([10, 1]);
  return out;
}

const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function correlation(a, b, shift) {
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < 12; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= 12;
  mb /= 12;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < 12; i++) {
    const x = a[(i + shift) % 12] - ma;
    const y = b[i] - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

// Each word of a chord text read as a chord (in brackets too), or null.
function chordsOf(text) {
  const out = [];
  for (const word of String(text || "").split(/\s+/)) {
    const c = parseWord(word);
    if (c) out.push(c.chord);
  }
  return out;
}

// A word: a chord, maybe in brackets, as {pre, chord, post}, or null.
function parseWord(word) {
  let pre = "";
  let post = "";
  let core = word;
  for (let k = 0; k < 4 && core; k++) {
    const chord = parseChord(core);
    if (chord) return { pre, chord, post };
    if (/^[([{]/.test(core)) {
      pre += core[0];
      core = core.slice(1);
    } else if (/[)\]}]$/.test(core)) {
      post = core.slice(-1) + post;
      core = core.slice(0, -1);
    } else break;
  }
  return null;
}

// The key of a song from the texts of its chords: {pc, minor}, or null when
// none of them is a chord.
export function estimateKey(texts) {
  const chords = [];
  for (const text of texts) {
    for (const c of chordsOf(text)) chords.push({ pc: c.root.pc, suffix: c.suffix, bass: c.bass ? c.bass.pc : null, weight: 1 });
  }
  return keyFrom(chords);
}

// The key from chords given as {pc (root), suffix, bass (pc or null), weight}.
export function keyFrom(chords) {
  const hist = new Float64Array(12);
  let n = 0;
  for (const c of chords) {
    if (!(c.weight > 0)) continue;
    for (const [iv, w] of tones(c.suffix)) hist[(c.pc + iv) % 12] += w * c.weight;
    if (c.bass !== null && c.bass !== undefined) hist[c.bass] += 0.5 * c.weight;
    n++;
  }
  if (!n) return null;
  let best = { pc: 0, minor: false, r: -Infinity };
  for (let t = 0; t < 12; t++) {
    const rM = correlation(hist, MAJOR, t);
    if (rM > best.r) best = { pc: t, minor: false, r: rM };
    const rm = correlation(hist, MINOR, t);
    if (rm > best.r) best = { pc: t, minor: true, r: rm };
  }
  return { pc: best.pc, minor: best.minor };
}

// How the notes are written in the key with tonic pc: a minor key as its
// relative major.
function keyAt(pc, minor) {
  const p = (((pc + (minor ? 3 : 0)) % 12) + 12) % 12;
  return { tonic: TONIC[p], flats: FLAT_SIDE.has(p) };
}

// The pitch class pc written with `letter`, unless that needs Cb, Fb, E#, B#
// or a double sharp or flat: then as the key writes its black keys.
function withLetter(pc, letter, key) {
  let acc = (pc - NATURAL[letter] + 12) % 12;
  if (acc > 6) acc -= 12;
  const odd = Math.abs(acc) > 1 || (acc === -1 && (letter === 0 || letter === 3)) || (acc === 1 && (letter === 2 || letter === 6));
  return odd ? (key.flats ? FLATS : SHARPS)[pc] : note(letter, acc);
}

// A chord's root in a key: by its degree, lowered (b3, b7…) or raised (#4,
// #5…) as its quality says.
function spellRoot(pc, q, key) {
  const semis = (pc - key.tonic.pc + 12) % 12;
  const raised = q.dim || q.half || (q.minor && semis === 6);
  return withLetter(pc, (key.tonic.letter + (raised ? RAISED : LOWERED)[semis]) % 7, key);
}

// A bass under a chord: as a note of the chord (its third, fifth, seventh…)
// when it is one, else by its degree in the key.
function spellBass(pc, root, q, key) {
  const iv = (pc - root.pc + 12) % 12;
  const steps = { 2: 1, 3: 2, 4: 2, 5: 3, 7: 4, 10: 6, 11: 6 }[iv] ?? (iv === 6 && (q.dim || q.half) ? 4 : iv === 8 && q.aug ? 4 : iv === 9 && (q.six || q.dim7) ? (q.six ? 5 : 6) : null);
  if (steps === null) return spellRoot(pc, {}, key);
  return withLetter(pc, (root.letter + steps) % 7, key);
}

function name(n, italian, glyphs) {
  const acc = n.acc === 1 ? (glyphs ? "♯" : "#") : n.acc === -1 ? (glyphs ? "♭" : "b") : "";
  return (italian ? ITALIAN : LETTERS)[n.letter] + acc;
}

// Every chord of `text` moved by `semitones` and written in `key` (the key
// they land in), and in the Italian names (DO RE MI…) or in letters (C D E…)
// if `italian` says so (true, false; null: as they were written); the other
// words as they are.
function transposeText(text, semitones, key, italian = null) {
  if (!text || (!semitones && italian === null)) return text || "";
  return String(text)
    .split(" ")
    .map((word) => {
      const w = parseWord(word);
      if (!w) return word;
      const { chord } = w;
      const it = italian === null ? chord.italian : italian;
      const q = quality(chord.suffix);
      const root = semitones ? spellRoot((chord.root.pc + semitones + 1200) % 12, q, key) : chord.root;
      let out = name(root, it, chord.glyphs) + chord.suffix;
      if (chord.bass) out += "/" + name(semitones ? spellBass((chord.bass.pc + semitones + 1200) % 12, root, q, key) : chord.bass, it, chord.glyphs);
      return w.pre + out + w.post;
    })
    .join(" ");
}

// A chord written in a key ({pc, minor}; null: C major): its root (C to B)
// spelled for the key and its quality, then `suffix` as it is.
export function nameChord(pc, suffix, key) {
  const k = keyAt(key ? key.pc : 0, key ? key.minor : false);
  return name(spellRoot(((pc % 12) + 12) % 12, quality(suffix), k), false, false) + suffix;
}

// How the chords are shown: in letters (C D E…) or in the Italian names (DO
// RE MI…), whatever way they were written. A choice of the page, kept by it.
let notation = "letters";
export const getNotation = () => notation;
export function setNotation(n) {
  notation = n === "italian" ? "italian" : "letters";
}

// The chords of a song (an iterable of texts) seen with the song moved by
// `semitones`: show(text) is how a chord of the song looks in the key of now
// and in the notation chosen (letters: in letters whatever was chosen),
// store(text) brings a chord typed in the key of now back to the song's own
// key (as it was typed). The views are made again when the notation changes.
export function chordView(texts, semitones = 0, { letters = false } = {}) {
  const shift = Math.round(+semitones || 0);
  const italian = !letters && notation === "italian";
  const found = shift ? estimateKey(texts) : null;
  const home = found || { pc: 0, minor: false };
  const now = keyAt(home.pc + shift, home.minor);
  const own = keyAt(home.pc, home.minor);
  const cache = new Map();
  return {
    shift,
    key: found,
    show(text) {
      if (!text) return "";
      let out = cache.get(text);
      if (out === undefined) {
        out = transposeText(text, shift, now, italian);
        cache.set(text, out);
      }
      return out;
    },
    store(text) {
      return shift && text ? transposeText(text, -shift, own) : text || "";
    },
  };
}
