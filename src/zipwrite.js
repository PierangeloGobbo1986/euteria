// Writing EUTERIA projects. A project is a zip whose members are stored as
// they are (no compression), as EUTERIA (Python) writes them. Saving the
// edits of a song rewrites its manifest.json only; the audio is never read
// into memory:
//
// - in place (the app's library, or a file Chrome and Edge may write to):
//   the new manifest and a new central directory replace the end of the
//   file, a few kilobytes: the old manifest too if it is the last member (a
//   project saved here before), else the old central directory only, and
//   the old manifest stays inside the file, unlisted, as zip readers ignore
//   it;
// - as a new file (a download, a share): a Blob made of slices of the old
//   file, assembled by the browser only when it is written. Share project
//   puts it together during the tap (Safari opens the share sheet only
//   then): composeWithManifest() and composeProject() are synchronous, with
//   what they need read beforehand (zipLayout(), crc32Blob()).

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_END = 0x06054b50;
const VERSION = 20; // 2.0: what stored members need
const MANIFEST = "manifest.json";

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

// CRC-32 of `bytes`, continuing from `crc` (0 to start).
export function crc32(bytes, crc = 0) {
  let c = ~crc >>> 0;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

// CRC-32 of a Blob, read `step` bytes at a time.
export async function crc32Blob(blob, step = 8 * 1024 * 1024) {
  let crc = 0;
  for (let at = 0; at < blob.size; at += step) crc = crc32(new Uint8Array(await blob.slice(at, at + step).arrayBuffer()), crc);
  return crc;
}

function dosTime(d = new Date()) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: (Math.max(0, d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

const encoder = new TextEncoder();

function localHeader({ name, method = 0, crc, compressedSize, size }, when) {
  const n = encoder.encode(name);
  const b = new Uint8Array(30 + n.length);
  const v = new DataView(b.buffer);
  v.setUint32(0, SIG_LOCAL, true);
  v.setUint16(4, VERSION, true);
  v.setUint16(6, 0, true);
  v.setUint16(8, method, true);
  v.setUint16(10, when.time, true);
  v.setUint16(12, when.date, true);
  v.setUint32(14, crc, true);
  v.setUint32(18, compressedSize, true);
  v.setUint32(22, size, true);
  v.setUint16(26, n.length, true);
  v.setUint16(28, 0, true);
  b.set(n, 30);
  return b;
}

function centralRecord({ name, method = 0, crc, compressedSize, size }, offset, when) {
  const n = encoder.encode(name);
  const b = new Uint8Array(46 + n.length);
  const v = new DataView(b.buffer);
  v.setUint32(0, SIG_CENTRAL, true);
  v.setUint16(4, VERSION, true);
  v.setUint16(6, VERSION, true);
  v.setUint16(8, 0, true);
  v.setUint16(10, method, true);
  v.setUint16(12, when.time, true);
  v.setUint16(14, when.date, true);
  v.setUint32(16, crc, true);
  v.setUint32(20, compressedSize, true);
  v.setUint32(24, size, true);
  v.setUint16(28, n.length, true);
  v.setUint32(42, offset, true);
  b.set(n, 46);
  return b;
}

function endRecord(count, size, offset) {
  const b = new Uint8Array(22);
  const v = new DataView(b.buffer);
  v.setUint32(0, SIG_END, true);
  v.setUint16(8, count, true);
  v.setUint16(10, count, true);
  v.setUint32(12, size, true);
  v.setUint32(16, offset, true);
  return b;
}

function join(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const manifestEntry = (bytes) => ({ name: MANIFEST, crc: crc32(bytes), compressedSize: bytes.length, size: bytes.length });

// In place: {at, bytes} to write at offset `at` of the project, after
// truncating it there (`zip` is openZip() of the file as it is now).
export async function manifestPatch(zip, manifestBytes) {
  const dir = zip.directory;
  const when = dosTime();
  const others = dir.entries.filter((e) => e.name !== MANIFEST);
  let at = dir.offset;
  const old = dir.entries.find((e) => e.name === MANIFEST);
  if (old && others.every((e) => e.localOffset < old.localOffset)) {
    const [, end] = await zip.dataRange(old);
    if (end === dir.offset) at = old.localOffset;
  }
  const entry = manifestEntry(manifestBytes);
  const local = localHeader(entry, when);
  const central = join([...others.map((e) => e.record), centralRecord(entry, at, when)]);
  const cdOffset = at + local.length + manifestBytes.length;
  return { at, bytes: join([local, manifestBytes, central, endRecord(others.length + 1, central.length, cdOffset)]) };
}

// Where each member's data lies in the file (`zip` is openZip() of it), in
// the file's order: what composeWithManifest() needs.
export async function zipLayout(zip) {
  const layout = [];
  for (const entry of [...zip.directory.entries].sort((a, b) => a.localOffset - b.localOffset)) {
    const [start, end] = await zip.dataRange(entry);
    layout.push({ entry, start, end });
  }
  return layout;
}

// A new file: the members of `file` (where zipLayout() found them) with the
// new manifest, as a Blob of slices of `file`.
export function composeWithManifest(file, layout, manifestBytes) {
  const when = dosTime();
  const parts = [];
  const records = [];
  let offset = 0;
  for (const { entry, start, end } of layout) {
    if (entry.name === MANIFEST) continue;
    const head = localHeader(entry, when);
    parts.push(head, file.slice(start, end));
    records.push(centralRecord(entry, offset, when));
    offset += head.length + (end - start);
  }
  const entry = manifestEntry(manifestBytes);
  const head = localHeader(entry, when);
  parts.push(head, manifestBytes);
  records.push(centralRecord(entry, offset, when));
  offset += head.length + manifestBytes.length;
  const central = join(records);
  parts.push(central, endRecord(records.length, central.length, offset));
  return new Blob(parts, { type: "application/zip" });
}

export async function withManifest(file, zip, manifestBytes) {
  return composeWithManifest(file, await zipLayout(zip), manifestBytes);
}

// A new project from members [{name, data: Blob | Uint8Array, crc}]
// (stored). A Blob member needs its CRC-32 given (crc32Blob()).
export function composeProject(members) {
  const when = dosTime();
  const parts = [];
  const records = [];
  let offset = 0;
  for (const m of members) {
    const data = m.data;
    const bytes = data instanceof Uint8Array;
    const size = bytes ? data.length : data.size;
    const crc = m.crc != null ? m.crc : bytes ? crc32(data) : null;
    if (crc === null) throw new Error(`The CRC-32 of ${m.name} is not known.`);
    const entry = { name: m.name, crc, compressedSize: size, size };
    const head = localHeader(entry, when);
    parts.push(head, data);
    records.push(centralRecord(entry, offset, when));
    offset += head.length + size;
  }
  const central = join(records);
  parts.push(central, endRecord(records.length, central.length, offset));
  return new Blob(parts, { type: "application/zip" });
}

// The same, the CRC-32 of the Blob members computed first.
export async function buildProject(members) {
  const ready = [];
  for (const m of members) ready.push(m.crc != null || m.data instanceof Uint8Array ? m : { ...m, crc: await crc32Blob(m.data) });
  return composeProject(ready);
}
