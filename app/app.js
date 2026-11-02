// EUTERIA Web, the app (listening mode).
//
// Two layouts share one player. "phone" (phones and tablets): songs are copied
// into a library inside the app, which shows the space they take, and values
// are numbers with − and + buttons. "computer": songs are opened from any
// folder (recent ones again with one click in Chrome and Edge), and volumes
// and tempo have sliders too.

import { Player, KEY_RANGE, MIN_LOOP } from "../src/player.js";
import { Library, inspectFile, storageEstimate, requestPersistence, isPersisted, AUDIO_EXTENSIONS } from "../src/library.js";
import { recentSupported, listRecent, addRecent, removeRecent, recentFile } from "../src/recent.js";
import { settingsKey, practiceFromManifest, loadSettings, saveSettings, forgetSettings } from "../src/settings.js";
import { TRACK_TITLES, STEM_NAMES, sliderToGain, gainToSlider } from "../src/project.js";
import { readGrid, emptyGrid } from "../src/grid.js";
import { detectHandheld } from "../src/device.js";
import { h, fmtTime, fmtSize, parseTime, numberField, keyField, confirmTap } from "./controls.js";
import { Timeline } from "./timeline.js";

const $ = (id) => document.getElementById(id);
const phone = document.documentElement.dataset.layout === "phone";
const ua = navigator.userAgent;
const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
const standalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const LAYOUT_KEY = "euteria.layout";
const MAX_EXPORTS = phone ? 6 : 10; // older exports leave the list, to keep memory free
const DEFAULT_LOOP_SECONDS = 16; // as EUTERIA (Python)
const WAVE_COLORS = { original: "#d6a85f", stems: ["#8eaaa5", "#809692"] }; // as EUTERIA (Python)
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const player = new Player();
// The phone draws the Original Track only; a computer every track.
player.peakKeys = phone ? ["original"] : null;
const library = phone && Library.supported() ? new Library() : null;

const app = {
  view: null,
  current: null, // the open song: {key, source: "library" | "file", entryId, name}
  adding: false,
  exports: [], // {id, file, url, name, seconds, tempo, key, selected}
  rows: [],
  fields: {},
  seeking: false,
  persisted: null,
  timeline: null,
  grid: emptyGrid(),
  gridVisible: true,
};

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
  if (app.current && player.song) saveSettings(app.current.key, { ...player.settings(), view: app.timeline.getView(), grid: app.gridVisible });
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
    app.grid = readGrid(song.manifest, song.duration);
    const practice = (song.manifest && song.manifest.practice) || {};
    app.gridVisible = saved && typeof saved.grid === "boolean" ? saved.grid : practice.grid_visible !== false;
    app.current = { key, source: origin.source, entryId: origin.entryId || null, name: file.name };
    showView("player");
    renderPlayer(saved && saved.view);
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
    else if (entry.tracks) bits.push(`${entry.tracks} tracks`);
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
  const song = await openSong(file, { source: "file" });
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
  const song = await openSong(file, { source: "file" });
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
  const handle = await handlePromise;
  const song = await openSong(file, { source: "file" });
  if (song && handle && handle.kind === "file") {
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
  const time = { min: 0, max: 0, step: 0.1, decimals: 1, inputMode: "decimal", format: (v) => fmtTime(v, true), parse: parseTime, className: "time" };
  f.loopStart = numberField({ ...time, label: "Loop start", onChange: (v) => player.setLoopStart(v) });
  f.loopEnd = numberField({ ...time, label: "Loop end", onChange: (v) => player.setLoopEnd(v) });
  $("loop-start-box").append(f.loopStart.el);
  $("loop-end-box").append(f.loopEnd.el);
  app.timeline = new Timeline($("timeline"), {
    compact: phone,
    varsOn: $("tl-wrap"),
    onSeek: (t) => player.seek(t),
    onLoop: (lp) => player.setLoop({ on: true, start: lp.start, end: lp.end }),
    onView: settingsChanged,
    onChange: updateZoom,
  });
  $("tl-hint").textContent = phone ? "Pinch to zoom, drag to scroll" : "Drag to scroll, pinch or ctrl+wheel to zoom";
  if (!phone) {
    // On a computer the tracks are the rows of the timeline.
    $("quick-slot").append($("quick"));
    $("timeline").closest(".card").append($("tracks-note"));
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

function renderPlayer(view = null) {
  const song = player.song;
  const box = phone ? $("tracks") : $("tl-heads");
  box.textContent = "";
  app.rows = [];
  $("song-title").textContent = song ? song.title : "";
  $("grid-toggle").hidden = !(song && app.grid.bars.length);
  if (!song) {
    $("song-meta").textContent = "";
    app.timeline.setSong({ duration: 0, sampleRate: 48000, rows: [], grid: emptyGrid() });
    updateZoom();
    scheduleUi();
    return;
  }
  const n = player.tracks.length;
  $("song-meta").textContent = `${song.kind === "audio" ? "Audio file" : `${n} track${n === 1 ? "" : "s"}`} · ${fmtTime(song.duration)}`;
  for (const t of player.tracks) {
    const row = trackRow(t);
    app.rows.push(row);
    box.append(row.el);
  }
  $("quick").hidden = !player.hasStems;
  $("tracks-note").hidden = player.hasStems;
  $("tracks-note").textContent = player.hasStems ? "" : "An audio file has no separate instruments: tempo, key and loop work on the whole song.";
  app.fields.loopStart.setRange(0, song.duration);
  app.fields.loopEnd.setRange(0, song.duration);
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
    $("time-now").textContent = fmtTime(player.position, true);
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
  grid.classList.toggle("on", app.gridVisible);
  grid.setAttribute("aria-pressed", String(app.gridVisible));
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
  loop.textContent = lp.on ? "On" : "Off";
  loop.classList.toggle("on", lp.on);
  loop.setAttribute("aria-pressed", String(lp.on));
  loop.disabled = !song;
  const quick = $("loop-quick");
  quick.classList.toggle("on", lp.on);
  quick.setAttribute("aria-pressed", String(lp.on));
  quick.disabled = !song;
  f.loopStart.set(lp.start);
  f.loopEnd.set(lp.end);
  f.loopStart.disable(!song);
  f.loopEnd.disable(!song);
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
  $("set-a").addEventListener("click", () => player.setLoopStart(player.position));
  $("set-b").addEventListener("click", () => player.setLoopEnd(player.position));
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
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
  const target = e.target || {};
  const tag = target.tagName || "";
  if (["INPUT", "TEXTAREA", "SELECT"].includes(tag) || target.isContentEditable) return;
  if (!player.song || app.view !== "player") return;
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
    player.setLoopStart(player.position);
  } else if (e.key === "]") {
    player.setLoopEnd(player.position);
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
  buildControls();
  wire();
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
}

// Hooks for the automated tests.
window.euteria = { player, app, library, openSong, addSong, openEntry, deleteEntry, deleteAll, renderLibrary, renderRecent, notice };

init();
