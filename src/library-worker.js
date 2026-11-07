/*
 * Web Worker that writes the songs of the library of src/library.js in the
 * app's private storage (the origin private file system): it copies a song
 * in, a few megabytes at a time, so the copy never holds the whole file in
 * memory, and it patches a song in place (the end of the file replaced, for
 * the new manifest of a project saved). It writes through a synchronous
 * access handle, which every browser with that storage offers in workers,
 * Safari included.
 *
 * Older Safari versions return promises from the access handle's methods:
 * every call is awaited, which works either way.
 */
"use strict";

const DIR = "library";
const CHUNK = 4 * 1024 * 1024;

self.onmessage = (event) => (event.data.op === "patch" ? patch(event.data) : copy(event.data));

async function openAccess(name, create) {
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle(DIR, { create: true });
  const handle = await dir.getFileHandle(name, { create });
  if (typeof handle.createSyncAccessHandle !== "function") throw Object.assign(new Error("no sync access"), { name: "NotSupportedError" });
  return handle.createSyncAccessHandle();
}

function failed(id, error) {
  self.postMessage({ type: "error", id, name: (error && error.name) || "Error", message: String((error && error.message) || error) });
}

// Cuts the file at `at` and writes `bytes` there.
async function patch({ id, name, at, bytes }) {
  let access = null;
  try {
    access = await openAccess(name, false);
    await access.truncate(at);
    let written = 0;
    while (written < bytes.length) {
      const n = await access.write(bytes.subarray(written), { at: at + written });
      if (!n) throw new Error("The save stopped: nothing could be written.");
      written += n;
    }
    await access.flush();
    const size = await access.getSize();
    await access.close();
    access = null;
    self.postMessage({ type: "done", id, size });
  } catch (error) {
    if (access) {
      try {
        await access.close();
      } catch (_) {}
    }
    failed(id, error);
  }
}

async function copy({ id, file, name }) {
  let access = null;
  try {
    access = await openAccess(name, true);
    await access.truncate(0);
    let at = 0;
    while (at < file.size) {
      const bytes = new Uint8Array(await file.slice(at, at + CHUNK).arrayBuffer());
      let written = 0;
      while (written < bytes.length) {
        const n = await access.write(bytes.subarray(written), { at: at + written });
        if (!n) throw new Error("The copy stopped: nothing could be written.");
        written += n;
      }
      at += bytes.length;
      self.postMessage({ type: "progress", id, done: at, total: file.size });
    }
    await access.flush();
    await access.close();
    access = null;
    self.postMessage({ type: "done", id });
  } catch (error) {
    if (access) {
      try {
        await access.close();
      } catch (_) {}
    }
    failed(id, error);
  }
}
