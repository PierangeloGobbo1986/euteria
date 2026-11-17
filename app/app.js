// EUTERIA Web, the app.
//
// Two layouts share one player. "phone" (phones and tablets): songs are copied
// into a library inside the app, which shows the space they take, and values
// are numbers with − and + buttons. "computer": songs are opened from any
// folder (recent ones again with one click in Chrome and Edge), and volumes
// and tempo have sliders too. The grid and the chords of a song are edited
// in the timeline (app/editor.js), takes are recorded over it
// (app/recording.js), and both are saved in the song's file. On a computer
// the tempo of a song is found as it opens (app/detect.js), and the grid made
// from it.

import { Player, KEY_RANGE, MIN_LOOP } from "../src/player.js";
import { Library, inspectFile, storageEstimate, requestPersistence, isPersisted, AUDIO_EXTENSIONS } from "../src/library.js";
import { openZip } from "../src/zip.js";
import { manifestPatch, buildProject, zipLayout, composeEdited, composeProject, crc32Blob } from "../src/zipwrite.js";
import { savedManifest, newProjectManifest, emptyProjectManifest, newProjectId, manifestBytes } from "../src/manifest.js";
import { recentSupported, listRecent, addRecent, removeRecent, recentFile, recentId, recentWritable } from "../src/recent.js";
import { settingsKey, practiceFromManifest, loadSettings, saveSettings, forgetSettings } from "../src/settings.js";
import { TRACK_TITLES, STEM_NAMES, sliderToGain, gainToSlider, isTake } from "../src/project.js";
import { readGrid, emptyGrid, applyGridEdits, extendGrid, newGrid } from "../src/grid.js";
import { detectHandheld } from "../src/device.js";
import { h, fmtTime, fmtSize, fmtSigned, extensionOf, safeName, numberField, keyField, confirmTap, icon, setIcon } from "./controls.js";
import { countEvent, counted, toggleCounting } from "./counter.js";
import { Timeline } from "./timeline.js";
import { getNotation, setNotation } from "../src/chordnames.js";
import { Editor } from "./editor.js";
import { SectionMenu } from "./sectionmenu.js";
import { sectionIndexAt } from "../src/sections.js";
import { SeparationFlow } from "./separate.js";
import { TempoDetection, readAnalysis, hasBeats, hasChords } from "./detect.js";
import { gridFromBeats } from "../src/tempo.js";
import { loadMetronome, saveMetronome, songDefaults, metronomeClicks, steadyClicks, clicksUntil, beatsPerBar, nextBeatKind, ACCENT, SILENT, COUNT_IN, MODES, MAX_BARS, VOLUME_MAX, BPM_MIN, BPM_MAX, SILENCE } from "../src/metronome.js";
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
const setAttr = (el, name, value) => el.getAttribute(name) !== value && el.setAttribute(name, value);
// The hint under the timeline, in the language in use.
const HINTS = phone
  ? {
      view: () =>
        tr("Tap or drag on the waveform to place the playhead; drag inside the loop to move it, its handles on the time scale to change it (both by the eighth note, as along the bar numbers). Tap a chord to write it. Drag along the bar numbers to choose a stretch, by the eighth note: Loop loops it. Pinch to zoom, drag the time scale to scroll. In the overview, drag the frame of the view or of the loop to move it."),
      noGrid: () => tr("No bars in this song yet: Detect tempo finds them on a computer (Song analysis), and the project saved there brings them here; or put the playhead on the first beat of a bar and tap Set first beat."),
      hidden: () => tr("The sections, the chords and the bars are hidden: the eye beside Bars and chords, over the timeline, shows them."),
      edit: () =>
        tr("Tap a chord, or a beat, to select its bar; drag along the chords to select several. The boxes are the beats of the bar: type each chord in the box of its beat; next goes on to the following bar, an empty box removes its chord. Chords typed one after the other in a box spread over the rest of the bar: two in the first box go on beats 1 and 3. Bar renumbers the bars from the one selected. Bar numbers: a tap takes a bar, dragging along them a stretch by the eighth note; Loop loops it, and with the loop on the loop goes there at once. Sections, the top row: tap a section or a bar to select it, tap the bars selected to name them; with the loop on, a section tapped is looped. Set first beat makes a bar start at the playhead; BPM and the meter rebuild the grid from there."),
    }
  : {
      view: () =>
        tr("Click or drag on the waveforms to place the playhead; drag inside the loop to move it, its edges to change it (both by the eighth note, as along the bar numbers; Alt: freely). Click a chord to write it. Drag along the bar numbers to choose a stretch, by the eighth note: Loop (L) loops it. Drag the time scale to scroll, pinch or ctrl+wheel to zoom. In the overview, drag the frame of the view or of the loop to move it."),
      noGrid: () => tr("No bars in this song yet: Detect tempo, in Song analysis, finds them; or put the playhead on the first beat of a bar and press Set first beat."),
      hidden: () => tr("The sections, the chords and the bars are hidden: the eye beside Bars and chords, over the timeline, shows them."),
      edit: () =>
        tr("Click a chord, or a beat, and type its chord: the boxes over the timeline are the beats of the bar (Tab: the next beat; Return: the next bar). Chords typed one after the other in a box spread over the rest of the bar: two in the first box go on beats 1 and 3. Shift-click or drag along the chords to select several bars. ← → move the selection (Shift: extend it), Delete clears it, Ctrl+C and Ctrl+V (⌘ on a Mac) copy and paste chords. Bar renumbers the bars from the one selected. Bar numbers: a click takes a bar, dragging along them a stretch by the eighth note, shift-click takes in more bars; Loop (L) loops it, and with the loop on the loop goes there at once. Sections, the top row: click a section or a bar to select it, click the bars selected to name them; with the loop on, a section clicked is looped, shift-click takes in more. Shift-click on the time scale moves an edge of the loop to the nearest beat. Set first beat makes a bar start at the playhead; BPM and the meter rebuild the grid from there."),
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
  renameDeclined: new Set(), // "old name|new name": the save dialog of a rename cancelled (saveSong())
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
  analysis: null, // the tempo detection of the open song (manifest.music.beat_tracking)
  analysisInFile: false, // it is in the song's file already
  saving: false,
  sharing: false, // the share sheet is open
  projectMessage: null, // the last message of Save or Share project: {text, kind, until}
};
let editor = null; // app/editor.js, made with the timeline
let sectionMenu = null; // app/sectionmenu.js
let separation = null; // app/separate.js
let detection = null; // app/detect.js
let recording = null; // app/recording.js

// The project's name changed and not saved yet (the bar at the top).
const retitled = () => {
  const s = player.song;
  return !!s && typeof s.fileTitle === "string" && s.title !== s.fileTitle;
};
// Changes not saved in the song's file yet: the name, the bars and chords,
// the takes.
// A project made here and never saved (a computer: the library keeps it on the phone).
const unsavedNew = () => !!app.current && !!app.current.created && !app.current.handle && app.current.source !== "library";
const songDirty = () => !!player.song && (editor.dirty || retitled() || (!!recording && recording.dirty) || unsavedNew());
// The song has audio of its own (an empty project has only its takes, if any).
const ownAudio = () => player.tracks.some((t) => !t.take);

// ----- messages -------------------------------------------------------------------
//
// One message at a time, in a band that opens under the bar at the top (with
// a song open, under the transport) over the page: always in view, and the
// page under it does not move. progress: the part done (0 to 1) of the work
// it tells, drawn as a bar under it. action: {label, run}, a button beside it
// (Align, for a take out of time), which closes it and runs. An error, or a
// message with an action, stays until closed (✕) or replaced; another
// message closes after ms, or else when replaced or cleared (notice("")).

const NOTICE_CLOSE_MS = 220; // the band closing (app.css), with what it said
let noticeTimer = null;
let noticeGone = null;
let noticeAction = null;
function notice(text, kind = "", ms = 0, progress = null, action = null) {
  const el = $("notice");
  const band = $("notice-band");
  clearTimeout(noticeTimer);
  clearTimeout(noticeGone);
  noticeAction = text && action ? action : null;
  $("notice-action").hidden = !noticeAction;
  if (noticeAction) $("notice-action").textContent = noticeAction.label;
  if (!text) {
    band.classList.remove("open");
    noticeGone = setTimeout(() => {
      el.textContent = "";
      el.hidden = true;
    }, NOTICE_CLOSE_MS);
    return;
  }
  const opening = !band.classList.contains("open");
  el.textContent = text;
  el.className = `notice ${kind}`.trim();
  el.hidden = false;
  band.dataset.kind = kind;
  const bar = typeof progress === "number" && Number.isFinite(progress);
  $("notice-bar").hidden = !bar;
  if (bar) {
    const fill = $("notice-fill");
    // A band opening shows the part done as it is, without growing to it.
    if (opening) fill.style.transition = "none";
    fill.style.width = `${Math.round(Math.max(0, Math.min(1, progress)) * 1000) / 10}%`;
    if (opening) {
      void fill.offsetWidth;
      fill.style.transition = "";
    }
  }
  const error = kind === "error";
  $("notice-close").hidden = !error && !noticeAction;
  band.classList.add("open");
  if (ms && !error && !noticeAction) noticeTimer = setTimeout(() => notice(""), ms);
}

// The band of the messages hangs under the bar at the top: the app bar (on
// the phone, with a song open, the transport is part of it), or on a
// computer with a song open the transport, which stays in view under it.
function placeNotice() {
  const home = !phone && app.view === "player" ? $("transport") : document.querySelector(".appbar");
  const band = $("notice-band");
  if (band.parentElement !== home) home.append(band);
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
  placeNotice();
  for (const v of ["library", "welcome", "player"]) $(`${v}-view`).hidden = v !== view;
  $("song-nav").hidden = view !== "player";
  if (view === "library") renderLibrary();
  if (view === "welcome") renderRecent();
  scheduleUi();
}

// ----- leaving a song with changes not saved ---------------------------------------
//
// As in EUTERIA (Python): before the library or another song, a song whose
// name, bars, chords or takes changed asks whether to save them. Don't save
// brings back the song as its file has it. (Tempo, key, loop and volumes are kept on
// the device anyway, and go in the file at the next Save.) A take being
// recorded ends first.

let leaving = false; // the page is going away on purpose: no question from the browser

// What changed since the song was last saved, for the question before
// leaving it.
function leaveHint(name, grid, takes) {
  if (name && grid && takes) return tr("The name of the project, the grid, the bar numbers or the chords, and the takes, changed since the song was last saved.");
  if (name && grid) return tr("The name of the project, the grid, the bar numbers or the chords changed since the song was last saved.");
  if (name && takes) return tr("The name of the project and the takes changed since the song was last saved.");
  if (name) return tr("The name of the project changed since the song was last saved.");
  if (grid && takes) return tr("The grid, the bar numbers or the chords, and the takes, changed since the song was last saved.");
  if (takes) return tr("The takes changed since the song was last saved.");
  return tr("The grid, the bar numbers or the chords changed since the song was last saved.");
}

function askToSave() {
  const dialog = $("leave-dialog");
  $("leave-hint").textContent = unsavedNew() ? tr("This project has not been saved yet.") : leaveHint(retitled(), editor.dirty, !!recording && recording.dirty);
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
  const named = retitled();
  if (editor.dirty) {
    editor.reset(song ? readGrid(song.manifest, song.duration) : emptyGrid());
    // A detection not in the file goes too (the file's stays): it runs again
    // next time.
    if (!app.analysisInFile) {
      app.analysis = song ? readAnalysis(song.manifest) : null;
      app.analysisInFile = !!app.analysis;
    }
  }
  if (named) {
    song.title = song.fileTitle;
    showTitle();
  }
  if (takes) await recording.revert();
  rememberSettings();
  notice(
    takes || named ? tr("The changes were not saved: the song is as its file has it.") : tr("The changes to the bars and chords were not saved: the song is as its file has it."),
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
    saveSettings(app.current.key, {
      ...player.settings(),
      view: app.timeline.getView(),
      grid: app.gridVisible,
      edits: editor.edits(),
      dirty: editor.dirty,
      analysis: app.analysisInFile ? null : app.analysis,
      title: retitled() ? player.song.title : null,
    });
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
  endRename(false);
  rememberSettings();
  detection.cancel();
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
          : tr("Opening {name}: lining up the tracks…", { name: file.name }),
        "",
        0,
        key && total ? done / total : 1
      )
    );
    const key = settingsKey(song, file);
    const saved = loadSettings(key);
    player.apply(saved || practiceFromManifest(song.manifest));
    // The name the file gives, and a new one not saved in it yet.
    song.fileTitle = song.title;
    if (saved && typeof saved.title === "string" && saved.title.trim()) song.title = saved.title.trim();
    // The grid of the file, with the edits not saved in it yet.
    const edits = saved && saved.edits;
    app.grid = readGrid(song.manifest, song.duration);
    if (edits) app.grid = applyGridEdits(app.grid, edits, song.duration);
    const practice = (song.manifest && song.manifest.practice) || {};
    app.gridVisible = saved && typeof saved.grid === "boolean" ? saved.grid : practice.grid_visible !== false;
    // The tempo and chord detection: the one kept in this browser (found
    // since the song was last saved), else the file's.
    const inFile = readAnalysis(song.manifest);
    const kept = saved && (hasBeats(saved.analysis) || hasChords(saved.analysis)) ? saved.analysis : null;
    app.analysis = kept || inFile;
    app.analysisInFile = !kept && !!inFile;
    app.current = { key, source: origin.source, entryId: origin.entryId || null, name: file.name, file, handle: origin.handle || null, created: !!origin.created };
    app.current.owner = songOwner();
    if (!origin.separated) countEvent(song.kind === "audio" ? "song-opened-audio" : "song-opened-project");
    showView("player");
    renderPlayer(saved && saved.view);
    if (sectionMenu) sectionMenu.close();
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

// The tempo and chord detection of the open song (app/detect.js): kept with
// it; tempo: the grid made from it in place of the song's; chords: the chords
// found written in its bars. Returns how many bars got a chord.
function applyDetection(analysis, fit, { tempo = false, chords = false } = {}) {
  if (!player.song) return 0;
  if (hasBeats(analysis) || hasChords(analysis)) {
    app.analysis = analysis;
    app.analysisInFile = false;
  }
  if (tempo && fit) editor.detected(fit);
  const written = chords ? editor.writeChords({ quiet: true }) : 0;
  rememberSettings();
  scheduleUi();
  return written;
}

// ----- the metronome -------------------------------------------------------------------
//
// A card of its own, between Song analysis and Tempo and key
// (src/metronome.js), and a round button in the transport, between Loop and
// Rec (M on a computer): the metronome is only the click. Its volume, own
// tempo, beats and what a silent bar silences are this browser's, for every
// song; a song opens with the metronome off, a count-in of one bar, the
// count-in only and no silent bars (songDefaults()). Its tempo
// follows the grid of the song (and the beats found in it) until it is given
// one of its own, which changes the click only; a song without a grid has the
// metronome's own tempo, from its start. The clicks are made again whenever
// what they come from changes, and handed to the audio engine with the
// settings.

const metro = loadMetronome();
let metroFor = { song: null, grid: null, analysis: null }; // what the clicks were made from
let metroFollow = true; // the click follows the grid of the song (when there is one)
let metroTempoKey = null; // the tempo, anchor and meter of the grid it last followed
const metroFields = {};
let metroSlider = null; // the volume's slider (a computer)

const songGrid = () => !!player.song && app.grid.bars.length > 0 && app.grid.bpm > 0;
const metroFollowing = () => metroFollow && songGrid();
const fmtBpm = (v) => (Number.isInteger(Math.round(v * 10) / 10) ? String(Math.round(v)) : (Math.round(v * 10) / 10).toFixed(1));

function metronomeClicksNow() {
  const g = app.grid;
  const until = clicksUntil(player.song ? player.song.duration : 0);
  const pattern = metro.patterns[g.meter];
  if (metroFollowing()) return metronomeClicks(g, hasBeats(app.analysis) ? app.analysis.beats : null, pattern, until);
  return steadyClicks({ bpm: metro.bpm, meter: g.meter, anchor: songGrid() ? g.bars[0] : 0, until }, pattern);
}

function pushMetronome(clicks) {
  // The count-in is heard with the metronome on; the clicks of the song only in "Whole song".
  player.countIn = metro.on ? metro.countIn : 0;
  // The silent bars only while they are on.
  const silent = metro.muteOn;
  const m = { on: metro.on && metro.mode === "song", volume: metro.volume / 100, play: metro.play, mute: silent ? metro.mute : 0, random: silent && metro.random, silence: SILENCE.indexOf(metro.silence) };
  if (clicks) m.clicks = player.song ? metronomeClicksNow() : null;
  player.setMetronome(m);
}

function metroChanged(clicks = false) {
  saveMetronome(metro);
  pushMetronome(clicks);
  renderMetronome();
}

function toggleMetronome() {
  if (!player.song) return;
  metro.on = !metro.on;
  metroChanged();
}

// Its own tempo: the click alone changes (the grid stays); the tempo of the
// song again follows it.
function setMetroBpm(v) {
  if (songGrid() && fmtBpm(v) === fmtBpm(app.grid.bpm)) metroFollow = true;
  else {
    metroFollow = false;
    metro.bpm = v;
  }
  metroChanged(true);
}

function wireMetronome() {
  $("metro-on").addEventListener("click", toggleMetronome);
  $("metro-quick").addEventListener("click", toggleMetronome);
  metroFields.bpm = numberField({
    label: tr("Tempo of the metronome"),
    min: BPM_MIN,
    max: BPM_MAX,
    step: 1,
    decimals: 1,
    format: fmtBpm,
    unit: "bpm",
    inputMode: "decimal",
    className: "bpm",
    onChange: setMetroBpm,
  });
  $("metro-bpm-box").append(metroFields.bpm.el);
  $("metro-follow").addEventListener("click", () => {
    metroFollow = true;
    metroChanged(true);
  });
  // The volume, as a track's: a slider on a computer, and its value with − and +.
  metroFields.volume = numberField({ label: tr("Metronome volume"), min: 0, max: VOLUME_MAX, step: 5, unit: "%", onChange: (v) => ((metro.volume = v), metroChanged()) });
  if (!phone) {
    metroSlider = h("input", { type: "range", min: "0", max: String(VOLUME_MAX), step: "1", "aria-label": tr("Metronome volume") });
    metroSlider.addEventListener("input", () => {
      metro.volume = Math.round(+metroSlider.value);
      metroChanged();
    });
    metroSlider.addEventListener("dblclick", () => {
      metro.volume = 100;
      metroChanged();
    });
    $("metro-volume-box").append(metroSlider);
  }
  $("metro-volume-box").append(metroFields.volume.el);
  $("metro-beats").addEventListener("click", (e) => {
    const b = e.target.closest("button.beat");
    if (!b) return;
    const meter = app.grid.meter;
    const p = metro.patterns[meter].slice();
    const i = +b.dataset.i;
    p[i] = nextBeatKind(p[i]);
    metro.patterns[meter] = p;
    metroChanged(true);
  });
  metroFields.play = numberField({ label: tr("Bars with the clicks"), min: 1, max: MAX_BARS, onChange: (v) => ((metro.play = v), metroChanged()) });
  metroFields.mute = numberField({ label: tr("How many silent bars"), min: 1, max: MAX_BARS, onChange: (v) => ((metro.mute = v), metroChanged()) });
  $("metro-mute-on").addEventListener("click", () => {
    metro.muteOn = !metro.muteOn;
    metroChanged();
  });
  $("metro-play-box").append(metroFields.play.el);
  $("metro-mute-box").append(metroFields.mute.el);
  $("metro-silence").addEventListener("change", (e) => {
    metro.silence = SILENCE.includes(e.target.value) ? e.target.value : "metronome";
    metroChanged();
  });
  $("metro-random").addEventListener("click", () => {
    metro.random = !metro.random;
    metroChanged();
  });
  $("metro-count").addEventListener("change", (e) => {
    metro.countIn = +e.target.value;
    metroChanged();
  });
  $("metro-mode").addEventListener("change", (e) => {
    metro.mode = MODES.includes(e.target.value) ? e.target.value : "song";
    metroChanged();
  });
  relabelMetronome();
}

function relabelMetronome() {
  const count = $("metro-count");
  count.textContent = "";
  for (const n of COUNT_IN) count.append(new Option(n === 0 ? tr("Off") : trn(n, "{n} bar", "{n} bars"), String(n)));
  count.value = String(metro.countIn);
  const mode = $("metro-mode");
  mode.textContent = "";
  const plays = { count: tr("Count-in only"), song: tr("Whole song") };
  for (const k of MODES) mode.append(new Option(plays[k], k));
  mode.value = metro.mode;
  const silence = $("metro-silence");
  silence.textContent = "";
  const said = { metronome: tr("Metronome only"), all: tr("Metronome and tracks"), tracks: tr("Tracks only") };
  for (const k of ["all", "metronome", "tracks"]) silence.append(new Option(said[k], k));
  silence.value = metro.silence;
  if (metroFields.play) {
    metroFields.bpm.relabel(tr("Tempo of the metronome"));
    metroFields.volume.relabel(tr("Metronome volume"));
    if (metroSlider) metroSlider.setAttribute("aria-label", tr("Metronome volume"));
    metroFields.play.relabel(tr("Bars with the clicks"));
    metroFields.mute.relabel(tr("How many silent bars"));
  }
  $("metro-beats").textContent = "";
  renderMetronome();
}

// The controls as the settings and the song are now.
function renderMetronome() {
  const song = player.song;
  const g = app.grid;
  const off = !song;
  const lit = metro.on && !!song;
  for (const b of [$("metro-on"), $("metro-quick")]) {
    b.classList.toggle("on", lit);
    setAttr(b, "aria-pressed", String(lit));
    b.disabled = off;
  }
  const state = lit ? tr("On") : tr("Off");
  if ($("metro-state").textContent !== state) $("metro-state").textContent = state;
  $("metro").classList.toggle("off", !metro.on);
  // Its tempo: the song's while it follows it; its own, with the way back.
  const following = metroFollowing();
  metroFields.bpm.set(following ? g.bpm : metro.bpm);
  metroFields.bpm.disable(off);
  const back = $("metro-follow");
  back.hidden = !songGrid() || following;
  if (!back.hidden) {
    const title = tr("Back to the tempo of the song: {bpm} BPM", { bpm: fmtBpm(g.bpm) });
    setAttr(back, "title", title);
    setAttr(back, "aria-label", title);
  }
  metroFields.volume.set(metro.volume);
  metroFields.volume.disable(off);
  if (metroSlider) {
    if (+metroSlider.value !== metro.volume) metroSlider.value = String(metro.volume);
    metroSlider.disabled = off;
  }
  // One button per beat of the bar.
  const beats = $("metro-beats");
  const n = beatsPerBar(g.meter);
  const pattern = metro.patterns[g.meter] || [];
  if (beats.children.length !== n) {
    beats.textContent = "";
    for (let i = 0; i < n; i++) beats.append(h("button", { type: "button", class: "small beat", "data-i": String(i) }, String(i + 1)));
  }
  for (let i = 0; i < n; i++) {
    const b = beats.children[i];
    const kind = pattern[i];
    b.classList.toggle("accent", kind === ACCENT);
    b.classList.toggle("silent", kind === SILENT);
    const label = kind === ACCENT ? tr("Beat {n}: accent", { n: i + 1 }) : kind === SILENT ? tr("Beat {n}: silent", { n: i + 1 }) : tr("Beat {n}: beat", { n: i + 1 });
    setAttr(b, "aria-label", label);
    setAttr(b, "title", label);
    b.disabled = off;
  }
  metroFields.play.set(metro.play);
  metroFields.mute.set(metro.mute);
  // With the count-in only, the bars with and without the clicks do not apply.
  const countOnly = metro.mode === "count";
  $("metro").classList.toggle("count-only", countOnly);
  // The silent bars: their switch, then what they are, while it is on.
  const muteOn = metro.muteOn;
  const muteBtn = $("metro-mute-on");
  muteBtn.classList.toggle("on", muteOn && !!song);
  setAttr(muteBtn, "aria-pressed", String(muteOn));
  muteBtn.disabled = off || countOnly;
  const muteState = muteOn ? tr("On") : tr("Off");
  if ($("metro-mute-state").textContent !== muteState) $("metro-mute-state").textContent = muteState;
  $("metro").classList.toggle("mute-off", !muteOn);
  const cycleOff = off || countOnly || !muteOn;
  metroFields.play.disable(cycleOff);
  metroFields.mute.disable(cycleOff);
  // The words after the fields, as many bars as they say.
  const playUnit = trn(metro.play, "bar,", "bars,");
  if ($("metro-play-unit").textContent !== playUnit) $("metro-play-unit").textContent = playUnit;
  const muteUnit = trn(metro.mute, "bar", "bars");
  if ($("metro-mute-unit").textContent !== muteUnit) $("metro-mute-unit").textContent = muteUnit;
  const silence = $("metro-silence");
  if (document.activeElement !== silence) silence.value = metro.silence;
  silence.disabled = cycleOff;
  const random = $("metro-random");
  random.classList.toggle("on", metro.random);
  setAttr(random, "aria-pressed", String(metro.random));
  random.disabled = cycleOff;
  // At random: what it does, while it is on.
  const randomHint = $("metro-random-hint");
  randomHint.hidden = !song || !metro.random || cycleOff;
  if (!randomHint.hidden) {
    const total = metro.play + metro.mute;
    const text = metro.mute
      ? `${tr("Random: the muted bars come unannounced, {mute} in every {total} on average, so you cannot count them.", { mute: metro.mute, total })} ${trn(metro.play, "The first bar always plays.", "The first {n} bars always play.")}`
      : tr("Random: set some muted bars first.");
    if (randomHint.textContent !== text) randomHint.textContent = text;
  }
  const count = $("metro-count");
  if (document.activeElement !== count) count.value = String(metro.countIn);
  count.disabled = off;
  const mode = $("metro-mode");
  if (document.activeElement !== mode) mode.value = metro.mode;
  mode.disabled = off;
  // Count-in only, with no count-in: nothing to hear.
  const modeHint = $("metro-mode-hint");
  modeHint.hidden = !song || !(countOnly && metro.countIn === 0);
  const modeText = tr("Count-in only, with the count-in off: the metronome has nothing to play. Choose a count-in, or Whole song.");
  if (modeHint.textContent !== modeText) modeHint.textContent = modeText;
  // A song without bars: the click at the metronome's own tempo, from its start.
  const hint = $("metro-hint");
  hint.hidden = !song || songGrid();
  const text = tr("This song has no bars: the metronome clicks at its own tempo from the start of the song.");
  if (hint.textContent !== text) hint.textContent = text;
}

// The tempo of the grid at the speed set (Song analysis), beside the field of the
// grid's tempo: 120 BPM played at 80% is 96 BPM.
function renderTempoFound() {
  const line = $("tempo-bpm");
  const g = app.grid;
  const show = songGrid() && player.rate !== 1;
  line.hidden = !show;
  if (!show) return;
  const text = tr("{bpm} BPM at this speed", { bpm: fmtBpm(g.bpm * player.rate) });
  if (line.textContent !== text) line.textContent = text;
}

// ----- speed training ------------------------------------------------------------------
//
// A part of the metronome's card: with the loop on, the speed goes up (or
// down) by `step` % every `every` passes, until `target` %. Its settings are
// this browser's; it is off whenever a song opens.

const TRAINER_KEY = "euteria-trainer";
const trainer = (() => {
  const t = { on: false, step: 5, every: 1, target: 100 };
  try {
    const kept = JSON.parse(localStorage.getItem(TRAINER_KEY) || "null");
    if (kept && typeof kept === "object") {
      if (Number.isInteger(kept.step)) t.step = Math.max(1, Math.min(25, kept.step));
      if (Number.isInteger(kept.every)) t.every = Math.max(1, Math.min(16, kept.every));
      if (Number.isInteger(kept.target)) t.target = Math.max(50, Math.min(200, kept.target));
    }
  } catch (_) {}
  return t;
})();
let trainerPasses = 0; // passes of the loop since the last step
const trainerFields = {};

function saveTrainer() {
  try {
    localStorage.setItem(TRAINER_KEY, JSON.stringify({ step: trainer.step, every: trainer.every, target: trainer.target }));
  } catch (_) {}
}

function trainerChanged() {
  saveTrainer();
  renderTrainer();
}

// The loop went round `count` times.
function trainerPass(count) {
  if (!trainer.on || !player.song || !player.loop.on) return;
  trainerPasses += count;
  if (trainerPasses < trainer.every) return;
  trainerPasses = 0;
  const rate = Math.round(player.rate * 100);
  if (rate === trainer.target) return;
  const next = rate < trainer.target ? Math.min(trainer.target, rate + trainer.step) : Math.max(trainer.target, rate - trainer.step);
  player.setRate(next / 100);
  if (next === trainer.target) notice(tr("Speed {n}%: target reached.", { n: next }), "ok", 4000);
}

function wireTrainer() {
  $("trainer-on").addEventListener("click", () => {
    trainer.on = !trainer.on;
    trainerPasses = 0;
    trainerChanged();
  });
  trainerFields.step = numberField({ label: tr("Speed added each time"), min: 1, max: 25, unit: "%", onChange: (v) => ((trainer.step = v), trainerChanged()) });
  trainerFields.every = numberField({ label: tr("Passes of the loop between two steps"), min: 1, max: 16, onChange: (v) => ((trainer.every = v), trainerChanged()) });
  trainerFields.target = numberField({ label: tr("Speed to reach"), min: 50, max: 200, step: 5, unit: "%", onChange: (v) => ((trainer.target = v), trainerChanged()) });
  $("trainer-step-box").append(trainerFields.step.el);
  $("trainer-every-box").append(trainerFields.every.el);
  $("trainer-target-box").append(trainerFields.target.el);
  player.onloop = trainerPass;
}

function relabelTrainer() {
  if (!trainerFields.step) return;
  trainerFields.step.relabel(tr("Speed added each time"));
  trainerFields.every.relabel(tr("Passes of the loop between two steps"));
  trainerFields.target.relabel(tr("Speed to reach"));
  renderTrainer();
}

function renderTrainer() {
  const song = !!player.song;
  const b = $("trainer-on");
  b.classList.toggle("on", trainer.on);
  setAttr(b, "aria-pressed", String(trainer.on));
  b.disabled = !song;
  const state = trainer.on ? tr("On") : tr("Off");
  if ($("trainer-state").textContent !== state) $("trainer-state").textContent = state;
  $("trainer").classList.toggle("off", !trainer.on);
  trainerFields.step.set(trainer.step);
  trainerFields.every.set(trainer.every);
  trainerFields.target.set(trainer.target);
  for (const k of ["step", "every", "target"]) trainerFields[k].disable(!song);
  const hint = $("trainer-hint");
  hint.hidden = !song || !trainer.on || player.loop.on;
  const text = tr("Speed training changes the speed at each pass of the loop: switch the loop on.");
  if (hint.textContent !== text) hint.textContent = text;
}

// ----- the sections of the song ------------------------------------------------------
//
// Named in the lane of the sections (app/timeline.js): a tap on the bars
// selected opens the menu of the names (app/sectionmenu.js), whose choice goes
// to those bars (Editor.setSectionOf). With the loop on, the sections selected
// there are looped.

let sectionBars = null; // {lo, hi}: the bars the menu is open for

function openSectionMenu({ lo, hi, x, y, pointerType }) {
  if (!player.song || editor.locked || !app.grid.bars.length) return;
  sectionBars = { lo, hi };
  const list = app.grid.sections || [];
  const k = sectionIndexAt(list, lo);
  // The section the bars are, when they are exactly one: marked in the menu.
  const current = k >= 0 && list[k].lo === lo && list[k].hi === hi ? list[k] : null;
  const removable = list.some((s) => s.hi >= lo && s.lo <= hi);
  sectionMenu.show({ x, y, current, removable, pointerType });
}

async function pickSection(value) {
  const bars = sectionBars;
  sectionBars = null;
  if (!bars || !player.song) return;
  if (value && value.other) {
    const list = app.grid.sections || [];
    const k = sectionIndexAt(list, bars.lo);
    const label = await askName({
      title: tr("Name of the section"),
      hint: tr("A name of your own, for example Coda, Vamp or Tag."),
      ok: tr("OK"),
      value: k >= 0 && list[k].label ? list[k].label : "",
    });
    if (!label || !player.song) return;
    editor.setSectionOf(bars.lo, bars.hi, { label });
    return;
  }
  editor.setSectionOf(bars.lo, bars.hi, value);
}

// The loop over bars lo..hi (from the first beat of the first one to the end
// of the last one).
function loopBars(lo, hi) {
  const bars = app.grid.bars;
  if (!player.song || !bars.length) return;
  const a = Math.max(0, Math.min(lo, bars.length - 1));
  const b = Math.max(a, Math.min(hi, bars.length - 1));
  const end = b + 1 < bars.length ? bars[b + 1] : player.song.duration;
  player.setLoop({ on: true, start: bars[a], end });
}

// ----- the notation of the chords ---------------------------------------------------
//
// Letters (C D E…) or the Italian names (DO RE MI…), for every chord shown: the
// button beside the chord lane (a phone: beside the chord field) names the one
// it changes to. A choice of this browser.

const NOTATION_KEY = "euteria-notation";
try {
  setNotation(localStorage.getItem(NOTATION_KEY));
} catch (_) {}

function renderNotation() {
  const italian = getNotation() === "italian";
  const label = italian ? "C D E…" : "DO RE MI…";
  const title = italian ? tr("The chords are in the Italian names: click for letters (C D E…)") : tr("The chords are in letters: click for the Italian names (DO RE MI…)");
  for (const b of document.querySelectorAll(".notation-btn")) {
    if (b.textContent !== label) b.textContent = label;
    if (b.title !== title) b.title = title;
  }
}

function toggleNotation() {
  setNotation(getNotation() === "italian" ? "letters" : "italian");
  try {
    localStorage.setItem(NOTATION_KEY, getNotation());
  } catch (_) {}
  renderNotation();
  if (!player.song) return;
  editor.commitInput();
  app.timeline.setGrid(app.grid);
  editor.loadInput();
  scheduleUi();
}

// ----- Detect tempo and Detect chords ---------------------------------------------------
//
// Detect tempo (Song analysis) puts in place of the grid the one made from the
// beats found; Detect chords (Song analysis) writes the chords found in every
// bar, finding the tempo first for a song without a grid. What a song kept
// from an earlier detection is used at once, so the buttons bring back the
// grid or the chords as they were found after any change; else (a computer,
// Chrome or Edge) the song is analysed now (app/detect.js). Both ask for a
// second click before replacing a grid or chords.

let reopen = null; // the song whose Bars and Chords opens again after a detection

function startDetection(options) {
  const song = player.song;
  reopen = editor.on ? song : null;
  editor.setOn(false);
  detection.start(song, app.current.file, app.current.name, options);
}

function detectionFinished() {
  const song = reopen;
  reopen = null;
  if (song && song === player.song && !editor.on) editor.setOn(true);
}

// The grid from the beats a song kept: true if there was one to make.
function storedTempo() {
  const a = app.analysis;
  const fit = gridFromBeats(a.beats, a.downbeats || [], player.song.duration);
  if (!fit) {
    notice(tr("No steady beat found in this song: Bars and Chords works by hand."), "", 6000);
    return false;
  }
  const on = editor.on;
  editor.detected(fit);
  if (on) editor.setOn(true);
  notice(tr("The grid of the tempo found: {bpm} BPM in {meter}.", { bpm: fit.bpm.toFixed(1), meter: fit.meter }), "ok", 6000);
  return true;
}

function findTempo() {
  if (!player.song || detection.running) return;
  if (hasBeats(app.analysis)) {
    storedTempo();
    rememberSettings();
    scheduleUi();
    return;
  }
  startDetection({ tempo: true });
}

function findChords() {
  if (!player.song || detection.running) return;
  let grid = app.grid.bars.length > 0;
  if (!grid && hasBeats(app.analysis)) grid = storedTempo();
  if (!grid && hasBeats(app.analysis)) return;
  if (grid && hasChords(app.analysis)) {
    const n = editor.writeChords();
    if (!editor.on) notice(n ? trn(n, "Chord found in {n} bar: check it by ear.", "Chords found in {n} bars: check them by ear.") : tr("No chords found in this song."), "ok", 6000);
    rememberSettings();
    scheduleUi();
    return;
  }
  startDetection({ tempo: !grid, chords: !hasChords(app.analysis), write: true });
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
  endRename(false);
  detection.cancel();
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
      entry = await library.add(file, kind, (done, total) => notice(tr("Adding {name} to the library… {pct}%", { name: file.name, pct: Math.floor((done / total) * 100) }), "", 0, done / total));
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
    library.update(entry.id, { title: song.fileTitle, duration: song.duration, tracks: player.tracks.length, kind: song.kind, settingsKey: app.current.key, opened: Date.now() });
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
  $("new-project-phone").disabled = busy;
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
    await addRecent(handle, { title: song.fileTitle, size: file.size });
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
    await addRecent(item.handle, { title: song.fileTitle, size: file.size });
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
    await addRecent(handle, { title: song.fileTitle, size: file.size });
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
    onSelect: (sel, info) => {
      editor.onSelect(sel, info);
      // With the loop on, the sections selected (their lane) are looped.
      if (info && info.done && info.lane === "sections" && !info.cancelled && player.loop.on) loopBars(sel.lo, sel.hi);
    },
    onSectionMenu: openSectionMenu,
    // A stretch chosen on the bar numbers: with the loop on, the loop goes
    // there at once; else Loop loops it.
    onRange: (r) => {
      if (player.loop.on) player.setLoop({ on: true, start: r.start, end: r.end });
      scheduleUi();
    },
    // A bar tapped while Bars and Chords is closed: it opens on that bar.
    onBarTap: (i, info) => {
      if (editor.locked) notice(tr("Bars and Chords opens when the tempo detection ends."), "", 4000);
      else editor.openAt(i, info);
    },
  });
  detection = new TempoDetection({
    app,
    player,
    phone,
    notice,
    refreshPage: scheduleUi,
    apply: applyDetection,
    finished: detectionFinished,
  });
  confirmTap($("find-bpm"), () => (phone ? tr("Tap again to replace the grid") : tr("Click again to replace the grid")), findTempo, 4000, () => app.grid.bars.length > 0);
  confirmTap($("find-chords"), () => (phone ? tr("Tap again to rewrite the chords") : tr("Click again to rewrite the chords")), findChords, 4000, () => app.grid.chords.size > 0);
  wireMetronome();
  wireTrainer();
  separation = new SeparationFlow({
    app,
    player,
    phone,
    notice,
    practiceState,
    refreshPage: scheduleUi,
    waitTempo: () => detection.idle(),
    takes: () => recording.forNewProject(),
    openFile: async (file, handle) => {
      const song = await openSong(file, { source: "file", handle, separated: true });
      if (song) {
        await addRecent(handle, { title: song.fileTitle, size: file.size });
        renderRecent();
      }
      return song;
    },
  });
  sectionMenu = new SectionMenu({ phone, onPick: pickSection });
  editor = new Editor({
    app,
    player,
    phone,
    timeline: app.timeline,
    changed: settingsChanged,
    refreshPage: scheduleUi,
    locked: () => detection.running,
    notice,
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
  } else {
    // On a computer the tracks are the rows of the timeline; at the top of the
    // column of the tracks, beside the bars and the time scale, All stems and
    // Original only.
    $("tl-side-tools").prepend($("quick"));
    $("tl-hint").before($("tracks-note"));
  }
}

// The names of the fields above, in the language in use.
function relabelControls() {
  const f = app.fields;
  f.tempo.relabel(tr("Tempo"));
  if (f.tempoSlider) f.tempoSlider.setAttribute("aria-label", tr("Tempo"));
  f.key.relabel(tr("Key"));
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

// Loop: on the stretch chosen on the bar numbers (or the loop of before),
// if it is in view; else as loopInView() says.
function toggleLoop() {
  if (!player.song) return;
  if (player.loop.on) {
    player.setLoop({ ...player.loop, on: false });
    return;
  }
  const r = app.timeline.range;
  const [v0, v1] = app.timeline.visibleRange();
  const chosen = r && r.end - r.start >= MIN_LOOP && r.end > v0 && r.start < v1;
  player.setLoop({ on: true, ...(chosen ? { start: r.start, end: r.end } : loopInView()) });
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
  showTitle();
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
  // The grid goes on to the song's end when a take made it longer, and back
  // when it is shorter again (not when it opens: its grid is its own).
  if (app.gridFit && app.gridFit.song === song && app.gridFit.duration !== song.duration) app.grid = extendGrid(app.grid, song.duration);
  app.gridFit = { song, duration: song.duration };
  app.shownDuration = song.duration;
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
  tr("The stems and the takes that are on, as they sound now (volumes, tempo, key); with no stem on, the Original Track. The MP3 files of this song stay here until EUTERIA closes: they are not saved in the project.");
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
  if (player.song.kind === "audio" || (cur.created && !cur.handle)) return "showSaveFilePicker" in window ? "new-file" : "copy";
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
function reportSave(text, kind = "", ms = 6000, action = null) {
  notice(text, kind, ms, null, action);
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
  player.song.fileTitle = player.song.title; // and its name
  app.analysisInFile = !!app.analysis; // the file has the tempo detection now
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
    library.update(cur.entryId, { settingsKey: cur.key, kind: "project", title: player.song.title });
    renderLibrary();
  }
  showSongMeta();
}

// The file of a project takes the project's name in its folder (Chrome and
// Edge move files), before anything is written. Chrome, as it is now,
// renames a file only for a page that may write its folder (earlier, right
// after a click): EUTERIA holds the file alone, so it is mostly refused, and
// Save then asks where to write the project under its new name (saveSong()).
// Resolves with {moved, id (its entry in the songs opened), from (the old
// name)} or {why: "browser", "taken", "failed", error}. Not onto a file the
// app may write: Chrome lets a file moved onto such a file replace it.
async function renameFile(handle, wanted) {
  const from = handle.name;
  if (typeof handle.move !== "function") return { why: "browser" };
  if (await recentWritable(wanted, handle)) return { why: "taken" };
  const id = await recentId(handle);
  try {
    await handle.move(wanted);
  } catch (error) {
    return { why: "failed", error: (error && error.message) || String(error) };
  }
  // Read from its new place from now on (the old one is gone), and listed so.
  try {
    const file = await handle.getFile();
    app.current.file = file;
    app.current.name = file.name;
    await addRecent(handle, { title: player.song.fileTitle, size: file.size, id });
    renderRecent();
  } catch (_) {}
  return { moved: true, id, from };
}

// A project written in its file: read back, listed in the songs opened.
// rename: what renameFile() said, if it was asked. Resolves with the message:
// {text, kind, ms}.
async function savedInFile(manifest, rename) {
  const cur = app.current;
  const song = player.song;
  const handle = cur.handle;
  const saved = await handle.getFile();
  await checkSaved(saved, manifest.project_id);
  savedInPlace(saved, manifest);
  await addRecent(handle, { title: song.title, size: saved.size });
  renderRecent();
  const name = saved.name;
  const wanted = `${safeName(song.title)}.euteria`;
  const kept = (text) => ({ text, kind: "", ms: 12000 });
  if (!rename) return { text: tr("Saved in {name}.", { name }), kind: "ok", ms: 6000 };
  if (rename.moved) return { text: tr("Saved: the file is now {name}.", { name }), kind: "ok", ms: 6000 };
  if (rename.why === "declined") return kept(tr("Saved in {name}: the file keeps its name.", { name }));
  // Refused, and the save dialog could not open in that click (a permission
  // asked first may have used it up): Rename… opens it with a click of its own.
  if ("showSaveFilePicker" in window) {
    return { text: tr("Saved in {name}. Rename gives the file the project's name, {wanted}.", { name, wanted }), kind: "", ms: 0, action: { label: tr("Rename…"), run: renameWithDialog } };
  }
  if (rename.why === "browser") return kept(tr("Saved in {name}. This browser cannot rename files: rename it {wanted} in its folder if you like.", { name, wanted }));
  if (rename.why === "taken") return kept(tr("Saved in {name}. It was not renamed {wanted}: a file with that name may already be in its folder.", { name, wanted }));
  return kept(tr("Saved in {name}. It could not be renamed {wanted}: {error}", { name, wanted, error: rename.error }));
}

// Rename…: the save dialog in the file's folder, the project's name filled
// in, opened by a click of its own; the project written in the file chosen,
// then the old file removed (saveSong()).
async function renameWithDialog() {
  const cur = app.current;
  const song = player.song;
  if (!song || !cur || !cur.handle || player.busy || app.saving) return;
  let picked;
  try {
    picked = await window.showSaveFilePicker({
      suggestedName: `${safeName(song.title)}.euteria`,
      startIn: cur.handle,
      types: [{ description: tr("EUTERIA project"), accept: { "application/x-euteria": [".euteria"] } }],
    });
  } catch (error) {
    if (error && error.name === "AbortError") return;
    reportSave(tr("The save dialog could not open: {error}", { error: (error && error.message) || error }), "error", 0);
    return;
  }
  if (await picked.isSameEntry(cur.handle)) return;
  await saveSong({ renameTo: picked });
}

// Resolves with how it was saved ("library", "file", "new-file", "copy"),
// or false. quiet: no message when it worked. made: the project just shared
// (projectNow()), saved as it is. renameTo: the file chosen in the save
// dialog of Rename… (renameWithDialog()), which takes the project's place.
async function saveSong({ quiet = false, made = null, renameTo = null } = {}) {
  const song = player.song;
  const cur = app.current;
  if (!song || !cur || player.busy || app.saving) return false;
  if (recording.busy) {
    notice(recording.recording ? tr("Stop recording first, then save.") : tr("Wait a moment: the take is being prepared."), "", 4000);
    return false;
  }
  editor.commitInput();
  const say = (text, kind) => quiet || reportSave(text, kind);
  // The project's name is its file's too (in the library, its entry's; a
  // copy's).
  const wanted = `${safeName(song.title)}.euteria`;
  const told = (m) => (quiet && m.kind === "ok") || reportSave(m.text, m.kind, m.ms, m.action || null);
  let mode = saveMode();
  let target = null;
  // What needs the click comes first: the permission to write, the place,
  // the file's new name.
  if (mode === "file" && !(await writePermission(cur.handle))) {
    mode = "copy";
    reportSave(tr("EUTERIA may not write the file: a copy is downloaded instead."));
  }
  let rename = mode === "file" && !renameTo && cur.handle.name !== wanted ? await renameFile(cur.handle, wanted) : null;
  // The rename refused: the save dialog, in the file's folder with the new
  // name. Confirmed, the project is written there and the old file removed
  // (a rename in two steps); not, it is saved where it is, and not asked
  // again for that name until the page is opened again.
  let replaces = null; // the file the one chosen replaces
  const askKey = rename && `${cur.handle.name}|${wanted}`;
  if (rename && !rename.moved && "showSaveFilePicker" in window && app.renameDeclined.has(askKey)) rename = { why: "declined" };
  else if (rename && !rename.moved && "showSaveFilePicker" in window) {
    try {
      const picked = await window.showSaveFilePicker({
        suggestedName: wanted,
        startIn: cur.handle,
        types: [{ description: tr("EUTERIA project"), accept: { "application/x-euteria": [".euteria"] } }],
      });
      // The same file chosen: saved where it is, under its name.
      if (await picked.isSameEntry(cur.handle)) {
        app.renameDeclined.add(askKey);
        rename = { why: "declined" };
      } else {
        target = picked;
        replaces = cur.handle;
        mode = "new-file";
      }
    } catch (error) {
      if (error && error.name === "AbortError") {
        app.renameDeclined.add(askKey);
        rename = { why: "declined" };
      }
    }
  }
  if (renameTo && mode === "file") {
    target = renameTo;
    replaces = cur.handle;
    mode = "new-file";
  }
  if (mode === "new-file" && !target) {
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
        : newProjectManifest({ id: newProjectId(), title: song.title, fileName: file.name, member, grid: app.grid, state: practiceState(), takes, analysis: app.analysis });
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
    const manifest = made ? made.manifest : savedManifest(song.manifest, app.grid, practiceState(), takes, app.analysis, song.title);
    const bytes = manifestBytes(manifest);
    const zip = await openZip(file);
    if (mode === "new-file") {
      // A project made here, saved for the first time where the user chooses.
      const blob = made ? made.blob : composeEdited(file, await zipLayout(zip), { manifestBytes: bytes, drop: recording.dropMembers, add: recording.membersToAdd() });
      const w = await target.createWritable();
      try {
        await w.write(blob);
        await w.close();
      } catch (error) {
        await w.abort().catch(() => {});
        throw error;
      }
      const saved = await target.getFile();
      await checkSaved(saved, manifest.project_id);
      cur.handle = target;
      cur.source = "file";
      savedInPlace(saved, manifest);
      // A rename in two steps: the old file goes once the new one is read
      // back whole, and the new one takes its place in the songs opened.
      let kept = null;
      let id = null;
      if (replaces) {
        id = await recentId(replaces);
        try {
          await replaces.remove();
        } catch (_) {
          kept = replaces.name;
        }
      }
      await addRecent(target, { title: song.title, size: saved.size, id });
      renderRecent();
      if (!replaces) say(tr("Saved in {name}.", { name: saved.name }), "ok");
      else if (!kept) say(tr("Saved: the file is now {name}.", { name: saved.name }), "ok");
      else reportSave(tr("Saved in {name}. The old file, {old}, could not be deleted: delete it in its folder if you like.", { name: saved.name, old: kept }), "", 12000);
      return mode;
    }
    if (recording.rewrite) {
      const blob = made ? made.blob : composeEdited(file, await zipLayout(zip), { manifestBytes: bytes, drop: recording.dropMembers, add: recording.membersToAdd() });
      if (mode === "library") {
        const entry = library.get(cur.entryId);
        await library.replace(entry, blob, wanted, "project");
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
        told(await savedInFile(manifest, rename));
      } else {
        const name = wanted;
        downloadBlob(blob, name);
        editor.saved(false);
        recording.saved(false);
        rememberSettings();
        say(tr("Downloaded a copy with the changes: {name}.", { name }), "ok");
      }
      return mode;
    }
    if (mode === "library") {
      const entry = library.get(cur.entryId);
      const { at, bytes: tail } = await manifestPatch(zip, bytes);
      await library.patch(entry, at, tail);
      if (entry.name !== wanted) library.update(cur.entryId, { name: wanted });
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
      told(await savedInFile(manifest, rename));
    } else {
      const name = wanted;
      downloadBlob(composeEdited(file, await zipLayout(zip), { manifestBytes: bytes }), name);
      editor.saved(false);
      recording.saved(false);
      rememberSettings();
      say(tr("Downloaded a copy with the changes: {name}.", { name }), "ok");
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
// The project as it is now: {manifest, blob, file}, or null if what it needs
// is not ready. as: {id, title} for a new project (Save as new project).
function projectNow(as = null) {
  const song = player.song;
  const cur = app.current;
  const ready = cur && cur.ready;
  if (!song || !ready || ready.file !== cur.file || recording.busy) return null;
  const add = recording.membersToAdd();
  if (!add) return null;
  const takes = recording.takes;
  const title = as ? as.title : song.title;
  if (isAudioSong(song)) {
    if (ready.crc == null) return null;
    const member = audioMember(cur.file);
    const manifest = newProjectManifest({ id: as ? as.id : newProjectId(), title, fileName: cur.file.name, member, grid: app.grid, state: practiceState(), takes, analysis: app.analysis });
    const blob = composeProject([
      { name: "manifest.json", data: manifestBytes(manifest) },
      { name: member, data: cur.file, crc: ready.crc },
      ...add,
    ]);
    return { manifest, blob, file: new File([blob], `${safeName(title)}.euteria`, { type: "application/zip" }) };
  }
  if (!ready.layout) return null;
  const manifest = savedManifest(song.manifest, app.grid, practiceState(), takes, app.analysis, title);
  if (as) manifest.project_id = as.id;
  const blob = composeEdited(cur.file, ready.layout, { manifestBytes: manifestBytes(manifest), drop: recording.dropMembers, add });
  return { manifest, blob, file: new File([blob], `${safeName(title)}.euteria`, { type: "application/zip" }) };
}

// ----- new projects: an empty one, or the song saved as a new project ------------------

// The name asked in a small window: resolves with it, or null.
function askName({ title, hint = "", ok, value = "" }) {
  const dialog = $("name-dialog");
  const input = $("name-input");
  $("name-title").textContent = title;
  $("name-hint").textContent = hint;
  $("name-ok").textContent = ok;
  input.value = value;
  $("name-ok").disabled = !value.trim();
  return new Promise((resolve) => {
    const done = () => {
      dialog.removeEventListener("close", done);
      const name = input.value.trim().replace(/\s+/g, " ").slice(0, 120);
      resolve(dialog.returnValue === "ok" && name ? name : null);
    };
    dialog.returnValue = "";
    dialog.addEventListener("close", done);
    dialog.showModal();
    input.focus();
    input.select();
  });
}

// "New project", or "New project 2"…: a name not taken in the library or
// among the recent songs.
async function freshName(base) {
  const list = library ? library.list() : await listRecent();
  const taken = new Set(list.map((e) => String(e.title || "").toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
}

const EMPTY_BPM = 120;
const EMPTY_BARS = 16; // the length of an empty project, before a take makes it longer

// A project with no audio, to record into: a grid at 120 BPM in 4/4 for the
// metronome and the chords, 16 bars long until a take goes past them. On the
// phone it goes in the library at once; on a computer Save asks where.
async function newEmptyProject() {
  if (player.busy || app.adding || app.saving) return;
  if (!(await confirmLeave())) return;
  const name = await askName({
    title: tr("New empty project"),
    hint: tr("A project with no audio, to record into: Rec records, with the metronome if you like, and the project gets longer as you play."),
    ok: tr("Create"),
    value: await freshName(tr("New project")),
  });
  if (!name) return;
  const length = (EMPTY_BARS * 4 * 60) / EMPTY_BPM;
  const grid = newGrid(EMPTY_BPM, "4/4", length);
  const state = { rate: 1, semitones: 0, loop: null, gridVisible: true, tracks: [] };
  const manifest = emptyProjectManifest({ id: newProjectId(), title: name, grid, state, length });
  const blob = await buildProject([{ name: "manifest.json", data: manifestBytes(manifest) }]);
  const file = new File([blob], `${safeName(name)}.euteria`, { type: "application/zip" });
  if (!library) {
    await openSong(file, { source: "file", created: true });
    return;
  }
  app.adding = true;
  renderLibrary();
  let entry = null;
  try {
    entry = await library.add(file, "project");
    app.persisted = await requestPersistence();
  } catch (error) {
    notice((error && error.message) || String(error), "error");
  }
  app.adding = false;
  renderLibrary();
  if (entry) await openEntry(entry, true);
}

// Save as new project: the song as it is now, with a new name, in a new
// project; the song goes on as that project, and the one saved before stays
// as it was saved (its changes not saved go with the copy).
async function saveAsNew() {
  const song = player.song;
  const cur = app.current;
  if (!song || !cur || player.busy || app.saving || app.sharing) return;
  if (recording.busy) {
    notice(recording.recording ? tr("Stop recording first, then save.") : tr("Wait a moment: the take is being prepared."), "", 4000);
    return;
  }
  editor.commitInput();
  const name = await askName({
    title: tr("Save as new project"),
    hint: tr("The song as it is now, in a new project with this name. You go on working on the new one; the one saved before stays as it was saved."),
    ok: tr("Save"),
    value: tr("{title} (copy)", { title: song.title }),
  });
  if (!name) return;
  const fileName = `${safeName(name)}.euteria`;
  let target = null;
  if (!library && "showSaveFilePicker" in window) {
    try {
      target = await window.showSaveFilePicker({
        id: "euteria-songs",
        suggestedName: fileName,
        types: [{ description: tr("EUTERIA project"), accept: { "application/x-euteria": [".euteria"] } }],
      });
    } catch (error) {
      if (error && error.name === "AbortError") return;
    }
  }
  app.saving = true;
  scheduleUi();
  try {
    await prepareShare();
    await recording.ready();
    const made = projectNow({ id: newProjectId(), title: name });
    if (!made) throw new Error(tr("Its file could not be read: open the song again."));
    const oldKey = cur.key;
    if (library) {
      const estimate = await storageEstimate();
      if (estimate && estimate.quota && estimate.quota - estimate.usage < made.blob.size * 1.05 + 5e6) {
        throw new Error(tr("There is not enough space for {name} ({size}). Delete songs you no longer need, or free some space on the device.", { name: fileName, size: fmtSize(made.blob.size) }));
      }
      const entry = await library.add(new File([made.blob], fileName, { type: "application/zip" }), "project");
      const saved = await library.file(entry);
      await checkSaved(saved, made.manifest.project_id);
      song.title = name;
      cur.source = "library";
      cur.entryId = entry.id;
      cur.created = false;
      savedInPlace(saved, made.manifest);
    } else if (target) {
      const w = await target.createWritable();
      try {
        await w.write(made.blob);
        await w.close();
      } catch (error) {
        await w.abort().catch(() => {});
        throw error;
      }
      const saved = await target.getFile();
      await checkSaved(saved, made.manifest.project_id);
      song.title = name;
      cur.handle = target;
      cur.source = "file";
      cur.created = false;
      savedInPlace(saved, made.manifest);
      await addRecent(target, { title: name, size: saved.size });
      renderRecent();
    } else {
      downloadBlob(made.blob, fileName);
      reportSave(tr("Downloaded: {name}. Open it to go on with the new project.", { name: fileName }), "ok");
      return;
    }
    // The song saved before: as it was saved, its changes gone with the copy.
    if (oldKey && oldKey !== cur.key) forgetSettings(oldKey);
    showTitle();
    renderLibrary();
    reportSave(tr("Saved as a new project: {name}.", { name }), "ok");
  } catch (error) {
    reportSave(tr("The song could not be saved. {error}", { error: (error && error.message) || error }), "error", 0);
  } finally {
    app.saving = false;
    scheduleUi();
  }
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
      text += ` ${recording.dirty || retitled() ? tr("Save first, at the top right: the changes are not in the file yet.") : tr("Save first, at the top right: the changes to the bars and chords are not in the file yet.")}`;
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
  // The song grew (a take recorded past its end) or went back: the tracks
  // and the timeline are drawn again, the grid fitted to it.
  if (song && app.shownDuration !== undefined && app.shownDuration !== song.duration && app.view === "player") {
    renderPlayer(app.timeline.getView()); // and updateUi() again
    return;
  }
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
  // The grid shown or hidden: the eye beside Bars and chords.
  const hasGrid = !!(song && app.grid.bars.length);
  // While the tempo is being found, the grid waits for it.
  $("grid-eye").disabled = detection.running;
  $("grid-view").hidden = !hasGrid;
  renderNotation();
  const eye = $("grid-eye");
  setIcon(eye, app.gridVisible ? "eye" : "eyeClosed");
  eye.setAttribute("aria-pressed", String(app.gridVisible));
  eye.title = app.gridVisible ? tr("The grid is shown: click to hide it") : tr("The grid is hidden: click to show it");
  // Nothing over the waveforms: why, first (no bars yet, or hidden).
  const state = !song ? "" : !hasGrid ? HINTS.noGrid() : !app.gridVisible ? HINTS.hidden() : "";
  const hint = state ? `${state} ${HINTS.view()}` : (editor.on && song ? HINTS.edit : HINTS.view)();
  if ($("tl-hint").textContent !== hint) $("tl-hint").textContent = hint;
  editor.refresh();
  // Separating the instruments (a song without stems, on a computer); once the
  // song has its stems, the button stays, grey.
  const sep = $("separate");
  const separable = !phone && !!song && separation.applicable;
  const separated = !phone && !!song && player.hasStems;
  sep.hidden = !(separable || separated);
  if (separable) {
    sep.disabled = !separation.supported || separation.running || busy || takesBusy;
    sep.classList.toggle("running", separation.running);
    const label = separation.running ? tr("Separating…") : tr("Separate instruments");
    if (sep.textContent !== label) sep.textContent = label;
    const title = separation.supported ? tr("Separate the six instruments of this song and save them with it in an EUTERIA project (.euteria)") : separation.reason;
    if (sep.title !== title) sep.title = title;
  } else if (separated) {
    sep.disabled = true;
    sep.classList.remove("running");
    const label = tr("Separate instruments");
    if (sep.textContent !== label) sep.textContent = label;
    const title = tr("The instruments of this song are separated already.");
    if (sep.title !== title) sep.title = title;
  }
  if (song && !ownAudio()) {
    const note = tr("This project has no audio of its own: Rec records a take, with the metronome if you like, and the project gets longer as you play.");
    if ($("tracks-note").textContent !== note) $("tracks-note").textContent = note;
  } else if (song && !player.hasStems) {
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
  renderTempoFound();
  f.tempo.disable(!song || locked);
  if (f.tempoSlider) {
    if (+f.tempoSlider.value !== tempo) f.tempoSlider.value = String(tempo);
    f.tempoSlider.disabled = !song || locked;
  }
  f.key.set(player.semitones);
  f.key.disable(!song || locked);
  // The metronome: as songDefaults() with every song that opens, the speed
  // trainer off; its tempo follows the grid again when the grid's tempo,
  // anchor or meter change; its clicks made again when the grid or the beats
  // found change.
  if (metroFor.song !== song && song) {
    // Off, a count-in of one bar, the count-in only, no silent bars.
    songDefaults(metro);
    trainer.on = false;
    trainerPasses = 0;
  }
  const tempoKey = songGrid() ? `${app.grid.bpm}|${app.grid.bars[0]}|${app.grid.meter}` : "";
  if (tempoKey !== metroTempoKey) {
    metroTempoKey = tempoKey;
    metroFollow = true;
  }
  if (metroFor.song !== song || metroFor.grid !== app.grid || metroFor.analysis !== app.analysis) {
    metroFor = { song, grid: app.grid, analysis: app.analysis };
    pushMetronome(true);
  }
  renderMetronome();
  renderTrainer();
  // Detect tempo and Detect chords: on a computer that can find them, or with
  // what the song kept from an earlier detection. Not on the phone, which
  // plays the projects a computer prepared (app/detect.js).
  const findBpm = $("find-bpm");
  findBpm.hidden = phone || !song || !ownAudio() || !(detection.supported || hasBeats(app.analysis));
  findBpm.disabled = !song || locked || detection.running;
  const findChordsBtn = $("find-chords");
  findChordsBtn.hidden = phone || !song || !ownAudio() || !(detection.supported || (hasChords(app.analysis) && (app.grid.bars.length > 0 || hasBeats(app.analysis))));
  findChordsBtn.disabled = !song || locked || detection.running;
  // The chords follow the key: shown, and typed, in the key of now.
  app.timeline.setChordShift(player.semitones);
  editor.setShift(player.semitones);

  const lp = player.loop;
  const quick = $("loop-quick");
  quick.classList.toggle("on", lp.on);
  quick.setAttribute("aria-pressed", String(lp.on));
  quick.disabled = !song || locked;
  recording.refresh();

  // Export MP3 works with any song: the Original Track alone too, with its tempo, key or
  // volume changed (player.exportMp3 says so when it is not).
  $("export").disabled = !ready || takesBusy;
  $("export").textContent = player.busy === "exporting" ? tr("Exporting…") : tr("Export MP3");
  const exportHint = EXPORT_HINT();
  if ($("export-hint").textContent !== exportHint) $("export-hint").textContent = exportHint;
  $("key-hint").hidden = !!song && !player.hasStems;

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
  $("save-as").disabled = !song || busy || app.saving || app.sharing || takesBusy;
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
  $("save-as").addEventListener("click", saveAsNew);
  $("new-project").addEventListener("click", newEmptyProject);
  $("new-project-phone").addEventListener("click", newEmptyProject);
  $("name-input").addEventListener("input", () => {
    $("name-ok").disabled = !$("name-input").value.trim();
  });
  $("now-open").addEventListener("click", () => showView("player"));
  $("now-play").addEventListener("click", () => {
    player.unlock();
    player.toggle();
  });

  // The band of the messages: ✕ closes an error; its button does what it offers.
  $("notice-close").addEventListener("click", () => notice(""));
  $("notice-action").addEventListener("click", () => {
    const action = noticeAction;
    notice("");
    if (action) action.run();
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
  $("loop-quick").addEventListener("click", toggleLoop);
  $("zoom-in").addEventListener("click", () => app.timeline.zoomBy(1.5));
  $("zoom-out").addEventListener("click", () => app.timeline.zoomBy(1 / 1.5));
  $("zoom-level").addEventListener("click", () => {
    app.timeline.setView({ zoom: 1, start: 0 });
    settingsChanged();
  });
  for (const b of document.querySelectorAll(".notation-btn")) b.addEventListener("click", toggleNotation);
  renderNotation();
  // The eye: the bars and the chords shown, and editable, or hidden.
  $("grid-eye").addEventListener("click", () => {
    app.gridVisible = !app.gridVisible;
    app.timeline.setGridVisible(app.gridVisible);
    editor.setOn(app.gridVisible);
    sectionMenu.close();
    settingsChanged();
    scheduleUi();
  });
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
  if (document.querySelector("dialog[open]")) return; // the keys belong to the window open over the song

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
  } else if ((e.key === "m" || e.key === "M") && !e.repeat) {
    toggleMetronome();
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

// ----- the instructions --------------------------------------------------------------------------
//
// Instructions, at the top right, opens a window with how to use EUTERIA, in
// the language in use (both texts are in index.html). It scrolls when the
// text is longer than the window; ✕, Esc or a click beside it closes it.
// Closed with the mouse, the button gives the focus back, so that the Space
// bar plays and pauses instead of opening the window again.

function wireHelp() {
  const button = $("help");
  const dialog = $("help-dialog");
  let pointer = "";
  let downBeside = false; // pressed beside the window, not in its text (selecting it)
  button.addEventListener("click", () => {
    if (!dialog.open) dialog.showModal();
  });
  $("help-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("pointerdown", (e) => {
    pointer = e.pointerType;
    downBeside = e.target === dialog;
  });
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog && downBeside) dialog.close(); // beside the window: its backdrop
  });
  dialog.addEventListener("keydown", () => (pointer = "key"));
  dialog.addEventListener("close", () => {
    if (pointer === "mouse") setTimeout(() => document.activeElement === button && button.blur(), 0);
    pointer = "";
  });
}

// ----- the name of the project ------------------------------------------------------
//
// The song's name at the top is the project's: a click (a tap) on it turns it
// into a field to rename it. Return or leaving the field keeps the new name,
// Escape the old one. A new name is a change to save, as the bars and chords
// are: Save writes it in the project and the file takes it as its name (in
// its folder with Chrome and Edge, renamed first: renameFile(); in the
// library; in a copy downloaded or shared), Don't save brings back the
// file's. A file whose name is not the project's takes it at any Save.

function showTitle() {
  const song = player.song;
  $("song-title").textContent = song ? song.title : "";
  $("song-title").disabled = !song;
}

function startRename() {
  const song = player.song;
  if (!song || app.saving) return;
  const input = $("song-title-input");
  input.value = song.title;
  $("song-title-h").hidden = true;
  input.hidden = false;
  input.focus();
  input.select();
}

// keep: the name typed becomes the project's (an empty one changes nothing).
function endRename(keep) {
  const input = $("song-title-input");
  if (input.hidden) return;
  input.hidden = true;
  $("song-title-h").hidden = false;
  const song = player.song;
  const name = input.value.trim().replace(/\s+/g, " ");
  if (!keep || !song || !name || name === song.title) return;
  song.title = name;
  showTitle();
  rememberSettings();
  scheduleUi();
}

function wireTitle() {
  const input = $("song-title-input");
  $("song-title").addEventListener("click", startRename);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === "Escape") {
      e.preventDefault();
      endRename(e.key === "Enter");
    }
  });
  input.addEventListener("blur", () => endRename(true));
}

// Every text the code wrote, again in the language now in use.
function relabel() {
  if (!editor) return; // this browser cannot run EUTERIA: only its notice
  relabelControls();
  relabelMetronome();
  relabelTrainer();
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
  wireHelp();
  wireTitle();
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
  detection.init();
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
  get detection() {
    return detection;
  },
  get recording() {
    return recording;
  },
  openSong,
  renderRecent,
  saveMode,
};

init();
