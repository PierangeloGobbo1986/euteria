// EUTERIA Web, the app.
//
// Two layouts share one player. "phone" (phones and tablets): songs are copied
// into a library inside the app, which shows the space they take, and values
// are numbers with − and + buttons. "computer": songs are opened from any
// folder (recent ones again with one click in Chrome and Edge), and volumes
// and tempo have sliders too. The grid and the chords of a song are edited
// in the timeline (app/editor.js) and saved in the song's file.

import { Player, KEY_RANGE, MIN_LOOP } from "../src/player.js";
import { Library, inspectFile, storageEstimate, requestPersistence, isPersisted, AUDIO_EXTENSIONS } from "../src/library.js";
import { openZip } from "../src/zip.js";
import { manifestPatch, withManifest, buildProject } from "../src/zipwrite.js";
import { savedManifest, newProjectManifest, newProjectId, manifestBytes } from "../src/manifest.js";
import { recentSupported, listRecent, addRecent, removeRecent, recentFile } from "../src/recent.js";
import { settingsKey, practiceFromManifest, loadSettings, saveSettings, forgetSettings } from "../src/settings.js";
import { TRACK_TITLES, STEM_NAMES, sliderToGain, gainToSlider } from "../src/project.js";
import { readGrid, emptyGrid, applyGridEdits } from "../src/grid.js";
import { detectHandheld } from "../src/device.js";
import { h, fmtTime, fmtSize, parseTime, numberField, keyField, confirmTap } from "./controls.js";
import { Timeline } from "./timeline.js";
import { Editor } from "./editor.js";

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
const WAVE_COLORS = { original: "#d6a85f", stems: ["#8eaaa5", "#809692"] }; // as EUTERIA (Python)
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const HINTS = phone
  ? {
      view: "Tap or drag on the waveform to place the playhead; drag inside the loop to move it, its handles under the bar numbers to change it (they snap to the bars). Pinch to zoom, drag the bar numbers to scroll. In the overview, drag the frame of the view or of the loop to move it.",
      edit: "Tap a bar in the chord lane to select it, drag along the lane to select several. Type the chord: next goes on to the following bar, an empty chord removes it. Bar renumbers the bars from the one selected. Set anchor makes a bar start at the playhead; BPM and the meter rebuild the grid from there.",
    }
  : {
      view: "Click or drag on the waveforms to place the playhead; drag inside the loop to move it, its edges to change it (they snap to the bars; Alt: freely). Drag the bar numbers to scroll, pinch or ctrl+wheel to zoom. In the overview, drag the frame of the view or of the loop to move it.",
      edit: "Click a bar in the chord lane and type its chord (Return: the next bar); shift-click or drag along the lane to select several. ← → move the selection (Shift: extend it), Delete clears it, Ctrl+C and Ctrl+V (⌘ on a Mac) copy and paste chords. Bar renumbers the bars from the one selected. Set anchor makes a bar start at the playhead; BPM and the meter rebuild the grid from there.",
    };

const player = new Player();
// The phone draws the Original Track only; a computer every track.
player.peakKeys = phone ? ["original"] : null;
const library = phone && Library.supported() ? new Library() : null;

const app = {
  view: null,
  // The open song: {key (of its settings), source: "library" | "file",
  // entryId (library), name, file (as it is now), handle (a file Chrome and
  // Edge may write to)}.
  current: null,
  adding: false,
  exports: [], // {id, file, url, name, seconds, tempo, key, selected}
  rows: [],
  fields: {},
  seeking: false,
  persisted: null,
  timeline: null,
  scrub: null, // where a finger drags the playhead while the song plays
  grid: emptyGrid(),
  gridVisible: true,
  saving: false,
};
let editor = null; // app/editor.js, made with the timeline

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

function setExportStatus(text, kind = "") {
  const el = $("export-status");
  el.textContent = text;
  el.className = `status ${kind}`.trim();
}

// ----- views ----------------------------------------------------------------------

const homeView = () => (phone ? "library" : "welcome");

function showView(view) {
  app.view = view;
  document.body.dataset.view = view;
  for (const v of ["library", "welcome", "player"]) $(`${v}-view`).hidden = v !== view;
  $("back").hidden = !(phone && view === "player");
  if (view === "library") renderLibrary();
  if (view === "welcome") renderRecent();
  scheduleUi();
}

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
  rememberSettings();
  app.current = null;
  setExportStatus("");
  window.scrollTo(0, 0);
  notice(`Opening ${file.name}…`);
  try {
    const song = await player.open(file, (done, total, key) =>
      notice(key ? `Opening ${file.name}: ${TRACK_TITLES[key] || key} (${done + 1} of ${total})…` : `Opening ${file.name}: lining up the tracks…`)
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
    showView("player");
    renderPlayer(saved && saved.view);
    editor.songOpened({ differs: !!edits, built: !!(edits && edits.built), dirty: !!(saved && saved.dirty) });
    window.scrollTo(0, 0);
    const warning = trackWarning();
    if (warning) notice(warning, "error");
    else notice("");
    return song;
  } catch (error) {
    renderPlayer();
    showView(homeView());
    notice(`${file.name} could not be opened. ${(error && error.message) || error}`, "error");
    return null;
  }
}

function trackWarning() {
  const bad = player.tracks.filter((t) => t.align && t.align.status === "mismatch");
  if (!bad.length) return "";
  return `${bad.map((t) => t.title).join(", ")}: not the length the project gives, so ${bad.length > 1 ? "they" : "it"} may not line up with the other tracks.`;
}

async function closeSong() {
  app.current = null; // nothing to save for a song that is going away
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
  let entry = null;
  let fresh = false;
  try {
    notice(`Checking ${file.name}…`);
    const kind = await inspectFile(file);
    entry = library.find(file.name, file.size);
    if (!entry) {
      const estimate = await storageEstimate();
      if (estimate && estimate.quota && estimate.quota - estimate.usage < file.size * 1.05 + 5e6) {
        throw new Error(`There is not enough space for ${file.name} (${fmtSize(file.size)}). Delete songs you no longer need, or free some space on the device.`);
      }
      entry = await library.add(file, kind, (done, total) => notice(`Adding ${file.name} to the library… ${Math.floor((done / total) * 100)}%`));
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
    $("notice").textContent += " It was not kept in the library.";
  }
  renderLibrary();
}

async function deleteEntry(entry) {
  if (player.busy || app.adding) return;
  try {
    if (app.current && app.current.entryId === entry.id) await closeSong();
    await library.remove(entry.id);
    if (entry.settingsKey && !library.entries.some((e) => e.settingsKey === entry.settingsKey)) forgetSettings(entry.settingsKey);
    notice(`${entry.title} deleted.`, "ok", 3000);
  } catch (error) {
    notice(`${entry.title} could not be deleted. ${(error && error.message) || error}`, "error");
  }
  renderLibrary();
}

async function deleteAll() {
  if (player.busy || app.adding) return;
  try {
    if (app.current && app.current.source === "library") await closeSong();
    const removed = await library.clear();
    for (const e of removed) if (e.settingsKey) forgetSettings(e.settingsKey);
    notice(`${removed.length} song${removed.length === 1 ? "" : "s"} deleted.`, "ok", 3000);
  } catch (error) {
    notice(`The library could not be emptied. ${(error && error.message) || error}`, "error");
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
    if (entry.kind === "audio") bits.push("audio file");
    else if (entry.tracks) bits.push(`${entry.tracks} track${entry.tracks === 1 ? "" : "s"}`);
    bits.push(fmtSize(entry.size));
    const open = h("button", { type: "button", class: "lib-open" }, h("span", { class: "title", text: entry.title }), h("span", { class: "meta", text: bits.join(" · ") }));
    open.disabled = busy;
    open.addEventListener("click", () => {
      player.unlock();
      openEntry(entry);
    });
    const del = h("button", { type: "button", class: "lib-del", "aria-label": `Delete ${entry.title}`, text: "✕" });
    del.disabled = busy;
    confirmTap(del, "Delete", () => deleteEntry(entry));
    list.append(h("li", { class: `lib-item${current ? " current" : ""}` }, open, del));
  }
  $("lib-empty").hidden = !library || entries.length > 0;
  $("lib-foot").hidden = !library || entries.length === 0;
  $("add-label").classList.toggle("disabled", busy);
  $("add-input").disabled = busy;
  $("lib-clear").disabled = busy;
  updateUsage(entries);
  updateLibraryHint();
}

let usageRound = 0;
async function updateUsage(entries) {
  if (!library) return;
  const round = ++usageRound;
  const n = entries.length;
  const text = `${n} song${n === 1 ? "" : "s"} · ${fmtSize(library.usage())}`;
  $("lib-usage").textContent = text;
  const estimate = await storageEstimate();
  if (round !== usageRound || !estimate || !estimate.quota) return;
  $("lib-usage").textContent = `${text} · ${fmtSize(Math.max(0, estimate.quota - estimate.usage))} available`;
}

function updateLibraryHint() {
  let text = "";
  if (library && ios && !standalone()) {
    text =
      "Tip: add EUTERIA to the Home Screen (Share, then Add to Home Screen) and open it from there. Safari may delete the data of websites not opened for a while, never that of Home Screen apps. The Home Screen app has a library of its own: add your songs there.";
  } else if (library && !ios && app.persisted === false) {
    text = "The browser may delete the library if the device runs short of space. Installing EUTERIA (browser menu, Install app or Add to Home screen) protects it.";
  }
  $("lib-hint").textContent = text;
  $("lib-hint").hidden = !text;
}

// ----- files and recent files (computer) --------------------------------------------------

async function pickFile() {
  player.unlock();
  if (!("showOpenFilePicker" in window)) {
    $("open-input").click();
    return;
  }
  let handle;
  try {
    [handle] = await window.showOpenFilePicker({
      id: "euteria-songs",
      multiple: false,
      types: [
        {
          description: "EUTERIA projects and audio files",
          accept: { "application/x-euteria": [".euteria", ".musicproj"], "audio/*": AUDIO_EXTENSIONS.map((e) => `.${e}`) },
        },
      ],
    });
  } catch (error) {
    if (error && error.name !== "AbortError") notice(`The file could not be opened. ${error.message}`, "error");
    return;
  }
  await openHandle(handle);
}

async function openHandle(handle) {
  let file;
  try {
    file = await handle.getFile();
  } catch (error) {
    notice(`${handle.name} could not be read. ${(error && error.message) || error}`, "error");
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
  closeMenu();
  if (player.busy) return;
  let file;
  try {
    file = await recentFile(item);
    if (!file) return; // permission refused
  } catch (error) {
    if (error && error.name === "NotFoundError") {
      await removeRecent(item.id);
      renderRecent();
      notice(`${item.name} is no longer where it was (moved, renamed or deleted). Open it again from its folder.`, "error");
    } else notice(`${item.name} could not be opened. ${(error && error.message) || error}`, "error");
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
  const supported = recentSupported();
  $("recent-menu").hidden = !supported;
  if (!supported) {
    $("recent-block").hidden = true;
    return;
  }
  const items = await listRecent();
  const list = $("recent-list");
  list.textContent = "";
  for (const item of items) {
    const open = h("button", { type: "button", class: "open-it" }, h("span", { class: "title", text: item.title || item.name }), h("span", { class: "meta", text: recentMeta(item) }));
    open.addEventListener("click", () => openRecentItem(item));
    const forget = h("button", { type: "button", class: "forget", "aria-label": `Remove ${item.name} from the list`, title: "Remove from the list", text: "✕" });
    forget.addEventListener("click", async () => {
      await removeRecent(item.id);
      renderRecent();
    });
    list.append(h("li", { class: "recent-item" }, open, forget));
  }
  $("recent-block").hidden = !items.length;
  const popup = $("recent-popup");
  popup.textContent = "";
  if (!items.length) popup.append(h("div", { class: "empty-menu", text: "The songs you open will be listed here." }));
  for (const item of items) {
    const b = h("button", { type: "button", role: "menuitem" }, h("span", { class: "title", text: item.title || item.name }), h("span", { class: "meta", text: fmtSize(item.size) }));
    b.addEventListener("click", () => openRecentItem(item));
    popup.append(b);
  }
}

function toggleMenu(show) {
  const popup = $("recent-popup");
  const open = show === undefined ? popup.hidden : show;
  popup.hidden = !open;
  $("recent-button").setAttribute("aria-expanded", String(open));
  if (open) renderRecent();
}
const closeMenu = () => toggleMenu(false);

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
  f.tempo = numberField({ label: "Tempo", min: 50, max: 200, step: 5, unit: "%", onChange: (v) => player.setRate(v / 100) });
  if (!phone) {
    f.tempoSlider = h("input", { type: "range", min: "50", max: "200", step: "1", value: "100", "aria-label": "Tempo" });
    f.tempoSlider.addEventListener("input", () => player.setRate(+f.tempoSlider.value / 100));
    f.tempoSlider.addEventListener("dblclick", () => player.setRate(1));
    $("tempo-box").append(f.tempoSlider);
  }
  $("tempo-box").append(f.tempo.el);
  f.key = keyField({ label: "Key", min: KEY_RANGE[0], max: KEY_RANGE[1], onChange: (v) => player.setSemitones(v) });
  $("key-box").append(f.key.el);
  // The playhead, to the hundredth of a second: it follows the yellow line,
  // and typing a time or − and + (a hundredth) move the line.
  f.position = numberField({
    label: "Playhead",
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
  editor = new Editor({
    app,
    player,
    phone,
    timeline: app.timeline,
    changed: settingsChanged,
    refreshPage: scheduleUi,
    save: () => saveSong(),
    share: () => shareSong(),
    saveInfo,
  });
  if (phone) {
    // Under the timeline: the editing tools (the chord of the bars selected
    // in it, then the grid), then the playhead and the loop.
    $("tl-wrap").after($("loop-controls"));
    $("tl-wrap").after($("grid-edit"));
    $("tl-wrap").after($("chord-edit"));
  } else {
    // On a computer the tracks are the rows of the timeline. Beside the bar
    // numbers and the chords, over the tracks: Bars and Chords (the editor),
    // then All stems and Original only.
    const edit = $("edit-toggle");
    edit.textContent = "Bars and Chords";
    $("tl-side").append(edit, $("quick"));
    $("tl-hint").before($("tracks-note"));
  }
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
  return player.tracks.map((t) => ({
    key: t.key,
    color: STEM_NAMES.includes(t.key) ? WAVE_COLORS.stems[stem++ % 2] : WAVE_COLORS.original,
    peaks: t.peaks,
    on: t.on,
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
  const toggle = h(
    "button",
    { type: "button", class: "toggle", "aria-pressed": "false" },
    h("span", { class: "dot", "aria-hidden": "true" }),
    h("span", { class: "name", text: t.title })
  );
  toggle.addEventListener("click", () => {
    const track = player.track(key);
    if (track) player.setTrackOn(key, !track.on);
  });
  const volume = numberField({ label: `${t.title} volume`, min: 0, max: 200, step: 10, unit: "%", buttons: phone, onChange: (v) => player.setTrackGain(key, sliderToGain(v)) });
  const parts = [toggle];
  let slider = null;
  if (!phone) {
    slider = h("input", { type: "range", min: "0", max: "200", step: "1", "aria-label": `${t.title} volume` });
    slider.addEventListener("input", () => player.setTrackGain(key, sliderToGain(+slider.value)));
    slider.addEventListener("dblclick", () => player.setTrackGain(key, 1));
    parts.push(slider);
  }
  parts.push(volume.el);
  return { key, el: h("div", { class: "track" }, ...parts), toggle, volume, slider };
}

function showSongMeta() {
  const song = player.song;
  const n = player.tracks.length;
  $("song-meta").textContent = song ? `${song.kind === "audio" ? "Audio file" : `${n} track${n === 1 ? "" : "s"}`} · ${fmtTime(song.duration)}` : "";
}

function renderPlayer(view = null) {
  const song = player.song;
  const box = phone ? $("tracks") : $("tl-rows");
  box.textContent = "";
  app.rows = [];
  $("song-title").textContent = song ? song.title : "";
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
  $("tracks-note").textContent = player.hasStems ? "" : "An audio file has no separate instruments: tempo, key and loop work on the whole song.";
  app.fields.position.setRange(0, song.duration);
  app.timeline.setSong({ duration: song.duration, sampleRate: song.sampleRate, rows: waveRows(), grid: app.grid, gridVisible: app.gridVisible, view });
  app.timeline.setLoop(player.loop);
  app.timeline.setPosition(player.position, player.playing);
  updateZoom();
  updateUi();
}

// ----- export -------------------------------------------------------------------------------

async function exportMp3() {
  if (!player.song || player.busy) return;
  setExportStatus("Measuring the level…");
  try {
    const r = await player.exportMp3((p) => setExportStatus(`${p.phase === "measure" ? "Measuring the level" : "Encoding"}… ${Math.round(p.fraction * 100)}%`));
    for (const e of app.exports) e.selected = false; // the new one is the selection
    app.exports.unshift({ id: Date.now(), file: r.file, url: URL.createObjectURL(r.file), name: r.name, seconds: r.seconds, tempo: r.tempo, key: r.key, selected: true });
    while (app.exports.length > MAX_EXPORTS) URL.revokeObjectURL(app.exports.pop().url);
    const lowered = r.reductionDb >= 0.1 ? ` · lowered ${r.reductionDb.toFixed(1)} dB to avoid clipping` : "";
    const full = r.fullOn ? " · Original Track not included" : "";
    setExportStatus(`Ready: ${r.name}\n${fmtTime(r.seconds)} · ${fmtSize(r.file.size)}${lowered}${full}`, "ok");
    renderExports();
  } catch (error) {
    setExportStatus(error.notice ? error.message : `The export failed: ${(error && error.message) || error}`, "error");
  }
  if (player.lost.length) {
    notice(`${player.lost.map((k) => TRACK_TITLES[k] || k).join(", ")}: lost after the failed export. Open the song again to get ${player.lost.length > 1 ? "them" : "it"} back.`, "error");
  }
}

const selectedExports = () => app.exports.filter((e) => e.selected);

function canShareFiles(files) {
  try {
    return !!(phone && navigator.canShare && navigator.canShare({ files }));
  } catch (_) {
    return false;
  }
}

function renderExports() {
  const box = $("exports");
  box.textContent = "";
  for (const e of app.exports) {
    const tick = h("input", { type: "checkbox", "aria-label": `Select ${e.name}` });
    tick.checked = e.selected;
    tick.addEventListener("change", () => {
      e.selected = tick.checked;
      updateExportActions();
    });
    const meta = `${fmtTime(e.seconds)} · ${fmtSize(e.file.size)} · tempo ${e.tempo}% · key ${e.key > 0 ? "+" : ""}${e.key}`;
    box.append(h("label", { class: "export-item" }, tick, h("span", { class: "name", text: e.name }), h("span", { class: "meta", text: meta })));
  }
  updateExportActions();
}

function updateExportActions() {
  const chosen = selectedExports();
  $("export-actions").hidden = !app.exports.length;
  const n = chosen.length;
  $("download").disabled = !n;
  $("download").textContent = n > 1 ? `Download ${n} files` : "Download";
  const share = $("share");
  share.hidden = !canShareFiles(n ? chosen.map((e) => e.file) : [new File([new Uint8Array(4)], "x.mp3", { type: "audio/mpeg" })]);
  share.disabled = !n;
  share.textContent = n > 1 ? `Share ${n} files…` : "Share…";
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
    await navigator.share({ files, title: files.length === 1 ? files[0].name : `${files.length} files from EUTERIA` });
  } catch (error) {
    if (!error || error.name !== "AbortError") setExportStatus(`Sharing failed: ${(error && error.message) || error}`, "error");
  }
}

// ----- saving the song ------------------------------------------------------------------------
//
// The edits (grid, chords) and the practice settings go into the song's
// manifest.json. A song of the library (phone) is updated in place; on a
// computer Chrome and Edge write the file itself, the other browsers download
// a copy. An audio file becomes an EUTERIA project (.euteria) holding it.

const extensionOf = (name) => ((/\.([A-Za-z0-9]{1,8})$/.exec(name || "") || [])[1] || "").toLowerCase();

function safeName(text) {
  const name = String(text || "").replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/\s+/g, " ").replace(/^[ .]+|[ .]+$/g, "").slice(0, 120);
  return name || "EUTERIA";
}

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

let sharing = null;
// The phone sends the song with the share sheet, or downloads it where the
// browser cannot share such a file.
function shareMode() {
  if (sharing === null) {
    try {
      sharing = !!(navigator.canShare && navigator.canShare({ files: [new File([new Uint8Array(4)], "song.euteria", { type: "application/zip" })] }));
    } catch (_) {
      sharing = false;
    }
  }
  return sharing ? "share" : "download";
}

function saveInfo() {
  const mode = saveMode();
  const audio = !!player.song && player.song.kind === "audio";
  const label = { library: audio ? "Save as project" : "Save", file: "Save", "new-file": "Save as project…", copy: audio ? "Download as project" : "Save a copy" }[mode] || "Save";
  const title = {
    library: "Save the changes in the song (in the library)",
    file: `Save the changes in ${app.current ? app.current.name : "the file"}`,
    "new-file": "Save the song as an EUTERIA project (.euteria), with its grid and chords",
    copy: "This browser cannot write the file: download a copy with the changes",
  }[mode];
  const library = mode === "library";
  return { label, title, share: library, shareLabel: library && shareMode() === "share" ? "Share…" : "Download", busy: app.saving };
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
  if (m.project_id !== id) throw new Error("the file read back is not the one written");
}

// The song is now `file` (saved in place): its settings follow it.
function savedInPlace(file, manifest) {
  const cur = app.current;
  const oldKey = cur.key;
  player.song.manifest = manifest;
  player.song.kind = "project";
  cur.file = file;
  cur.name = file.name;
  cur.key = settingsKey(player.song, file);
  editor.saved(true);
  rememberSettings();
  if (cur.source === "library") {
    if (cur.key !== oldKey) forgetSettings(oldKey);
    library.update(cur.entryId, { settingsKey: cur.key, kind: "project" });
    renderLibrary();
  }
  showSongMeta();
}

// Resolves with true once saved.
async function saveSong() {
  const song = player.song;
  const cur = app.current;
  if (!song || !cur || player.busy || app.saving) return false;
  editor.commitInput();
  let mode = saveMode();
  let target = null;
  // What needs the click comes first: the permission to write, the place.
  if (mode === "file" && !(await writePermission(cur.handle))) {
    mode = "copy";
    editor.say("EUTERIA may not write the file: a copy is downloaded instead.");
  }
  if (mode === "new-file") {
    try {
      target = await window.showSaveFilePicker({
        id: "euteria-songs",
        suggestedName: `${safeName(song.title)}.euteria`,
        types: [{ description: "EUTERIA project", accept: { "application/x-euteria": [".euteria"] } }],
      });
    } catch (error) {
      if (error && error.name === "AbortError") return false;
      mode = "copy";
    }
  }
  app.saving = true;
  scheduleUi();
  try {
    const file = cur.file;
    if (song.kind === "audio" || !song.manifest) {
      // An audio file: a new project around it.
      const id = newProjectId();
      const ext = extensionOf(file.name);
      const member = `audio/original.${AUDIO_EXTENSIONS.includes(ext) ? ext : "audio"}`;
      const manifest = newProjectManifest({ id, title: song.title, fileName: file.name, member, grid: app.grid, state: practiceState() });
      const blob = await buildProject([
        { name: "manifest.json", data: manifestBytes(manifest) },
        { name: member, data: file },
      ]);
      const name = `${safeName(song.title)}.euteria`;
      if (mode === "library") {
        const entry = library.get(cur.entryId);
        await library.replace(entry, blob, name, "project");
        const saved = await library.file(library.get(cur.entryId));
        await checkSaved(saved, id);
        savedInPlace(saved, manifest);
        editor.say("Saved: the song is now an EUTERIA project, with its grid and chords.", "ok");
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
        editor.say(`Saved in ${saved.name}.`, "ok");
      } else {
        downloadBlob(blob, name);
        editor.saved(false);
        rememberSettings();
        editor.say(`Downloaded: ${name}.`, "ok");
      }
      return true;
    }
    // A project: its manifest.json rewritten.
    const manifest = savedManifest(song.manifest, app.grid, practiceState());
    const bytes = manifestBytes(manifest);
    const zip = await openZip(file);
    if (mode === "library") {
      const entry = library.get(cur.entryId);
      const { at, bytes: tail } = await manifestPatch(zip, bytes);
      await library.patch(entry, at, tail);
      const saved = await library.file(library.get(cur.entryId));
      await checkSaved(saved, manifest.project_id);
      savedInPlace(saved, manifest);
      editor.say("Saved.", "ok");
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
      editor.say(`Saved in ${saved.name}.`, "ok");
    } else {
      downloadBlob(await withManifest(file, zip, bytes), cur.name);
      editor.saved(false);
      rememberSettings();
      editor.say(`Downloaded a copy with the changes: ${cur.name}.`, "ok");
    }
    return true;
  } catch (error) {
    const changed = error && error.name === "NotReadableError";
    editor.say(
      changed
        ? "The song could not be saved: its file changed since it was opened. Open it again (the edits are kept)."
        : `The song could not be saved. ${(error && error.message) || error}`,
      "error",
      0
    );
    return false;
  } finally {
    app.saving = false;
    scheduleUi();
  }
}

// The phone: the song (saved first if it has changes) to the share sheet, to
// send it to a computer or keep it in Files.
async function shareSong() {
  const cur = app.current;
  if (!library || !cur || cur.source !== "library" || app.saving || player.busy) return;
  if (editor.dirty || player.song.kind === "audio") {
    if (!(await saveSong())) return;
  }
  const entry = library.get(cur.entryId);
  if (!entry) return;
  try {
    const stored = await library.file(entry);
    const file = new File([stored], entry.name, { type: "application/zip" });
    if (shareMode() === "share") await navigator.share({ files: [file], title: entry.title });
    else downloadBlob(file, entry.name);
  } catch (error) {
    if (error && error.name === "NotAllowedError") editor.say("Saved. Tap Share again to send the song.");
    else if (!error || error.name !== "AbortError") editor.say(`The song could not be shared. ${(error && error.message) || error}`, "error");
  }
}

// ----- the column beside the bar numbers (computer) ---------------------------------------------
//
// Bars and Chords, All stems and Original only sit beside the bar numbers and
// the chords, over the tracks. Without the chord lane there is less room:
// the timeline then moves down by what is missing, so that the tracks stay
// beside their waveforms.

const SIDE_ROW = 28;
const SIDE_GAP = 6;

function layoutSide() {
  if (phone || !player.song) return;
  const rows = 1 + (player.hasStems ? 1 : 0);
  const need = rows * SIDE_ROW + (rows - 1) * SIDE_GAP + 8;
  const offset = `${Math.max(0, need - app.timeline.headHeight)}px`;
  const wrap = $("tl-wrap");
  if (wrap.style.getPropertyValue("--tl-offset") !== offset) wrap.style.setProperty("--tl-offset", offset);
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

function showUpdate(latest) {
  const b = $("update");
  const newer = !!latest && latest !== VERSION;
  b.classList.toggle("available", newer);
  b.title = newer ? `Version ${latest} is available: update now (this is ${VERSION})` : `EUTERIA ${VERSION}: look for a new version and switch to it`;
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
      notice("EUTERIA cannot look for a new version now: there is no connection.", "error", 5000);
      return;
    }
    lastCheck = Date.now();
    showUpdate(latest);
    if (latest === VERSION) {
      notice(`EUTERIA is up to date: version ${VERSION}.`, "ok", 4000);
      return;
    }
    notice(`Updating EUTERIA to version ${latest}…`);
    rememberSettings();
    await renewServiceWorker();
    location.reload();
  } finally {
    button.disabled = false;
  }
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
  for (const id of ["play", "stop", "back5", "fwd5", "seek"]) $(id).disabled = !ready;
  const play = $("play");
  const playText = player.playing ? "❚❚" : "▶";
  if (play.textContent !== playText) play.textContent = playText;
  play.classList.toggle("playing", player.playing);
  play.setAttribute("aria-label", player.playing ? "Pause" : "Play");
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
    if (!phone) app.timeline.setRowOn(row.key, t.on);
  }
  if (song) {
    app.timeline.setLoop(player.loop);
    app.timeline.setPosition(player.position, player.playing);
  }
  const grid = $("grid-toggle");
  grid.hidden = !(song && app.grid.bars.length);
  grid.classList.toggle("on", app.gridVisible);
  grid.setAttribute("aria-pressed", String(app.gridVisible));
  const hint = editor.on && song ? HINTS.edit : HINTS.view;
  if ($("tl-hint").textContent !== hint) $("tl-hint").textContent = hint;
  editor.refresh();
  layoutSide();
  $("all-stems").disabled = !ready;
  $("original-only").disabled = !ready;

  const f = app.fields;
  const tempo = Math.round(player.rate * 100);
  f.tempo.set(tempo);
  f.tempo.disable(!song);
  if (f.tempoSlider) {
    if (+f.tempoSlider.value !== tempo) f.tempoSlider.value = String(tempo);
    f.tempoSlider.disabled = !song;
  }
  f.key.set(player.semitones);
  f.key.disable(!song);

  const lp = player.loop;
  const loop = $("loop");
  loop.classList.toggle("on", lp.on);
  loop.setAttribute("aria-pressed", String(lp.on));
  loop.disabled = !song;
  const quick = $("loop-quick");
  quick.classList.toggle("on", lp.on);
  quick.setAttribute("aria-pressed", String(lp.on));
  quick.disabled = !song;
  f.position.set(app.scrub ?? player.position);
  f.position.disable(!song);
  $("set-a").disabled = !song;
  $("set-b").disabled = !song;

  const stems = player.hasStems;
  $("export").disabled = !ready || !stems;
  $("export").textContent = player.busy === "exporting" ? "Exporting…" : "Export MP3";
  $("export-hint").textContent = !song || stems ? "The stems that are on, as they sound now (volumes, tempo, key)." : "The export combines stems: an audio file has none.";
  $("key-hint").hidden = !!song && !stems;

  if (phone) {
    const showNow = app.view === "library" && !!song;
    $("now").hidden = !showNow;
    if (showNow) {
      $("now-title").textContent = song.title;
      $("now-time").textContent = `${fmtTime(player.position)} / ${fmtTime(duration)}`;
      $("now-play").textContent = playText;
      $("now-play").setAttribute("aria-label", player.playing ? "Pause" : "Play");
      $("now-play").disabled = !ready;
    }
  }
}

// ----- wiring ---------------------------------------------------------------------------------

function wire() {
  // Library (phone)
  $("add-label").addEventListener("click", () => player.unlock());
  $("add-input").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (file) addSong(file);
  });
  if (library) confirmTap($("lib-clear"), "Tap again to delete every song", deleteAll);
  $("back").addEventListener("click", () => showView("library"));
  $("now-open").addEventListener("click", () => showView("player"));
  $("now-play").addEventListener("click", () => {
    player.unlock();
    player.toggle();
  });

  // Version
  $("update").addEventListener("click", updateApp);
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && checkForUpdate());

  // Files (computer)
  $("open").addEventListener("click", pickFile);
  $("open-big").addEventListener("click", pickFile);
  $("open-input").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (file) openSong(file, { source: "file" });
  });
  $("recent-button").addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMenu();
  });
  document.addEventListener("click", (e) => {
    if (!$("recent-menu").contains(e.target)) closeMenu();
  });

  // Transport
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
  $("grid-toggle").addEventListener("click", () => {
    app.gridVisible = !app.gridVisible;
    app.timeline.setGridVisible(app.gridVisible);
    settingsChanged();
    scheduleUi();
  });
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
  if (e.key === "Escape") closeMenu();
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
  link.textContent = `Use the ${other} layout`;
  link.addEventListener("click", (e) => {
    e.preventDefault();
    rememberSettings();
    try {
      if (other === (detectHandheld() ? "phone" : "computer")) localStorage.removeItem(LAYOUT_KEY);
      else localStorage.setItem(LAYOUT_KEY, other);
    } catch (_) {}
    const url = new URL(location.href);
    url.searchParams.delete("layout");
    location.href = url.href;
  });
}

function trackAppBarHeight() {
  const bar = document.querySelector(".appbar");
  const set = () => document.documentElement.style.setProperty("--appbar-h", `${Math.round(bar.getBoundingClientRect().height)}px`);
  new ResizeObserver(set).observe(bar);
  set();
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
  if (!Player.supported()) {
    $("unsupported").hidden = false;
    return;
  }
  $("app-version").textContent = VERSION ? `v${VERSION}` : "";
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
      if (n) notice(`${n} song${n === 1 ? " was" : "s were"} no longer in the storage of the browser and left the library.`, "error");
    } catch (_) {}
    app.persisted = await isPersisted();
    renderLibrary();
  }
  updateUi();
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
  openSong,
  addSong,
  openEntry,
  deleteEntry,
  deleteAll,
  renderLibrary,
  renderRecent,
  notice,
  saveSong,
  shareSong,
  saveMode,
  updateApp,
  VERSION,
};

init();
