// Recent files of the computer layout. In Chrome and Edge a file opened with
// the system's file picker (or dropped on the window) comes with a handle that
// can be kept (in IndexedDB) and opened again later, after the browser asks
// once for permission. Other browsers give no such handle: there the list
// stays empty and songs are opened from their folder each time.

// The list lives in the site's IndexedDB, shared by all its tabs: a tab
// stopped in the middle of an operation on it (under an alert, frozen) holds
// it, and the others wait. So an operation waits WAIT_MS at most, then gives
// up (3.3.1: Save stayed on "Saving…" behind such a tab); and the page never
// waits for the list to do what the user asked (app/app.js keepRecent()).
const DB = "euteria";
const STORE = "recent";
const MAX = 10;
const WAIT_MS = 3000;

export const recentSupported = () => typeof window !== "undefined" && "showOpenFilePicker" in window && "indexedDB" in window;

const late = () => new Error("The list of the songs opened did not answer.");

function openDb() {
  return new Promise((resolve, reject) => {
    let gone = false;
    const timer = setTimeout(() => {
      gone = true;
      reject(late());
    }, WAIT_MS);
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => {
      clearTimeout(timer);
      if (gone) request.result.close(); // too late: given up already
      else resolve(request.result);
    };
    request.onerror = () => {
      clearTimeout(timer);
      reject(request.error);
    };
  });
}

async function withStore(mode, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const timer = setTimeout(() => {
        try {
          tx.abort(); // out of the queue: it holds nothing up any more
        } catch (_) {}
        reject(late());
      }, WAIT_MS);
      const store = tx.objectStore(STORE);
      let result;
      Promise.resolve(fn(store)).then((r) => (result = r), reject);
      tx.oncomplete = () => {
        clearTimeout(timer);
        resolve(result);
      };
      tx.onerror = () => {
        clearTimeout(timer);
        reject(tx.error);
      };
      tx.onabort = () => {
        clearTimeout(timer);
        reject(tx.error || late());
      };
    });
  } finally {
    db.close();
  }
}

const request = (r) => new Promise((resolve, reject) => {
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});

async function readAll() {
  const all = await withStore("readonly", (store) => request(store.getAll()));
  return (all || []).sort((a, b) => b.opened - a.opened);
}

// Most recent first: [{id, name, title, size, opened, handle}].
export async function listRecent() {
  if (!recentSupported()) return [];
  try {
    return await readAll();
  } catch (_) {
    return [];
  }
}

// id: the entry to put it in (a file renamed: its old handle no longer
// matches it), else the entry of the same file, or a new one. Nothing is
// added if the list did not answer (it could not tell the file is in it).
export async function addRecent(handle, { title, size, id = null }) {
  if (!recentSupported() || !handle) return;
  try {
    const all = await readAll();
    for (const item of all) {
      if (id) break;
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

// The id of the entry of `handle`, or null.
export async function recentId(handle) {
  if (!handle) return null;
  for (const item of await listRecent()) {
    try {
      if (await item.handle.isSameEntry(handle)) return item.id;
    } catch (_) {}
  }
  return null;
}

// Whether a file of the list other than `handle` is named `name` (letter
// case aside) and may be written by the app: Chrome lets a file moved onto
// such a file replace it, and the list cannot tell their folders apart.
export async function recentWritable(name, handle) {
  const key = (n) => String(n).normalize("NFC").toLowerCase();
  for (const item of await listRecent()) {
    try {
      if (key(item.handle.name) !== key(name) || (await item.handle.isSameEntry(handle))) continue;
      if ((await item.handle.queryPermission({ mode: "readwrite" })) === "granted") return true;
    } catch (_) {}
  }
  return false;
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
