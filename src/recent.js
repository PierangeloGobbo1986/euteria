// Recent files of the computer layout. In Chrome and Edge a file opened with
// the system's file picker (or dropped on the window) comes with a handle that
// can be kept (in IndexedDB) and opened again later, after the browser asks
// once for permission. Other browsers give no such handle: there the list
// stays empty and songs are opened from their folder each time.
//
// The list lives in the site's IndexedDB, shared by all its tabs. A tab
// stopped in the middle of an operation holds it up for the others, and a
// handle read back may not answer at all: in one Chrome the list of 3.3.1
// stopped answering for good, even with the browser started again, and Save,
// then the rename of a project, waited on it. Since 3.3.2:
// - what the Library shows (name, title, size, when) is kept apart from the
//   handles, in a database of its own: store "list"; the handles in store
//   "files", read one at a time, only to open a song again or to tell apart
//   two files of the same name. A handle that cannot be kept, or read back,
//   leaves its song listed all the same;
// - an operation gives up after WAIT_MS, a question to a handle after
//   ASK_MS, and the page never waits on the list to do what the user asked
//   (app/app.js keepRecent(), renameFile());
// - the list of 3.3.1 and before (database "euteria", the handles inside its
//   entries) is not read again: it is deleted (dropOldRecent()).

const DB = "euteria-songs";
const LIST = "list"; // {id, name, title, size, opened}
const FILES = "files"; // {id, handle}
const OLD_DB = "euteria"; // up to 3.3.1
const DROPPED = "euteria.recent-old-dropped"; // localStorage: the old list deleted
const MAX = 10;
const WAIT_MS = 3000;
const ASK_MS = 1500;

export const recentSupported = () => typeof window !== "undefined" && "showOpenFilePicker" in window && "indexedDB" in window;

const late = () => new Error("The list of the songs opened did not answer.");
const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const key = (name) => String(name).normalize("NFC").toLowerCase();

// What fn() gives within ms; else (no answer, or an error) the fallback.
export function within(fn, ms, fallback) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    const done = (value) => {
      clearTimeout(timer);
      resolve(value);
    };
    try {
      Promise.resolve(fn()).then(done, () => done(fallback));
    } catch (_) {
      done(fallback);
    }
  });
}
const ask = (fn, fallback) => within(fn, ASK_MS, fallback);

// Whether the list (store "list") did not answer the last time it was read,
// or written: the Library says so.
const trouble = { read: false, write: false };
export const recentTrouble = () => trouble.read || trouble.write;

function openDb() {
  return new Promise((resolve, reject) => {
    let gone = false;
    const timer = setTimeout(() => {
      gone = true;
      reject(late());
    }, WAIT_MS);
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(LIST)) db.createObjectStore(LIST, { keyPath: "id" });
      if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES, { keyPath: "id" });
    };
    request.onsuccess = () => {
      clearTimeout(timer);
      const db = request.result;
      db.onversionchange = () => db.close(); // never holds up another tab
      if (gone) db.close(); // too late: given up already
      else resolve(db);
    };
    request.onerror = () => {
      clearTimeout(timer);
      reject(request.error);
    };
  });
}

// One transaction on one store; fn(store) places its requests. Given up
// after WAIT_MS (the transaction aborted: it holds nothing up any more).
async function withStore(name, mode, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(name, mode);
      const timer = setTimeout(() => {
        try {
          tx.abort();
        } catch (_) {}
        reject(late());
      }, WAIT_MS);
      let result;
      try {
        Promise.resolve(fn(tx.objectStore(name))).then((r) => (result = r), reject);
      } catch (error) {
        // A value that cannot be kept (a handle of another kind): nothing written.
        clearTimeout(timer);
        try {
          tx.abort();
        } catch (_) {}
        reject(error);
        return;
      }
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

// The store of the list, its answer noted for recentTrouble().
async function onList(mode, fn) {
  const kind = mode === "readonly" ? "read" : "write";
  try {
    const result = await withStore(LIST, mode, fn);
    trouble[kind] = false;
    return result;
  } catch (error) {
    trouble[kind] = true;
    throw error;
  }
}

const request = (r) => new Promise((resolve, reject) => {
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});

async function readList() {
  const all = await onList("readonly", (store) => request(store.getAll()));
  return (all || []).sort((a, b) => b.opened - a.opened);
}

// Most recent first: [{id, name, title, size, opened}].
export async function listRecent() {
  if (!recentSupported()) return [];
  try {
    return await readList();
  } catch (_) {
    return [];
  }
}

// The handle kept for the entry `id`; null if none was kept, or it does not
// come back.
async function handleOf(id) {
  try {
    const row = await withStore(FILES, "readonly", (store) => request(store.get(id)));
    return (row && row.handle) || null;
  } catch (_) {
    return null;
  }
}

// Whether two handles are of the same file: true, false, or null (no answer).
const sameFile = (a, b) => ask(() => a.isSameEntry(b), null);

// The entry of the file of `handle`: among those of its name (letter case
// aside), the one whose handle is of the same file; else one whose handle
// cannot tell (none kept, or no answer), most likely that file.
async function entryOf(handle, list) {
  let maybe = null;
  for (const entry of list.filter((e) => key(e.name) === key(handle.name))) {
    const kept = await handleOf(entry.id);
    const same = kept ? await sameFile(kept, handle) : null;
    if (same) return entry;
    if (same === null && !maybe) maybe = entry;
  }
  return maybe;
}

// The file of `handle` at the top of the list. id: the entry to put it in (a
// file renamed: the entry of its old name), else the entry of the same file,
// or a new one. The handle is kept apart: if it cannot be (or the store of
// the handles does not answer), the song is listed all the same.
export async function addRecent(handle, { title, size, id = null }) {
  if (!recentSupported() || !handle) return;
  try {
    const list = await readList();
    const known = id ? list.find((e) => e.id === id) : await entryOf(handle, list);
    const entry = { id: (known && known.id) || id || newId(), name: handle.name, title: title || handle.name, size, opened: Date.now() };
    const drop = [entry, ...list.filter((e) => e.id !== entry.id)].slice(MAX).map((e) => e.id);
    await onList("readwrite", (store) => {
      for (const old of drop) store.delete(old);
      store.put(entry);
    });
    await withStore(FILES, "readwrite", (store) => {
      for (const old of drop) store.delete(old);
      store.put({ id: entry.id, handle });
    });
  } catch (_) {}
}

// The id of the entry of the file of `handle`, or null.
export async function recentId(handle) {
  if (!recentSupported() || !handle) return null;
  try {
    const entry = await entryOf(handle, await readList());
    return entry ? entry.id : null;
  } catch (_) {
    return null;
  }
}

// Whether a file of the list other than that of `handle` is named `name`
// (letter case aside) and may be written by the app: Chrome lets a file
// moved onto such a file replace it, and the list cannot tell their folders
// apart. true, false, or null: it cannot tell (such a file's handle not kept,
// or no answer). Rejects if the list does not answer.
export async function recentWritable(name, handle) {
  if (!recentSupported()) return false;
  for (const entry of (await readList()).filter((e) => key(e.name) === key(name))) {
    const kept = await handleOf(entry.id);
    if (!kept) return null;
    const same = await sameFile(kept, handle);
    if (same) continue;
    if (same === null) return null;
    const permission = await ask(() => kept.queryPermission({ mode: "readwrite" }), null);
    if (permission === null) return null;
    if (permission === "granted") return true;
  }
  return false;
}

export async function removeRecent(id) {
  if (!recentSupported() || !id) return;
  try {
    await onList("readwrite", (store) => store.delete(id));
  } catch (_) {}
  try {
    await withStore(FILES, "readwrite", (store) => store.delete(id));
  } catch (_) {}
}

// The file of an entry, and its handle: {file, handle}, asking for permission
// if needed (call it from a click: the browser shows its question only after
// a user gesture). Resolves with null if permission is refused; rejects with
// an error marked `lost` if no handle was kept for it, or it does not answer.
export async function recentFile(item) {
  const lost = () => Object.assign(new Error("The file of the list did not answer."), { lost: true });
  const handle = await handleOf(item.id);
  if (!handle) throw lost();
  let permission = await ask(() => handle.queryPermission({ mode: "read" }), null);
  if (permission === null) throw lost();
  if (permission !== "granted") permission = await handle.requestPermission({ mode: "read" });
  if (permission !== "granted") return null;
  const file = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(lost()), WAIT_MS);
    handle.getFile().then(
      (f) => {
        clearTimeout(timer);
        resolve(f);
      },
      (error) => {
        clearTimeout(timer);
        reject(error); // NotFoundError: moved, renamed or deleted
      }
    );
  });
  return { file, handle };
}

// The list of 3.3.1 and before, deleted once (in the background, at start-up):
// what stopped answering is not read again. A tab of an older version still
// open holds it up until it closes.
export function dropOldRecent() {
  if (!recentSupported()) return;
  try {
    if (localStorage.getItem(DROPPED) === "1") return;
    const request = indexedDB.deleteDatabase(OLD_DB);
    request.onsuccess = () => {
      try {
        localStorage.setItem(DROPPED, "1");
      } catch (_) {}
    };
  } catch (_) {}
}
