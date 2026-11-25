// What an audio file says of itself (3.0): its title, artist, album and year,
// from its tags, so that the details of a song opened from it (Song, in File
// export and sharing) fill in by themselves. ID3 (MP3 and AAC, and the ID3
// chunk of WAV and AIFF; the old ID3v1 at the end of an MP3 when nothing else
// gives them), the iTunes atoms of MP4 and M4A, the Vorbis comments of FLAC,
// Ogg Vorbis and Opus, the INFO list of WAV, the NAME and AUTH chunks of
// AIFF. Only the tags are read: the start of the file, then its atoms or
// chunks one by one, the audio between them skipped.
//
// readTags(file): a File (a Blob) or the bytes of one (a Uint8Array). Resolves
// with {title, artist, album, year} (each a string or null; the artist of the
// album when the track has none, the year as four digits), or null when the
// file says none of them, or cannot be read.

const MAX_READ = 16 * 1024 * 1024; // a tag (pictures and all), or the atoms of an MP4, read at most
const OGG_READ = 2 * 1024 * 1024; // the start of an Ogg file, where its comments are

const latin1 = new TextDecoder("latin1");
const utf8 = new TextDecoder("utf-8");
const strictUtf8 = new TextDecoder("utf-8", { fatal: true });

const ascii = (b, at, n) => String.fromCharCode(...b.subarray(at, at + n));
const be32 = (b, at) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;
const be24 = (b, at) => (b[at] << 16) | (b[at + 1] << 8) | b[at + 2];
const le32 = (b, at) => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;
const synchsafe = (b, at) => ((b[at] & 0x7f) << 21) | ((b[at + 1] & 0x7f) << 14) | ((b[at + 2] & 0x7f) << 7) | (b[at + 3] & 0x7f);

// What each format calls them.
const ID3_FRAMES = {
  TIT2: "title",
  TT2: "title",
  TPE1: "artist",
  TP1: "artist",
  TPE2: "albumArtist",
  TP2: "albumArtist",
  TALB: "album",
  TAL: "album",
  TYER: "year",
  TYE: "year",
  TDRC: "year",
  TORY: "firstYear",
  TOR: "firstYear",
  TDOR: "firstYear",
};
const MP4_ITEMS = { "©nam": "title", "©ART": "artist", aART: "albumArtist", "©alb": "album", "©day": "year" };
const COMMENTS = { TITLE: "title", ARTIST: "artist", ALBUMARTIST: "albumArtist", "ALBUM ARTIST": "albumArtist", ALBUM: "album", DATE: "year", YEAR: "year", ORIGINALDATE: "firstYear", ORIGINALYEAR: "firstYear" };
const INFO = { INAM: "title", IART: "artist", IPRD: "album", ICRD: "year" };

export async function readTags(file) {
  try {
    const r = source(file);
    const head = await r.read(0, 12);
    const tags = {};
    const id = ascii(head, 0, 4);
    if (id.startsWith("ID3")) await id3(r, 0, tags);
    else if (ascii(head, 4, 4) === "ftyp") await mp4(r, tags);
    else if (id === "fLaC") await flac(r, tags);
    else if (id === "OggS") await ogg(r, tags);
    else if (id === "RIFF" && ascii(head, 8, 4) === "WAVE") await chunks(r, false, tags);
    else if (id === "FORM" && /^AIF[FC]$/.test(ascii(head, 8, 4))) await chunks(r, true, tags);
    if (!tags.title && !tags.artist && !tags.album) await id3v1(r, tags);
    return tidy(tags);
  } catch (_) {
    return null;
  }
}

// The bytes of a File, or of a Uint8Array, a piece at a time.
function source(file) {
  if (file instanceof Uint8Array) return { size: file.length, read: async (at, n) => file.subarray(Math.max(0, at), Math.min(file.length, at + n)) };
  return { size: file.size, read: async (at, n) => new Uint8Array(await file.slice(Math.max(0, at), Math.min(file.size, at + n)).arrayBuffer()) };
}

// A value found, unless one was found already (the first one stays).
function put(tags, key, value) {
  if (!tags[key] && typeof value === "string" && value.trim()) tags[key] = value;
}

// One line of text, without control characters; null if empty.
function clean(value) {
  if (typeof value !== "string") return null;
  let s = "";
  for (const ch of value) s += ch.charCodeAt(0) < 32 ? " " : ch;
  return s.replace(/\s+/g, " ").trim() || null;
}

// The year of a date (1958, 1958-03-09, 1958-03-09T08:00:00Z).
function yearOf(value) {
  const m = /(?:^|\D)([12]\d{3})(?:\D|$)/.exec(value || "");
  return m ? m[1] : null;
}

function tidy(t) {
  const out = { title: clean(t.title), artist: clean(t.artist) || clean(t.albumArtist), album: clean(t.album), year: yearOf(t.year) || yearOf(t.firstYear) };
  return out.title || out.artist || out.album || out.year ? out : null;
}

// Bytes as text: UTF-8, else Latin-1 (old taggers).
function decode(b) {
  try {
    return strictUtf8.decode(b);
  } catch (_) {
    return latin1.decode(b);
  }
}

// Strings one after the other, each ended by a zero byte (two for UTF-16).
function strings(b, wide) {
  const out = [];
  let start = 0;
  const step = wide ? 2 : 1;
  for (let i = 0; i + step <= b.length; i += step) {
    if (b[i] === 0 && (!wide || b[i + 1] === 0)) {
      out.push(b.subarray(start, i));
      start = i + step;
    }
  }
  if (start < b.length) out.push(b.subarray(start));
  return out;
}

// ----- ID3 -------------------------------------------------------------------------------

// The text of an ID3 text frame: its encoding, then its strings (several in
// 2.4, joined).
function id3Text(d) {
  if (!d.length) return "";
  const enc = d[0];
  const b = d.subarray(1);
  const wide = enc === 1 || enc === 2;
  const parts = strings(b, wide).map((s) => {
    if (!wide) return enc === 3 ? utf8.decode(s) : latin1.decode(s);
    // 1: UTF-16 with its byte order mark (little-endian without one, as most
    // taggers write); 2: big-endian.
    let le = enc === 1;
    if (s[0] === 0xff && s[1] === 0xfe) [le, s] = [true, s.subarray(2)];
    else if (s[0] === 0xfe && s[1] === 0xff) [le, s] = [false, s.subarray(2)];
    return new TextDecoder(le ? "utf-16le" : "utf-16be").decode(s);
  });
  return parts.filter((s) => s.trim()).join(", ");
}

// Unsynchronisation undone: FF 00 back to FF.
function unsync(b) {
  const out = new Uint8Array(b.length);
  let n = 0;
  for (let i = 0; i < b.length; i++) {
    out[n++] = b[i];
    if (b[i] === 0xff && b[i + 1] === 0) i++;
  }
  return out.subarray(0, n);
}

// An ID3v2 tag (2.2, 2.3, 2.4) at `at`.
async function id3(r, at, tags) {
  const h = await r.read(at, 10);
  if (h.length < 10 || ascii(h, 0, 3) !== "ID3") return;
  const major = h[3];
  if (major < 2 || major > 4) return;
  const flags = h[5];
  let b = await r.read(at + 10, Math.min(synchsafe(h, 6), MAX_READ));
  if (major < 4 && flags & 0x80) b = unsync(b); // the whole tag (2.2, 2.3)
  let p = 0;
  if (flags & 0x40) p = major === 3 ? 4 + be32(b, 0) : major === 4 ? synchsafe(b, 0) : 0; // its extended header
  const idLength = major === 2 ? 3 : 4;
  const headLength = major === 2 ? 6 : 10;
  while (p + headLength <= b.length) {
    const id = ascii(b, p, idLength);
    if (!/^[A-Z0-9]+$/.test(id)) break; // the padding
    const length = major === 2 ? be24(b, p + 3) : major === 4 ? synchsafe(b, p + 4) : be32(b, p + 4);
    const format = major === 2 ? 0 : b[p + 9];
    let data = b.subarray(p + headLength, p + headLength + length);
    p += headLength + length;
    const key = ID3_FRAMES[id];
    if (!key) continue;
    // Compressed or encrypted: left alone.
    if ((major === 3 && format & 0xc0) || (major === 4 && format & 0x0c)) continue;
    if ((major === 3 && format & 0x20) || (major === 4 && format & 0x40)) data = data.subarray(1); // its group
    if (major === 4 && format & 0x01) data = data.subarray(4); // its data length
    if (major === 4 && format & 0x02) data = unsync(data);
    put(tags, key, id3Text(data));
  }
}

// The old tag of 128 bytes at the end of an MP3.
async function id3v1(r, tags) {
  if (r.size < 128) return;
  const b = await r.read(r.size - 128, 128);
  if (ascii(b, 0, 3) !== "TAG") return;
  const field = (at, n) => latin1.decode(strings(b.subarray(at, at + n), false)[0] || new Uint8Array(0));
  put(tags, "title", field(3, 30));
  put(tags, "artist", field(33, 30));
  put(tags, "album", field(63, 30));
  put(tags, "year", field(93, 4));
}

// ----- MP4, M4A --------------------------------------------------------------------------

// The atoms inside b from..to: {type, from (their content), to}.
function* atoms(b, from, to) {
  let p = from;
  while (p + 8 <= to) {
    let size = be32(b, p);
    let head = 8;
    if (size === 1) {
      size = be32(b, p + 8) * 4294967296 + be32(b, p + 12);
      head = 16;
    } else if (size === 0) size = to - p;
    if (size < head || p + size > to) return;
    yield { type: ascii(b, p + 4, 4), from: p + head, to: p + size };
    p += size;
  }
}

const atom = (b, from, to, type) => {
  for (const a of atoms(b, from, to)) if (a.type === type) return a;
  return null;
};

// moov > udta > meta > ilst: the items of iTunes, each with its data atom
// (its kind, its locale, then the text). moov may be at the end of the file:
// the top atoms are read one by one.
async function mp4(r, tags) {
  let at = 0;
  for (let n = 0; n < 1024 && at + 8 <= r.size; n++) {
    const h = await r.read(at, 16);
    let size = be32(h, 0);
    let head = 8;
    if (size === 1) {
      size = be32(h, 8) * 4294967296 + be32(h, 12);
      head = 16;
    } else if (size === 0) size = r.size - at;
    if (size < head) return;
    if (ascii(h, 4, 4) === "moov") {
      if (size - head > 4 * MAX_READ) return;
      const moov = await r.read(at + head, size - head);
      const udta = atom(moov, 0, moov.length, "udta");
      const meta = udta && atom(moov, udta.from, udta.to, "meta");
      if (!meta) return;
      // A full atom (version and flags, zero) in iTunes files; not in QuickTime's.
      const from = be32(moov, meta.from) === 0 ? meta.from + 4 : meta.from;
      const ilst = atom(moov, from, meta.to, "ilst");
      if (!ilst) return;
      for (const item of atoms(moov, ilst.from, ilst.to)) {
        const key = MP4_ITEMS[item.type];
        const data = key && atom(moov, item.from, item.to, "data");
        if (data && data.to - data.from > 8) put(tags, key, utf8.decode(moov.subarray(data.from + 8, data.to)));
      }
      return;
    }
    at += size;
  }
}

// ----- FLAC, Ogg ---------------------------------------------------------------------------

// A Vorbis comment block from `at`: its vendor, then KEY=value lines.
function vorbis(b, at, tags) {
  let p = at;
  p += 4 + le32(b, p);
  const n = le32(b, p);
  p += 4;
  for (let i = 0; i < n && p + 4 <= b.length; i++) {
    const length = le32(b, p);
    p += 4;
    const line = utf8.decode(b.subarray(p, p + length));
    p += length;
    const eq = line.indexOf("=");
    const key = eq > 0 ? COMMENTS[line.slice(0, eq).toUpperCase()] : null;
    if (key) put(tags, key, line.slice(eq + 1));
  }
}

// The metadata blocks of a FLAC file, to its Vorbis comments (block 4).
async function flac(r, tags) {
  let at = 4;
  for (let n = 0; n < 128; n++) {
    const h = await r.read(at, 4);
    if (h.length < 4) return;
    const length = be24(h, 1);
    if ((h[0] & 0x7f) === 4) {
      vorbis(await r.read(at + 4, Math.min(length, MAX_READ)), 0, tags);
      return;
    }
    if (h[0] & 0x80) return; // the last block
    at += 4 + length;
  }
}

// The second packet of the first stream of an Ogg file (put together from its
// pages): the comments of Vorbis ("\x03vorbis") or of Opus ("OpusTags").
async function ogg(r, tags) {
  const b = await r.read(0, Math.min(r.size, OGG_READ));
  const packets = [];
  let parts = [];
  let serial = null;
  let p = 0;
  while (p + 27 <= b.length && packets.length < 2) {
    if (ascii(b, p, 4) !== "OggS") return;
    const segments = b[p + 26];
    const s = le32(b, p + 14);
    if (serial === null) serial = s;
    let q = p + 27 + segments;
    for (let i = 0; i < segments && packets.length < 2; i++) {
      const length = b[p + 27 + i];
      if (s === serial) {
        parts.push(b.subarray(q, q + length));
        if (length < 255) {
          const packet = new Uint8Array(parts.reduce((sum, x) => sum + x.length, 0));
          let k = 0;
          for (const x of parts) {
            packet.set(x, k);
            k += x.length;
          }
          packets.push(packet);
          parts = [];
        }
      }
      q += length;
    }
    p = q;
  }
  const c = packets[1];
  if (!c) return;
  if (c[0] === 3 && ascii(c, 1, 6) === "vorbis") vorbis(c, 7, tags);
  else if (ascii(c, 0, 8) === "OpusTags") vorbis(c, 8, tags);
}

// ----- WAV, AIFF ---------------------------------------------------------------------------

// The chunks of a WAV file (sizes little-endian) or an AIFF one (big-endian),
// one by one, the audio skipped: the INFO list, an ID3 chunk, the NAME and
// AUTH of AIFF.
async function chunks(r, big, tags) {
  let at = 12;
  for (let n = 0; n < 256 && at + 8 <= r.size; n++) {
    const h = await r.read(at, 12);
    const id = ascii(h, 0, 4);
    const length = big ? be32(h, 4) : le32(h, 4);
    const from = at + 8;
    if (id === "LIST" && ascii(h, 8, 4) === "INFO") info(await r.read(from + 4, Math.min(Math.max(0, length - 4), MAX_READ)), tags);
    else if (id === "id3 " || id === "ID3 ") await id3(r, from, tags);
    else if (big && (id === "NAME" || id === "AUTH")) put(tags, id === "NAME" ? "title" : "artist", decode(strings(await r.read(from, Math.min(length, 4096)), false)[0] || new Uint8Array(0)));
    at = from + length + (length & 1);
  }
}

function info(b, tags) {
  for (let p = 0; p + 8 <= b.length; ) {
    const id = ascii(b, p, 4);
    const length = le32(b, p + 4);
    const key = INFO[id];
    if (key) put(tags, key, decode(strings(b.subarray(p + 8, p + 8 + length), false)[0] || new Uint8Array(0)));
    p += 8 + length + (length & 1);
  }
}
