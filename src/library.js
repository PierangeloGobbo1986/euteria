// The library of the phone layout: songs copied into the app's private
// storage (the origin private file system, invisible to other apps), listed
// with their details in localStorage. Each song stays exactly as it was
// imported (a .euteria project or an audio file); the library shows the space
// it takes and deletes songs one by one or all together.

import { openZip } from "./zip.js";

const INDEX_KEY = "euteria.library";
const DIR = "library";
const CHUNK = 4 * 1024 * 1024;
const ORPHAN_AGE_MS = 60 * 60 * 1000; // unlisted files older than this are leftovers of a copy that was interrupted

export const AUDIO_EXTENSIONS = ["mp3", "m4a", "aac", "wav", "wave", "aif", "aiff", "aifc", "flac", "ogg", "oga", "opus", "caf", "mp4", "m4b", "webm", "weba"];

const extensionOf = (name) => ((/\.([A-Za-z0-9]{1,8})$/.exec(name || "") || [])[1] || "").toLowerCase();

// What a file is: "project" (an EUTERIA project, .euteria or .musicproj) or
// "audio". Anything else is refused before it takes any space.
export async function inspectFile(file) {
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  const zip = head[0] === 0x50 && head[1] === 0x4b; // "PK"
  if (zip) {
    let archive;
    try {
      archive = await openZip(file);
    } catch (_) {
      throw new Error(`${file.name} is a damaged zip file.`);
    }
    if (!archive.has("manifest.json")) throw new Error(`${file.name} is not an EUTERIA project (it has no manifest.json).`);
    return "project";
  }
  const ext = extensionOf(file.name);
  if (AUDIO_EXTENSIONS.includes(ext) || /^audio\//.test(file.type || "")) return "audio";
  throw new Error(`${file.name} is neither an EUTERIA project (.euteria) nor an audio file.`);
}

function newId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function runWorker(message, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./library-worker.js", import.meta.url));
    worker.onmessage = (event) => {
      const m = event.data;
      if (m.type === "progress") {
        onProgress(m.done, m.total);
        return;
      }
      worker.terminate();
      if (m.type === "done") resolve(m);
      else reject(Object.assign(new Error(m.message), { name: m.name }));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "The library could not be written."));
    };
    worker.postMessage({ id: 1, ...message });
  });
}

const copyWithWorker = (file, name, onProgress) => runWorker({ op: "copy", file, name }, onProgress);

// For browsers without synchronous access handles in workers.
async function copyOnPage(dir, file, name, onProgress) {
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  try {
    let at = 0;
    while (at < file.size) {
      const chunk = file.slice(at, at + CHUNK);
      await writable.write(chunk);
      at += chunk.size;
      onProgress(at, file.size);
    }
    await writable.close();
  } catch (error) {
    try {
      await writable.abort();
    } catch (_) {}
    throw error;
  }
}

// A full storage explained; other errors as they are.
function spaceError(error) {
  if (error && error.name === "QuotaExceededError") {
    return new Error("There is not enough space for this song. Delete songs you no longer need, or free some space on the device.");
  }
  return error;
}

function friendly(error) {
  const e = spaceError(error);
  return e !== error ? e : new Error(`The song could not be added to the library (${(error && error.message) || error}).`);
}

export class Library {
  static supported() {
    return !!(navigator.storage && navigator.storage.getDirectory) && typeof Worker !== "undefined";
  }

  constructor() {
    this.entries = [];
    this.load();
  }

  load() {
    try {
      const index = JSON.parse(localStorage.getItem(INDEX_KEY) || "null");
      this.entries = index && Array.isArray(index.entries) ? index.entries : [];
    } catch (_) {
      this.entries = [];
    }
  }

  save() {
    try {
      localStorage.setItem(INDEX_KEY, JSON.stringify({ v: 1, entries: this.entries }));
    } catch (_) {}
  }

  async dir() {
    const root = await navigator.storage.getDirectory();
    return root.getDirectoryHandle(DIR, { create: true });
  }

  // Most recently opened (or added) first.
  list() {
    return [...this.entries].sort((a, b) => Math.max(b.opened || 0, b.added || 0) - Math.max(a.opened || 0, a.added || 0));
  }

  get(id) {
    return this.entries.find((e) => e.id === id) || null;
  }

  find(name, size) {
    return this.entries.find((e) => e.name === name && e.size === size) || null;
  }

  usage() {
    return this.entries.reduce((sum, e) => sum + (e.size || 0), 0);
  }

  // Copies `file` into the library; resolves with its entry.
  async add(file, kind, onProgress = () => {}) {
    const dir = await this.dir();
    const id = newId();
    const stored = `${id}.${extensionOf(file.name) || "bin"}`;
    try {
      try {
        await copyWithWorker(file, stored, onProgress);
      } catch (error) {
        if (error.name !== "NotSupportedError") throw error;
        await copyOnPage(dir, file, stored, onProgress);
      }
    } catch (error) {
      try {
        await dir.removeEntry(stored);
      } catch (_) {}
      throw friendly(error);
    }
    const entry = {
      id,
      stored,
      name: file.name,
      size: file.size,
      kind,
      title: file.name.replace(/\.[^.]+$/, "") || file.name,
      duration: null,
      tracks: null,
      settingsKey: null,
      added: Date.now(),
      opened: 0,
    };
    this.load();
    this.entries.push(entry);
    this.save();
    return entry;
  }

  // The song as a File carrying its original name.
  async file(entry) {
    const dir = await this.dir();
    let stored;
    try {
      stored = await (await dir.getFileHandle(entry.stored)).getFile();
    } catch (error) {
      if (error && error.name === "NotFoundError") {
        this.forget(entry.id);
        throw new Error(`${entry.title} is no longer in the library: the browser removed it.`);
      }
      throw error;
    }
    return new File([stored], entry.name, { type: stored.type, lastModified: stored.lastModified });
  }

  // Writes `bytes` at `at`, cutting the song's file there (a project saved
  // in place); resolves with the new size.
  async patch(entry, at, bytes) {
    let size;
    try {
      size = (await runWorker({ op: "patch", name: entry.stored, at, bytes })).size;
    } catch (error) {
      if (error.name !== "NotSupportedError") throw spaceError(error);
      const handle = await (await this.dir()).getFileHandle(entry.stored);
      const w = await handle.createWritable({ keepExistingData: true });
      try {
        await w.truncate(at);
        await w.write({ type: "write", position: at, data: bytes });
        await w.close();
      } catch (e) {
        try {
          await w.abort();
        } catch (_) {}
        throw spaceError(e);
      }
      size = at + bytes.length;
    }
    this.update(entry.id, { size });
    return size;
  }

  // Replaces the song's file with `blob` (an audio file that became a
  // project); resolves with the new size.
  async replace(entry, blob, name, kind) {
    const dir = await this.dir();
    const stored = `${newId()}.${extensionOf(name) || "bin"}`;
    try {
      try {
        await copyWithWorker(blob, stored, () => {});
      } catch (error) {
        if (error.name !== "NotSupportedError") throw error;
        await copyOnPage(dir, blob, stored, () => {});
      }
    } catch (error) {
      try {
        await dir.removeEntry(stored);
      } catch (_) {}
      throw spaceError(error);
    }
    try {
      await dir.removeEntry(entry.stored);
    } catch (_) {}
    this.update(entry.id, { stored, name, kind, size: blob.size });
    return blob.size;
  }

  update(id, fields) {
    this.load();
    const entry = this.get(id);
    if (!entry) return null;
    Object.assign(entry, fields);
    this.save();
    return entry;
  }

  forget(id) {
    this.load();
    this.entries = this.entries.filter((e) => e.id !== id);
    this.save();
  }

  async remove(id) {
    const entry = this.get(id);
    if (!entry) return null;
    try {
      await (await this.dir()).removeEntry(entry.stored);
    } catch (error) {
      if (!error || error.name !== "NotFoundError") throw error;
    }
    this.forget(id);
    return entry;
  }

  async clear() {
    const root = await navigator.storage.getDirectory();
    try {
      await root.removeEntry(DIR, { recursive: true });
    } catch (error) {
      if (!error || error.name !== "NotFoundError") throw error;
    }
    const removed = this.entries;
    this.entries = [];
    this.save();
    return removed;
  }

  // Drops the entries whose file is gone and deletes files no entry lists
  // (left by a copy that was interrupted). Returns the entries dropped.
  async verify() {
    const dir = await this.dir();
    const files = new Map();
    for await (const [name, handle] of dir.entries()) {
      if (handle.kind === "file") files.set(name, handle);
    }
    this.load();
    const gone = this.entries.filter((e) => !files.has(e.stored));
    if (gone.length) {
      this.entries = this.entries.filter((e) => files.has(e.stored));
      this.save();
    }
    const listed = new Set(this.entries.map((e) => e.stored));
    for (const [name, handle] of files) {
      if (listed.has(name)) continue;
      try {
        const file = await handle.getFile();
        if (Date.now() - file.lastModified > ORPHAN_AGE_MS) await dir.removeEntry(name);
      } catch (_) {}
    }
    return gone;
  }
}

// Space the browser reports for this site: {quota, usage} in bytes, or null.
export async function storageEstimate() {
  try {
    if (navigator.storage && navigator.storage.estimate) return await navigator.storage.estimate();
  } catch (_) {}
  return null;
}

// Asks the browser to keep the site's data (true, false, or null if it cannot be asked).
export async function requestPersistence() {
  try {
    if (!navigator.storage || !navigator.storage.persist) return null;
    if (navigator.storage.persisted && (await navigator.storage.persisted())) return true;
    return await navigator.storage.persist();
  } catch (_) {
    return null;
  }
}

export async function isPersisted() {
  try {
    if (navigator.storage && navigator.storage.persisted) return await navigator.storage.persisted();
  } catch (_) {}
  return null;
}
