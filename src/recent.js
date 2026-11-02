// Recent files of the computer layout. In Chrome and Edge a file opened with
// the system's file picker (or dropped on the window) comes with a handle that
// can be kept (in IndexedDB) and opened again later, after the browser asks
// once for permission. Other browsers give no such handle: there the list
// stays empty and songs are opened from their folder each time.

const DB = "euteria";
const STORE = "recent";
const MAX = 10;

export const recentSupported = () => typeof window !== "undefined" && "showOpenFilePicker" in window && "indexedDB" in window;

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      let result;
      Promise.resolve(fn(store)).then((r) => (result = r), reject);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

const request = (r) => new Promise((resolve, reject) => {
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});

// Most recent first: [{id, name, title, size, opened, handle}].
export async function listRecent() {
  if (!recentSupported()) return [];
  try {
    const all = await withStore("readonly", (store) => request(store.getAll()));
    return (all || []).sort((a, b) => b.opened - a.opened);
  } catch (_) {
    return [];
  }
}

export async function addRecent(handle, { title, size }) {
  if (!recentSupported() || !handle) return;
  try {
    const all = await listRecent();
    let id = null;
    for (const item of all) {
      try {
        if (await item.handle.isSameEntry(handle)) id = item.id;
      } catch (_) {}
    }
    const entry = { id: id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: handle.name, title: title || handle.name, size, opened: Date.now(), handle };
    const drop = [entry, ...all.filter((i) => i.id !== entry.id)].slice(MAX).map((i) => i.id);
    await withStore("readwrite", (store) => {
      store.put(entry);
      for (const old of drop) store.delete(old);
    });
  } catch (_) {}
}

export async function removeRecent(id) {
  if (!recentSupported()) return;
  try {
    await withStore("readwrite", (store) => store.delete(id));
  } catch (_) {}
}

// The file behind a recent entry, asking for permission if needed (call it
// from a click: the browser shows its question only after a user gesture).
// Resolves with null if permission is refused.
export async function recentFile(item) {
  const handle = item.handle;
  let permission = await handle.queryPermission({ mode: "read" });
  if (permission !== "granted") permission = await handle.requestPermission({ mode: "read" });
  if (permission !== "granted") return null;
  return handle.getFile();
}
