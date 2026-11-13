// EUTERIA Web, the app.
//
// Two layouts share one player. "phone" (phones and tablets): songs are copied
// into a library inside the app, which shows the space they take, and values
// are numbers with − and + buttons. "computer": songs are opened from any
// folder (recent ones again with one click in Chrome and Edge), and volumes
// and tempo have sliders too. The grid and the chords of a song are edited
// in the timeline (app/editor.js), takes are recorded over it
// (app/recording.js), and both are saved in the song's file.

import { Player, KEY_RANGE, MIN_LOOP } from "../src/player.js";
import { Library, inspectFile, storageEstimate, requestPersistence, isPersisted, AUDIO_EXTENSIONS } from "../src/library.js";
import { openZip } from "../src/zip.js";
import { manifestPatch, buildProject, zipLayout, composeEdited, composeProject, crc32Blob } from "../src/zipwrite.js";
import { savedManifest, newProjectManifest, newProjectId, manifestBytes } from "../src/manifest.js";
import { recentSupported, listRecent, addRecent, removeRecent, recentFile } from "../src/recent.js";
import { settingsKey, practiceFromManifest, loadSettings, saveSettings, forgetSettings } from "../src/settings.js";
import { TRACK_TITLES, STEM_NAMES, sliderToGain, gainToSlider, isTake } from "../src/project.js";
import { readGrid, emptyGrid, applyGridEdits } from "../src/grid.js";
import { detectHandheld } from "../src/device.js";
import { h, fmtTime, fmtSize, fmtSigned, extensionOf, safeName, parseTime, numberField, keyField, confirmTap, icon, setIcon } from "./controls.js";
import { countEvent, counted, toggleCounting } from "./counter.js";
import { Timeline } from "./timeline.js";
import { Editor } from "./editor.js";
import { SeparationFlow } from "./separate.js";
import { RecordingFlow } from "./recording.js";
import { sortable } from "./sortable.js";
import { tr, trn, lang, setLang, onLangChange, translatePage, LANGUAGES } from "../src/i18n.js";

const $ = (id) => document.getElementById(id);
const phone = document.documentElement.dataset.layout === "phone";
const ua = navigator.userAgent;
const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
const standalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const LAYOUT_KEY = "euteria.layout";
const VERSION = self.EUTERIA_VERSION || ""; // version.js
const UPDATE_CHECK_MS = 60 * 60 * 1000; // a new version is looked for at start, then at most once an hour
const MAX_EXPORTS = phone ? 6 : 10; // older exports leave the list, to keep memory free
const DEFAULT_LOOP_SECONDS = 16; // as EUTERIA (Python)
const WAVE_COLORS = { original: "#d6a85f", stems: ["#8eaaa5", "#809692"], take: "#d08a84" }; // as EUTERIA (Python), and the takes
const TAKE_ROW = 84; // the height of a take's row in the timeline (computer): its Sync goes under the volume
const LIVE_LANE = 30; // the phone's lane under the waveform, for the take being recorded
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
// The hint under the timeline, in the language in use.
const HINTS = phone
  ? {
      view: () =>
        tr("Tap or drag on the waveform to place the playhead; drag inside the loop to move it, its handles under the bar numbers to change it (they snap to the bars). Pinch to zoom, drag the bar numbers to scroll. In the overview, drag the frame of the view or of the loop to move it."),
      edit: () =>
        tr("Tap a bar in the chord lane to select it, drag along the lane to select several. Type the chord: next goes on to the following bar, an empty chord removes it. Bar renumbers the bars from the one selected. Set anchor makes a bar start at the playhead; BPM and the meter rebuild the grid from there."),
    }
  : {
      view: () =>
        tr("Click or drag on the waveforms to place the playhead; drag inside the loop to move it, its edges to change it (they snap to the bars; Alt: freely). Drag the bar numbers to scroll, pinch or ctrl+wheel to zoom. In the overview, drag the frame of the view or of the loop to move it."),
      edit: () =>
        tr("Click a bar in the chord lane and type its chord (Return: the next bar); shift-click or drag along the lane to select several. ← → move the selection (Shift: extend it), Delete clears it, Ctrl+C and Ctrl+V (⌘ on a Mac) copy and paste chords. Bar renumbers the bars from the one selected. Set anchor makes a bar start at the playhead; BPM and the meter rebuild the grid from there."),
    };

const player = new Player();
// The phone draws the Original Track only; a computer every track.
player.peakKeys = phone ? ["original"] : null;
const library = phone && Library.supported() ? new Library() : null;

const app = {
  view: null,
  // The open song: {key (of its settings), source: "library" | "file",
  // entryId (library), name, file (as it is now), handle (a file Chrome and
  // Edge may write to), ready (what Share project needs, read from file)}.
  current: null,
  adding: false,
  exports: [], // {id, owner, file, url, name, seconds, tempo, key, selected}: in memory only, until the page closes
  exportShown: null, // the export the status under Export MP3 is about
  exportStatus: null, // that status: {text (or a function giving it), kind}
  rows: [],
  fields: {},
  seeking: false,
  persisted: null,
  timeline: null,
  scrub: null, // where a finger drags the playhead while the song plays
  grid: emptyGrid(),
  gridVisible: true,
  saving: false,
  sharing: false, // the share sheet is open
  projectMessage: null, // the last message of Save or Share project: {text, kind, until}
};
let editor = null; // app/editor.js, made with the timeline
let separation = null; // app/separate.js
let recording = null; // app/recording.js

// Changes not saved in the song's file yet: the bars and chords, the takes.
const songDirty = () => !!player.song && (editor.dirty || (!!recording && recording.dirty));

// ----- messages -------------------------------------------------------------------

let noticeTimer = null;
function notice(text, kind = "", ms = 0) {
  const el = $("notice");
  clearTimeout(noticeTimer);
  el.textContent = text || "";
  el.className = `notice ${kind}`.trim();
  el.hidden = !text;
  if (text && ms) noticeTimer = setTimeout(() => (el.hidden = true), ms);
}

// The line under Export MP3. text: a text, or a function giving it in the
// language in use (a message that stays, said again in another language).
function setExportStatus(text, kind = "") {
  app.exportShown = null;
  app.exportStatus = { text, kind };
  paintExportStatus();
}

function paintExportStatus() {
  const { text, kind } = app.exportStatus || { text: "", kind: "" };
  const el = $("export-status");
  el.textContent = typeof text === "function" ? text() : text;
  el.className = `status ${kind}`.trim();
}

// ----- views ----------------------------------------------------------------------

const homeView = () => (phone ? "library" : "welcome");

// The library is the home: the songs (phone) or the songs opened before
// (computer), and the buttons to open more.
function showView(view) {
  app.view = view;
  document.body.dataset.view = view;
  for (const v of ["library", "welcome", "player"]) $(`${v}-view`).hidden = v !== view;
  $("song-nav").hidden = view !== "player";
  if (view === "library") renderLibrary();
  if (view === "welcome") renderRecent();
  scheduleUi();
}

// ----- leaving a song with changes not saved ---------------------------------------
//
// As in EUTERIA (Python): before the library or another song, a song whose
// bars, chords or takes changed asks whether to save them. Don't save brings
// back the song as its file has it. (Tempo, key, loop and volumes are kept on
// the device anyway, and go in the file at the next Save.) A take being
// recorded ends first.

let leaving = false; // the page is going away on purpose: no question from the browser

function askToSave() {
  const dialog = $("leave-dialog");
  const takes = !!recording && recording.dirty;
  $("leave-hint").textContent =
    editor.dirty && takes
      ? tr("The grid, the bar numbers or the chords, and the takes, changed since the song was last saved.")
      : takes
        ? tr("The takes changed since the song was last saved.")
        : tr("The grid, the bar numbers or the chords changed since the song was last saved.");
  return new Promise((resolve) => {
    const done = () => {
      dialog.removeEventListener("close", done);
      resolve(dialog.returnValue || "cancel");
    };
    dialog.returnValue = "";
    dialog.addEventListener("close", done);
    dialog.showModal();
  });
}

// Resolves with true when the song may be left.
async function confirmLeave() {
  if (!player.song) return true;
  if (recording && recording.busy) await recording.recorder.settle();
  if (!songDirty()) return true;
  const choice = await askToSave();
  if (choice === "save") return !!(await saveSong());
  if (choice === "discard") {
    await discardEdits();
    return true;
  }
  return false;
}

async function discardEdits() {
  const song = player.song;
  const takes = recording.dirty;
  if (editor.dirty) editor.reset(song ? readGrid(song.manifest, song.duration) : emptyGrid());
  if (takes) await recording.revert();
  rememberSettings();
  notice(
    takes ? tr("The changes were not saved: the song is as its file has it.") : tr("The changes to the bars and chords were not saved: the song is as its file has it."),
    "",
    5000
  );
}

async function goHome() {
  if (await confirmLeave()) showView(homeView());
}

window.addEventListener("beforeunload", (e) => {
  if (leaving || !editor || !(songDirty() || (recording && recording.busy))) return;
  e.preventDefault();
  e.returnValue = "";
});

// ----- settings of the open song ----------------------------------------------------

let saveTimer = null;
function rememberSettings() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (app.current && player.song) {
    saveSettings(app.current.key, { ...player.settings(), view: app.timeline.getView(), grid: app.gridVisible, edits: editor.edits(), dirty: editor.dirty });
  }
}
function settingsChanged() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(rememberSettings, 500);
}
player.onsettings = settingsChanged;
window.addEventListener("pagehide", rememberSettings);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") rememberSettings();
});

// ----- opening songs ------------------------------------------------------------------

// Opens `file` in the player. Resolves with the song, or with null if it could
// not be opened (the reason is shown).
async function openSong(file, origin) {
  if (player.busy) return null;
  if (separation && separation.running) {
    notice(tr("The separation is still running: wait for it to finish, or stop it, before opening another song."), "error", 6000);
    return null;
  }
  if (recording.busy) await recording.recorder.settle();
  rememberSettings();
  app.current = null;
  recording.reset();
  setExportStatus("");
  window.scrollTo(0, 0);
  notice(tr("Opening {name}…", { name: file.name }));
  try {
    const song = await player.open(file, (done, total, key) =>
      notice(
        key
          ? tr("Opening {name}: {what} ({n} of {total})…", { name: file.name, what: TRACK_TITLES[key] ? tr(TRACK_TITLES[key]) : isTake(key) ? tr("takes") : key, n: done + 1, total })
          : tr("Opening {name}: lining up the tracks…", { name: file.name })
      )
    );
    const key = settingsKey(song, file);
    const saved = loadSettings(key);
    player.apply(saved || practiceFromManifest(song.manifest));
    // The grid of the file, with the edits not saved in it yet.
    const edits = saved && saved.edits;
    app.grid = readGrid(song.manifest, song.duration);
    if (edits) app.grid = applyGridEdits(app.grid, edits, song.duration);
    const practice = (song.manifest && song.manifest.practice) || {};
    app.gridVisible = saved && typeof saved.grid === "boolean" ? saved.grid : practice.grid_visible !== false;
    app.current = { key, source: origin.source, entryId: origin.entryId || null, name: file.name, file, handle: origin.handle || null };
    app.current.owner = songOwner();
    if (!origin.separated) countEvent(song.kind === "audio" ? "song-opened-audio" : "song-opened-project");
    showView("player");
    renderPlayer(saved && saved.view);
    editor.songOpened({ differs: !!edits, built: !!(edits && edits.built), dirty: !!(saved && saved.dirty) });
    prepareSoon();
    window.scrollTo(0, 0);
    const warning = trackWarning();
    if (warning) notice(warning, "error");
    else notice("");
    return song;
  } catch (error) {
    renderPlayer();
    showView(homeView());
    notice(tr("{name} could not be opened. {error}", { name: file.name, error: (error && error.message) || error }), "error");
    return null;
  }
}

// Whose MP3 exports are listed: the song open, as its entry in the library,
// else the project (its id stays the same when it is saved), else the audio
// file.
function songOwner() {
  const cur = app.current;
  const song = player.song;
  if (!cur || !song) return null;
  if (cur.entryId) return `e:${cur.entryId}`;
  const id = song.manifest && song.manifest.project_id;
  return id ? `p:${id}` : `a:${cur.name}:${cur.file.size}`;
}

function trackWarning() {
  const bad = player.tracks.filter((t) => t.align && t.align.status === "mismatch");
  if (!bad.length) return "";
  const names = bad.map((t) => tr(t.title)).join(", ");
  return trn(
    bad.length,
    "{names}: not the length the project gives, so it may not line up with the other tracks.",
    "{names}: not the length the project gives, so they may not line up with the other tracks.",
    { names }
  );
}

async function closeSong() {
  app.current = null; // nothing to save for a song that is going away
  if (recording.busy) await recording.recorder.settle();
  recording.reset();
  await player.close();
  renderPlayer();
}

// ----- library (phone) ------------------------------------------------------------------

async function addSong(file) {
  if (!file || player.busy || app.adding) return;
  if (!library) {
    await openSong(file, { source: "file" });
    return;
  }
  app.adding = true;
  renderLibrary();
  let entry;
  let fresh = false;
  try {
    notice(tr("Checking {name}…", { name: file.name }));
    const kind = await inspectFile(file);
    entry = library.find(file.name, file.size);
    if (!entry) {
      const estimate = await storageEstimate();
      if (estimate && estimate.quota && estimate.quota - estimate.usage < file.size * 1.05 + 5e6) {
        throw new Error(
          tr("There is not enough space for {name} ({size}). Delete songs you no longer need, or free some space on the device.", { name: file.name, size: fmtSize(file.size) })
        );
      }
      entry = await library.add(file, kind, (done, total) => notice(tr("Adding {name} to the library… {pct}%", { name: file.name, pct: Math.floor((done / total) * 100) })));
      fresh = true;
      app.persisted = await requestPersistence();
    }
  } catch (error) {
    notice((error && error.message) || String(error), "error");
    app.adding = false;
    renderLibrary();
    return;
  }
  app.adding = false;
  renderLibrary();
  await openEntry(entry, fresh);
}

async function openEntry(entry, fresh = false) {
  if (player.busy || app.adding) return;
  if (player.song && app.current && app.current.entryId === entry.id) {
    showView("player");
    return;
  }
  if (!(await confirmLeave())) return;
  let file;
  try {
    file = await library.file(entry);
  } catch (error) {
    notice((error && error.message) || String(error), "error");
    renderLibrary();
    return;
  }
  const song = await openSong(file, { source: "library", entryId: entry.id });
  if (song) {
    library.update(entry.id, { title: song.title, duration: song.duration, tracks: player.tracks.length, kind: song.kind, settingsKey: app.current.key, opened: Date.now() });
  } else if (fresh) {
    // A file this browser cannot read takes no space.
    try {
      await library.remove(entry.id);
    } catch (_) {}
    $("notice").textContent += ` ${tr("It was not kept in the library.")}`;
  }
  renderLibrary();
}

async function deleteEntry(entry) {
  if (player.busy || app.adding) return;
  try {
    if (app.current && app.current.entryId === entry.id) await closeSong();
    await library.remove(entry.id);
    deleteExports(app.exports.filter((e) => e.owner === `e:${entry.id}`));
    if (entry.settingsKey && !library.entries.some((e) => e.settingsKey === entry.settingsKey)) forgetSettings(entry.settingsKey);
    notice(tr("{title} deleted.", { title: entry.title }), "ok", 3000);
  } catch (error) {
    notice(tr("{title} could not be deleted. {error}", { title: entry.title, error: (error && error.message) || error }), "error");
  }
  renderLibrary();
}

async function deleteAll() {
  if (player.busy || app.adding) return;
  try {
    if (app.current && app.current.source === "library") await closeSong();
    const removed = await library.clear();
    for (const e of removed) if (e.settingsKey) forgetSettings(e.settingsKey);
    const gone = new Set(removed.map((e) => `e:${e.id}`));
    deleteExports(app.exports.filter((e) => gone.has(e.owner)));
    notice(trn(removed.length, "{n} song deleted.", "{n} songs deleted."), "ok", 3000);
  } catch (error) {
    notice(tr("The library could not be emptied. {error}", { error: (error && error.message) || error }), "error");
  }
  renderLibrary();
}

function renderLibrary() {
  if (!phone) return;
  $("lib-unsupported").hidden = !!library;
  const entries = library ? library.list() : [];
  const busy = !!player.busy || app.adding;
  const list = $("lib-list");
  list.textContent = "";
  for (const entry of entries) {
    const current = !!(player.song && app.current && app.current.entryId === entry.id);
    const bits = [];
    if (entry.duration) bits.push(fmtTime(entry.duration));
    if (entry.kind === "audio") bits.push(tr("audio file"));
    else if (entry.tracks) bits.push(trn(entry.tracks, "{n} track", "{n} tracks"));
    bits.push(fmtSize(entry.size));
    const open = h("button", { type: "button", class: "lib-open" }, h("span", { class: "title", text: entry.title }), h("span", { class: "meta", text: bits.join(" · ") }));
    open.disabled = busy;
    open.addEventListener("click", () => {
      player.unlock();
      openEntry(entry);
    });
    const del = h("button", { type: "button", class: "lib-del", "aria-label": tr("Delete {title}", { title: entry.title }), text: "✕" });
    del.disabled = busy;
    confirmTap(del, () => tr("Delete"), () => deleteEntry(entry));
    list.append(h("li", { class: `lib-item${current ? " current" : ""}` }, open, del));
  }
  $("lib-empty").hidden = !library || entries.length > 0;
  $("lib-foot").hidden = !library || entries.length === 0;
  for (const id of ["add-label", "add-project-label"]) $(id).classList.toggle("disabled", busy);
  $("add-input").disabled = busy;
  $("add-project-input").disabled = busy;
  $("lib-clear").disabled = busy;
  updateUsage(entries);
  updateLibraryHint();
}

let usageRound = 0;
async function updateUsage(entries) {
  if (!library) return;
  const round = ++usageRound;
  const n = entries.length;
  const text = trn(n, "{n} song · {size}", "{n} songs · {size}", { size: fmtSize(library.usage()) });
  $("lib-usage").textContent = text;
  const estimate = await storageEstimate();
  if (round !== usageRound || !estimate || !estimate.quota) return;
  $("lib-usage").textContent = tr("{text} · {size} available", { text, size: fmtSize(Math.max(0, estimate.quota - estimate.usage)) });
}

// A Home Screen app added before version 0.4.5 still runs under the status
// bar (the old "black-translucent" style), where iOS 26 draws its dark fade:
// the system reads that style only when the app is added.
function underStatusBar() {
  if (!ios || !standalone() || !window.matchMedia("(orientation: portrait)").matches) return false;
  return parseFloat(getComputedStyle(document.querySelector(".appbar")).paddingTop) > 12;
}

function updateLibraryHint() {
  let text = "";
  if (library && underStatusBar()) {
    text = tr(
      "To remove the dark band at the top of the screen, delete EUTERIA from the Home Screen and add it again from Safari (Share, then Add to Home Screen): the system reads that setting only when the app is added. The songs of this library are deleted with it: first save the projects you changed (Share project, then Save to Files), then add them again."
    );
  } else if (library && ios && !standalone()) {
    text = tr(
      "Tip: add EUTERIA to the Home Screen (Share, then Add to Home Screen) and open it from there. Safari may delete the data of websites not opened for a while, never that of Home Screen apps. The Home Screen app has a library of its own: add your songs there."
    );
  } else if (library && !ios && app.persisted === false) {
    text = tr("The browser may delete the library if the device runs short of space. Installing EUTERIA (browser menu, Install app or Add to Home screen) protects it.");
  }
  $("lib-hint").textContent = text;
  $("lib-hint").hidden = !text;
}

// ----- files and recent files (computer) --------------------------------------------------

const PICK = {
  audio: { description: () => tr("Audio files"), accept: { "audio/*": AUDIO_EXTENSIONS.map((e) => `.${e}`) }, input: `audio/*,${AUDIO_EXTENSIONS.map((e) => `.${e}`).join(",")}` },
  project: { description: () => tr("EUTERIA projects"), accept: { "application/x-euteria": [".euteria", ".musicproj"] }, input: ".euteria,.musicproj" },
};

// kind: "audio" (Open MP3 / audio) or "project" (Open EUTERIA project).
async function pickFile(kind) {
  player.unlock();
  const pick = PICK[kind];
  if (!("showOpenFilePicker" in window)) {
    const input = $("open-input");
    input.accept = pick.input;
    input.click();
    return;
  }
  let handle;
  try {
    [handle] = await window.showOpenFilePicker({ id: "euteria-songs", multiple: false, types: [{ description: pick.description(), accept: pick.accept }] });
  } catch (error) {
    if (error && error.name !== "AbortError") notice(tr("The file could not be opened. {error}", { error: error.message }), "error");
    return;
  }
  await openHandle(handle);
}

async function openHandle(handle) {
  if (!(await confirmLeave())) return;
  let file;
  try {
    file = await handle.getFile();
  } catch (error) {
    notice(tr("{name} could not be read. {error}", { name: handle.name, error: (error && error.message) || error }), "error");
    return;
  }
  const song = await openSong(file, { source: "file", handle });
  if (song) {
    await addRecent(handle, { title: song.title, size: file.size });
    renderRecent();
  }
}

async function openRecentItem(item) {
  player.unlock();
  if (player.busy || !(await confirmLeave())) return;
  let file;
  try {
    file = await recentFile(item);
    if (!file) return; // permission refused
  } catch (error) {
    if (error && error.name === "NotFoundError") {
      await removeRecent(item.id);
      renderRecent();
      notice(tr("{name} is no longer where it was (moved, renamed or deleted). Open it again from its folder.", { name: item.name }), "error");
    } else notice(tr("{name} could not be opened. {error}", { name: item.name, error: (error && error.message) || error }), "error");
    return;
  }
  const song = await openSong(file, { source: "file", handle: item.handle });
  if (song) {
    await addRecent(item.handle, { title: song.title, size: file.size });
    renderRecent();
  }
}

function recentMeta(item) {
  const plain = item.name.replace(/\.[^.]+$/, "");
  return plain === item.title ? fmtSize(item.size) : `${item.name} · ${fmtSize(item.size)}`;
}

async function renderRecent() {
  if (phone) return;
  if (!recentSupported()) {
    $("recent-list").textContent = "";
    $("recent-empty").textContent = tr("This browser cannot keep the list of the songs opened: open them again from their folder.");
    $("recent-empty").hidden = false;
    return;
  }
  const items = await listRecent();
  const list = $("recent-list");
  list.textContent = "";
  for (const item of items) {
    const open = h("button", { type: "button", class: "open-it" }, h("span", { class: "title", text: item.title || item.name }), h("span", { class: "meta", text: recentMeta(item) }));
    open.addEventListener("click", () => openRecentItem(item));
    const forget = h("button", { type: "button", class: "forget", "aria-label": tr("Remove {name} from the list", { name: item.name }), title: tr("Remove from the list"), text: "✕" });
    forget.addEventListener("click", async () => {
      await removeRecent(item.id);
      renderRecent();
    });
    list.append(h("li", { class: "recent-item" }, open, forget));
  }
  $("recent-empty").textContent = tr("The songs you open are listed here, to open them again with one click.");
  $("recent-empty").hidden = items.length > 0;
}

// ----- drag and drop, files opened with the installed app ----------------------------------

function wireDrop() {
  let depth = 0;
  const hasFiles = (e) => !!e.dataTransfer && [...(e.dataTransfer.types || [])].includes("Files");
  const overlay = (on) => ($("drop").hidden = !on);
  window.addEventListener("dragenter", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth++;
    overlay(true);
  });
  window.addEventListener("dragleave", (e) => {
    if (!hasFiles(e)) return;
    depth = Math.max(0, depth - 1);
    if (!depth) overlay(false);
  });
  window.addEventListener("dragover", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  });
  window.addEventListener("drop", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    overlay(false);
    const item = [...e.dataTransfer.items].find((i) => i.kind === "file");
    // The handle must be asked for during the drop event itself.
    const handle = !phone && item && item.getAsFileSystemHandle ? item.getAsFileSystemHandle().catch(() => null) : Promise.resolve(null);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    player.unlock();
    if (phone) addSong(file);
    else openDropped(file, handle);
  });
}

async function openDropped(file, handlePromise) {
  let handle = await handlePromise;
  if (handle && handle.kind !== "file") handle = null;
  if (!(await confirmLeave())) return;
  const song = await openSong(file, { source: "file", handle });
  if (song && handle) {
    await addRecent(handle, { title: song.title, size: file.size });
    renderRecent();
  }
}

function wireLaunchQueue() {
  if (!("launchQueue" in window) || !window.launchQueue) return;
  window.launchQueue.setConsumer(async (params) => {
    const handle = params && params.files && params.files[0];
    if (!handle || handle.kind !== "file") return;
    if (phone) addSong(await handle.getFile());
    else openHandle(handle);
  });
}

// ----- the player -------------------------------------------------------------------------

function buildControls() {
  const f = app.fields;
  f.tempo = numberField({ label: tr("Tempo"), min: 50, max: 200, step: 5, unit: "%", onChange: (v) => player.setRate(v / 100) });
  if (!phone) {
    f.tempoSlider = h("input", { type: "range", min: "50", max: "200", step: "1", value: "100", "aria-label": tr("Tempo") });
    f.tempoSlider.addEventListener("input", () => player.setRate(+f.tempoSlider.value / 100));
    f.tempoSlider.addEventListener("dblclick", () => player.setRate(1));
    $("tempo-box").append(f.tempoSlider);
  }
  $("tempo-box").append(f.tempo.el);
  f.key = keyField({ label: tr("Key"), min: KEY_RANGE[0], max: KEY_RANGE[1], onChange: (v) => player.setSemitones(v) });
  $("key-box").append(f.key.el);
  // The playhead, to the hundredth of a second: it follows the yellow line,
  // and typing a time or − and + (a hundredth) move the line.
  f.position = numberField({
    label: tr("Playhead"),
    min: 0,
    max: 0,
    step: 0.01,
    decimals: 2,
    inputMode: "decimal",
    format: (v) => fmtTime(v, 2),
    parse: parseTime,
    className: "time",
    onChange: (v) => {
      player.seek(v);
      revealPlayhead();
    },
  });
  $("position-box").append(f.position.el);
  // The cards of the tracks, dragged by their grip to another place; the
  // bar at the top of the screen stays in view.
  sortable(phone ? $("tracks") : $("tl-rows"), {
    grip: ".grip",
    onMove: moveTrack,
    top: () => Math.max(0, document.querySelector(".appbar").getBoundingClientRect().bottom),
  });
  app.timeline = new Timeline($("timeline"), {
    compact: phone,
    varsOn: $("tl-wrap"),
    onSeek: (t) => {
      app.scrub = null;
      player.seek(t);
    },
    // A finger dragging the playhead: paused, it moves at once; playing,
    // the song jumps there when the finger lifts.
    onScrub: (t) => {
      if (player.playing) app.scrub = t;
      else player.seek(t);
      scheduleUi();
    },
    onLoop: (lp) => player.setLoop({ on: true, start: lp.start, end: lp.end }),
    onView: settingsChanged,
    onChange: updateZoom,
    onSelect: (sel, info) => editor.onSelect(sel, info),
  });
  separation = new SeparationFlow({
    app,
    player,
    phone,
    notice,
    practiceState,
    refreshPage: scheduleUi,
    takes: () => recording.forNewProject(),
    openFile: async (file, handle) => {
      const song = await openSong(file, { source: "file", handle, separated: true });
      if (song) {
        await addRecent(handle, { title: song.title, size: file.size });
        renderRecent();
      }
      return song;
    },
  });
  editor = new Editor({
    app,
    player,
    phone,
    timeline: app.timeline,
    changed: settingsChanged,
    refreshPage: scheduleUi,
  });
  recording = new RecordingFlow({
    app,
    player,
    phone,
    notice,
    refreshPage: scheduleUi,
    takesChanged: () => {
      renderPlayer(app.timeline.getView());
      rememberSettings();
    },
    liveRow: { color: WAVE_COLORS.take, height: phone ? LIVE_LANE : TAKE_ROW },
  });
  if (phone) {
    // The transport joins the app bar: one banner at the top, always in view.
    document.querySelector(".appbar").append($("transport"));
    // Under the timeline: the playhead and the loop; at the bottom of the
    // card, Bars and Chords (the editor), whose tools open under it (the
    // chord of the bars selected, then the grid).
    $("tl-wrap").after($("loop-controls"));
    $("tl-hint").after($("edit-bar"));
    $("edit-bar").after($("chord-edit"), $("grid-edit"));
  } else {
    // On a computer the tracks are the rows of the timeline. Over it, in a row
    // of its own, Bars and Chords (the editor); at the top of the column of
    // the tracks, beside the time scale, All stems and Original only.
    $("tl-side").prepend($("quick"));
    $("tl-hint").before($("tracks-note"));
  }
}

// The names of the fields above, in the language in use.
function relabelControls() {
  const f = app.fields;
  f.tempo.relabel(tr("Tempo"));
  if (f.tempoSlider) f.tempoSlider.setAttribute("aria-label", tr("Tempo"));
  f.key.relabel(tr("Key"));
  f.position.relabel(tr("Playhead"));
}

function updateZoom() {
  const t = app.timeline;
  $("zoom-level").textContent = `${Math.round(t.zoom * 100)}%`;
  $("zoom-out").disabled = !player.song || t.zoom <= 1.0001;
  $("zoom-in").disabled = !player.song || t.zoom >= t.zoomMax - 0.0001;
  $("zoom-level").disabled = !player.song;
}

function waveRows() {
  if (phone) {
    const t = player.tracks.find((x) => x.peaks) || player.tracks[0];
    return t ? [{ key: t.key, color: WAVE_COLORS.original, peaks: t.peaks, on: true }] : [];
  }
  let stem = 0;
  const sr = player.context ? player.context.sampleRate : 48000;
  return player.tracks.map((t) => ({
    key: t.key,
    color: t.take ? WAVE_COLORS.take : STEM_NAMES.includes(t.key) ? WAVE_COLORS.stems[stem++ % 2] : WAVE_COLORS.original,
    peaks: t.peaks,
    on: t.on,
    offset: t.take ? t.start / sr : 0,
    height: t.take ? TAKE_ROW : null,
  }));
}

// Python's toggle_loop(): a loop switched on appears where the user is
// looking. Here it starts at the bar being played if the playhead is in
// view, else in the middle of the view; it lasts 16 seconds, or as long as
// the loop it replaces, in whole bars when the song has a grid.
function loopInView() {
  const d = player.song.duration;
  const [v0, v1] = app.timeline.visibleRange();
  const span = Math.max(0.5, v1 - v0);
  let { start, end } = player.loop;
  const valid = end - start >= MIN_LOOP;
  if (valid && start >= v0 - 1e-6 && end <= v1 + 1e-6) return { start, end };
  let width = clamp(valid ? end - start : DEFAULT_LOOP_SECONDS, 0.5, Math.max(0.5, span * 0.5));
  const p = player.position;
  start = p >= v0 && p <= v1 ? p : (v0 + v1) / 2 - width / 2;
  start = clamp(start, 0, Math.max(0, d - width));
  const bars = app.grid.bars;
  if (bars.length > 1) {
    const barLen = (bars[bars.length - 1] - bars[0]) / (bars.length - 1);
    let i = 0;
    while (i + 1 < bars.length && bars[i + 1] <= start + 1e-6) i++;
    const n = Math.max(1, Math.round(width / barLen));
    const j = Math.min(bars.length - 1, i + n);
    return { start: bars[i], end: j > i ? bars[j] : Math.min(d, bars[i] + barLen) };
  }
  return { start, end: Math.min(d, start + width) };
}

function toggleLoop() {
  if (!player.song) return;
  if (player.loop.on) player.setLoop({ ...player.loop, on: false });
  else player.setLoop({ on: true, ...loopInView() });
}

// Set start moves the start of the loop to the playhead; Set end moves its
// end there and switches the loop on: start, then end, and the loop plays.
function setLoopStartHere() {
  if (player.song) player.setLoopStart(player.position);
}

function setLoopEndHere() {
  if (!player.song) return;
  player.setLoopEnd(player.position);
  if (!player.loop.on) player.setLoop({ ...player.loop, on: true });
}

// After a jump made with a button or a key, the timeline shows the playhead.
function revealPlayhead() {
  if (player.song) app.timeline.reveal(player.position);
}

function trackRow(t) {
  const key = t.key;
  const title = tr(t.title); // a stem's name in the language in use; a take's as it is
  const toggle = h(
    "button",
    { type: "button", class: "toggle", "aria-pressed": "false" },
    h("span", { class: "dot", "aria-hidden": "true" }),
    h("span", { class: "name", text: title })
  );
  toggle.addEventListener("click", () => {
    const track = player.track(key);
    if (track) player.setTrackOn(key, !track.on);
  });
  const volume = numberField({ label: tr("{title} volume", { title }), min: 0, max: 200, step: 5, unit: "%", onChange: (v) => player.setTrackGain(key, sliderToGain(v)) });
  // The grip: dragged, or the arrow keys on it, to put the track elsewhere.
  const grip = h(
    "button",
    { type: "button", class: "grip", title: tr("Drag to move the track (or ↑ ↓)"), "aria-label": tr("Move {title}: drag it, or press the up or down arrow", { title }) },
    icon("grip")
  );
  const parts = [grip, toggle];
  let slider = null;
  let del = null;
  let sync = null;
  if (t.take) {
    // A take: ✕ deletes it (a second tap confirms), Sync moves it in time.
    // On the phone ✕ comes between the grip and the name, on a computer after the name.
    del = h("button", { type: "button", class: "take-del", title: tr("Delete {title}", { title }), "aria-label": tr("Delete {title}", { title }), text: "✕" });
    confirmTap(del, () => tr("Delete"), () => recording.deleteTake(key));
    if (phone) parts.splice(1, 0, del);
    else parts.push(del);
  }
  if (!phone) {
    slider = h("input", { type: "range", min: "0", max: "200", step: "1", "aria-label": tr("{title} volume", { title }) });
    slider.addEventListener("input", () => player.setTrackGain(key, sliderToGain(+slider.value)));
    slider.addEventListener("dblclick", () => player.setTrackGain(key, 1));
    parts.push(slider);
  }
  parts.push(volume.el);
  if (t.take) {
    sync = numberField({
      label: tr("{title} sync", { title }),
      min: -1000,
      max: 1000,
      step: 5,
      unit: "ms",
      inputMode: "text",
      format: fmtSigned,
      className: "sync",
      onChange: (v) => recording.setSync(key, v),
    });
    sync.el.title = tr("Sync: moves the take earlier (−) or later (+), in milliseconds, to put it in time with the song. The next takes from the same input get the same Sync.");
    parts.push(h("div", { class: "sync-row" }, h("span", { class: "mini-label", text: "Sync" }), sync.el));
  }
  return { key, el: h("div", { class: `track${t.take ? " take" : ""}` }, ...parts), grip, toggle, volume, slider, del, sync };
}

// A track dragged to another place (or moved with the arrow keys on its
// grip): the cards and the rows of the timeline are drawn again in the new
// order, kept with the song's settings and written in its file by Save.
function moveTrack(from, to, byKey) {
  const t = player.tracks[from];
  if (!t || !player.moveTrack(t.key, to)) return;
  renderPlayer(app.timeline.getView());
  if (byKey) {
    const row = app.rows.find((r) => r.key === t.key);
    if (row) row.grip.focus();
  }
}

function showSongMeta() {
  const song = player.song;
  const n = player.tracks.length;
  $("song-meta").textContent = song ? `${song.kind === "audio" ? tr("Audio file") : trn(n, "{n} track", "{n} tracks")} · ${fmtTime(song.duration)}` : "";
}

function renderPlayer(view = null) {
  const song = player.song;
  const box = phone ? $("tracks") : $("tl-rows");
  box.textContent = "";
  app.rows = [];
  renderExports(); // the exports of this song
  $("song-title").textContent = song ? song.title : "";
  $("song-title").title = song ? song.title : ""; // in full, should it be cut short
  if (!song) {
    $("song-meta").textContent = "";
    app.timeline.setSong({ duration: 0, sampleRate: 48000, rows: [], grid: emptyGrid() });
    updateZoom();
    scheduleUi();
    return;
  }
  showSongMeta();
  for (const t of player.tracks) {
    const row = trackRow(t);
    app.rows.push(row);
    box.append(row.el);
  }
  $("quick").hidden = !player.hasStems;
  $("tracks-note").hidden = player.hasStems;
  app.fields.position.setRange(0, song.duration);
  app.timeline.setSong({ duration: song.duration, sampleRate: song.sampleRate, rows: waveRows(), grid: app.grid, gridVisible: app.gridVisible, view });
  app.timeline.setLoop(player.loop);
  app.timeline.setPosition(player.position, player.playing);
  if (recording) recording.drawLive(); // a take being recorded: its card again beside its row
  updateZoom();
  updateUi();
}

// ----- export -------------------------------------------------------------------------------

async function exportMp3() {
  if (!player.song || player.busy) return;
  setExportStatus(tr("Measuring the level…"));
  try {
    const r = await player.exportMp3((p) => {
      const pct = Math.round(p.fraction * 100);
      setExportStatus(p.phase === "measure" ? tr("Measuring the level… {pct}%", { pct }) : tr("Encoding… {pct}%", { pct }));
    });
    for (const e of songExports()) e.selected = false; // the new one is the selection
    const owner = app.current ? app.current.owner : null;
    app.exports.unshift({ id: Date.now(), owner, file: r.file, url: URL.createObjectURL(r.file), name: r.name, seconds: r.seconds, tempo: r.tempo, key: r.key, selected: true });
    while (app.exports.length > MAX_EXPORTS) URL.revokeObjectURL(app.exports.pop().url);
    setExportStatus(() => {
      const lowered = r.reductionDb >= 0.1 ? ` · ${tr("lowered {db} dB to avoid clipping", { db: r.reductionDb.toFixed(1) })}` : "";
      const full = r.fullOn ? ` · ${tr("Original Track not included")}` : "";
      return `${tr("Ready: {name}", { name: r.name })}\n${fmtTime(r.seconds)} · ${fmtSize(r.file.size)}${lowered}${full}`;
    }, "ok");
    app.exportShown = app.exports[0].id;
    renderExports();
    countEvent("mp3-exported");
  } catch (error) {
    setExportStatus(error.notice ? error.message : tr("The export failed: {error}", { error: (error && error.message) || error }), "error");
  }
  if (player.lost.length) {
    const names = player.lost.map((k) => (TRACK_TITLES[k] ? tr(TRACK_TITLES[k]) : k)).join(", ");
    notice(
      trn(
        player.lost.length,
        "{names}: lost after the failed export. Open the song again to get it back.",
        "{names}: lost after the failed export. Open the song again to get them back.",
        { names }
      ),
      "error"
    );
  }
}

const EXPORT_HINT = () =>
  tr("The stems and the takes that are on, as they sound now (volumes, tempo, key). The MP3 files of this song stay here until EUTERIA closes: they are not saved in the project.");
// The exports of the song open: each export belongs to the song it was made from.
const songExports = () => app.exports.filter((e) => !!app.current && e.owner === app.current.owner);
const selectedExports = () => songExports().filter((e) => e.selected);

function canShareFiles(files) {
  try {
    return !!(navigator.canShare && navigator.canShare({ files }));
  } catch (_) {
    return false;
  }
}

function renderExports() {
  const box = $("exports");
  box.textContent = "";
  for (const e of songExports()) {
    const tick = h("input", { type: "checkbox", "aria-label": tr("Select {name}", { name: e.name }) });
    tick.checked = e.selected;
    tick.addEventListener("change", () => {
      e.selected = tick.checked;
      updateExportActions();
    });
    const meta = `${fmtTime(e.seconds)} · ${fmtSize(e.file.size)} · ${tr("tempo {tempo}%", { tempo: e.tempo })} · ${tr("key {key}", { key: `${e.key > 0 ? "+" : ""}${e.key}` })}`;
    const del = h("button", { type: "button", class: "export-del", title: tr("Delete"), "aria-label": tr("Delete {title}", { title: e.name }), text: "✕" });
    del.addEventListener("click", () => deleteExports([e]));
    box.append(
      h("div", { class: "export-item" }, h("label", { class: "export-pick" }, tick, h("span", { class: "name", text: e.name }), h("span", { class: "meta", text: meta })), del)
    );
  }
  updateExportActions();
}

// The exports live in memory only (never in the song's file, nor on the
// device): deleting one frees its memory at once. They go with their song
// when it is deleted from the library.
function deleteExports(list) {
  for (const e of list) URL.revokeObjectURL(e.url);
  app.exports = app.exports.filter((e) => !list.includes(e));
  if (list.some((e) => e.id === app.exportShown)) {
    app.exportShown = null;
    setExportStatus("");
  }
  renderExports();
}

function updateExportActions() {
  const shown = songExports();
  const chosen = shown.filter((e) => e.selected);
  const count = shown.length;
  $("exports-head").hidden = !count;
  if (count) {
    const size = shown.reduce((sum, e) => sum + e.file.size, 0);
    $("exports-count").textContent = trn(count, "{n} file · {size}", "{n} files · {size}", { size: fmtSize(size) });
  }
  $("export-actions").hidden = !count;
  const n = chosen.length;
  $("download").disabled = !n;
  $("download").textContent = n > 1 ? tr("Download {n} files", { n }) : tr("Download");
  const share = $("share");
  share.hidden = !canShareFiles(n ? chosen.map((e) => e.file) : [new File([new Uint8Array(4)], "x.mp3", { type: "audio/mpeg" })]);
  share.disabled = !n;
  share.textContent = n > 1 ? tr("Share {n} files…", { n }) : tr("Share…");
  $("download").classList.toggle("primary", share.hidden);
}

// One file after the other, each as its own download.
async function downloadSelected() {
  const chosen = selectedExports();
  for (let i = 0; i < chosen.length; i++) {
    const a = h("a", { href: chosen[i].url, download: chosen[i].name });
    document.body.append(a);
    a.click();
    a.remove();
    if (i < chosen.length - 1) await new Promise((r) => setTimeout(r, 600));
  }
}

async function shareSelected() {
  const files = selectedExports().map((e) => e.file);
  if (!files.length) return;
  try {
    await navigator.share({ files, title: files.length === 1 ? files[0].name : tr("{n} files from EUTERIA", { n: files.length }) });
  } catch (error) {
    if (!error || error.name !== "AbortError") setExportStatus(tr("Sharing failed: {error}", { error: (error && error.message) || error }), "error");
  }
}

// ----- saving the song ------------------------------------------------------------------------
//
// The edits (grid, chords) and the practice settings go into the song's
// manifest.json. A song of the library (phone) is updated in place; on a
// computer Chrome and Edge write the file itself, the other browsers download
// a copy. An audio file becomes an EUTERIA project (.euteria) holding it.

function practiceState() {
  return {
    rate: player.rate,
    semitones: player.semitones,
    loop: player.loop,
    gridVisible: app.gridVisible,
    tracks: player.tracks.map((t) => ({ key: t.key, on: t.on, gain: t.gain })),
  };
}

// How Save works for the open song: "library" (the song in the app is
// updated), "file" (the file itself), "new-file" (an audio file saved as a
// project where the user chooses), "copy" (a download).
function saveMode() {
  const cur = app.current;
  if (!cur || !player.song) return null;
  if (cur.source === "library") return "library";
  if (player.song.kind === "audio") return "showSaveFilePicker" in window ? "new-file" : "copy";
  return cur.handle && typeof cur.handle.createWritable === "function" ? "file" : "copy";
}

let shareSheet = null;
// How Share project works: "share" (the share sheet takes project files:
// Safari, and every browser on iPhone and iPad, Safari underneath),
// "download" (a smartphone whose browser cannot share them: Chrome, Edge and
// the other Chromium browsers answer yes to canShare() for any file, then
// refuse to share anything but images, audio, video, PDF and text),
// "explain" (a computer: the project file saved is shared with the app
// wanted).
function shareMode() {
  if (!phone) return "explain";
  if (shareSheet === null) {
    let can = false;
    try {
      can = !!(navigator.canShare && navigator.canShare({ files: [new File([new Uint8Array(4)], "song.euteria", { type: "application/zip" })] }));
    } catch (_) {}
    const chromium = !ios && (!!navigator.userAgentData || /\b(Chrome|Chromium|Edg|EdgA|OPR|SamsungBrowser)\//.test(ua));
    shareSheet = can && !chromium;
  }
  return shareSheet ? "share" : "download";
}

// What Save does for the open song, said in its tooltip.
function saveTitle() {
  const mode = saveMode();
  const audio = !!player.song && player.song.kind === "audio";
  const what = {
    library: audio ? tr("Save the song as an EUTERIA project, in the library") : tr("Save the changes in the song"),
    file: app.current ? tr("Save the changes in {name}", { name: app.current.name }) : tr("Save the changes in the file"),
    "new-file": tr("Save the song as an EUTERIA project (.euteria): you choose where"),
    copy: audio ? tr("This browser cannot write files: download the song as an EUTERIA project") : tr("This browser cannot write the file: download a copy with the changes"),
  }[mode];
  return what ? `${what} (${/Mac/.test(navigator.platform || "") ? "⌘S" : "Ctrl+S"})` : tr("Save");
}

// Messages of Save and Share project: at the top, and in the card.
function reportSave(text, kind = "", ms = 6000) {
  notice(text, kind, ms);
  app.projectMessage = { text, kind, until: ms ? performance.now() + ms : Infinity };
  scheduleUi();
  if (ms) setTimeout(scheduleUi, ms + 50);
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = h("a", { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}

async function writePermission(handle) {
  try {
    if ((await handle.queryPermission({ mode: "readwrite" })) === "granted") return true;
    return (await handle.requestPermission({ mode: "readwrite" })) === "granted";
  } catch (_) {
    return false;
  }
}

// The file as written: its manifest must read back.
async function checkSaved(file, id) {
  const m = JSON.parse(await (await openZip(file)).text("manifest.json"));
  if (m.project_id !== id) throw new Error(tr("the file read back is not the one written"));
}

// The song is now `file` (saved in place): its settings follow it.
function savedInPlace(file, manifest) {
  const cur = app.current;
  const oldKey = cur.key;
  const oldOwner = cur.owner;
  player.song.manifest = manifest;
  player.song.kind = "project";
  cur.file = file;
  cur.name = file.name;
  cur.key = settingsKey(player.song, file);
  // An audio file saved as a project keeps its exports.
  cur.owner = songOwner();
  for (const e of app.exports) if (e.owner === oldOwner) e.owner = cur.owner;
  prepareSoon();
  editor.saved(true);
  recording.saved(true);
  rememberSettings();
  if (cur.source === "library") {
    if (cur.key !== oldKey) forgetSettings(oldKey);
    library.update(cur.entryId, { settingsKey: cur.key, kind: "project" });
    renderLibrary();
  }
  showSongMeta();
}

// Resolves with how it was saved ("library", "file", "new-file", "copy"),
// or false. quiet: no message when it worked. made: the project just shared
// (projectNow()), saved as it is.
async function saveSong({ quiet = false, made = null } = {}) {
  const song = player.song;
  const cur = app.current;
  if (!song || !cur || player.busy || app.saving) return false;
  if (recording.busy) {
    notice(recording.recording ? tr("Stop recording first, then save.") : tr("Wait a moment: the take is being prepared."), "", 4000);
    return false;
  }
  editor.commitInput();
  const say = (text, kind) => quiet || reportSave(text, kind);
  let mode = saveMode();
  let target = null;
  // What needs the click comes first: the permission to write, the place.
  if (mode === "file" && !(await writePermission(cur.handle))) {
    mode = "copy";
    reportSave(tr("EUTERIA may not write the file: a copy is downloaded instead."));
  }
  if (mode === "new-file") {
    try {
      target = await window.showSaveFilePicker({
        id: "euteria-songs",
        suggestedName: `${safeName(song.title)}.euteria`,
        types: [{ description: tr("EUTERIA project"), accept: { "application/x-euteria": [".euteria"] } }],
      });
    } catch (error) {
      if (error && error.name === "AbortError") return false;
      mode = "copy";
    }
  }
  app.saving = true;
  scheduleUi();
  try {
    await recording.ready(); // the takes recorded, as MP3
    const file = cur.file;
    const takes = recording.takes;
    if (isAudioSong(song)) {
      // An audio file: a new project around it (and its takes).
      const member = audioMember(file);
      const manifest = made
        ? made.manifest
        : newProjectManifest({ id: newProjectId(), title: song.title, fileName: file.name, member, grid: app.grid, state: practiceState(), takes });
      const id = manifest.project_id;
      const blob = made ? made.blob : await buildProject([
        { name: "manifest.json", data: manifestBytes(manifest) },
        { name: member, data: file, crc: cur.ready && cur.ready.file === file ? cur.ready.crc : null },
        ...recording.membersToAdd(),
      ]);
      const name = `${safeName(song.title)}.euteria`;
      if (mode === "library") {
        const entry = library.get(cur.entryId);
        await library.replace(entry, blob, name, "project");
        const saved = await library.file(library.get(cur.entryId));
        await checkSaved(saved, id);
        savedInPlace(saved, manifest);
        say(tr("Saved: the song is now an EUTERIA project, with its bars and chords."), "ok");
        return mode;
      } else if (mode === "new-file") {
        const w = await target.createWritable();
        try {
          await w.write(blob);
          await w.close();
        } catch (error) {
          await w.abort().catch(() => {});
          throw error;
        }
        const saved = await target.getFile();
        await checkSaved(saved, id);
        cur.handle = target;
        cur.source = "file";
        savedInPlace(saved, manifest);
        await addRecent(target, { title: song.title, size: saved.size });
        renderRecent();
        say(tr("Saved in {name}.", { name: saved.name }), "ok");
        return mode;
      }
      downloadBlob(blob, name);
      editor.saved(false);
      recording.saved(false);
      rememberSettings();
      say(tr("Downloaded: {name}.", { name }), "ok");
      return "copy";
    }
    // A project: its manifest.json rewritten; the whole file written again
    // if takes were recorded or deleted.
    const manifest = made ? made.manifest : savedManifest(song.manifest, app.grid, practiceState(), takes);
    const bytes = manifestBytes(manifest);
    const zip = await openZip(file);
    if (recording.rewrite) {
      const blob = made ? made.blob : composeEdited(file, await zipLayout(zip), { manifestBytes: bytes, drop: recording.dropMembers, add: recording.membersToAdd() });
      if (mode === "library") {
        const entry = library.get(cur.entryId);
        await library.replace(entry, blob, entry.name, "project");
        const saved = await library.file(library.get(cur.entryId));
        await checkSaved(saved, manifest.project_id);
        savedInPlace(saved, manifest);
        say(tr("Saved."), "ok");
      } else if (mode === "file") {
        const w = await cur.handle.createWritable();
        try {
          await w.write(blob);
          await w.close();
        } catch (error) {
          await w.abort().catch(() => {});
          throw error;
        }
        const saved = await cur.handle.getFile();
        await checkSaved(saved, manifest.project_id);
        savedInPlace(saved, manifest);
        await addRecent(cur.handle, { title: song.title, size: saved.size });
        renderRecent();
        say(tr("Saved in {name}.", { name: saved.name }), "ok");
      } else {
        downloadBlob(blob, cur.name);
        editor.saved(false);
        recording.saved(false);
        rememberSettings();
        say(tr("Downloaded a copy with the changes: {name}.", { name: cur.name }), "ok");
      }
      return mode;
    }
    if (mode === "library") {
      const entry = library.get(cur.entryId);
      const { at, bytes: tail } = await manifestPatch(zip, bytes);
      await library.patch(entry, at, tail);
      const saved = await library.file(library.get(cur.entryId));
      await checkSaved(saved, manifest.project_id);
      savedInPlace(saved, manifest);
      say(tr("Saved."), "ok");
    } else if (mode === "file") {
      const { at, bytes: tail } = await manifestPatch(zip, bytes);
      const w = await cur.handle.createWritable({ keepExistingData: true });
      try {
        await w.truncate(at);
        await w.write({ type: "write", position: at, data: tail });
        await w.close();
      } catch (error) {
        await w.abort().catch(() => {});
        throw error;
      }
      const saved = await cur.handle.getFile();
      await checkSaved(saved, manifest.project_id);
      savedInPlace(saved, manifest);
      await addRecent(cur.handle, { title: song.title, size: saved.size });
      renderRecent();
      say(tr("Saved in {name}.", { name: saved.name }), "ok");
    } else {
      downloadBlob(composeEdited(file, await zipLayout(zip), { manifestBytes: bytes }), cur.name);
      editor.saved(false);
      recording.saved(false);
      rememberSettings();
      say(tr("Downloaded a copy with the changes: {name}.", { name: cur.name }), "ok");
    }
    return mode;
  } catch (error) {
    const changed = error && error.name === "NotReadableError";
    reportSave(
      changed
        ? tr("The song could not be saved: its file changed since it was opened. Open it again (the edits are kept).")
        : tr("The song could not be saved. {error}", { error: (error && error.message) || error }),
      "error",
      0
    );
    return false;
  } finally {
    app.saving = false;
    scheduleUi();
  }
}

// ----- sharing the project ---------------------------------------------------------------------
//
// Share project sends the song's file as it is now (bars, chords, practice
// settings) with the share sheet: email, WhatsApp, Files, AirDrop. Safari
// opens the share sheet only while the tap is being handled, so the file is
// put together at once, from slices of the song's file (src/zipwrite.js),
// with what that needs read beforehand, when the song opens or is saved:
// where the members of a project lie, the CRC-32 of an audio file. A song of
// the library is saved after. Where the browser cannot share project files
// (Chrome, Edge), a phone downloads the project, a computer saves it in its
// file and says to attach that.

const audioMember = (file) => {
  const ext = extensionOf(file.name);
  return `audio/original.${AUDIO_EXTENSIONS.includes(ext) ? ext : "audio"}`;
};
const isAudioSong = (song) => song.kind === "audio" || !song.manifest;

// Reads what projectNow() needs from the song's file as it is now.
async function prepareShare() {
  const cur = app.current;
  const song = player.song;
  if (!cur || !song) return null;
  const file = cur.file;
  if (cur.ready && cur.ready.file === file) return cur.ready;
  if (cur.preparing && cur.preparing.file === file) return cur.preparing.promise;
  const audio = isAudioSong(song);
  const promise = (async () => {
    // An audio file is read 1 MB at a time, the page kept responsive.
    const ready = audio ? { file, crc: await crc32Blob(file, 1 << 20) } : { file, layout: await zipLayout(await openZip(file)) };
    if (cur.file === file) cur.ready = ready;
    return ready;
  })().catch(() => null);
  cur.preparing = { file, promise };
  const ready = await promise;
  if (cur.preparing && cur.preparing.promise === promise) cur.preparing = null;
  return ready;
}

// After the song opens or is saved, where the share sheet takes projects;
// elsewhere what is needed is read when needed.
function prepareSoon() {
  const cur = app.current;
  const song = player.song;
  if (!cur || !song || shareMode() !== "share") return;
  setTimeout(() => app.current === cur && prepareShare(), isAudioSong(song) ? 300 : 0);
}

// The project as it is now, put together at once: {file, manifest, blob},
// or null while prepareShare() has not read what it needs, or a take is
// still being encoded.
function projectNow() {
  const song = player.song;
  const cur = app.current;
  const ready = cur && cur.ready;
  if (!song || !ready || ready.file !== cur.file || recording.busy) return null;
  const add = recording.membersToAdd();
  if (!add) return null;
  const takes = recording.takes;
  if (isAudioSong(song)) {
    if (ready.crc == null) return null;
    const member = audioMember(cur.file);
    const manifest = newProjectManifest({ id: newProjectId(), title: song.title, fileName: cur.file.name, member, grid: app.grid, state: practiceState(), takes });
    const blob = composeProject([
      { name: "manifest.json", data: manifestBytes(manifest) },
      { name: member, data: cur.file, crc: ready.crc },
      ...add,
    ]);
    return { manifest, blob, file: new File([blob], `${safeName(song.title)}.euteria`, { type: "application/zip" }) };
  }
  if (!ready.layout) return null;
  const manifest = savedManifest(song.manifest, app.grid, practiceState(), takes);
  const blob = composeEdited(cur.file, ready.layout, { manifestBytes: manifestBytes(manifest), drop: recording.dropMembers, add });
  return { manifest, blob, file: new File([blob], cur.name, { type: "application/zip" }) };
}

// The same, waiting for what it needs.
async function projectFile() {
  await prepareShare();
  await recording.ready();
  const made = projectNow();
  if (!made) throw new Error(tr("Its file could not be read: open the song again."));
  return made.file;
}

function shareProject() {
  const song = player.song;
  const cur = app.current;
  if (!song || !cur || app.saving || app.sharing || player.busy || recording.busy) return;
  editor.commitInput();
  const mode = shareMode();
  if (mode === "explain") {
    explainSharing();
    return;
  }
  if (mode === "download") {
    downloadProject();
    return;
  }
  let made = null;
  try {
    made = projectNow();
  } catch (_) {}
  if (made) sendProject(made); // the share sheet opens during this tap
  else sendWhenReady();
}

// The share sheet, then the song of the library saved. The share sheet
// copies the file as it opens: should it stay open long (or never answer,
// as on older iPhones), the song is saved all the same after a while. late:
// the tap may no longer count (Safari then asks for another one).
const SHARE_SAVE_MS = 15000;
async function sendProject(made, late = false) {
  const cur = app.current;
  const inLibrary = cur.source === "library" && !!library;
  app.sharing = true;
  scheduleUi();
  let settled = false;
  const shared = navigator.share({ files: [made.file], title: player.song.title }).then(
    () => ((settled = true), null),
    (e) => ((settled = true), e || new Error("unknown error"))
  );
  let error = await Promise.race([shared, new Promise((r) => setTimeout(() => r(null), SHARE_SAVE_MS))]);
  app.sharing = false;
  if (late && settled && error && error.name === "NotAllowedError") {
    scheduleUi();
    reportSave(tr("The project is ready: tap Share project again to send it."));
    return;
  }
  // Refused although asked during the tap: a browser that cannot share
  // project files (as Chrome, should one pass for another): Download project.
  const refused = !late && !ios && !!error && error.name === "NotAllowedError";
  if (refused) shareSheet = false;
  scheduleUi();
  let saved = false;
  if (inLibrary && app.current === cur) {
    saved = !!(await saveSong({ quiet: true, made }));
    if (!saved) return; // saveSong says why
    if (!settled) reportSave(tr("Saved."), "ok"); // the share sheet still open
  }
  if (!settled) error = await shared;
  reportShare(error, saved, refused);
}

function reportShare(error, saved, refused = false) {
  const again = !refused && !!error && error.name === "NotAllowedError"; // the tap no longer counted
  const failed = !!error && !again && error.name !== "AbortError"; // AbortError: closed without sending
  const shared = !error && !refused;
  let text = refused
    ? tr("This browser cannot share project files: Download project saves the song's file instead.")
    : again
      ? tr("Tap Share project again to send it.")
      : failed
        ? tr("The project could not be shared. {error}", { error: error.message || error })
        : error
          ? ""
          : tr("Shared.");
  if (saved) text = shared ? tr("Saved and shared.") : tr("Saved. {text}", { text }).trim();
  if (text) reportSave(text, failed ? "error" : again ? "" : "ok", failed ? 0 : 6000);
  if (shared) countEvent("project-shared");
}

// Tapped before the song's file was read (just opened): read it, then try.
async function sendWhenReady() {
  app.sharing = true;
  scheduleUi();
  let made = null;
  let why = tr("its file could not be read. Open the song again.");
  try {
    await prepareShare();
    try {
      await recording.ready();
    } catch (error) {
      why = error.message;
      throw error;
    }
    made = projectNow();
  } catch (_) {}
  app.sharing = false;
  scheduleUi();
  if (!made) {
    reportSave(tr("The project could not be put together: {why}", { why }), "error", 0);
    return;
  }
  sendProject(made, true);
}

// A phone whose browser cannot share project files: the project downloaded.
async function downloadProject() {
  const cur = app.current;
  try {
    if (cur.source === "library" && library) {
      if (!(await saveSong({ quiet: true }))) return;
      const entry = library.get(cur.entryId);
      if (!entry) return;
      downloadBlob(new File([await library.file(entry)], entry.name, { type: "application/zip" }), entry.name);
      reportSave(tr("Saved and downloaded: {name}.", { name: entry.name }), "ok");
      countEvent("project-downloaded");
      return;
    }
    const file = await projectFile();
    downloadBlob(file, file.name);
    reportSave(tr("Downloaded: {name}.", { name: file.name }), "ok");
    countEvent("project-downloaded");
  } catch (error) {
    reportSave(tr("The project could not be downloaded. {error}", { error: (error && error.message) || error }), "error", 0);
  }
}

// A computer: Share project is for smartphones; here the project file saved
// is shared with the app wanted.
function explainSharing() {
  const song = player.song;
  let text;
  if (isAudioSong(song)) {
    text = tr(
      "Share project works on smartphones. On a computer, save the song with Save, at the top right (it becomes an EUTERIA project, .euteria), then share that file with the app you want: email, WhatsApp and so on."
    );
  } else {
    text = tr("Share project works on smartphones. On a computer, share the project file you saved ({name}) with the app you want: email, WhatsApp and so on.", { name: app.current.name });
    if (songDirty()) {
      text += ` ${recording.dirty ? tr("Save first, at the top right: the changes are not in the file yet.") : tr("Save first, at the top right: the changes to the bars and chords are not in the file yet.")}`;
    }
  }
  reportSave(text, "", 15000);
}

// ----- the version, updating the app -----------------------------------------------------------
//
// The Update button looks for a new version (version.js, fetched again from
// the site) and switches to it at once: the service worker is renewed, then
// the page loads again. The edits and the settings of the open song are kept.

let lastCheck = 0;

async function latestVersion() {
  const response = await fetch("version.js", { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const m = /EUTERIA_VERSION\s*=\s*"([^"]+)"/.exec(await response.text());
  if (!m) throw new Error("no version in version.js");
  return m[1];
}

let shownLatest = null; // the newest version found, as the Update button says
function showUpdate(latest) {
  shownLatest = latest;
  const b = $("update");
  const newer = !!latest && latest !== VERSION;
  b.classList.toggle("available", newer);
  b.title = newer
    ? tr("Version {latest} is available: update now (this is {version})", { latest, version: VERSION })
    : tr("EUTERIA {version}: look for a new version and switch to it", { version: VERSION });
}

async function checkForUpdate() {
  if (!VERSION || Date.now() - lastCheck < UPDATE_CHECK_MS) return;
  lastCheck = Date.now();
  try {
    showUpdate(await latestVersion());
  } catch (_) {}
}

// The new service worker, once it has kept the new version (at most 15 s).
async function renewServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return;
    await reg.update();
    if (!reg.installing && !reg.waiting) return;
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 15000);
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true }
      );
    });
  } catch (_) {}
}

async function updateApp() {
  const button = $("update");
  if (button.disabled) return;
  button.disabled = true;
  try {
    let latest;
    try {
      latest = await latestVersion();
    } catch (_) {
      notice(tr("EUTERIA cannot look for a new version now: there is no connection."), "error", 5000);
      return;
    }
    lastCheck = Date.now();
    showUpdate(latest);
    if (latest === VERSION) {
      notice(tr("EUTERIA is up to date: version {version}.", { version: VERSION }), "ok", 4000);
      return;
    }
    if (!(await confirmLeave())) return;
    notice(tr("Updating EUTERIA to version {version}…", { version: latest }));
    rememberSettings();
    await renewServiceWorker();
    leaving = true;
    location.reload();
  } finally {
    button.disabled = false;
  }
}

// ----- the visit counter -------------------------------------------------------------------
//
// Five taps on the version number leave this device out of the visit
// counter (its owner's own use), or count it again (app/counter.js).

let versionTaps = 0;
let versionTapAt = 0;
function versionTapped() {
  const now = Date.now();
  versionTaps = now - versionTapAt < 1500 ? versionTaps + 1 : 1;
  versionTapAt = now;
  if (versionTaps < 5) return;
  versionTaps = 0;
  const on = toggleCounting();
  showCounting();
  notice(on ? tr("This device is counted again by the visit counter.") : tr("This device is no longer counted by the visit counter."), "ok", 5000);
}

function showCounting() {
  $("app-version").title = counted() ? "" : tr("This device is not counted by the visit counter");
}

// ----- updating the page -------------------------------------------------------------------

let uiQueued = false;
function scheduleUi() {
  if (uiQueued) return;
  uiQueued = true;
  requestAnimationFrame(() => {
    uiQueued = false;
    updateUi();
  });
}
player.onupdate = scheduleUi;

function updateUi() {
  const song = player.song;
  const busy = !!player.busy;
  const ready = !!song && !busy;
  // While a take is recorded, nothing moves the song under it.
  const locked = player.recording;
  const takesBusy = recording.busy;
  for (const id of ["play", "stop", "back5", "fwd5", "seek"]) $(id).disabled = !ready || (locked && (id === "back5" || id === "fwd5" || id === "seek"));
  const play = $("play");
  const playIcon = player.playing ? "pause" : "play";
  setIcon(play, playIcon);
  play.classList.toggle("playing", player.playing);
  play.setAttribute("aria-label", player.playing ? tr("Pause") : tr("Play"));
  const duration = song ? song.duration : 0;
  if (!app.seeking) {
    $("time-now").textContent = fmtTime(app.scrub ?? player.position, true);
    $("seek").value = duration > 0 ? String(Math.round((player.position / duration) * 1000)) : "0";
  }
  $("time-total").textContent = fmtTime(duration);

  for (const row of app.rows) {
    const t = player.track(row.key);
    if (!t) continue;
    row.toggle.classList.toggle("on", t.on);
    row.toggle.setAttribute("aria-pressed", String(t.on));
    row.toggle.disabled = busy;
    const v = gainToSlider(t.gain);
    row.volume.set(v);
    row.volume.disable(busy);
    if (row.slider) {
      if (+row.slider.value !== v) row.slider.value = String(v);
      row.slider.disabled = busy;
    }
    if (row.sync) {
      row.sync.set(t.take.syncMs);
      row.sync.disable(busy || takesBusy);
      row.del.disabled = busy || takesBusy;
    }
    if (!phone) {
      app.timeline.setRowOn(row.key, t.on);
      if (t.take) app.timeline.setRowOffset(row.key, t.start / player.context.sampleRate);
    }
  }
  if (song) {
    app.timeline.setLoop(player.loop);
    app.timeline.setPosition(player.position, player.playing);
  }
  // The grid shown or hidden: Grid in the toolbar (phone), the eye beside
  // Bars and Chords (computer).
  const hasGrid = !!(song && app.grid.bars.length);
  const grid = $("grid-toggle");
  grid.hidden = !hasGrid;
  grid.classList.toggle("on", app.gridVisible);
  grid.setAttribute("aria-pressed", String(app.gridVisible));
  $("grid-view").hidden = !hasGrid;
  const eye = $("grid-eye");
  setIcon(eye, app.gridVisible ? "eye" : "eyeClosed");
  eye.setAttribute("aria-pressed", String(app.gridVisible));
  eye.title = app.gridVisible ? tr("The grid is shown: click to hide it") : tr("The grid is hidden: click to show it");
  const hint = (editor.on && song ? HINTS.edit : HINTS.view)();
  if ($("tl-hint").textContent !== hint) $("tl-hint").textContent = hint;
  editor.refresh();
  // Separating the instruments (a song without stems, on a computer).
  const sep = $("separate");
  const separable = !phone && !!song && separation.applicable;
  sep.hidden = !separable;
  if (separable) {
    sep.disabled = !separation.supported || separation.running || busy || takesBusy;
    sep.classList.toggle("running", separation.running);
    const label = separation.running ? tr("Separating…") : tr("Separate instruments");
    if (sep.textContent !== label) sep.textContent = label;
    const title = separation.supported ? tr("Separate the six instruments of this song and save them with it in an EUTERIA project (.euteria)") : separation.reason;
    if (sep.title !== title) sep.title = title;
  }
  if (song && !player.hasStems) {
    const note = phone
      ? tr("This song has no separate instruments: tempo, key and loop work on the whole song. To separate them, open it in EUTERIA on a computer, with Chrome or Edge.")
      : separation.supported
        ? tr("This song has no separate instruments yet: Separate instruments makes the six stems, and saves them with the song in an EUTERIA project (.euteria).")
        : `${tr("This song has no separate instruments: tempo, key and loop work on the whole song.")} ${separation.reason}`.trim();
    if ($("tracks-note").textContent !== note) $("tracks-note").textContent = note;
  }
  separation.refresh();
  $("all-stems").disabled = !ready;
  $("original-only").disabled = !ready;

  const f = app.fields;
  const tempo = Math.round(player.rate * 100);
  f.tempo.set(tempo);
  f.tempo.disable(!song || locked);
  if (f.tempoSlider) {
    if (+f.tempoSlider.value !== tempo) f.tempoSlider.value = String(tempo);
    f.tempoSlider.disabled = !song || locked;
  }
  f.key.set(player.semitones);
  f.key.disable(!song || locked);

  const lp = player.loop;
  const loop = $("loop");
  loop.classList.toggle("on", lp.on);
  loop.setAttribute("aria-pressed", String(lp.on));
  loop.disabled = !song || locked;
  const quick = $("loop-quick");
  quick.classList.toggle("on", lp.on);
  quick.setAttribute("aria-pressed", String(lp.on));
  quick.disabled = !song || locked;
  f.position.set(app.scrub ?? player.position);
  f.position.disable(!song || locked);
  $("set-a").disabled = !song || locked;
  $("set-b").disabled = !song || locked;
  recording.refresh();

  const stems = player.hasStems;
  const takes = player.takes.length > 0;
  $("export").disabled = !ready || takesBusy || !(stems || takes);
  $("export").textContent = player.busy === "exporting" ? tr("Exporting…") : tr("Export MP3");
  const exportHint = !song || stems || takes ? EXPORT_HINT() : tr("The export combines stems and takes: an audio file has no stems, and no take was recorded yet.");
  if ($("export-hint").textContent !== exportHint) $("export-hint").textContent = exportHint;
  $("key-hint").hidden = !!song && !stems;

  // Save, at the top right, and Share project.
  const save = $("save-top");
  const saveText = app.saving ? tr("Saving…") : tr("Save");
  if (save.textContent !== saveText) save.textContent = saveText;
  save.disabled = !song || busy || app.saving || takesBusy;
  save.classList.toggle("dirty", songDirty());
  const saveTip = song ? saveTitle() : tr("Save");
  if (save.title !== saveTip) save.title = saveTip;
  const shareProj = $("share-song");
  const shareWay = shareMode();
  const inLibrary = !!app.current && app.current.source === "library";
  const shareText = app.sharing ? tr("Sharing…") : shareWay === "download" ? tr("Download project") : tr("Share project…");
  if (shareProj.textContent !== shareText) shareProj.textContent = shareText;
  shareProj.disabled = !song || busy || app.saving || app.sharing || takesBusy;
  const projectHint =
    shareWay === "share"
      ? inLibrary
        ? tr("Saves the song and sends its file (.euteria), with its bars, chords and practice settings, by email, WhatsApp and so on.")
        : tr("Sends the song's file (.euteria) as it is now, with its bars, chords and practice settings, by email, WhatsApp and so on.")
      : shareWay === "download"
        ? tr("Saves the song and downloads its file (.euteria), with its bars, chords and practice settings: this browser cannot share it.")
        : tr("Share project works on smartphones. On a computer, share the project file you saved (Save, at the top right) with the app you want: email, WhatsApp and so on.");
  if ($("project-hint").textContent !== projectHint) $("project-hint").textContent = projectHint;
  const m = app.projectMessage && performance.now() < app.projectMessage.until ? app.projectMessage : null;
  const status = $("project-status");
  const dirtyText = !songDirty()
    ? ""
    : editor.dirty && recording.dirty
      ? tr("Changes to the bars and chords, and to the takes, not saved yet.")
      : editor.dirty
        ? tr("Changes to the bars and chords not saved yet.")
        : tr("Changes to the takes not saved yet.");
  const statusText = m ? m.text : dirtyText;
  if (status.textContent !== statusText) status.textContent = statusText;
  const statusClass = `status ${m ? m.kind : dirtyText ? "dirty" : ""}`.trim();
  if (status.className !== statusClass) status.className = statusClass;

  // The song open, on the library screen.
  const showNow = (app.view === "library" || app.view === "welcome") && !!song;
  $("now").hidden = !showNow;
  if (showNow) {
    $("now-title").textContent = song.title;
    $("now-time").textContent = `${fmtTime(player.position)} / ${fmtTime(duration)}`;
    setIcon($("now-play"), playIcon);
    $("now-play").setAttribute("aria-label", player.playing ? tr("Pause") : tr("Play"));
    $("now-play").disabled = !ready;
  }
}

// ----- wiring ---------------------------------------------------------------------------------

function wire() {
  // Library (phone): an audio file or a project, copied into the app.
  for (const id of ["add-label", "add-project-label"]) $(id).addEventListener("click", () => player.unlock());
  for (const id of ["add-input", "add-project-input"]) {
    $(id).addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = "";
      if (file) addSong(file);
    });
  }
  if (library) confirmTap($("lib-clear"), () => tr("Tap again to delete every song"), deleteAll);
  confirmTap($("exports-clear"), () => (phone ? tr("Tap again to delete all") : tr("Click again to delete all")), () => deleteExports(songExports()));
  $("back").addEventListener("click", goHome);
  $("save-top").addEventListener("click", () => saveSong());
  $("share-song").addEventListener("click", shareProject);
  $("now-open").addEventListener("click", () => showView("player"));
  $("now-play").addEventListener("click", () => {
    player.unlock();
    player.toggle();
  });

  // Version
  $("update").addEventListener("click", updateApp);
  $("separate").addEventListener("click", () => separation.start());
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && checkForUpdate());

  // Files (computer)
  $("open-audio").addEventListener("click", () => pickFile("audio"));
  $("open-project").addEventListener("click", () => pickFile("project"));
  $("open-input").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (file && (await confirmLeave())) openSong(file, { source: "file" });
  });

  // Transport
  setIcon($("play"), "play");
  setIcon($("now-play"), "play");
  setIcon($("stop"), "stop");
  $("play").addEventListener("click", () => {
    player.unlock();
    player.toggle();
  });
  $("stop").addEventListener("click", () => {
    player.stop();
    revealPlayhead();
  });
  $("back5").addEventListener("click", () => {
    player.skip(-5);
    revealPlayhead();
  });
  $("fwd5").addEventListener("click", () => {
    player.skip(5);
    revealPlayhead();
  });
  const seek = $("seek");
  const seekTime = () => (player.song ? (+seek.value / 1000) * player.song.duration : 0);
  seek.addEventListener("input", () => {
    app.seeking = true;
    $("time-now").textContent = fmtTime(seekTime(), true);
  });
  seek.addEventListener("change", () => {
    app.seeking = false;
    player.seek(seekTime());
    revealPlayhead();
  });

  // Tracks, loop, export
  $("all-stems").addEventListener("click", () => player.allStems());
  $("original-only").addEventListener("click", () => player.originalOnly());
  $("loop").addEventListener("click", toggleLoop);
  $("loop-quick").addEventListener("click", toggleLoop);
  $("zoom-in").addEventListener("click", () => app.timeline.zoomBy(1.5));
  $("zoom-out").addEventListener("click", () => app.timeline.zoomBy(1 / 1.5));
  $("zoom-level").addEventListener("click", () => {
    app.timeline.setView({ zoom: 1, start: 0 });
    settingsChanged();
  });
  const toggleGrid = () => {
    app.gridVisible = !app.gridVisible;
    app.timeline.setGridVisible(app.gridVisible);
    settingsChanged();
    scheduleUi();
  };
  $("grid-toggle").addEventListener("click", toggleGrid);
  $("grid-eye").addEventListener("click", toggleGrid);
  $("set-a").addEventListener("click", setLoopStartHere);
  $("set-b").addEventListener("click", setLoopEndHere);
  $("export").addEventListener("click", exportMp3);
  $("download").addEventListener("click", downloadSelected);
  $("share").addEventListener("click", shareSelected);

  // A button clicked with the mouse gives the focus back, so that the Space
  // bar plays and pauses instead of pressing that button again.
  document.addEventListener("pointerup", (e) => {
    const target = e.target && e.target.closest ? e.target.closest("button") : null;
    if (target && e.pointerType === "mouse") setTimeout(() => target.blur(), 0);
  });
  document.addEventListener("keydown", onKey);

  wireDrop();
  wireLaunchQueue();
  wireLayoutSwitch();
}

function onKey(e) {
  if (e.defaultPrevented) return;
  const target = e.target || {};
  const tag = target.tagName || "";
  const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(tag) || target.isContentEditable;
  const open = !!player.song && app.view === "player";
  if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && (e.key === "s" || e.key === "S")) {
    // Ctrl+S, ⌘S: save the song (the field being typed in first).
    if (!open) return;
    e.preventDefault();
    if (typing && target.blur) target.blur();
    saveSong();
    return;
  }
  if (typing || !open) return;
  if (editor.key(e)) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.code === "Space") {
    if (tag === "BUTTON") return; // the focused button takes it
    e.preventDefault();
    if (!e.repeat) {
      player.unlock();
      player.toggle();
    }
  } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
    e.preventDefault();
    player.skip(e.key === "ArrowLeft" ? -5 : 5);
    revealPlayhead();
  } else if (e.key === "Home") {
    e.preventDefault();
    player.seek(player.loop.on ? player.loop.start : 0);
    revealPlayhead();
  } else if ((e.key === "l" || e.key === "L") && !e.repeat) {
    toggleLoop();
  } else if ((e.key === "r" || e.key === "R") && !e.repeat) {
    player.unlock();
    recording.toggle();
  } else if (e.key === "[") {
    setLoopStartHere();
  } else if (e.key === "]") {
    setLoopEndHere();
  } else if (/^[1-9]$/.test(e.key) && !e.repeat) {
    const t = player.tracks[+e.key - 1];
    if (t) player.setTrackOn(t.key, !t.on);
  } else if (e.key === "+" || e.key === "=") {
    app.timeline.zoomBy(1.5);
  } else if (e.key === "-" || e.key === "_") {
    app.timeline.zoomBy(1 / 1.5);
  } else if (e.key === "0") {
    app.timeline.setView({ zoom: 1, start: 0 });
    settingsChanged();
  }
}

function wireLayoutSwitch() {
  const link = $("layout-switch");
  const other = phone ? "computer" : "phone";
  labelLayoutSwitch();
  link.addEventListener("click", async (e) => {
    e.preventDefault();
    if (!(await confirmLeave())) return;
    rememberSettings();
    leaving = true;
    try {
      if (other === (detectHandheld() ? "phone" : "computer")) localStorage.removeItem(LAYOUT_KEY);
      else localStorage.setItem(LAYOUT_KEY, other);
    } catch (_) {}
    const url = new URL(location.href);
    url.searchParams.delete("layout");
    location.href = url.href;
  });
}

function labelLayoutSwitch() {
  $("layout-switch").textContent = phone ? tr("Use the computer layout") : tr("Use the phone layout");
}

// ----- the language ----------------------------------------------------------------------------
//
// At the top right: "Language:" and its menu on a computer, a small "EN ▾"
// on the phone (the menu itself, invisible, laid over it). The language
// changes at once: the texts of index.html are translated where they are
// (src/i18n.js), and those the code writes are written again.

function wireLanguage() {
  const select = $("lang-select");
  for (const [code, name] of Object.entries(LANGUAGES)) {
    const option = new Option(name, code);
    option.setAttribute("translate", "no");
    select.append(option);
  }
  showLanguage();
  select.addEventListener("change", () => setLang(select.value));
  onLangChange(() => {
    showLanguage();
    relabel();
  });
}

function showLanguage() {
  $("lang-select").value = lang();
  $("lang-short").textContent = lang().toUpperCase();
}

// Every text the code wrote, again in the language now in use.
function relabel() {
  if (!editor) return; // this browser cannot run EUTERIA: only its notice
  relabelControls();
  labelLayoutSwitch();
  showCounting();
  showUpdate(shownLatest);
  app.timeline.relabel();
  editor.relabel();
  recording.relabel();
  renderLibrary();
  renderRecent();
  paintExportStatus();
  renderPlayer(player.song ? app.timeline.getView() : null);
}

// --appbar-h: the height of the bar at the top; --app-h: the window's.
function trackAppBarHeight() {
  const bar = document.querySelector(".appbar");
  const root = document.documentElement.style;
  const set = () => root.setProperty("--appbar-h", `${Math.round(bar.getBoundingClientRect().height)}px`);
  const setApp = () => root.setProperty("--app-h", `${window.innerHeight}px`);
  new ResizeObserver(set).observe(bar);
  window.addEventListener("resize", setApp);
  set();
  setApp();
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const local = ["localhost", "127.0.0.1"].includes(location.hostname);
  if (location.protocol !== "https:" && !local) return;
  const register = () => navigator.serviceWorker.register("sw.js").catch(() => {});
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register);
}

async function init() {
  translatePage(); // the texts of index.html in the language in use, before the code changes any
  wireLanguage();
  if (!Player.supported()) {
    $("unsupported").hidden = false;
    return;
  }
  $("app-version").textContent = VERSION ? `v${VERSION}` : "";
  $("app-version").addEventListener("click", versionTapped);
  showCounting();
  showUpdate(null);
  buildControls();
  wire();
  trackAppBarHeight();
  showView(homeView());
  registerServiceWorker();
  if (library) {
    try {
      const gone = await library.verify();
      for (const e of gone) if (e.settingsKey && !library.entries.some((x) => x.settingsKey === e.settingsKey)) forgetSettings(e.settingsKey);
      const n = gone.length;
      if (n) notice(trn(n, "{n} song was no longer in the storage of the browser and left the library.", "{n} songs were no longer in the storage of the browser and left the library."), "error");
    } catch (_) {}
    app.persisted = await isPersisted();
    renderLibrary();
  }
  updateUi();
  separation.init();
  setTimeout(checkForUpdate, 3000);
}

// Hooks for the automated tests.
window.euteria = {
  player,
  app,
  library,
  get editor() {
    return editor;
  },
  get separation() {
    return separation;
  },
  get recording() {
    return recording;
  },
  openSong,
  renderRecent,
  saveMode,
};

init();
