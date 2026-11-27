// The community (3.3): the analyses of songs that people using EUTERIA Web
// publish (their bars, sections and chords and the details of the song, as
// Share analysis makes them, src/shared.js; never any audio, never the
// notes), kept online in Firebase (Cloud Firestore, its Lite SDK, and
// Firebase Authentication), searched and imported by anyone, published by
// whoever signs in (Google, or an email address and a password, the address
// checked first). The rules that guard them are in firestore.rules.
//
// The SDK of Firebase is loaded from its site only when the community is
// used (a version fixed here), so that nothing changes for whoever never
// opens it. What the page does with the community goes through a driver (the
// Firebase one, firebaseDriver(); the tests give one of their own), with plain
// objects in and out:
//
// analyses/{id}: {v: 1, title, performer, album, year, words (the words of
// the title and of the performer, as searched: wordsOf()), titleKey,
// duration (s), bpm, meter, kind ("record": as on the record; "arrangement":
// an arrangement of one's own), note (what its author says of it), analysis
// (the file of the analysis, as JSON text), owner (who published it), ownerName
// (the name they chose to show), created, updated, likes}; analyses/{id}/
// likes/{uid}: a like of uid; reports/{id}: {analysis, by, reason, at}, read
// only in the console of Firebase; users/{uid}: {name (the public name),
// lastPublish}.

export const FIREBASE = {
  // The SDK, from Google's site (cross-origin modules, left alone by sw.js).
  base: "https://www.gstatic.com/firebasejs/13.3.0/",
  // The web app's settings: public by design (the rules guard the data).
  config: {
    apiKey: "AIzaSyCfUi3DNfQQsQpNT4h4islV5Lsi9fWiA0M",
    authDomain: "euteria.firebaseapp.com",
    projectId: "euteria",
    storageBucket: "euteria.firebasestorage.app",
    messagingSenderId: "545907728418",
    appId: "1:545907728418:web:ee0806ed895f245bbf2a7b",
  },
};

export const KINDS = ["record", "arrangement"];
export const NOTE_MAX = 1000;
export const NAME_MAX = 40;
export const RESULTS = 50; // read at most by a search

// Words that say little of a song, left out of what is searched.
const STOP = new Set(["the", "a", "an", "of", "and", "to", "in", "on", "il", "lo", "la", "i", "gli", "le", "di", "e", "un", "una", "uno", "del", "della", "de", "el", "los", "las", "y", "le", "les", "des", "et", "der", "die", "das", "und"]);

// A text as it is searched: lower case, no accents, "&" an "and", no
// apostrophes.
export function plain(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/['’`´]/g, "");
}

// A title or a name without what changes from one release to another: what
// is in brackets ("(Remastered 2009)", "[Live]"), a featured artist, a track
// number at its start ("01 - ", "3. ").
export function bare(text) {
  return plain(text)
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/\s(feat|ft|featuring)\.?\s.*$/, " ")
    .replace(/^\s*\d{1,3}\s*[-._)]\s+/, " ")
    .replace(/\s+-\s+(remaster(ed)?|live|mono|stereo|single|radio edit|edit|version)\b.*$/, " ");
}

// The words of texts, as searched (no duplicates, at most 40, two letters or
// more, not STOP).
export function wordsOf(...texts) {
  const out = [];
  for (const text of texts) {
    for (const w of bare(text).split(/[^a-z0-9]+/)) {
      if (w.length < 2 || STOP.has(w) || out.includes(w)) continue;
      out.push(w.slice(0, 40));
      if (out.length >= 40) return out;
    }
  }
  return out;
}

// A title as compared: its words in order.
export const keyOf = (text) => bare(text).split(/[^a-z0-9]+/).filter(Boolean).join(" ");

// The analyses found for a search (`query`: what was typed) ranked for the
// song open (`mine`: {title, performer, duration}): those holding every word
// typed, the same title and performer first, then those of about the same
// length (the same recording, likely), then the liked ones, then the newest.
export function rank(found, query, mine = {}) {
  const want = wordsOf(query);
  const title = keyOf(mine.title);
  const performer = keyOf(mine.performer);
  const score = (a) => {
    let s = 0;
    if (title && keyOf(a.title) === title) s += 4;
    if (performer && keyOf(a.performer) === performer) s += 2;
    if (mine.duration > 0 && a.duration > 0 && Math.abs(a.duration - mine.duration) <= 3) s += 3;
    return s;
  };
  return found
    .filter((a) => want.every((w) => (a.words || []).includes(w)))
    .map((a) => ({ a, s: score(a) }))
    .sort((x, y) => y.s - x.s || (y.a.likes || 0) - (x.a.likes || 0) || (y.a.updated || 0) - (x.a.updated || 0))
    .map((x) => x.a);
}

// What a publication holds (the analysis, as src/shared.js analysisJson()
// makes it; the details of the song; kind; note; the public name): the fields
// of its record.
export function entryOf({ data, details, kind, note, name }) {
  const title = String(details.title || "").trim().slice(0, 200);
  const performer = String(details.performer || "").trim().slice(0, 200);
  const music = data.music || {};
  const entry = {
    v: 1,
    title,
    performer,
    album: String(details.album || "").trim().slice(0, 200),
    year: String(details.year || "").trim().slice(0, 10),
    words: wordsOf(title, performer),
    titleKey: keyOf(title).slice(0, 200),
    duration: Math.round((+data.duration || 0) * 1000) / 1000,
    bpm: +music.bpm > 0 ? Math.round(+music.bpm * 1000) / 1000 : null,
    meter: String(music.time_signature || "4/4").slice(0, 8),
    kind: KINDS.includes(kind) ? kind : "record",
    note: String(note || "").trim().slice(0, NOTE_MAX),
    analysis: JSON.stringify(data),
    ownerName: String(name || "").trim().slice(0, NAME_MAX),
  };
  return entry;
}

// Why something went wrong, as a code the page says in words: "offline",
// "denied" (the rules refused it), "busy" (the quotas of the day used up),
// "popup-blocked", "popup-closed", "wrong-password", "no-account",
// "email-in-use", "weak-password", "bad-email", "recent-login" (to sign in
// again first), "too-many" (too many tries), or "" (something else).
export function reasonOf(error) {
  const code = String((error && error.code) || "");
  const map = {
    "auth/network-request-failed": "offline",
    unavailable: "offline",
    "deadline-exceeded": "offline",
    "permission-denied": "denied",
    "resource-exhausted": "busy",
    "auth/popup-blocked": "popup-blocked",
    "auth/popup-closed-by-user": "popup-closed",
    "auth/cancelled-popup-request": "popup-closed",
    "auth/user-cancelled": "popup-closed",
    "auth/wrong-password": "wrong-password",
    "auth/invalid-credential": "wrong-password",
    "auth/invalid-login-credentials": "wrong-password",
    "auth/user-not-found": "no-account",
    "auth/email-already-in-use": "email-in-use",
    "auth/weak-password": "weak-password",
    "auth/password-does-not-meet-requirements": "weak-password",
    "auth/invalid-email": "bad-email",
    "auth/missing-email": "bad-email",
    "auth/requires-recent-login": "recent-login",
    "auth/too-many-requests": "too-many",
    "auth/quota-exceeded": "busy",
  };
  if (map[code]) return map[code];
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "offline";
  return "";
}

// The user as the page sees them: {uid, email, name (as the account gives
// it), verified (the address checked: a Google account always is), google}.
function userOf(u) {
  if (!u) return null;
  const google = (u.providerData || []).some((p) => p && p.providerId === "google.com");
  return { uid: u.uid, email: u.email || "", name: u.displayName || "", verified: !!u.emailVerified || google, google };
}

const millis = (t) => (t && typeof t.toMillis === "function" ? t.toMillis() : +t || 0);

// A record read back, as a plain object.
function recordOf(snap) {
  const d = snap.data() || {};
  return { ...d, id: snap.id, created: millis(d.created), updated: millis(d.updated), likes: +d.likes || 0 };
}

// The driver of the community on Firebase. Its SDK loads at the first call
// (ready()), once.
export function firebaseDriver({ base = FIREBASE.base, config = FIREBASE.config } = {}) {
  let loading = null;
  const load = () =>
    (loading ||= (async () => {
      const [A, U, F] = await Promise.all([import(`${base}firebase-app.js`), import(`${base}firebase-auth.js`), import(`${base}firebase-firestore-lite.js`)]);
      const app = A.getApps().length ? A.getApp() : A.initializeApp(config);
      const auth = U.getAuth(app);
      U.useDeviceLanguage(auth);
      const db = F.getFirestore(app);
      return { U, F, auth, db };
    })().catch((error) => {
      loading = null;
      throw error;
    }));
  const current = async () => {
    const { auth } = await load();
    if (!auth.currentUser) throw Object.assign(new Error("Not signed in."), { code: "auth/no-current-user" });
    return auth.currentUser;
  };
  return {
    ready: () => load().then(() => true),
    // cb(user or null) now and at every change; returns what stops it.
    async watch(cb) {
      const { U, auth } = await load();
      return U.onAuthStateChanged(auth, (u) => cb(userOf(u)));
    },
    // Must run straight from a click (the window of Google): call it only
    // once ready() resolved.
    async signInGoogle() {
      const { U, auth } = await load();
      const provider = new U.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      return userOf((await U.signInWithPopup(auth, provider)).user);
    },
    async signInEmail(email, password) {
      const { U, auth } = await load();
      return userOf((await U.signInWithEmailAndPassword(auth, email, password)).user);
    },
    // A new account; the address is sent a link to check it.
    async createAccount(email, password) {
      const { U, auth } = await load();
      const { user } = await U.createUserWithEmailAndPassword(auth, email, password);
      await U.sendEmailVerification(user);
      return userOf(user);
    },
    async sendVerification() {
      const { U } = await load();
      await U.sendEmailVerification(await current());
    },
    // The account read again (the address checked since?), its token too.
    async refresh() {
      const { U } = await load();
      const user = await current();
      await U.reload(user);
      await user.getIdToken(true);
      return userOf(user);
    },
    async resetPassword(email) {
      const { U, auth } = await load();
      await U.sendPasswordResetEmail(auth, email);
    },
    async signOut() {
      const { U, auth } = await load();
      await U.signOut(auth);
    },
    // The public name kept for the user, or "".
    async userName(uid) {
      const { F, db } = await load();
      try {
        const snap = await F.getDoc(F.doc(db, "users", uid));
        return snap.exists() ? String(snap.data().name || "") : "";
      } catch (_) {
        return "";
      }
    },
    // The analyses holding `word` (one of wordsOf()).
    async search(word) {
      const { F, db } = await load();
      const snap = await F.getDocs(F.query(F.collection(db, "analyses"), F.where("words", "array-contains", word), F.limit(RESULTS)));
      return snap.docs.map(recordOf);
    },
    async mine(uid) {
      const { F, db } = await load();
      const snap = await F.getDocs(F.query(F.collection(db, "analyses"), F.where("owner", "==", uid), F.limit(200)));
      return snap.docs.map(recordOf);
    },
    // A new analysis (id null) or the user's own one again; the public name
    // kept with the user. Resolves with its id.
    async publish(entry, id = null) {
      const { F, db } = await load();
      const user = await current();
      const batch = F.writeBatch(db);
      const me = F.doc(db, "users", user.uid);
      if (id) {
        batch.update(F.doc(db, "analyses", id), { ...entry, updated: F.serverTimestamp() });
        batch.set(me, { name: entry.ownerName }, { merge: true });
        await batch.commit();
        return id;
      }
      const ref = F.doc(F.collection(db, "analyses"));
      batch.set(ref, { ...entry, owner: user.uid, likes: 0, created: F.serverTimestamp(), updated: F.serverTimestamp() });
      batch.set(me, { name: entry.ownerName, lastPublish: F.serverTimestamp() }, { merge: true });
      await batch.commit();
      return ref.id;
    },
    async remove(id) {
      const { F, db } = await load();
      await F.deleteDoc(F.doc(db, "analyses", id));
    },
    // A like (on: true) or none: the like and the count in one write.
    async like(id, on) {
      const { F, db } = await load();
      const user = await current();
      const batch = F.writeBatch(db);
      const mine = F.doc(db, "analyses", id, "likes", user.uid);
      if (on) batch.set(mine, { at: F.serverTimestamp() });
      else batch.delete(mine);
      batch.update(F.doc(db, "analyses", id), { likes: F.increment(on ? 1 : -1) });
      await batch.commit();
    },
    async report(id, reason) {
      const { F, db } = await load();
      const user = await current();
      await F.addDoc(F.collection(db, "reports"), { analysis: id, by: user.uid, reason: String(reason || "").slice(0, 500), at: F.serverTimestamp() });
    },
    // The account gone, with what it published and its record. Firebase
    // deletes only an account signed in a moment ago: otherwise nothing is
    // deleted and the error says to sign in again ("recent-login").
    async deleteAccount() {
      const { U, F, db } = await load();
      const user = await current();
      const last = Date.parse((user.metadata && user.metadata.lastSignInTime) || "") || 0;
      if (Date.now() - last > 4 * 60 * 1000) throw Object.assign(new Error("Sign in again first."), { code: "auth/requires-recent-login" });
      const snap = await F.getDocs(F.query(F.collection(db, "analyses"), F.where("owner", "==", user.uid), F.limit(500)));
      for (const d of snap.docs) await F.deleteDoc(d.ref);
      await F.deleteDoc(F.doc(db, "users", user.uid)).catch(() => {});
      await U.deleteUser(user);
    },
  };
}
