// The timeline of the player, from the top: the notes (2.21), the sections of
// the song, the chords and, under them, the bar numbers (when there is a grid
// and it is shown), the time scale (on a smartphone under the tracks, 2.22:
// thicker there, for a finger to drag), then the
// waveform of each track (one row on the phone, one per track on a computer)
// with the bar grid over it. The loop and the playhead are drawn over the
// tracks only, so that the bars and their chords stay free to be clicked.
// Only the part of the song in view is drawn. While a take is recorded, its
// waveform grows in a row of its own at the bottom.
//
// Two panes, each with its two canvases (2.22): the lanes (and, on a
// computer, the time scale) in the head pane, the tracks in the body pane.
// On a computer the head pane stays in view (sticky) while the page scrolls
// down the tracks, as the transport over it does; a press on it is read in
// its own place (_point()). The drawing works in one frame from the top of
// the head down, each pane drawing its part.
//
// The same with a mouse and a finger: on the waveforms, a tap or a click
// places the playhead, dragging from inside the loop moves the loop (keeping
// its length), dragging from anywhere else drags the playhead. The loop's
// edges are dragged by its handles at the bottom of the time scale (with a
// mouse, anywhere along them). Edges and loop move by the step of the bar
// numbers, the eighth note when zoomed in enough (_rangeStep(); Alt or Option
// moves them freely). A tap on the time scale places the playhead, dragging
// it scrolls; pinching, ctrl+wheel (a trackpad pinch) or the zoom buttons
// zoom from the whole song (100%) to about 100 pixels per second. The
// overview over the timeline shows the whole song, the part in view and the
// loop: dragging their frames moves the view or the loop, a tap elsewhere
// brings the view there. While the song plays the view follows the playhead,
// except for a few seconds after the user moved it.
//
// On a computer each track is its clips (src/clips.js): the strip at the top
// of its row has one block for each, over the part of the waveform it plays.
// A click on a block selects that clip (shift-click: more of them; Escape,
// in app/app.js, none), dragging it moves the clips selected by the step of
// the bar numbers, keeping where they are against the beats (Alt or Option:
// freely), on top of the others of their track (onClips): where clips
// overlap both play (2.15). A click where they overlap takes the one on top
// (the last one moved), a click again on it the one under it, and so on. The
// edges of a clip shorten or lengthen it, as far as the track's audio goes;
// the knobs at the corners of a clip selected, or under the mouse, fade it
// in and out. The rest of the row is the playhead's, as before, so that the
// playhead can be placed in a clip selected to cut it there (C, in
// app/app.js).
//
// A drag that selects bars, chooses a stretch of the bar numbers, or moves
// clips or the loop scrolls the view when it reaches an edge of the timeline
// (or goes past it), and goes on there (2.15).
//
// The chords are for the chords, each on the beat where it starts: while the
// grid and the chords are edited, a tap or a click on a chord selects its
// bar, with its first beat; a tap or a click again on that bar says the beat
// it was on (its slot, src/grid.js; 2.20), dragging along them (or
// shift-click) selects several; otherwise a tap on a bar asks for its chord
// to be edited (onBarTap), from its first beat, and dragging scrolls. The beat being
// written is marked in the bars selected (setActiveSlot). The chords are
// shown in the key the song is played in (setChordShift, src/chordnames.js).
//
// The bar numbers choose a stretch of the song for the loop (onRange): a tap
// takes the bar, dragging along them a stretch by the eighth note (half a
// beat in 3/4 and 4/4, a beat in 6/8; by the beat, or the bar, when the song
// is zoomed out so far that eighths are too close together), shift-click
// takes in more bars. With the loop on, the loop is that stretch
// (setLoop()), and a new one moves it.
//
// The lane of the sections (src/sections.js) selects in the same way, a
// section at a time: a tap on a section selects all its bars, on a bar
// without one that bar; dragging, or shift-click, takes in the next ones. A
// tap on the bars selected opens the menu of the names (onSectionMenu). With
// the loop on, what is selected there is looped (onSelect says the lane): a
// tap on a section among several selected takes that one alone, and the menu
// opens once the loop is on the bars selected. With
// the loop on, shift-click on the time scale moves an edge of the loop to the
// nearest beat (before the loop or after it, the loop grows; inside, the
// nearer edge comes in).
//
// The lane of the notes (2.21, src/notes.js), at the top: a line where each
// bar starts, always, and the notes as blocks along their bars, those that
// overlap one under the other (the lane grows a row for them). A tap or a
// click there: on the bars selected, the first time (a section selected, say),
// their note; a tap again there, the note or the bar under it alone;
// elsewhere, the note under it (all its bars), or the bar. Dragging along it
// selects several bars, shift-click takes in more. onSelect says the lane
// ("notes", and again: a tap again on the bars picked there), for the field
// Note (app/editor.js). With a mouse, resting on the notes, the chords or the
// sections shows what they say, whole, in a box beside it (_tip()).

import { barNumber, barAt, slotTimes, slotAt, slotBeats, chordTexts } from "../src/grid.js";
import { noteRows, notesAt } from "../src/notes.js";
import { chordView } from "../src/chordnames.js";
import { sectionTitles, sectionColor, sectionIndexAt } from "../src/sections.js";
import { PEAK_BUCKET } from "../src/peaks.js";
import { wholeClip, clipsAt, move as moveClips, trim as trimClip, fade as fadeClip } from "../src/clips.js";
import { tr } from "../src/i18n.js";

const C = {
  ruler: "#141a1b",
  row: "#131719",
  overview: "#101416",
  border: "#30383d",
  text: "#edf0ec",
  dim: "#697471",
  time: "#7f8c8e",
  chord: "#e8cf9c",
  note: "#8fb3e0", // the notes (2.21)
  beat: "#465b59",
  bar: "rgba(215, 220, 218, 0.5)",
  sep: "rgba(215, 220, 218, 0.22)",
  loop: "#6bb7aa",
  loopGlow: "rgba(107, 183, 170, 0.28)",
  loopFill: "rgba(107, 183, 170, 0.12)",
  range: "rgba(107, 183, 170, 0.3)",
  select: "rgba(214, 168, 95, 0.26)",
  selectEdge: "#d6a85f",
  slot: "rgba(214, 168, 95, 0.3)",
  slotEdge: "rgba(214, 168, 95, 0.55)",
  playhead: "#e7bd6d",
  window: "rgba(237, 240, 236, 0.09)",
  windowEdge: "rgba(237, 240, 236, 0.6)",
  fadeShade: "rgba(6, 9, 10, 0.55)",
  fadeLine: "rgba(237, 240, 236, 0.75)",
  knob: "#edf0ec",
};
const STRIP = 13; // the strip of the clips, at the top of a track's row (a computer)
const KNOB = 4.5; // the radius of a fade's knob
const KNOB_Y = STRIP + 6; // its centre, under the strip (clear of the edges of the block)
const CLIP_EDGE_PX = { mouse: 5, touch: 12 }; // how near an edge of a clip grabs it
const MIN_CLIP = 0.02; // seconds: the shortest a clip may be (src/player.js)
const fadeShape = (u) => 0.5 - 0.5 * Math.cos(Math.PI * u); // as the engine's
const FONT = '-apple-system, "SF Pro Text", "Helvetica Neue", Arial, sans-serif';
const TAP_SLOP = 6; // pixels a press may move and still be a tap
// A Mac: ⌘ adds a clip to those selected (Ctrl-click is its right click).
const MAC = /Mac|iPhone|iPad|iPod/.test((typeof navigator !== "undefined" && navigator.platform) || "");
// A drag at an edge of the timeline scrolls it (2.15): how near the edge it
// starts (pixels, inside), and the most it scrolls by in a frame.
const EDGE_ZONE = { mouse: 8, touch: 24 };
const EDGE_SPEED = { mouse: 36, touch: 18 };
const EDGE_GESTURES = new Set(["select", "range", "section", "notes", "clip", "start", "end", "body"]);
const TIP_MS = 450; // the mouse resting this long on a lane shows what it says (2.21)
const RANGE_PX = { mouse: 6, touch: 12 }; // the narrowest step a stretch of the bar numbers takes
const MIN_LOOP = 0.25; // seconds, as the engine
const FOLLOW_PAUSE_MS = 4000;
const TIME_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
const EVERY = [1, 2, 4, 8, 16, 32, 64, 128, 256];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const now = () => performance.now();
const mod = (a, m) => ((a % m) + m) % m;

// First index of `list` (sorted) whose value is >= t.
function lowerBound(list, t) {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function spacing(list, fallback) {
  if (list.length < 2) return fallback;
  return (list[list.length - 1] - list[0]) / (list.length - 1);
}

function fmtClock(s) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s - m * 60)).padStart(2, "0")}`;
}

export class Timeline {
  // host: an empty element. compact: the phone's timeline (one row, smaller).
  // onSeek(t), onScrub(t) while a finger drags the playhead, onLoop({on,
  // start, end}) when a loop drag ends, onView() when the user has panned or
  // zoomed, onChange() after every redraw of the view, onSelect({anchor, lo,
  // hi}, done) while bars are selected (done: the press ended, tap: it did
  // not move, lane: "sections" from the lane of the sections, "notes" from
  // that of the notes, with again: a tap again there), onBarTap(index,
  // {pointerType}) when a bar is tapped while not editing, onSectionMenu({lo,
  // hi, x, y, pointerType}) when the bars selected are tapped in the lane of
  // the sections (x, y: where, in the window), onRange({start, end}) when a
  // stretch has been chosen on the bar numbers. onSelect and onBarTap say the
  // beat pressed too (slot).
  // varsOn: the element that gets --tl-over, --tl-ruler, --tl-head, --tl-row,
  // --tl-notes (and --tl-notes-row, one of its rows),
  // --tl-sections, --tl-nums and --tl-chords (the height of the overview, of
  // the time scale, of everything over the tracks, of a row, of the lanes of
  // the sections, of the bar numbers and of the chords), so that a column
  // beside can line up.
  // onClipSelect([{key, i}]) when clips are selected (or none); onClips(key,
  // clips) when the clips of a track were moved, trimmed or faded (seconds
  // from the track's start).
  constructor(host, { compact = false, varsOn = null, onSeek, onScrub, onLoop, onView, onChange, onSelect, onBarTap, onSectionMenu, onRange, onClipSelect, onClips } = {}) {
    this.onSelect = onSelect || (() => {});
    this.onClipSelect = onClipSelect || (() => {});
    this.onClips = onClips || (() => {});
    this.clipSel = []; // [{key, i}]: the clips selected
    this.hoverClip = null; // {key, i}: the clip under the mouse
    this.onRange = onRange || (() => {});
    this.range = null; // {start, end}: the stretch chosen on the bar numbers (the loop's, with the loop on)
    this.onBarTap = onBarTap || (() => {});
    this.onSectionMenu = onSectionMenu || (() => {});
    this.editing = false;
    this.selection = null; // {anchor, lo, hi}: bars selected in the chord lane
    this.activeSlot = null; // the beat being written in them (its slot)
    this.onScrub = onScrub || (() => {});
    this.scrub = null; // where a finger is dragging the playhead
    this.varsOn = varsOn || host;
    this.compact = compact;
    this.onSeek = onSeek || (() => {});
    this.onLoop = onLoop || (() => {});
    this.onView = onView || (() => {});
    this.onChange = onChange || (() => {});
    // notes: a row of the lane of the notes (2.21); sections: the lane of the
    // sections; chords: the chord lane under it; nums: the lane of the bar
    // numbers under that; ruler: the time scale over the tracks; tab: the
    // handles of the loop at its ends.
    this.dims = compact
      ? { notes: 24, sections: 24, nums: 18, chords: 22, ruler: 40, row: 64, overview: 24, tab: { w: 12, h: 20 } }
      : { notes: 22, sections: 22, nums: 20, chords: 24, ruler: 28, row: 60, overview: 26, tab: { w: 9, h: 16 } };
    this.duration = 0;
    this.sampleRate = 48000;
    this.rows = [];
    this.live = null; // the take being recorded
    this.grid = { beats: [], bars: [], offset: 0, chords: new Map(), sections: [], notes: [], bpm: null, meter: "4/4" };
    this.noteLayout = { rows: [], count: 1 }; // the row of each note in their lane (noteRows())
    this.notesPick = null; // {lo, hi}: the bars picked in the lane of the notes, while they are the ones selected
    this.tipText = "";
    this.tipTimer = 0;
    this.titles = []; // what each section shows (sectionTitles())
    // The chords as they are shown: in the key of now, the song moved by
    // chordShift semitones (src/chordnames.js).
    this.chordShift = 0;
    this.chordNames = chordView([], 0);
    this.gridVisible = true;
    this.zoom = 1;
    this.start = 0;
    this.width = 0;
    this.position = 0;
    this.playing = false;
    this.loop = { on: false, start: 0, end: 0 };
    this.dragLoop = null;
    this.pointers = new Map();
    this.gesture = null;
    this.lastUser = -Infinity;
    this.queued = false;
    this.inertia = null;
    this.overviewCache = null;

    host.classList.add("tl");
    this.main = document.createElement("div");
    this.main.className = "tl-main";
    this.main.setAttribute("role", "img");
    // The head pane (the lanes, the time scale on a computer) and the body
    // pane (the tracks), each a canvas for what changes rarely and one over
    // it for the selection, the loop and the playhead (2.22).
    this.head = document.createElement("div");
    this.head.className = "tl-headpane";
    this.hbase = document.createElement("canvas");
    this.hbase.className = "tl-base";
    this.htop = document.createElement("canvas");
    this.htop.className = "tl-top";
    this.head.append(this.hbase, this.htop);
    this.body = document.createElement("div");
    this.body.className = "tl-bodypane";
    this.base = document.createElement("canvas");
    this.base.className = "tl-base";
    this.top = document.createElement("canvas");
    this.top.className = "tl-top";
    this.body.append(this.base, this.top);
    this.main.append(this.head, this.body);
    this.over = document.createElement("canvas");
    this.over.className = "tl-overview";
    this.relabel();
    host.append(this.over, this.main);
    this._bind();
    this.resizer = new ResizeObserver(() => this.layout());
    this.resizer.observe(this.main);
  }

  // What the timeline and the overview are, for screen readers (again in
  // another language).
  relabel() {
    this.main.setAttribute("aria-label", tr("Timeline: tap or drag the waveforms to move the playhead, drag inside the loop to move it, tap a bar to write its chord, drag the time scale to scroll, pinch to zoom"));
    this.over.setAttribute("aria-label", tr("Overview of the whole song: drag the frame of the view or of the loop to move it, tap elsewhere to bring the view there"));
    this.titles = sectionTitles(this.grid.sections);
    this.requestDraw();
  }

  // ----- content ------------------------------------------------------------

  // rows: [{key, color, peaks: {min, max} | null, on, offset (the song time
  // where the track begins, a take), height (null: the usual), length (the
  // seconds of its audio), clips (src/clips.js, in seconds; null: whole)}],
  // grid as readGrid().
  setSong({ duration, sampleRate, rows, grid, gridVisible = true, view = null }) {
    this.duration = duration;
    this.sampleRate = sampleRate || 48000;
    this.rows = rows;
    this.grid = grid;
    this.chordNames = chordView(chordTexts(grid.chords), this.chordShift);
    this.titles = sectionTitles(grid.sections);
    this.noteLayout = noteRows(grid.notes);
    this.notesPick = null;
    this.gridVisible = gridVisible;
    this.barSec = spacing(grid.bars, grid.bpm ? (60 / grid.bpm) * 4 : 2);
    this.beatSec = spacing(grid.beats, grid.bpm ? 60 / grid.bpm : 0.5);
    this.zoom = 1;
    this.start = 0;
    this.loop = { on: false, start: 0, end: 0 };
    this.dragLoop = null;
    this.selection = null;
    this.range = null;
    this.clipSel = this.clipSel.filter((s) => rows.some((r) => r.key === s.key && s.i < this._clipsOf(r).length));
    this.hoverClip = null;
    this.position = 0;
    this.overviewCache = null;
    this.layout();
    if (view) this.setView(view);
  }

  // ----- clips ------------------------------------------------------------------

  // Clips are edited on a computer.
  get clipsOn() {
    return !this.compact;
  }

  // The clips a row plays (seconds from its start): its own, or itself whole.
  _clipsOf(row) {
    if (row.clips) return row.clips;
    return row.length > 0 ? [wholeClip(row.length)] : [];
  }

  // The clips of track `key` changed elsewhere (cut, deleted, undone): those
  // selected there are kept while they are still there.
  setRowClips(key, clips) {
    const row = this.rows.find((r) => r.key === key);
    if (!row) return;
    row.clips = clips;
    const n = this._clipsOf(row).length;
    this.clipSel = this.clipSel.filter((s) => s.key !== key || s.i < n);
    this.requestDraw();
  }

  get clipSelection() {
    return this.clipSel.map((s) => ({ ...s }));
  }

  setClipSelection(list) {
    this.clipSel = (list || []).filter((s) => {
      const row = this.rows.find((r) => r.key === s.key);
      return row && s.i >= 0 && s.i < this._clipsOf(row).length;
    });
    this.drawTop();
  }

  // Every clip of every track selected (Ctrl+A, ⌘A, 2.17).
  selectAllClips() {
    if (!this.clipsOn) return;
    this.clipSel = this.rows.flatMap((row) => this._clipsOf(row).map((_, i) => ({ key: row.key, i })));
    this.onClipSelect(this.clipSelection);
    this.drawTop();
  }

  _isSelected(key, i) {
    return this.clipSel.some((s) => s.key === key && s.i === i);
  }

  // Song seconds where clip c of `row` starts and ends.
  _clipSpan(row, c) {
    const s = (row.offset || 0) + c.at;
    return [s, s + c.to - c.from];
  }

  setRowOn(key, on) {
    const row = this.rows.find((r) => r.key === key);
    if (row && row.on !== on) {
      row.on = on;
      this.requestDraw();
    }
  }

  // A take moved in time (its Sync).
  setRowOffset(key, offset) {
    const row = this.rows.find((r) => r.key === key);
    if (row && Math.abs((row.offset || 0) - offset) > 1e-6) {
      row.offset = offset;
      this.requestDraw();
    }
  }

  rowHeight(row) {
    return row.height || this.dims.row;
  }

  // The take being recorded ({offset, peaks, color, height}), drawn as it
  // comes in, as the last row; null when no take is recorded.
  setLive(live) {
    const before = this.height;
    this.live = live || null;
    if (this.height !== before) this.layout();
    else this.requestDraw();
  }

  setGridVisible(on) {
    this.gridVisible = !!on;
    this.layout();
  }

  // A grid edited: the view stays where it is.
  setGrid(grid) {
    const head = this.headHeight;
    this.grid = grid;
    this.chordNames = chordView(chordTexts(grid.chords), this.chordShift);
    this.titles = sectionTitles(grid.sections);
    this.noteLayout = noteRows(grid.notes);
    this.barSec = spacing(grid.bars, grid.bpm ? (60 / grid.bpm) * 4 : 2);
    this.beatSec = spacing(grid.beats, grid.bpm ? 60 / grid.bpm : 0.5);
    const n = grid.bars.length;
    const sel = this.selection;
    if (sel) this.selection = n ? { anchor: clamp(sel.anchor, 0, n - 1), lo: clamp(sel.lo, 0, n - 1), hi: clamp(sel.hi, 0, n - 1) } : null;
    if (this.headHeight !== head) this.layout();
    else this.requestDraw();
  }

  // The song moved by `semitones`: its chords shown in the new key.
  setChordShift(semitones) {
    const shift = Math.round(+semitones || 0);
    if (shift === this.chordShift) return;
    this.chordShift = shift;
    this.chordNames = chordView(chordTexts(this.grid.chords), shift);
    if (this.showChords) this.requestDraw();
  }

  // A bar's chords as they are shown (in the key of now), one after the
  // other; with k, the chord of its slot k.
  chordShown(index, k = null) {
    const slots = this.grid.chords.get(index) || [];
    if (k !== null) return this.chordNames.show(slots[k] || "");
    return slots
      .filter(Boolean)
      .map((text) => this.chordNames.show(text))
      .join(" ");
  }

  // Editing: a tap on the bars selects them.
  setEditing(on) {
    this.editing = !!on;
    if (!this.editing) this.selection = null;
    this.drawTop();
  }

  setSelection(sel) {
    this.selection = sel ? { anchor: sel.anchor ?? sel.lo, lo: sel.lo, hi: sel.hi } : null;
    const pick = this.notesPick;
    if (pick && !(sel && sel.lo === pick.lo && sel.hi === pick.hi)) this.notesPick = null; // chosen elsewhere
    this.drawTop();
  }

  // The beat being written in the bars selected (its slot), or null.
  setActiveSlot(k) {
    const v = Number.isInteger(k) ? k : null;
    if (v === this.activeSlot) return;
    this.activeSlot = v;
    this.drawTop();
  }

  // The bar under x (0 before the first bar).
  barIndexAt(x) {
    return Math.max(0, Math.min(this.grid.bars.length - 1, barAt(this.grid, this.t(x))));
  }

  // Brings bars lo..hi into view (the selection moved with the keys).
  revealBars(lo, hi) {
    const bars = this.grid.bars;
    if (!bars.length) return;
    const a = bars[clamp(lo, 0, bars.length - 1)];
    const b = hi + 1 < bars.length ? bars[Math.max(0, hi + 1)] : this.duration;
    if (a < this.start || b > this.start + this.span) {
      this.start = this.clampStart(b - a <= this.span * 0.8 ? a - this.span * 0.1 : a);
      this.lastUser = now();
      this.requestDraw();
    }
  }

  get hasGrid() {
    return this.grid.bars.length > 0;
  }

  get showChords() {
    return this.gridVisible && this.hasGrid;
  }

  // ----- geometry -------------------------------------------------------------

  // How far right of its bar line a bar's number and its chord start: in line
  // with each other, and clear of the loop's handle when the loop starts there.
  get textX() {
    return Math.ceil(this.dims.tab.w / 2) + 1;
  }

  // The notes (2.21), the sections, the chords and the bar numbers, at the top
  // (none without a grid shown).
  get barsHeight() {
    return this.showChords ? this.notesHeight + this.dims.sections + this.dims.chords + this.dims.nums : 0;
  }

  // The lane of the notes, at the very top: a row, more where notes overlap.
  get notesHeight() {
    return this.showChords ? this.dims.notes * this.noteLayout.count : 0;
  }

  // The top of the lane of the sections, under the notes; of the chord lane,
  // under the sections; of the bar numbers, under the chords.
  get sectionsTop() {
    return this.notesHeight;
  }

  get chordsTop() {
    return this.sectionsTop + this.dims.sections;
  }

  get numsTop() {
    return this.chordsTop + this.dims.chords;
  }

  // The time scale under the tracks on a smartphone (2.22), over them on a
  // computer.
  get rulerBelow() {
    return this.compact;
  }

  // The time scale: under the lanes, or under the tracks.
  get rulerTop() {
    return this.rulerBelow ? this.tracksBottom : this.barsHeight;
  }

  // Everything over the tracks: the head pane.
  get headHeight() {
    return this.barsHeight + (this.rulerBelow ? 0 : this.dims.ruler);
  }

  // The bottom of the tracks (and of the take being recorded).
  get tracksBottom() {
    return this.headHeight + this.rows.reduce((sum, r) => sum + this.rowHeight(r), 0) + (this.live ? this.live.height : 0);
  }

  get height() {
    return this.tracksBottom + (this.rulerBelow ? this.dims.ruler : 0);
  }

  // Where the time scale meets the tracks: the loop's handles sit there, and
  // the mark of the playhead.
  get edgeY() {
    return this.rulerBelow ? this.tracksBottom : this.headHeight;
  }

  _inRuler(y) {
    return y >= this.rulerTop && y < this.rulerTop + this.dims.ruler;
  }

  get pps() {
    return this.duration > 0 && this.width > 0 ? (this.width / this.duration) * this.zoom : 1;
  }

  get span() {
    return this.duration / this.zoom;
  }

  get zoomMax() {
    if (!(this.duration > 0) || !(this.width > 0)) return 20;
    return clamp((100 * this.duration) / this.width, 20, 400);
  }

  x(t) {
    return (t - this.start) * this.pps;
  }

  t(x) {
    return this.start + x / this.pps;
  }

  clampStart(s) {
    return clamp(s, 0, Math.max(0, this.duration - this.span));
  }

  visibleRange() {
    return [this.start, Math.min(this.duration, this.start + this.span)];
  }

  getView() {
    return { zoom: Math.round(this.zoom * 1000) / 1000, start: Math.round(this.start * 1000) / 1000 };
  }

  setView({ zoom, start }) {
    if (isFinite(zoom)) this.zoom = clamp(+zoom, 1, this.zoomMax);
    if (isFinite(start)) this.start = this.clampStart(+start);
    this.requestDraw();
  }

  zoomAround(z, px, anchorT = this.t(px)) {
    z = clamp(z, 1, this.zoomMax);
    this.zoom = Math.abs(z - 1) < 1e-3 ? 1 : z;
    this.start = this.clampStart(anchorT - px / this.pps);
    this.lastUser = now();
    this.requestDraw();
  }

  // Buttons: around the playhead if it is in view, else around the middle.
  zoomBy(factor) {
    const px = this.x(this.position);
    this.zoomAround(this.zoom * factor, px >= 0 && px <= this.width ? px : this.width / 2);
    this.onView();
  }

  // ----- position, loop, following ---------------------------------------------

  setPosition(t, playing) {
    this.position = t;
    this.playing = playing;
    this.follow();
    this.drawTop();
    this.drawOverview();
  }

  setLoop(loop) {
    this.loop = { on: !!loop.on, start: +loop.start || 0, end: +loop.end || 0 };
    // With the loop on, the stretch of the bar numbers is the loop's.
    if (this.loop.on && this.loop.end > this.loop.start && !(this.gesture && this.gesture.kind === "range")) this.range = { start: this.loop.start, end: this.loop.end };
    if (!this.gesture && !this.overDrag) this.dragLoop = null;
    this.drawTop();
    this.drawOverview();
  }

  // While playing, keeps the playhead in view (page by page).
  follow() {
    if (!this.playing || this.gesture || this.zoom <= 1 || now() - this.lastUser < FOLLOW_PAUSE_MS) return;
    const span = this.span;
    if (this.position < this.start || this.position > this.start + span * 0.92) {
      this.start = this.clampStart(this.position - span * 0.08);
      this.requestDraw();
    }
  }

  // Brings `t` into view (after a jump made with the buttons or the keyboard).
  reveal(t) {
    if (t < this.start || t > this.start + this.span) {
      this.start = this.clampStart(t - this.span * 0.25);
      this.requestDraw();
    }
  }

  // ----- drawing ------------------------------------------------------------------

  layout() {
    const w = Math.round(this.main.clientWidth);
    this.dpr = Math.min(3, window.devicePixelRatio || 1);
    this.width = w;
    const h = this.height;
    const T = this.headHeight;
    this.main.style.height = `${h}px`;
    this.head.style.height = `${T}px`;
    this.body.style.height = `${h - T}px`;
    const size = (c, ch) => {
      c.width = Math.max(1, Math.round(w * this.dpr));
      c.height = Math.max(1, Math.round(ch * this.dpr));
      c.style.width = `${w}px`;
      c.style.height = `${ch}px`;
    };
    for (const c of [this.hbase, this.htop]) size(c, T);
    for (const c of [this.base, this.top]) size(c, h - T);
    const o = this.dims.overview;
    this.over.width = Math.max(1, Math.round(w * this.dpr));
    this.over.height = Math.round(o * this.dpr);
    this.over.style.width = `${w}px`;
    this.over.style.height = `${o}px`;
    this.overviewCache = null;
    this.varsOn.style.setProperty("--tl-over", `${o}px`);
    this.varsOn.style.setProperty("--tl-ruler", `${this.dims.ruler}px`);
    this.varsOn.style.setProperty("--tl-head", `${this.headHeight}px`);
    this.varsOn.style.setProperty("--tl-row", `${this.dims.row}px`);
    // The lanes of the sections, of the bar numbers and of the chords (none
    // without a grid shown).
    this.varsOn.style.setProperty("--tl-notes", `${this.notesHeight}px`);
    this.varsOn.style.setProperty("--tl-notes-row", `${this.dims.notes}px`);
    this.varsOn.style.setProperty("--tl-sections", `${this.barsHeight ? this.dims.sections : 0}px`);
    this.varsOn.style.setProperty("--tl-nums", `${this.barsHeight ? this.dims.nums : 0}px`);
    this.varsOn.style.setProperty("--tl-chords", `${this.barsHeight ? this.dims.chords : 0}px`);
    this.zoom = clamp(this.zoom, 1, this.zoomMax);
    this.start = this.clampStart(this.start);
    this.draw();
  }

  requestDraw() {
    if (this.queued) return;
    this.queued = true;
    requestAnimationFrame(() => {
      this.queued = false;
      this.draw();
    });
  }

  // The context of a pane's canvas, cleared, in the frame of the whole
  // timeline (y from the top of the head pane down).
  _pane(canvas, top, h) {
    const ctx = canvas.getContext("2d");
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, -top * this.dpr);
    ctx.clearRect(0, top, this.width, h);
    return ctx;
  }

  draw() {
    this.queued = false;
    const T = this.headHeight;
    const head = this._pane(this.hbase, 0, T);
    const ctx = this._pane(this.base, T, this.height - T);
    if (!(this.duration > 0) || !this.width) {
      this.drawTop();
      return;
    }
    if (this.showChords) {
      this._notes(head);
      head.save();
      head.translate(0, this.sectionsTop);
      this._sections(head);
      head.restore();
      this._numbers(head);
      this._chords(head);
    }
    this._ruler(this.rulerBelow ? ctx : head);
    let y = T;
    for (const row of this.rows) {
      this._row(ctx, row, y);
      y += this.rowHeight(row);
    }
    if (this.live) this._row(ctx, { ...this.live, on: true }, y);
    this.drawTop();
    this.drawOverview();
    this.onChange();
  }

  // Bars and beats in view: [first index, end index) of each list.
  _range(list, pad) {
    return [Math.max(0, lowerBound(list, this.start - pad)), lowerBound(list, this.start + this.span + pad)];
  }

  _every(spacingPx, minPx) {
    return EVERY.find((k) => spacingPx * k >= minPx) || EVERY[EVERY.length - 1];
  }

  // The bar numbers, under the chords, in line with them, so that each bar's
  // number and chord go together: a line where each bar starts (every 2, 4…
  // bars when they are narrow) and the beats as short ticks along the bottom.
  _numbers(ctx) {
    const y0 = this.numsTop;
    const h = this.dims.nums;
    const W = this.width;
    ctx.fillStyle = C.ruler;
    ctx.fillRect(0, y0, W, h);
    const g = this.grid;
    const barPx = this.barSec * this.pps;
    if (this.beatSec * this.pps >= 5) {
      ctx.fillStyle = C.dim;
      const [a, b] = this._range(g.beats, 0);
      for (let i = a; i < b; i++) ctx.fillRect(Math.round(this.x(g.beats[i])), y0 + h - 5, 1, 5);
    }
    const lines = this._every(barPx, 6);
    const labels = this._every(barPx, this.compact ? 24 : 28);
    ctx.font = `700 11px ${FONT}`;
    ctx.textBaseline = "alphabetic";
    const [a, b] = this._range(g.bars, this.barSec);
    for (let i = a; i < b; i++) {
      const n = barNumber(g, i);
      const x = Math.round(this.x(g.bars[i]));
      ctx.fillStyle = C.text;
      if (mod(n - 1, lines) === 0) ctx.fillRect(x, y0 + 3, 1, h - 3);
      if (mod(n - 1, labels) === 0) ctx.fillText(String(n), x + this.textX, y0 + h - 6);
    }
  }

  // The notes (2.21), over the sections: a line where each bar starts,
  // always (every 2, 4… bars when they are narrow), and each note a block
  // along its bars with its text, cut to fit, those that overlap one under
  // the other (noteRows()).
  _notes(ctx) {
    const rowH = this.dims.notes;
    const h = this.notesHeight;
    const W = this.width;
    ctx.fillStyle = C.ruler;
    ctx.fillRect(0, 0, W, h);
    const g = this.grid;
    const n = g.bars.length;
    const lines = this._every(this.barSec * this.pps, 6);
    const [a, b] = this._range(g.bars, this.barSec);
    ctx.fillStyle = C.sep;
    for (let i = a; i < b; i++) if (mod(barNumber(g, i) - 1, lines) === 0) ctx.fillRect(Math.round(this.x(g.bars[i])), 0, 1, h);
    const list = g.notes || [];
    const rows = this.noteLayout.rows;
    ctx.font = `500 ${this.compact ? 11 : 11.5}px ${FONT}`;
    ctx.textBaseline = "middle";
    for (let k = 0; k < list.length; k++) {
      const note = list[k];
      if (note.lo >= n) continue;
      const x0 = this.x(g.bars[note.lo]);
      const x1 = note.hi + 1 < n ? this.x(g.bars[note.hi + 1]) : this.x(this.duration);
      if (x1 < 0 || x0 > W) continue;
      const y = (rows[k] || 0) * rowH;
      const l = Math.round(x0) + 1;
      const r = Math.round(x1) - 1;
      if (r - l < 2) continue;
      ctx.save();
      ctx.globalAlpha = 0.26;
      ctx.fillStyle = C.note;
      this._roundRect(ctx, l, y + 2, r - l, rowH - 4, 4);
      ctx.globalAlpha = 1;
      ctx.fillRect(l, y + 2, 3, rowH - 4);
      ctx.restore();
      // The text where the block is in view, at its left.
      const left = Math.max(l, 0) + 7;
      const room = Math.min(r, W) - left - 3;
      if (room >= 9) {
        const text = this._fit(ctx, note.text, room);
        if (text) {
          ctx.fillStyle = C.text;
          ctx.fillText(text, left, y + rowH / 2 + 1);
        }
      }
    }
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = C.border;
    ctx.fillRect(0, h - 1, W, 1);
  }

  // The sections, over the chords: a block of its colour along the bars
  // of each one, with its name (numbered when it comes back), cut to fit.
  _sections(ctx) {
    const h = this.dims.sections;
    const W = this.width;
    ctx.fillStyle = C.ruler;
    ctx.fillRect(0, 0, W, h);
    const g = this.grid;
    const list = g.sections || [];
    const n = g.bars.length;
    ctx.font = `650 ${this.compact ? 11 : 11.5}px ${FONT}`;
    ctx.textBaseline = "middle";
    for (let k = 0; k < list.length; k++) {
      const s = list[k];
      if (s.lo >= n) continue;
      const x0 = this.x(g.bars[s.lo]);
      const x1 = s.hi + 1 < n ? this.x(g.bars[s.hi + 1]) : this.x(this.duration);
      if (x1 < 0 || x0 > W) continue;
      const a = Math.round(x0) + 1;
      const b = Math.round(x1) - 1;
      if (b - a < 2) continue;
      const color = sectionColor(s);
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = color;
      this._roundRect(ctx, a, 2, b - a, h - 4, 4);
      ctx.globalAlpha = 1;
      ctx.fillRect(a, 2, 3, h - 4);
      ctx.restore();
      // The name where the block is in view, at its left.
      const left = Math.max(a, 0) + 7;
      const room = Math.min(b, W) - left - 3;
      if (room >= 9) {
        const text = this._fit(ctx, this.titles[k] || "", room);
        if (text) {
          ctx.fillStyle = C.text;
          ctx.fillText(text, left, h / 2 + 1);
        }
      }
    }
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = C.border;
    ctx.fillRect(0, h - 1, W, 1);
  }

  // The time scale, next to the tracks (over them, or under them on a
  // smartphone): the time every few seconds. The loop's handles sit on its
  // edge by the tracks (drawTop()). Under the tracks it is thicker, its
  // ticks from the tracks down and the times in its middle.
  _ruler(ctx) {
    const y0 = this.rulerTop;
    const R = this.dims.ruler;
    const W = this.width;
    ctx.fillStyle = C.ruler;
    ctx.fillRect(0, y0, W, R);
    const step = TIME_STEPS.find((s) => s * this.pps >= 64) || 600;
    ctx.font = `500 ${this.rulerBelow ? 12 : 11}px ${FONT}`;
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = C.time;
    const tick = this.rulerBelow ? 10 : 12;
    const text = this.rulerBelow ? y0 + R / 2 + 8 : y0 + 12;
    for (let s = Math.floor(this.start / step) * step; s <= this.start + this.span; s += step) {
      const x = Math.round(this.x(s));
      if (x < -40) continue;
      ctx.fillRect(x, y0 + (this.rulerBelow ? 0 : 2), 1, tick);
      ctx.fillText(fmtClock(s), x + 3, text);
    }
    ctx.fillStyle = C.border;
    ctx.fillRect(0, this.rulerBelow ? y0 : y0 + R - 1, W, 1);
  }

  _fit(ctx, text, w) {
    if (ctx.measureText(text).width <= w) return text;
    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (ctx.measureText(`${text.slice(0, mid)}…`).width <= w) lo = mid;
      else hi = mid - 1;
    }
    return lo > 0 ? `${text.slice(0, lo)}…` : "";
  }

  // The chords, each where its beat is (a short mark under one that starts
  // inside its bar), its name as long as the room before the next chord
  // allows (over the following bars without one too, up to 160 pixels).
  _chords(ctx) {
    const y0 = this.chordsTop;
    const h = this.dims.chords;
    const W = this.width;
    ctx.fillStyle = C.ruler;
    ctx.fillRect(0, y0, W, h);
    const g = this.grid;
    const barPx = this.barSec * this.pps;
    const lines = this._every(barPx, 6);
    ctx.font = `600 ${this.compact ? 11 : 12}px ${FONT}`;
    ctx.textBaseline = "middle";
    const [a, b] = this._range(g.bars, this.barSec);
    const from = Math.max(0, a - 1);
    for (let i = from; i < b; i++) {
      const x0 = this.x(g.bars[i]);
      if (x0 > W) break;
      if (mod(barNumber(g, i) - 1, lines) === 0 && x0 >= 0) {
        ctx.fillStyle = C.sep;
        ctx.fillRect(Math.round(x0), y0, 1, h);
      }
    }
    // The chords from the bar before the view to a little past it.
    const events = [];
    for (let i = from; i < g.bars.length && this.x(g.bars[i]) <= W + 200; i++) {
      const slots = g.chords.get(i);
      if (!slots) continue;
      const at = slotTimes(g, i);
      slots.forEach((text, k) => text && events.push({ t: at[k], text, i, k }));
    }
    const pad = this.textX;
    for (let e = 0; e < events.length; e++) {
      const ev = events[e];
      const x0 = this.x(ev.t);
      if (x0 > W) break;
      const next = e + 1 < events.length ? this.x(events[e + 1].t) : this.x(this.duration);
      const barEnd = this.x(this._barEnd(ev.i));
      const x1 = Math.min(next, Math.max(barEnd, x0 + 160));
      if (x1 < 0) continue;
      if (ev.k > 0 && x0 >= 0) {
        ctx.fillStyle = C.sep;
        ctx.fillRect(Math.round(x0), y0 + h - 6, 1, 5);
      }
      const text = this.chordNames.show(ev.text);
      const room = x1 - x0 - pad - 2;
      if (!text || room < 9) continue;
      ctx.fillStyle = C.chord;
      const fitted = this._fit(ctx, text, room);
      if (fitted) {
        ctx.fillText(fitted, Math.round(x0) + pad, y0 + h / 2 + 1);
      } else {
        // Too narrow even for one letter and "…": the beginning, cut at the next chord.
        ctx.save();
        ctx.beginPath();
        ctx.rect(x0 + 1, y0, room + pad, h);
        ctx.clip();
        ctx.fillText(text, Math.round(x0) + pad, y0 + h / 2 + 1);
        ctx.restore();
      }
    }
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = C.border;
    ctx.fillRect(0, y0 + h - 1, W, 1);
  }

  _gridLines(ctx, y0, h) {
    if (!this.gridVisible || !this.hasGrid) return;
    const g = this.grid;
    const beatPx = this.beatSec * this.pps;
    if (beatPx >= 8) {
      ctx.fillStyle = C.beat;
      const [a, b] = this._range(g.beats, 0);
      for (let i = a; i < b; i++) ctx.fillRect(Math.round(this.x(g.beats[i])), y0, 1, h);
    }
    const lines = this._every(this.barSec * this.pps, 6);
    ctx.fillStyle = C.bar;
    const [a, b] = this._range(g.bars, 0);
    for (let i = a; i < b; i++) {
      if (mod(barNumber(g, i) - 1, lines) !== 0) continue;
      ctx.fillRect(Math.round(this.x(g.bars[i])) - 0.5, y0, 1.5, h);
    }
  }

  // The envelope of `peaks` from t0 (the track's own seconds at x = 0) drawn
  // as one vertical line per device pixel, in the area x x0..x1 (else
  // 0..width), y y0..y0+h. scale: how the values compare with 8-bit ones (the
  // take being recorded).
  _wave(ctx, peaks, color, alpha, y0, h, t0, pxPerSec, width, scale = 1, x0 = 0, x1 = width) {
    if (!peaks) return;
    const { min, max } = peaks;
    const n = min.length;
    const dpr = this.dpr;
    const bucketSec = PEAK_BUCKET / this.sampleRate;
    const mid = (y0 + h / 2) * dpr;
    const amp = (((h / 2) * 0.88 * dpr) / 128) * scale;
    const cols = Math.ceil(width * dpr);
    const perCol = 1 / (pxPerSec * dpr * bucketSec); // buckets per device pixel
    ctx.save();
    // In device pixels, keeping the shift of the pane drawn on (2.22: the
    // tracks' pane starts under the lanes).
    ctx.setTransform(1, 0, 0, 1, 0, ctx.getTransform().f);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    const base = t0 / bucketSec;
    const last = Math.min(cols, Math.ceil(x1 * dpr));
    for (let px = Math.max(0, Math.floor(x0 * dpr)); px < last; px++) {
      const a = Math.floor(base + px * perCol);
      const b = Math.max(a + 1, Math.floor(base + (px + 1) * perCol));
      if (b > 0 && a < n) {
        let lo = Infinity;
        let hi = -Infinity;
        for (let i = Math.max(0, a); i < Math.min(n, b); i++) {
          if (min[i] < lo) lo = min[i];
          if (max[i] > hi) hi = max[i];
        }
        if (hi >= lo) {
          const y1 = mid - hi * amp;
          ctx.fillRect(px, y1, 1, Math.max(1, mid - lo * amp - y1));
        }
      }
    }
    ctx.restore();
  }

  // A track's row: the waveform of each of its clips where it plays (with its
  // fades), on a computer under the strip of the clips; the grid over them.
  // The take being recorded has no clips yet: its waveform as it comes in.
  _row(ctx, row, y0) {
    const h = this.rowHeight(row);
    const W = this.width;
    ctx.fillStyle = C.row;
    ctx.fillRect(0, y0, W, h);
    const alpha = row.on || this.compact ? 0.9 : 0.3;
    if (!(row.length > 0)) this._wave(ctx, row.peaks, row.color, alpha, y0, h, this.start - (row.offset || 0), this.pps, W, row.scale);
    else {
      const strip = this.clipsOn ? STRIP : 0;
      const wy = y0 + strip;
      const wh = h - strip;
      const clips = this._clipsOf(row);
      // In the order they were placed: the last one moved over the others.
      clips.forEach((c, i) => {
        const [s, e] = this._clipSpan(row, c);
        const x0 = this.x(s);
        const x1 = this.x(e);
        if (x1 < 0 || x0 > W) return;
        const a = Math.max(0, x0);
        const b = Math.min(W, x1);
        if (strip) {
          ctx.save();
          ctx.globalAlpha = row.on ? 0.34 : 0.15;
          ctx.fillStyle = row.color;
          this._roundRect(ctx, x0 + 0.5, y0 + 1.5, Math.max(1, x1 - x0 - 1), strip - 2.5, 3);
          // Over a clip placed before it: its edges marked, to tell it apart.
          if (clips.some((d, j) => j < i && d.at < c.at + c.to - c.from && c.at < d.at + d.to - d.from)) {
            ctx.globalAlpha = row.on ? 0.95 : 0.5;
            ctx.fillRect(Math.round(x0), y0 + 1.5, 1.5, strip - 2.5);
            ctx.fillRect(Math.round(x1) - 1.5, y0 + 1.5, 1.5, strip - 2.5);
          }
          ctx.restore();
        }
        this._wave(ctx, row.peaks, row.color, alpha, wy, wh, this.start - s + c.from, this.pps, W, row.scale, a, b);
        this._fades(ctx, c, x0, x1, wy, wh);
      });
    }
    this._gridLines(ctx, y0, h);
    ctx.fillStyle = C.border;
    ctx.fillRect(0, y0 + h - 1, W, 1);
  }

  // The fades of a clip drawn from x0 to x1 over y0..y0+h: the part they
  // lower shaded, their curve over it.
  _fades(ctx, c, x0, x1, y0, h) {
    const pps = this.pps;
    for (const [len, from, dir] of [
      [c.fadeIn || 0, x0, 1],
      [c.fadeOut || 0, x1, -1],
    ]) {
      const w = len * pps;
      if (w < 1.5) continue;
      const steps = Math.max(4, Math.min(48, Math.round(w / 3)));
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(from, y0);
      for (let k = 0; k <= steps; k++) {
        const u = k / steps;
        ctx.lineTo(from + dir * u * w, y0 + h - fadeShape(u) * h);
      }
      ctx.lineTo(from + dir * w, y0);
      ctx.closePath();
      ctx.fillStyle = C.fadeShade;
      ctx.fill();
      ctx.beginPath();
      for (let k = 0; k <= steps; k++) {
        const u = k / steps;
        const x = from + dir * u * w;
        const y = y0 + h - fadeShape(u) * h;
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = C.fadeLine;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
  }

  // Over the rows: the clips selected (their block in the strip lit and
  // framed) and the knobs of their fades, and of the clip under the mouse.
  _clipsTop(ctx) {
    if (!this.clipsOn || (!this.clipSel.length && !this.hoverClip)) return;
    let top = this.headHeight;
    for (const row of this.rows) {
      const h = this.rowHeight(row);
      const clips = this._clipsOf(row);
      for (let i = 0; i < clips.length; i++) {
        const sel = this._isSelected(row.key, i);
        const hover = !!this.hoverClip && this.hoverClip.key === row.key && this.hoverClip.i === i;
        if (!sel && !hover) continue;
        const c = clips[i];
        const [s, e] = this._clipSpan(row, c);
        const x0 = this.x(s);
        const x1 = this.x(e);
        if (x1 < -KNOB || x0 > this.width + KNOB) continue;
        if (sel) {
          ctx.fillStyle = C.select;
          ctx.fillRect(x0, top + 1, x1 - x0, STRIP - 2);
          ctx.strokeStyle = C.selectEdge;
          ctx.lineWidth = 2;
          ctx.strokeRect(x0 + 1, top + 1.5, Math.max(1, x1 - x0 - 2), STRIP - 3);
          ctx.globalAlpha = 0.5;
          ctx.strokeRect(x0 + 1, top + 1, Math.max(1, x1 - x0 - 2), h - 3);
          ctx.globalAlpha = 1;
        }
        for (const kx of [x0 + (c.fadeIn || 0) * this.pps, x1 - (c.fadeOut || 0) * this.pps]) {
          ctx.beginPath();
          ctx.arc(kx, top + KNOB_Y, KNOB, 0, Math.PI * 2);
          ctx.fillStyle = sel ? C.selectEdge : C.knob;
          ctx.fill();
          ctx.strokeStyle = C.row;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
      top += h;
    }
  }

  // The bars selected (their numbers and chords), the loop and the playhead,
  // on their own canvas over the rest. The loop and the playhead cover the
  // tracks only, from their top edge (T) down.
  drawTop() {
    const T = this.headHeight;
    const head = this._pane(this.htop, 0, T);
    const body = this._pane(this.top, T, this.height - T);
    if (!(this.duration > 0)) return;
    // The same picture on both panes, each showing its part.
    this._drawTop(head);
    this._drawTop(body);
  }

  _drawTop(ctx) {
    const T = this.headHeight;
    const B = this.tracksBottom;
    const E = this.edgeY;
    const below = this.rulerBelow;
    const sel = this.selection;
    // The stretch chosen on the bar numbers, in their lane.
    const rg = this.range;
    if (rg && this.showChords && rg.end > rg.start) {
      const x1 = Math.round(this.x(rg.start));
      const x2 = Math.max(x1 + 2, Math.round(this.x(rg.end)));
      if (x2 >= 0 && x1 <= this.width) {
        const y = this.numsTop;
        const h = this.dims.nums - 1;
        ctx.fillStyle = C.range;
        ctx.fillRect(x1, y, x2 - x1, h);
        ctx.fillStyle = C.loop;
        ctx.fillRect(x1, y + h - 2, x2 - x1, 2);
        ctx.fillRect(x1, y, 2, h);
        ctx.fillRect(x2 - 2, y, 2, h);
      }
    }
    // The bars selected, on the sections and the chords.
    if (this.editing && sel && this.showChords) {
      const bars = this.grid.bars;
      const x1 = Math.round(this.x(bars[sel.lo]));
      const x2 = Math.round(sel.hi + 1 < bars.length ? this.x(bars[sel.hi + 1]) : this.x(this.duration));
      if (x2 >= 0 && x1 <= this.width) {
        const h = this.numsTop - 1;
        ctx.fillStyle = C.select;
        ctx.fillRect(x1, 0, x2 - x1, h);
        this._slotsSelected(ctx, sel);
        ctx.fillStyle = C.selectEdge;
        ctx.fillRect(x1, 0, x2 - x1, 2);
        ctx.fillRect(x1, h - 2, x2 - x1, 2);
        ctx.fillRect(x1, 0, 2, h);
        ctx.fillRect(x2 - 2, 0, 2, h);
      }
    }
    const lp = this.dragLoop || this.loop;
    if (lp.on && lp.end > lp.start) {
      const x1 = Math.round(this.x(lp.start));
      const x2 = Math.round(this.x(lp.end));
      if (x2 >= -10 && x1 <= this.width + 10) {
        ctx.fillStyle = C.loopFill;
        ctx.fillRect(x1, T, x2 - x1, B - T);
        ctx.fillStyle = C.loop;
        ctx.fillRect(x1, below ? E + 1 : E - 4, x2 - x1, 3);
        const tab = this.dims.tab;
        for (const x of [x1, x2]) {
          ctx.fillStyle = C.loopGlow;
          ctx.fillRect(x - 2.5, T, 5, B - T);
          ctx.fillStyle = C.loop;
          ctx.fillRect(x - 1, T, 2, B - T);
          this._roundRect(ctx, x - tab.w / 2, below ? E - tab.h / 2 + 2 : E - tab.h / 2 - 2, tab.w, tab.h, 3);
        }
      }
    }
    this._clipsTop(ctx);
    const x = Math.round(this.x(this.scrub ?? this.position));
    if (x >= -4 && x <= this.width + 4) {
      ctx.fillStyle = "rgba(231, 189, 109, 0.18)";
      ctx.fillRect(x - 2.5, T, 5, B - T);
      ctx.fillStyle = C.playhead;
      ctx.fillRect(x - 1, T, 2, B - T);
      // Its mark, on the edge of the time scale, pointing at the tracks.
      ctx.beginPath();
      ctx.moveTo(x - 6, E);
      ctx.lineTo(x + 6, E);
      ctx.lineTo(x, below ? E - 8 : E + 8);
      ctx.closePath();
      ctx.fill();
    }
  }

  // In the chord lane of the bars selected that are in view: a line between
  // their beats a chord may start on, and the beat being written lit.
  _slotsSelected(ctx, sel) {
    const g = this.grid;
    const [a, b] = this._range(g.bars, this.barSec);
    const lo = Math.max(sel.lo, a - 1, 0);
    const hi = Math.min(sel.hi, b, g.bars.length - 1);
    const y = this.chordsTop + 3;
    const h = this.dims.chords - 6;
    for (let i = lo; i <= hi; i++) {
      const at = slotTimes(g, i);
      const end = this._barEnd(i);
      for (let k = 0; k < at.length; k++) {
        if (at[k] >= end) break;
        const xa = Math.round(this.x(at[k]));
        const xb = Math.round(this.x(k + 1 < at.length ? Math.min(at[k + 1], end) : end));
        if (xb < 0 || xa > this.width) continue;
        if (k > 0) {
          ctx.fillStyle = C.slotEdge;
          ctx.fillRect(xa, y, 1, h);
        }
        if (k === this.activeSlot && xb - xa > 4) {
          ctx.fillStyle = C.slot;
          ctx.fillRect(xa + 2, y, xb - xa - 4, h);
        }
      }
    }
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  }

  // The whole song, the part in view, the loop and the playhead.
  drawOverview() {
    const W = this.width;
    const H = this.dims.overview;
    const ctx = this.over.getContext("2d");
    if (!W || !(this.duration > 0)) {
      ctx.clearRect(0, 0, this.over.width, this.over.height);
      return;
    }
    if (!this.overviewCache) {
      const cache = document.createElement("canvas");
      cache.width = this.over.width;
      cache.height = this.over.height;
      const c = cache.getContext("2d");
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      c.fillStyle = C.overview;
      c.fillRect(0, 0, W, H);
      // The Original Track, wherever its row is.
      const row = this.rows.find((r) => r.key === "original" && r.peaks) || this.rows.find((r) => r.peaks && !r.offset);
      if (row) this._wave(c, row.peaks, "#5d6d6b", 1, 2, H - 4, 0, W / this.duration, W);
      this.overviewCache = cache;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.overviewCache, 0, 0);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const k = W / this.duration;
    const lp = this.dragLoop || this.loop;
    if (lp.on && lp.end > lp.start) {
      ctx.fillStyle = "rgba(107, 183, 170, 0.35)";
      ctx.fillRect(lp.start * k, 0, Math.max(1, (lp.end - lp.start) * k), H);
    }
    if (this.zoom > 1.001) {
      const x0 = this.start * k;
      const w = Math.max(4, this.span * k);
      ctx.fillStyle = C.window;
      ctx.fillRect(x0, 0, w, H);
      ctx.strokeStyle = C.windowEdge;
      ctx.lineWidth = 1;
      ctx.strokeRect(x0 + 0.5, 0.5, w - 1, H - 1);
    }
    ctx.fillStyle = C.playhead;
    ctx.fillRect(Math.round((this.scrub ?? this.position) * k) - 0.5, 0, 1.5, H);
  }

  // ----- interaction -----------------------------------------------------------------

  _bind() {
    const el = this.main;
    el.addEventListener("pointerdown", (e) => this._down(e));
    el.addEventListener("pointermove", (e) => this._move(e));
    el.addEventListener("pointerup", (e) => {
      if (e.pointerType !== "mouse") this.touchUpAt = performance.now();
      this._up(e, false);
    });
    el.addEventListener("pointercancel", (e) => this._up(e, true));
    // The mouse events a browser sends after a tap would take the focus from
    // the chord field the tap put it in (2.20: a tap again on a bar opens the
    // keyboard there).
    this.touchUpAt = -Infinity;
    el.addEventListener("mousedown", (e) => performance.now() - this.touchUpAt < 1000 && e.preventDefault());
    el.addEventListener("pointerleave", (e) => {
      this._tipHide();
      if (!this.pointers.size && e.pointerType === "mouse") this._hover(-1, -1);
    });
    window.addEventListener("scroll", () => this._tipHide(), { passive: true });
    el.addEventListener("wheel", (e) => {
      this._tipHide();
      this._wheel(e);
    }, { passive: false });
    // Two fingers on the timeline zoom it, not the page.
    el.addEventListener("touchmove", (e) => e.touches.length > 1 && e.preventDefault(), { passive: false });
    // Safari (trackpad pinch on a Mac, two fingers on iPhone and iPad).
    this.nativePinch = typeof window.GestureEvent !== "undefined";
    el.addEventListener("gesturestart", (e) => {
      e.preventDefault();
      this._stopInertia();
      this.safari = { zoom0: this.zoom, x: e.clientX - el.getBoundingClientRect().left };
    });
    el.addEventListener("gesturechange", (e) => {
      e.preventDefault();
      if (this.safari) this.zoomAround(this.safari.zoom0 * e.scale, this.safari.x);
    });
    el.addEventListener("gestureend", (e) => {
      e.preventDefault();
      if (this.safari) this.onView();
      this.safari = null;
    });
    this._bindOverview();
  }

  // The overview: dragging the frame of the view or of the loop moves it
  // (the loop snaps to the bars, Alt or Option: freely); a press elsewhere
  // brings the view there and drags it.
  _bindOverview() {
    const ov = this.over;
    const at = (e) => {
      const r = ov.getBoundingClientRect();
      return { x: e.clientX - r.left, t: clamp(((e.clientX - r.left) / Math.max(1, r.width)) * this.duration, 0, this.duration) };
    };
    // The frame under x: "loop", "view" or null (the narrower one where they
    // overlap; narrow frames are grabbed a little around them).
    const frameAt = (x, type) => {
      const k = this.width / this.duration;
      const pad = type === "mouse" ? 2 : 8;
      const frames = [];
      const lp = this.loop;
      if (lp.on && lp.end > lp.start) frames.push({ kind: "loop", a: lp.start * k, b: lp.end * k });
      if (this.zoom > 1.001) frames.push({ kind: "view", a: this.start * k, b: this.start * k + Math.max(4, this.span * k) });
      const hits = frames.filter((f) => {
        const grow = Math.max(pad, (24 - (f.b - f.a)) / 2);
        return x >= f.a - grow && x <= f.b + grow;
      });
      hits.sort((f, g) => f.b - f.a - (g.b - g.a));
      return hits.length ? hits[0].kind : null;
    };
    const centre = (t) => {
      this.start = this.clampStart(t - this.span / 2);
      this.lastUser = now();
      this.requestDraw();
    };
    ov.addEventListener("pointerdown", (e) => {
      if (!(this.duration > 0) || (e.pointerType === "mouse" && e.button !== 0)) return;
      this._stopInertia();
      try {
        ov.setPointerCapture(e.pointerId);
      } catch (_) {}
      const { x, t } = at(e);
      const kind = frameAt(x, e.pointerType) || "jump";
      this.overDrag = { kind, id: e.pointerId, t0: t, start0: this.start, loop0: { ...this.loop }, moved: false };
      if (kind === "jump") centre(t);
      if (e.pointerType === "mouse") ov.style.cursor = kind === "jump" ? "" : "grabbing";
    });
    ov.addEventListener("pointermove", (e) => {
      const d = this.overDrag;
      if (!d || d.id !== e.pointerId) {
        if (!d && e.pointerType === "mouse" && this.duration > 0) ov.style.cursor = frameAt(at(e).x, "mouse") ? "grab" : "";
        return;
      }
      const { t } = at(e);
      if (d.kind === "jump") {
        centre(t);
        return;
      }
      d.moved = true;
      if (d.kind === "view") {
        this.start = this.clampStart(d.start0 + t - d.t0);
        this.lastUser = now();
        this.requestDraw();
        return;
      }
      const w = d.loop0.end - d.loop0.start;
      let s = clamp(d.loop0.start + t - d.t0, 0, Math.max(0, this.duration - w));
      if (!e.altKey && this.hasGrid) {
        // By the step the overview's scale allows (the bar, mostly).
        const snapped = this._rangeSnap(s, this._rangeStep(e.pointerType, ov.clientWidth / this.duration));
        if (snapped + w <= this.duration + 1e-9) s = snapped;
      }
      this.dragLoop = { on: true, start: s, end: s + w };
      this.drawTop();
      this.drawOverview();
    });
    const end = (e) => {
      const d = this.overDrag;
      if (!d || d.id !== e.pointerId) return;
      this.overDrag = null;
      if (e.pointerType === "mouse") ov.style.cursor = "";
      if (d.kind === "loop") {
        const lp = this.dragLoop;
        this.dragLoop = null;
        if (lp && d.moved && e.type !== "pointercancel") {
          this.loop = { ...lp };
          this.onLoop(lp);
        }
        this.drawTop();
        this.drawOverview();
      } else this.onView();
    };
    ov.addEventListener("pointerup", end);
    ov.addEventListener("pointercancel", end);
  }

  // Where an event is, in the frame of the timeline: on the head pane (which
  // may stand in view, sticky, over the tracks), from its own top; on the
  // body pane, under the head.
  _point(e) {
    const h = this.head.getBoundingClientRect();
    if (h.height > 0 && e.clientY >= h.top && e.clientY < h.bottom) return { x: e.clientX - h.left, y: e.clientY - h.top };
    const b = this.body.getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top + this.headHeight };
  }

  // The row of a track at y: {row, top}, or null (over the tracks, or the
  // take being recorded).
  _rowAt(y) {
    let top = this.headHeight;
    if (y < top) return null;
    for (const row of this.rows) {
      const h = this.rowHeight(row);
      if (y < top + h) return row.length > 0 ? { row, top } : null;
      top += h;
    }
    return null;
  }

  // The clips of `row` that play at song time t, the one on top first.
  _stackAt(row, t) {
    return clipsAt(this._clipsOf(row), t - (row.offset || 0));
  }

  // The clip under x in a row ({key, i}): the one selected there, else the
  // one on top; or null.
  _clipUnder(x, y) {
    const at = this._rowAt(y);
    if (!at) return null;
    const stack = this._stackAt(at.row, this.t(x));
    if (!stack.length) return null;
    const i = stack.find((k) => this._isSelected(at.row.key, k)) ?? stack[0];
    return { key: at.row.key, i };
  }

  // What a press at (x, y) takes of the clips (a computer): {row, i, part:
  // "start" | "end" (the edges of its block in the strip), "move" (the block),
  // "fadeIn" | "fadeOut" (the knobs of a clip selected or under the mouse,
  // under the strip)}, or null. Where clips overlap: an edge first (of the
  // clip on top, if two are there), then the clip selected, else the one on
  // top.
  _clipHit(x, y, type) {
    if (!this.clipsOn) return null;
    const at = this._rowAt(y);
    if (!at) return null;
    const { row, top } = at;
    const clips = this._clipsOf(row);
    const order = clips.map((_, i) => clips.length - 1 - i); // the one on top first
    if (y >= top + STRIP) {
      const grab = type === "mouse" ? KNOB + 3 : KNOB + 10;
      const sel = (i) => this._isSelected(row.key, i);
      const hover = (i) => !!this.hoverClip && this.hoverClip.key === row.key && this.hoverClip.i === i;
      for (const i of [...order.filter(sel), ...order.filter((i) => !sel(i) && hover(i))]) {
        const c = clips[i];
        const [s, e] = this._clipSpan(row, c);
        if (Math.hypot(x - this.x(s + (c.fadeIn || 0)), y - (top + KNOB_Y)) <= grab) return { row, i, part: "fadeIn" };
        if (Math.hypot(x - this.x(e - (c.fadeOut || 0)), y - (top + KNOB_Y)) <= grab) return { row, i, part: "fadeOut" };
      }
      return null;
    }
    const tol = type === "mouse" ? CLIP_EDGE_PX.mouse : CLIP_EDGE_PX.touch;
    let edgeIn = null;
    let middle = null;
    let near = null;
    for (const i of order) {
      const [s, e] = this._clipSpan(row, clips[i]);
      const x0 = this.x(s);
      const x1 = this.x(e);
      if (x < x0 - tol || x > x1 + tol) continue;
      const inside = x >= x0 && x < x1;
      // A block too narrow for its edges and a middle: its middle third moves it.
      const edge = Math.min(tol, (x1 - x0) / 3);
      const part = x - x0 <= edge ? "start" : x1 - x <= edge ? "end" : "move";
      if (inside && part !== "move") edgeIn = edgeIn || { row, i, part };
      else if (inside) {
        if (!middle || (this._isSelected(row.key, i) && !this._isSelected(row.key, middle.i))) middle = { row, i, part };
      } else if (part !== "move") near = near || { row, i, part };
    }
    return edgeIn || middle || near;
  }

  // A press on the clips: the clip taken is selected (shift, or Ctrl / ⌘:
  // added; one of several selected stays with them, so that the drag moves,
  // trims or fades them all, 2.17), and the drag starts.
  _clipDown(e, p, hit) {
    const key = hit.row.key;
    const was = this._isSelected(key, hit.i);
    const add = e.shiftKey || (MAC ? e.metaKey : e.ctrlKey);
    if (!was) this.clipSel = add ? [...this.clipSel, { key, i: hit.i }] : [{ key, i: hit.i }];
    this.onClipSelect(this.clipSelection);
    // Every row with a clip selected, as it was (the drag starts from there).
    const rows = new Map();
    for (const sel of this.clipSel) {
      if (rows.has(sel.key)) continue;
      const row = this.rows.find((r) => r.key === sel.key);
      if (row) rows.set(sel.key, { row, was: row.clips, clips: this._clipsOf(row), sel: this.clipSel.filter((x) => x.key === sel.key).map((x) => x.i) });
    }
    // t0: the song time pressed (a drag is measured from there, the view may
    // scroll meanwhile).
    const t0 = this.t(p.x);
    this.gesture = { kind: "clip", part: hit.part, id: e.pointerId, x0: p.x, t0, key, i: hit.i, was, shift: add, rows, moved: false, step: this.hasGrid ? this._rangeStep(e.pointerType) : null };
    if (e.pointerType === "mouse") this.main.style.cursor = hit.part === "move" ? "grabbing" : "ew-resize";
    this.drawTop();
  }

  // The drag of a press on the clips, the pointer at x: the clips selected
  // moved (by the step of the bar numbers, kept where they are against the
  // beats; never before the song), the edge trimmed (to the step), or the
  // fade made longer or shorter. With several selected (2.17) their same
  // edge moves as much as the one taken (each as far as its audio goes), and
  // their same fade becomes as long. Shown at once; the tracks take them
  // when the pointer is let go.
  _clipDrag(g, x, free) {
    const base = g.rows.get(g.key);
    const c = base.clips[g.i];
    const off = base.row.offset || 0;
    const dt = this.t(x) - g.t0;
    const snap = (t) => (!free && g.step ? this._rangeSnap(t, g.step) : t);
    if (g.part === "move") {
      const s0 = off + c.at;
      let delta = dt;
      if (!free && g.step) {
        const lead = s0 - this._rangeSnap(s0, g.step);
        delta = this._rangeSnap(s0 + dt - lead, g.step) + lead - s0;
      }
      let first = Infinity;
      for (const r of g.rows.values()) for (const i of r.sel) first = Math.min(first, (r.row.offset || 0) + r.clips[i].at);
      delta = Math.max(delta, -first);
      for (const r of g.rows.values()) {
        const out = moveClips(r.clips, r.sel, delta);
        r.row.clips = out.clips;
        r.now = out.indexes;
      }
    } else if (g.part === "start" || g.part === "end") {
      const [s, e] = this._clipSpan(base.row, c);
      const edge = g.part === "start" ? s : e;
      const delta = snap(edge + dt) - edge;
      for (const r of g.rows.values()) {
        let clips = r.clips;
        for (const i of r.sel) {
          const at = r.clips[i].at + (g.part === "start" ? 0 : r.clips[i].to - r.clips[i].from);
          clips = trimClip(clips, i, g.part, at + delta, r.row.length, MIN_CLIP).clips;
        }
        r.row.clips = clips;
        r.now = r.sel;
      }
    } else {
      const len = Math.max(0, g.part === "fadeIn" ? (c.fadeIn || 0) + dt : (c.fadeOut || 0) - dt);
      for (const r of g.rows.values()) {
        let clips = r.clips;
        for (const i of r.sel) clips = fadeClip(clips, i, g.part === "fadeIn" ? "in" : "out", len);
        r.row.clips = clips;
        r.now = r.sel;
      }
    }
    this.requestDraw();
  }

  // The press on the clips ends: a tap selects (shift: in or out of the
  // selection; one of several selected: that one alone; the one selected
  // alone, where clips overlap: the next one under it, from the top again
  // after the last); a drag gives the tracks their new clips, the selection
  // following them; cancelled, they are as they were.
  _clipUp(g, cancelled) {
    if (!g.moved) {
      if (!cancelled && g.part === "move") {
        if (g.shift && g.was) this.clipSel = this.clipSel.filter((x) => x.key !== g.key || x.i !== g.i);
        else if (!g.shift && g.was) {
          const row = g.rows.get(g.key).row;
          const stack = this.clipSel.length === 1 ? this._stackAt(row, g.t0) : [];
          const k = stack.indexOf(g.i);
          this.clipSel = [{ key: g.key, i: stack.length > 1 && k >= 0 ? stack[(k + 1) % stack.length] : g.i }];
        }
        this.onClipSelect(this.clipSelection);
      }
    } else if (cancelled) {
      for (const r of g.rows.values()) r.row.clips = r.was;
    } else {
      const sel = [];
      for (const [key, r] of g.rows) for (const i of r.now || r.sel) sel.push({ key, i });
      this.clipSel = sel;
      for (const [key, r] of g.rows) this.onClips(key, r.row.clips);
      this.onClipSelect(this.clipSelection);
    }
    this.requestDraw();
  }

  // The mouse over the timeline: the knobs of the clip under it shown.
  _hover(x, y) {
    const under = this.clipsOn ? this._clipUnder(x, y) : null;
    const was = this.hoverClip;
    if ((under && was && under.key === was.key && under.i === was.i) || (!under && !was)) return;
    this.hoverClip = under;
    this.drawTop();
  }

  // What a press at (x, y) grabs: the notes, the sections, the chords or the
  // bar numbers ("notes", "sections", "chords", "nums" while editing, else
  // "bars"), a loop
  // edge ("start", "end"), the loop itself ("body"), or nothing (on the time
  // scale: a tap places the playhead, dragging scrolls; on the waveforms: the
  // playhead).
  _hit(x, y, type) {
    if (y < this.barsHeight) return !this.editing ? "bars" : y < this.sectionsTop ? "notes" : y < this.chordsTop ? "sections" : y < this.numsTop ? "chords" : "nums";
    const lp = this.loop;
    if (!lp.on || !(lp.end > lp.start)) return null;
    const mouse = type === "mouse";
    const x1 = this.x(lp.start);
    const x2 = this.x(lp.end);
    const d = Math.min(Math.abs(x - x1), Math.abs(x - x2));
    const edge = Math.abs(x - x1) <= Math.abs(x - x2) ? "start" : "end";
    const E = this.edgeY;
    // The time scale: the handles, on its edge by the tracks.
    if (this._inRuler(y)) return d <= (mouse ? 6 : 16) ? edge : null;
    // The waveforms: a mouse grabs the edges all along them, a finger the
    // part of the handles that reaches into the tracks; the loop from
    // inside it.
    const nearTab = this.rulerBelow ? y > E - this.dims.tab.h / 2 : y < E + this.dims.tab.h / 2;
    if (mouse ? d <= 6 : d <= 16 && nearTab) return edge;
    return x > x1 && x < x2 ? "body" : null;
  }

  // A press in the lane of the notes let go (2.21). A drag selected bars. A
  // tap: on the bars selected, not picked there yet (a section selected,
  // say), those bars; on bars picked there, the note under it (a shorter
  // one) or the bar alone (again); elsewhere the note under it, all its
  // bars, or the bar. Shift: the selection grows to take in the bar.
  _notesUp(g, pointerType) {
    const sel = this.selection;
    let range = null;
    let again = false;
    if (g.moved) range = sel;
    else {
      const i = g.i;
      const pick = this.notesPick;
      const picked = !!sel && !!pick && pick.lo === sel.lo && pick.hi === sel.hi;
      const inside = !!sel && i >= sel.lo && i <= sel.hi;
      const note = this._noteAt(i, g.row);
      const whole = (x) => ({ anchor: x.lo, lo: x.lo, hi: x.hi });
      if (g.shift && sel) range = { anchor: sel.anchor, lo: Math.min(sel.lo, i), hi: Math.max(sel.hi, i) };
      else if (inside && !picked) range = { ...sel };
      else if (inside) {
        again = true;
        range = note && !(note.lo === sel.lo && note.hi === sel.hi) ? whole(note) : { anchor: i, lo: i, hi: i };
      } else range = note ? whole(note) : { anchor: i, lo: i, hi: i };
    }
    if (!range) return;
    this.selection = { anchor: range.anchor ?? range.lo, lo: range.lo, hi: range.hi };
    this.notesPick = { lo: range.lo, hi: range.hi };
    this.drawTop();
    this.onSelect({ ...this.selection }, { done: true, tap: !g.moved, pointerType, lane: "notes", again });
  }

  // The note in row `row` of the lane of the notes over bar i, or null.
  _noteAt(i, row) {
    const list = this.grid.notes || [];
    const rows = this.noteLayout.rows;
    for (let k = 0; k < list.length; k++) if ((rows[k] || 0) === row && list[k].lo <= i && i <= list[k].hi) return list[k];
    return null;
  }

  // ----- what the lanes say, whole, under the mouse (2.21) ------------------------

  // The mouse resting on the notes, the sections or the chords of a bar: what
  // they say, in a box beside it, after a moment.
  _tip(x, y, e) {
    let text = "";
    const g = this.grid;
    if (this.showChords && y >= 0 && y < this.numsTop && g.bars.length && this.t(x) >= g.bars[0] - 1e-6) {
      const i = this.barIndexAt(x);
      text = y < this.sectionsTop ? this._notesTip(i) : y < this.chordsTop ? this._sectionTip(i) : this._chordsTip(i);
    }
    if (text !== this.tipText) {
      this._tipHide();
      this.tipText = text;
      if (text) this.tipTimer = setTimeout(() => this._tipShow(e.clientX, e.clientY), TIP_MS);
    } else if (text && this.tipBox && !this.tipBox.hidden) this._tipPlace(e.clientX, e.clientY);
    else if (text) {
      clearTimeout(this.tipTimer);
      this.tipTimer = setTimeout(() => this._tipShow(e.clientX, e.clientY), TIP_MS);
    }
  }

  _range2(lo, hi) {
    const g = this.grid;
    const a = barNumber(g, lo);
    const b = barNumber(g, hi);
    return a === b ? tr("Bar {n}", { n: a }) : tr("Bars {from} to {to}", { from: a, to: b });
  }

  // The notes over bar i, the longer first, with their bars.
  _notesTip(i) {
    return notesAt(this.grid.notes, i)
      .map((n) => `${this._range2(n.lo, n.hi)}: ${n.text}`)
      .join("\n");
  }

  // The section of bar i: its name, numbered, and its bars.
  _sectionTip(i) {
    const list = this.grid.sections || [];
    const k = sectionIndexAt(list, i);
    return k >= 0 ? `${this.titles[k] || ""} · ${this._range2(list[k].lo, list[k].hi)}` : "";
  }

  // The chords of bar i, in the key of now, each with its beat.
  _chordsTip(i) {
    const slots = this.grid.chords.get(i);
    if (!slots || !slots.some(Boolean)) return "";
    const beats = slotBeats(this.grid.meter);
    const chords = slots.map((c, k) => (c && k < beats.length ? `${this.chordNames.show(c)} (${beats[k] + 1})` : "")).filter(Boolean);
    return `${this._range2(i, i)}: ${chords.join(", ")}`;
  }

  _tipShow(cx, cy) {
    if (!this.tipText) return;
    if (!this.tipBox) {
      this.tipBox = document.createElement("div");
      this.tipBox.className = "tl-tip";
      this.tipBox.setAttribute("role", "tooltip");
      this.tipBox.hidden = true;
      document.body.append(this.tipBox);
    }
    this.tipBox.textContent = this.tipText;
    this.tipBox.hidden = false;
    this._tipPlace(cx, cy);
  }

  _tipPlace(cx, cy) {
    const box = this.tipBox;
    if (!box) return;
    const w = box.offsetWidth;
    const h = box.offsetHeight;
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, cx + 14));
    const top = cy + 18 + h <= window.innerHeight - 8 ? cy + 18 : Math.max(8, cy - h - 12);
    box.style.left = `${Math.round(left)}px`;
    box.style.top = `${Math.round(top)}px`;
  }

  _tipHide() {
    clearTimeout(this.tipTimer);
    this.tipTimer = 0;
    this.tipText = "";
    if (this.tipBox) this.tipBox.hidden = true;
  }

  // What a press in the lane of the sections takes: the section under bar
  // `i` (all its bars), or the bar alone.
  _unitAt(i) {
    const list = this.grid.sections || [];
    const k = sectionIndexAt(list, i);
    return k >= 0 ? { lo: list[k].lo, hi: list[k].hi } : { lo: i, hi: i };
  }

  // The beat of bar i pressed at x: the one under it, or the chord of the
  // bar whose name, written before it, reaches x.
  _slotAtX(i, x) {
    const g = this.grid;
    const k = slotAt(g, i, this.t(x));
    const slots = g.chords.get(i);
    if (!slots || slots[k]) return k;
    for (let j = k - 1; j >= 0; j--) {
      if (!slots[j]) continue;
      const ctx = this.base.getContext("2d");
      ctx.font = `600 ${this.compact ? 11 : 12}px ${FONT}`;
      const end = this.x(slotTimes(g, i)[j]) + this.textX + ctx.measureText(this.chordNames.show(slots[j])).width;
      return x <= end + 2 ? j : k;
    }
    return k;
  }

  // The end of bar `i` (the start of the next one, or the end of the song).
  _barEnd(i) {
    const bars = this.grid.bars;
    return i + 1 < bars.length ? bars[i + 1] : this.duration;
  }

  // Whether the loop is on bars lo..hi.
  _loopOver(lo, hi) {
    const bars = this.grid.bars;
    return !!bars.length && Math.abs(this.loop.start - bars[lo]) < 1e-6 && Math.abs(this.loop.end - this._barEnd(hi)) < 1e-6;
  }

  // The beat nearest to `t` (else the bar, else `t`).
  _nearestBeat(t) {
    const g = this.grid;
    const list = g.beats.length ? g.beats : g.bars;
    if (!list.length) return t;
    const i = lowerBound(list, t);
    let best = list[clamp(i, 0, list.length - 1)];
    if (i > 0 && Math.abs(list[i - 1] - t) < Math.abs(best - t)) best = list[i - 1];
    return best;
  }

  // Shift-click with the loop on: the span a..b (a bar, or a beat: a === b)
  // moves the edge of the loop on its side; inside the loop, the nearer edge.
  _loopTo(a, b) {
    let { start, end } = this.loop;
    if (a < start - 1e-9) start = a;
    else if (b > end + 1e-9) end = b;
    else if (a - start <= end - b) start = a;
    else end = b;
    start = clamp(start, 0, this.duration);
    end = clamp(end, 0, this.duration);
    if (end - start < MIN_LOOP) return;
    this.loop = { on: true, start, end };
    this.onLoop({ ...this.loop });
    this.drawTop();
    this.drawOverview();
  }

  _down(e) {
    this._tipHide();
    if (!(this.duration > 0)) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const p = this._point(e);
    this.pointers.set(e.pointerId, { x: p.x, y: p.y });
    try {
      this.main.setPointerCapture(e.pointerId);
    } catch (_) {}
    this._stopInertia();
    if (this.pointers.size >= 2) {
      // A second finger: pinch (Safari reports it with gesture events
      // instead). A playhead being dragged stays where it was taken.
      this.dragLoop = null;
      if (this.scrub !== null) {
        const t = this.scrub;
        this.scrub = null;
        this.onSeek(t);
      }
      const [a, b] = [...this.pointers.values()];
      this.gesture = { kind: "pinch", dist0: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), zoom0: this.zoom, anchor: this.t((a.x + b.x) / 2) };
      this.drawTop();
      return;
    }
    // The clips (a computer): their strip, their edges, their fades.
    const clip = this._clipHit(p.x, p.y, e.pointerType);
    if (clip) {
      this._clipDown(e, p, clip);
      return;
    }
    const zone = this._hit(p.x, p.y, e.pointerType);
    const looping = this.loop.on && this.loop.end > this.loop.start;
    // Shift-click on the time scale with the loop on: an edge of the loop to
    // the nearest beat.
    if (e.shiftKey && looping && this.hasGrid && this._inRuler(p.y)) {
      const t = this._nearestBeat(clamp(this.t(p.x), 0, this.duration));
      this._loopTo(t, t);
      return;
    }
    // The bar numbers: a stretch for the loop. A tap takes the bar (shift:
    // the stretch grows to take it in), dragging a stretch by the step of
    // _rangeStep() from where the press was.
    if (zone === "nums") {
      const i = this.barIndexAt(p.x);
      const bar = { start: this.grid.bars[i], end: this._barEnd(i) };
      const before = this.range;
      const from = e.shiftKey && before ? { start: Math.min(before.start, bar.start), end: Math.max(before.end, bar.end) } : bar;
      const step = this._rangeStep(e.pointerType);
      this.gesture = { kind: "range", id: e.pointerId, x0: p.x, step, anchor: this._rangeSnap(clamp(this.t(p.x), 0, this.duration), step), moved: false };
      this._setRange(from);
      return;
    }
    // The lane of the notes (2.21): what a tap takes is known when it ends
    // (_notesUp()); a drag selects bars from here.
    if (zone === "notes") {
      const i = this.barIndexAt(p.x);
      const anchor = e.shiftKey && this.selection ? this.selection.anchor : i;
      this.gesture = { kind: "notes", id: e.pointerId, x0: p.x, i, row: Math.floor(p.y / this.dims.notes), anchor, shift: e.shiftKey, moved: false };
      return;
    }
    if (zone === "sections") {
      const i = this.barIndexAt(p.x);
      const sel = this.selection;
      const onSelection = !e.shiftKey && !!sel && i >= sel.lo && i <= sel.hi;
      const unit = this._unitAt(i);
      // Shift: the selection grows to take in the section (or bar) clicked.
      const from = e.shiftKey && sel ? { lo: sel.lo, hi: sel.hi, anchor: sel.anchor } : { lo: unit.lo, hi: unit.hi, anchor: unit.lo };
      this.gesture = { kind: "section", id: e.pointerId, x0: p.x, i, from, onSelection, moved: false };
      if (!onSelection) this._selectRange(from.anchor, Math.min(from.lo, unit.lo), Math.max(from.hi, unit.hi));
      return;
    }
    if (zone === "chords") {
      const i = this.barIndexAt(p.x);
      const anchor = e.shiftKey && this.selection ? this.selection.anchor : i;
      // A click on the bar already selected, alone, takes the beat clicked;
      // on another bar, its first beat (2.20).
      const again = !e.shiftKey && !!this.selection && this.selection.lo === i && this.selection.hi === i;
      const slot = again ? this._slotAtX(i, p.x) : 0;
      this.gesture = { kind: "select", id: e.pointerId, x0: p.x, anchor, slot, again, moved: false };
      this._select(anchor, i, false, slot);
      return;
    }
    // The edges and the body of the loop move by the step of the bar numbers
    // (the eighth note, zoomed in enough).
    const step = this.hasGrid ? this._rangeStep(e.pointerType) : null;
    if (zone === "start" || zone === "end") this.gesture = { kind: zone, id: e.pointerId, x0: p.x, step };
    else if (zone === "body") this.gesture = { kind: "body", id: e.pointerId, x0: p.x, t0: this.t(p.x), loop0: { ...this.loop }, step, moved: false };
    else if (p.y >= this.headHeight && p.y < this.tracksBottom) this.gesture = { kind: "scrub", id: e.pointerId, x0: p.x, y0: p.y, moved: false };
    // The time scale, or the bars while not editing: a tap places the
    // playhead (the bars: asks for the chord), dragging scrolls.
    else this.gesture = { kind: "press", bar: zone === "bars", id: e.pointerId, x0: p.x, y0: p.y, start0: this.start, samples: [{ x: p.x, t: e.timeStamp }] };
    if (e.pointerType === "mouse" && this.gesture.kind !== "press") this.main.style.cursor = zone === "body" ? "grabbing" : this.gesture.kind === "scrub" ? "col-resize" : "ew-resize";
  }

  _move(e) {
    const p = this._point(e);
    const pt = this.pointers.get(e.pointerId);
    if (!pt) {
      if (e.pointerType === "mouse") {
        this._hover(p.x, p.y);
        this._tip(p.x, p.y, e);
        const clip = this._clipHit(p.x, p.y, "mouse");
        const zone = clip ? null : this._hit(p.x, p.y, "mouse");
        this.main.style.cursor = clip
          ? clip.part === "move"
            ? "grab"
            : "ew-resize"
          : zone === "start" || zone === "end"
            ? "ew-resize"
            : zone === "body"
              ? "grab"
              : zone === "chords" || zone === "bars" || zone === "sections" || zone === "notes" || zone === "nums"
                ? "pointer"
                : "";
      }
      return;
    }
    pt.x = p.x;
    pt.y = p.y;
    const g = this.gesture;
    if (!g) return;
    if (g.kind === "pinch") {
      if (this.nativePinch || this.pointers.size < 2) return;
      const [a, b] = [...this.pointers.values()];
      const d = Math.max(10, Math.hypot(a.x - b.x, a.y - b.y));
      this.zoomAround((g.zoom0 * d) / g.dist0, (a.x + b.x) / 2, g.anchor);
      return;
    }
    if (g.id !== e.pointerId) return;
    // Far enough from the press to scroll at an edge (a tap there does not).
    if (!g.far && g.x0 !== undefined && Math.abs(p.x - g.x0) >= TAP_SLOP) g.far = true;
    this.lastDrag = { x: p.x, y: p.y, altKey: e.altKey, pointerType: e.pointerType, timeStamp: e.timeStamp };
    this._drag(g, p, e);
    this._edgeScroll();
  }

  // A drag going on, the pointer at p (e: its keys and kind).
  _drag(g, p, e) {
    if (g.kind === "clip") {
      if (!g.moved && Math.abs(p.x - g.x0) < TAP_SLOP) return;
      g.moved = true;
      this._clipDrag(g, p.x, e.altKey);
      return;
    }
    if (g.kind === "select") {
      if (!g.moved && Math.abs(p.x - g.x0) < TAP_SLOP) return;
      g.moved = true;
      this._select(g.anchor, this.barIndexAt(p.x), false, g.slot);
      return;
    }
    if (g.kind === "range") {
      if (!g.moved && Math.abs(p.x - g.x0) < TAP_SLOP) return;
      g.moved = true;
      const t = clamp(this.t(p.x), 0, this.duration);
      const at = this._rangeSnap(t, g.step);
      let a = Math.min(g.anchor, at);
      let b = Math.max(g.anchor, at);
      // Back where it started: one step, on the side of the finger.
      if (b - a < g.step.len / 2) {
        if (t >= g.anchor) b = g.anchor + g.step.len;
        else a = g.anchor - g.step.len;
      }
      this._setRange({ start: a, end: b });
      return;
    }
    if (g.kind === "notes") {
      if (!g.moved && Math.abs(p.x - g.x0) < TAP_SLOP) return;
      g.moved = true;
      const i = this.barIndexAt(p.x);
      this.selection = { anchor: g.anchor, lo: Math.min(g.anchor, i), hi: Math.max(g.anchor, i) };
      this.drawTop();
      this.onSelect({ ...this.selection }, { done: false, lane: "notes" });
      return;
    }
    if (g.kind === "section") {
      if (!g.moved && Math.abs(p.x - g.x0) < TAP_SLOP) return;
      g.moved = true;
      const unit = this._unitAt(this.barIndexAt(p.x));
      this._selectRange(g.from.anchor, Math.min(g.from.lo, unit.lo), Math.max(g.from.hi, unit.hi));
      return;
    }
    if (g.kind === "start" || g.kind === "end") {
      let t = clamp(this.t(p.x), 0, this.duration);
      if (!e.altKey && g.step) t = this._rangeSnap(t, g.step);
      let { start, end } = this.loop;
      if (g.kind === "start") start = clamp(t, 0, end - MIN_LOOP);
      else end = clamp(t, start + MIN_LOOP, this.duration);
      this.dragLoop = { on: true, start, end };
      this.drawTop();
      this.drawOverview();
      return;
    }
    if (g.kind === "scrub") {
      if (!g.moved && Math.abs(p.x - g.x0) < TAP_SLOP) return;
      g.moved = true;
      this.scrub = clamp(this.t(p.x), 0, this.duration);
      this.drawTop();
      this.drawOverview();
      this.onScrub(this.scrub);
      return;
    }
    if (g.kind === "body") {
      const dx = p.x - g.x0;
      if (!g.moved && Math.abs(dx) < TAP_SLOP) return;
      g.moved = true;
      const w = g.loop0.end - g.loop0.start;
      let s = clamp(g.loop0.start + this.t(p.x) - g.t0, 0, Math.max(0, this.duration - w));
      if (!e.altKey && g.step) {
        const snapped = this._rangeSnap(s, g.step);
        if (snapped + w <= this.duration + 1e-9) s = snapped;
      }
      this.dragLoop = { on: true, start: s, end: s + w };
      this.drawTop();
      this.drawOverview();
      return;
    }
    const dx = p.x - g.x0;
    if (g.kind === "press" && Math.abs(dx) < TAP_SLOP && Math.abs(p.y - g.y0) < TAP_SLOP) return;
    g.kind = "pan";
    if (e.pointerType === "mouse") this.main.style.cursor = "grabbing";
    this.start = this.clampStart(g.start0 - dx / this.pps);
    g.samples.push({ x: p.x, t: e.timeStamp });
    while (g.samples.length > 2 && e.timeStamp - g.samples[0].t > 100) g.samples.shift();
    this.lastUser = now();
    this.requestDraw();
  }

  _up(e, cancelled) {
    const pt = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    const g = this.gesture;
    if (!g) return;
    if (g.kind === "pinch") {
      if (this.pointers.size === 0) {
        this.gesture = null;
        this.onView();
      }
      return;
    }
    if (g.id !== e.pointerId) return;
    this.gesture = null;
    const scrolled = this._stopEdgeScroll();
    if (e.pointerType === "mouse") this.main.style.cursor = "";
    if (scrolled) this.onView();
    const commitLoop = () => {
      if (!this.dragLoop) return;
      const lp = this.dragLoop;
      this.dragLoop = null;
      this.loop = { ...lp };
      this.onLoop(lp);
    };
    if (g.kind === "clip") {
      this._clipUp(g, cancelled);
      if (pt && e.pointerType === "mouse") this._hover(pt.x, pt.y); // the knobs of the clip now selected
    } else if (g.kind === "select") {
      if (this.selection) this.onSelect({ ...this.selection }, { done: true, tap: !g.moved, pointerType: e.pointerType, cancelled, slot: g.moved ? 0 : g.slot, again: g.again && !g.moved });
    } else if (g.kind === "range") {
      if (this.range && !cancelled) this.onRange({ ...this.range });
    } else if (g.kind === "notes") {
      if (!cancelled) this._notesUp(g, e.pointerType);
    } else if (g.kind === "section") {
      const sel = this.selection;
      if (!sel || cancelled) {
        // nothing to do
      } else if (g.onSelection && !g.moved) {
        // A tap on the bars selected: the menu of the names. With the loop on,
        // on a section among several selected, that section alone (looped);
        // on bars selected that the loop is not on yet, the loop goes there.
        const u = this._unitAt(g.i);
        const inside = sectionIndexAt(this.grid.sections, g.i) >= 0 && u.lo >= sel.lo && u.hi <= sel.hi && (u.lo > sel.lo || u.hi < sel.hi);
        if (this.loop.on && inside) {
          this.selection = { anchor: u.lo, lo: u.lo, hi: u.hi };
          this.onSelect({ ...this.selection }, { done: true, tap: true, pointerType: e.pointerType, lane: "sections" });
        } else if (this.loop.on && !this._loopOver(sel.lo, sel.hi)) {
          this.onSelect({ ...sel }, { done: true, tap: true, pointerType: e.pointerType, lane: "sections" });
        } else {
          const r = this.main.getBoundingClientRect();
          this.onSectionMenu({ lo: sel.lo, hi: sel.hi, x: r.left + (pt ? pt.x : 0), y: r.top + this.sectionsTop + this.dims.sections, pointerType: e.pointerType });
        }
      } else this.onSelect({ ...sel }, { done: true, tap: !g.moved, pointerType: e.pointerType, lane: "sections" });
    } else if (g.kind === "start" || g.kind === "end") commitLoop();
    else if (g.kind === "body") {
      if (g.moved) commitLoop();
      else if (!cancelled && pt) this.onSeek(clamp(this.t(pt.x), 0, this.duration));
    } else if (g.kind === "scrub") {
      const t = g.moved ? this.scrub : pt ? clamp(this.t(pt.x), 0, this.duration) : null;
      this.scrub = null;
      if (t !== null && (g.moved || !cancelled)) this.onSeek(t);
    } else if (g.kind === "press") {
      if (!cancelled && pt) {
        if (g.bar) {
          const i = this.barIndexAt(pt.x);
          this.onBarTap(i, { pointerType: e.pointerType, slot: 0 }); // its first beat (2.20)
        }
        else this.onSeek(clamp(this.t(pt.x), 0, this.duration));
      }
    } else if (g.kind === "pan") {
      if (!cancelled) this._inertia(g.samples, e.pointerType);
      this.onView();
    }
    this.drawTop();
  }

  _select(anchor, i, done, slot = null) {
    this.selection = { anchor, lo: Math.min(anchor, i), hi: Math.max(anchor, i) };
    this.drawTop();
    this.onSelect({ ...this.selection }, { done, slot });
  }

  _selectRange(anchor, lo, hi) {
    this.selection = { anchor: clamp(anchor, lo, hi), lo, hi };
    this.drawTop();
    this.onSelect({ ...this.selection }, { done: false, lane: "sections" });
  }

  // The step a stretch of the bar numbers takes, and the edges and the body
  // of the loop dragged: the eighth note (half a beat in 3/4 and 4/4, a beat
  // in 6/8), else the beat, else the bar, the finest that is wide enough on
  // screen (pps: pixels per second, the view's by default) for a mouse or a
  // finger. {list (the grid's beats or bars), div (each part of it divided in
  // div), pace (seconds between two of the list), len (seconds of a step)}.
  _rangeStep(pointerType, pps = this.pps) {
    const g = this.grid;
    const min = pointerType === "mouse" ? RANGE_PX.mouse : RANGE_PX.touch;
    const eighths = /\/8$/.test(g.meter || "") ? 1 : 2;
    const beat = { list: g.beats, pace: this.beatSec };
    if (g.beats.length && (this.beatSec / eighths) * pps >= min) return { ...beat, div: eighths, len: this.beatSec / eighths };
    if (g.beats.length && this.beatSec * pps >= min) return { ...beat, div: 1, len: this.beatSec };
    return { list: g.bars, pace: this.barSec, div: 1, len: this.barSec };
  }

  // The point of `step` nearest to t: the beats (or bars) of the grid, each
  // divided in step.div; before the first and after the last, at their pace.
  _rangeSnap(t, step) {
    const list = step.list;
    if (!list.length) return t;
    const i = lowerBound(list, t);
    let a;
    let b;
    if (i <= 0) {
      b = list[0];
      a = b - step.pace;
    } else if (i >= list.length) {
      a = list[list.length - 1];
      b = a + step.pace;
    } else {
      a = list[i - 1];
      b = list[i];
    }
    const part = (b - a) / step.div;
    return clamp(a + Math.round((t - a) / part) * part, 0, this.duration);
  }

  // The stretch chosen on the bar numbers forgotten (Deselect, 2.15). Only
  // with the loop off: while it is on, the stretch is the loop's.
  clearRange() {
    if (!this.range || this.loop.on) return;
    this.range = null;
    this.drawTop();
  }

  // The stretch of the bar numbers, at least as long as a loop can be.
  _setRange({ start, end }) {
    let a = clamp(Math.min(start, end), 0, this.duration);
    let b = clamp(Math.max(start, end), 0, this.duration);
    if (b - a < MIN_LOOP) {
      b = Math.min(this.duration, a + MIN_LOOP);
      a = Math.max(0, b - MIN_LOOP);
    }
    this.range = { start: a, end: b };
    this.drawTop();
  }

  _wheel(e) {
    if (!(this.duration > 0)) return;
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.width : 1;
    if (e.ctrlKey) {
      // A trackpad pinch arrives as a wheel with the ctrl key.
      e.preventDefault();
      this._stopInertia();
      this.zoomAround(this.zoom * Math.exp(-e.deltaY * unit * 0.01), this._point(e).x);
      this._viewSoon();
      return;
    }
    const dx = (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * unit;
    const dy = e.shiftKey ? 0 : e.deltaY * unit;
    if (Math.abs(dx) <= Math.abs(dy)) return; // the page scrolls
    e.preventDefault();
    this._stopInertia();
    this.start = this.clampStart(this.start + dx / this.pps);
    this.lastUser = now();
    this.requestDraw();
    this._viewSoon();
  }

  _viewSoon() {
    clearTimeout(this.viewTimer);
    this.viewTimer = setTimeout(() => this.onView(), 400);
  }

  _inertia(samples, type) {
    if (type === "mouse" || samples.length < 2) return;
    const a = samples[0];
    const b = samples[samples.length - 1];
    const dt = b.t - a.t;
    if (dt <= 0) return;
    let v = (b.x - a.x) / dt; // pixels per millisecond
    if (Math.abs(v) < 0.1) return;
    let last = now();
    const step = () => {
      const t = now();
      const elapsed = Math.min(48, t - last);
      last = t;
      const before = this.start;
      this.start = this.clampStart(this.start - (v * elapsed) / this.pps);
      v *= Math.pow(0.94, elapsed / 16);
      this.lastUser = t;
      this.draw();
      if (Math.abs(v) < 0.02 || this.start === before) {
        this.inertia = null;
        this.onView();
        return;
      }
      this.inertia = requestAnimationFrame(step);
    };
    this.inertia = requestAnimationFrame(step);
  }

  _stopInertia() {
    if (this.inertia) cancelAnimationFrame(this.inertia);
    this.inertia = null;
  }

  // A drag (EDGE_GESTURES) held at an edge of the timeline, or past it,
  // scrolls the view that way, faster the further it goes, and goes on under
  // the pointer as if it moved (2.15). Called on each move of the drag.
  _edgeScroll() {
    const g = this.gesture;
    const d = this.lastDrag;
    if (!g || !d || !EDGE_GESTURES.has(g.kind) || !g.far || this.zoom <= 1) {
      this._stopEdgeScroll();
      return;
    }
    const mouse = d.pointerType === "mouse";
    const zone = mouse ? EDGE_ZONE.mouse : EDGE_ZONE.touch;
    const depth = d.x < zone ? d.x - zone : d.x > this.width - zone ? d.x - (this.width - zone) : 0;
    this.edgeDepth = depth;
    if (!depth || this.edgeRaf) return;
    let last = now();
    const step = () => {
      this.edgeRaf = null;
      if (this.gesture !== g || !this.edgeDepth) return;
      const t = now();
      const elapsed = Math.min(48, t - last);
      last = t;
      const k = Math.abs(this.edgeDepth);
      const px = Math.min(mouse ? EDGE_SPEED.mouse : EDGE_SPEED.touch, 2 + k * (mouse ? 0.35 : 0.8)) * (elapsed / 16);
      const before = this.start;
      this.start = this.clampStart(this.start + (Math.sign(this.edgeDepth) * px) / this.pps);
      if (this.start === before) return; // at the start or the end of the song
      this.edgeScrolled = true;
      this.lastUser = t;
      this._drag(g, { x: this.lastDrag.x, y: this.lastDrag.y }, this.lastDrag);
      this.draw();
      this.edgeRaf = requestAnimationFrame(step);
    };
    this.edgeRaf = requestAnimationFrame(step);
  }

  // The scrolling at an edge stopped: whether the view moved.
  _stopEdgeScroll() {
    if (this.edgeRaf) cancelAnimationFrame(this.edgeRaf);
    this.edgeRaf = null;
    this.edgeDepth = 0;
    const scrolled = !!this.edgeScrolled;
    this.edgeScrolled = false;
    return scrolled;
  }
}
