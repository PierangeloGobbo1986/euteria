// Minimal ZIP reader for EUTERIA project files (.euteria, .musicproj).
//
// It reads the central directory and returns each member as a slice of the
// File, so a large project is never loaded into memory all at once. Members
// stored as they are and members compressed with deflate are supported
// (DecompressionStream "deflate-raw"); ZIP64 is not needed for projects.

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

export async function openZip(blob) {
  const size = blob.size;
  const tailLength = Math.min(size, 22 + 65535);
  const tail = new DataView(await blob.slice(size - tailLength).arrayBuffer());
  let eocd = -1;
  for (let i = tailLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("This file is not a project (it is not a zip archive).");
  const count = tail.getUint16(eocd + 10, true);
  const directorySize = tail.getUint32(eocd + 12, true);
  const directoryOffset = tail.getUint32(eocd + 16, true);
  if (count === 0xffff || directoryOffset === 0xffffffff) throw new Error("ZIP64 archives are not supported.");

  const directory = new DataView(await blob.slice(directoryOffset, directoryOffset + directorySize).arrayBuffer());
  const names = new TextDecoder();
  const entries = new Map();
  let p = 0;
  for (let n = 0; n < count; n++) {
    if (directory.getUint32(p, true) !== CENTRAL) throw new Error("The project file is damaged (zip directory).");
    const nameLength = directory.getUint16(p + 28, true);
    const extraLength = directory.getUint16(p + 30, true);
    const commentLength = directory.getUint16(p + 32, true);
    const name = names.decode(new Uint8Array(directory.buffer, directory.byteOffset + p + 46, nameLength));
    entries.set(name, {
      name,
      method: directory.getUint16(p + 10, true),
      compressedSize: directory.getUint32(p + 20, true),
      size: directory.getUint32(p + 24, true),
      localOffset: directory.getUint32(p + 42, true),
    });
    p += 46 + nameLength + extraLength + commentLength;
  }

  async function dataRange(entry) {
    const head = new DataView(await blob.slice(entry.localOffset, entry.localOffset + 30).arrayBuffer());
    if (head.getUint32(0, true) !== LOCAL) throw new Error(`The project file is damaged (${entry.name}).`);
    const start = entry.localOffset + 30 + head.getUint16(26, true) + head.getUint16(28, true);
    return [start, start + entry.compressedSize];
  }

  return {
    names: () => [...entries.keys()],
    has: (name) => entries.has(name),
    size: (name) => (entries.has(name) ? entries.get(name).size : 0),
    // A fresh Uint8Array (its own ArrayBuffer) with the member's content.
    async bytes(name) {
      const entry = entries.get(name);
      if (!entry) throw new Error(`The project has no ${name}.`);
      const [a, b] = await dataRange(entry);
      const raw = blob.slice(a, b);
      if (entry.method === 0) return new Uint8Array(await raw.arrayBuffer());
      if (entry.method === 8) {
        const stream = raw.stream().pipeThrough(new DecompressionStream("deflate-raw"));
        return new Uint8Array(await new Response(stream).arrayBuffer());
      }
      throw new Error(`Unsupported compression in ${name}.`);
    },
    async text(name) {
      return new TextDecoder().decode(await this.bytes(name));
    },
  };
}
