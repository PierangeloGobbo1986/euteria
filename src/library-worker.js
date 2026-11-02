/*
 * Web Worker that copies a song into the app's private storage (the origin
 * private file system) for the library of src/library.js. It writes through a
 * synchronous access handle, which every browser with that storage offers in
 * workers (Safari included), a few megabytes at a time, so the copy never
 * holds the whole file in memory.
 *
 * Older Safari versions return promises from the access handle's methods:
 * every call is awaited, which works either way.
 */
"use strict";

const DIR = "library";
const CHUNK = 4 * 1024 * 1024;

self.onmessage = async (event) => {
  const { id, file, name } = event.data;
  let access = null;
  try {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle(DIR, { create: true });
    const handle = await dir.getFileHandle(name, { create: true });
    if (typeof handle.createSyncAccessHandle !== "function") throw Object.assign(new Error("no sync access"), { name: "NotSupportedError" });
    access = await handle.createSyncAccessHandle();
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
    self.postMessage({ type: "error", id, name: (error && error.name) || "Error", message: String((error && error.message) || error) });
  }
};
