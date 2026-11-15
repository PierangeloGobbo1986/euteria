// Editing the grid and the chords of the open song, as in EUTERIA (Python):
// the tempo of the grid (BPM, doubled or halved with ×2 and ÷2), the meter,
// the first beat (a bar starts there; Set first beat puts it at the playhead),
// the numbers of the bars, a chord per bar, copying and pasting the chords of
// several bars, clearing the chords. Every edit is kept in this browser at
// once (src/settings.js), and written in the song's file by Save (app.js).
//
// The editor is in the Song analysis card, always at hand: the bars and the
// chords can be edited whenever they are shown (the eye), except while the
// tempo detection runs (ctx.locked()); detected() puts the grid it makes in
// place of the one the song had.
//
// Bars are selected in the timeline, by their numbers or their chords: a tap
// or a click selects one, dragging along them (or shift-click) several; ‹ and
// › start from the bar at the playhead. No bar is selected until then, so that
// the keys stay the transport's (← → five seconds) until a bar is chosen;
// Escape lets it go. The chord typed applies to every bar selected; Return
// goes on to the next bar. With the song transposed (Key), the chord field
// shows and takes the chords in the key of now, and the bars keep them in the
// song's own key (src/chordnames.js), so that the song saved is the same in
// any key. Detect chords (Song analysis, wired in app/app.js) writes the
// chords found in the song (app/detect.js, src/chords.js) in every bar.

import { h, numberField, fmtTime, fmtSigned, parseTime, confirmTap } from "./controls.js";
import { chordView } from "../src/chordnames.js";
import { barChords } from "../src/chords.js";
import { setSection, sectionTitles, sectionIndexAt } from "../src/sections.js";
import { METERS, BPM_RANGE, DEFAULT_BPM, rebuildGrid, gridEdits, barNumber, barAt } from "../src/grid.js";
import { tr, trn } from "../src/i18n.js";

const $ = (id) => document.getElementById(id);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
// Keys that start typing a chord when bars are selected (a computer).
const CHORD_KEY = /^[A-Ga-gN%]$/;
const MESSAGE_MS = 4000;
// Text and attributes set only when they change (the page is refreshed at
// every frame while the song plays).
const setText = (el, text) => el.textContent !== text && (el.textContent = text);
const setAttr = (el, name, value) => el.getAttribute(name) !== value && el.setAttribute(name, value);

export class Editor {
  // ctx: {app, player, phone, timeline, changed() (the edits are to be kept),
  // refreshPage(), locked() (the tempo detection is running)}. Saving is in
  // the Project files card (app.js).
  constructor(ctx) {
    this.ctx = ctx;
    this.on = false;
    this.sel = null; // {anchor, lo, hi}: bar indexes
    this.clip = []; // chords copied, one per bar ("" for none)
    this.target = null; // the bars whose chord the chord field shows
    this.shown = ""; // what it showed
    this.shift = 0; // the song moved by these semitones (Key)
    this.dirty = false; // edits not saved in the file yet
    this.differs = false; // the grid is not the file's (kept in this browser)
    this.built = false; // its beats and bars were rebuilt here
    this.message = null; // {text, kind, until}
    this._build();
  }

  get grid() {
    return this.ctx.app.grid;
  }

  // The chords of the song seen in the key of now.
  get names() {
    return chordView(this.grid.chords.values(), this.shift);
  }

  // The song moved by `semitones` (Key): what was typed goes in first, in the
  // key it was typed in, then the chord field shows the new key.
  setShift(semitones) {
    const shift = Math.round(+semitones || 0);
    if (shift === this.shift) return;
    this.commitInput();
    this.shift = shift;
    this.loadInput();
    this.refresh();
  }

  get duration() {
    const song = this.ctx.player.song;
    return song ? song.duration : 0;
  }

  // ----- controls ----------------------------------------------------------------

  _build() {
    const phone = this.ctx.phone;
    this.bpm = numberField({
      label: tr("Tempo of the grid"),
      min: BPM_RANGE[0],
      max: BPM_RANGE[1],
      step: 0.5,
      decimals: 1,
      unit: "bpm",
      inputMode: "decimal",
      className: "bpm",
      onChange: (v) => this.rebuild({ bpm: v }, tr("Grid at {bpm} BPM.", { bpm: v.toFixed(1) })),
    });
    $("bpm-box").append(this.bpm.el);
    this.meter = h("select", { "aria-label": tr("Meter") });
    for (const m of METERS) this.meter.append(new Option(m, m));
    this.meter.addEventListener("change", () => this.setMeter(this.meter.value));
    $("meter-box").append(h("div", { class: "num meter" }, h("div", { class: "value" }, this.meter)));
    this.anchor = numberField({
      label: tr("First beat"),
      min: 0,
      max: 0,
      step: 0.01,
      decimals: 3,
      inputMode: "decimal",
      format: (v) => fmtTime(v, 3),
      parse: parseTime,
      className: "time anchor",
      onChange: (v) => this.rebuild({ firstBeat: v }, tr("First beat at {time}.", { time: fmtTime(v, 3) })),
    });
    $("anchor-box").append(this.anchor.el);
    $("set-anchor").addEventListener("click", () => {
      const t = this._beatNear(clamp(this.ctx.player.position, 0, this.duration));
      this.rebuild({ firstBeat: t }, tr("First beat at {time}: a bar starts there, the grid goes both ways.", { time: fmtTime(t, 3) }));
    });
    $("bpm-double").addEventListener("click", () => this.scaleTempo(2));
    $("bpm-half").addEventListener("click", () => this.scaleTempo(0.5));
    confirmTap($("clear-chords"), () => (phone ? tr("Tap again to clear") : tr("Click again to clear")), () => this.clearChords());

    this.bar = numberField({
      label: tr("Number of the selected bar"),
      min: -9999,
      max: 9999,
      step: 1,
      buttons: false,
      className: "bar",
      onChange: (v) => this.renumber(v),
    });
    this.bar.input.title = tr("Type a number to renumber the bars from here");
    $("bar-box").append(this.bar.el);
    $("bar-prev").addEventListener("click", () => this.move(-1, false));
    $("bar-next").addEventListener("click", () => this.move(1, false));
    $("chord-copy").addEventListener("click", () => this.copy());
    $("chord-paste").addEventListener("click", () => this.paste());

    const input = (this.chord = $("chord-input"));
    input.addEventListener("focus", () => {
      // The whole chord selected, to type over it (not when a key started it).
      // Some browsers place the caret after the focus: selected again then,
      // unless something was typed already.
      if (this.keepCaret) {
        this.keepCaret = false;
        return;
      }
      const value = input.value;
      input.select();
      setTimeout(() => document.activeElement === input && input.value === value && input.select(), 0);
    });
    input.addEventListener("blur", () => this.commitInput());
    input.addEventListener("keydown", (e) => this._inputKey(e));

  }

  // Time `t` put on the beat the tempo detection found nearest to it, if one is
  // near (a third of a beat); else as it is.
  _beatNear(t) {
    const found = this.ctx.app.analysis && this.ctx.app.analysis.beats;
    if (!Array.isArray(found) || !found.length) return t;
    const bpm = this.grid.bpm || DEFAULT_BPM;
    const tol = 20 / bpm;
    let best = null;
    for (const b of found) if (Math.abs(b - t) <= tol && (best === null || Math.abs(b - t) < Math.abs(best - t))) best = b;
    return best === null ? t : clamp(best, 0, this.duration);
  }

  // The names of the controls, again in the language in use.
  relabel() {
    this.bpm.relabel(tr("Tempo of the grid"));
    this.meter.setAttribute("aria-label", tr("Meter"));
    this.anchor.relabel(tr("First beat"));
    this.bar.relabel(tr("Number of the selected bar"));
    this.bar.input.title = tr("Type a number to renumber the bars from here");
    if (this.ctx.player.song) this.chord.placeholder = this._placeholder(); // else the page's own
    this.refresh();
  }

  // Return: the next bar (Shift: the previous one), the keyboard stays up.
  // Escape: the chord as it was. Ctrl+C and Ctrl+V (⌘ on a Mac) copy and
  // paste the chords of the bars, as in EUTERIA (Python), unless part of the
  // text is selected (copy) or nothing was copied (paste).
  _inputKey(e) {
    const input = this.chord;
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === "Enter" && !mod && !e.altKey) {
      e.preventDefault();
      this.commitInput();
      this.move(e.shiftKey ? -1 : 1, false);
      input.select();
    } else if (e.key === "Escape") {
      e.preventDefault();
      input.value = this.shown;
      input.blur();
    } else if (mod && !e.altKey && !e.shiftKey && (e.key === "c" || e.key === "C")) {
      const all = input.selectionStart === input.selectionEnd || (input.selectionStart === 0 && input.selectionEnd === input.value.length);
      if (!all) return;
      e.preventDefault();
      this.copy();
    } else if (mod && !e.altKey && !e.shiftKey && (e.key === "v" || e.key === "V")) {
      if (!this.clip.length) return;
      e.preventDefault();
      this.paste();
      input.select();
    }
  }

  // ----- state ----------------------------------------------------------------------

  // A song opened, with its edits as this browser keeps them.
  songOpened({ differs = false, built = false, dirty = false } = {}) {
    this.differs = differs;
    this.built = built;
    this.dirty = dirty && differs;
    this.sel = null;
    this.target = null;
    this.message = null;
    this.anchor.setRange(0, this.duration);
    // The bars and the chords can be edited whenever they are shown.
    this.on = !!this.ctx.player.song && this.ctx.app.gridVisible && !this.locked;
    this.ctx.timeline.setEditing(this.on);
    this.ctx.timeline.setSelection(null);
    this.loadInput();
    this.refresh();
  }

  // The edits to keep in this browser, or null (the grid is the file's).
  edits() {
    return this.differs ? gridEdits(this.grid, this.built) : null;
  }

  // The edits are dropped: the grid of the file again.
  reset(grid) {
    this.ctx.app.grid = grid;
    this.differs = false;
    this.built = false;
    this.dirty = false;
    this.sel = null;
    this.target = null;
    this.ctx.timeline.setGrid(grid);
    this.ctx.timeline.setSelection(null);
    this.loadInput();
    this.ctx.refreshPage();
  }

  // The song was saved: in its own file (inPlace), or as a copy.
  saved(inPlace) {
    this.dirty = false;
    if (inPlace) {
      this.differs = false;
      this.built = false;
    }
  }

  get locked() {
    return !!(this.ctx.locked && this.ctx.locked());
  }

  setOn(on) {
    const { app, player, timeline } = this.ctx;
    on = !!on && !!player.song && !this.locked;
    if (on === this.on) return;
    this.commitInput();
    this.on = on;
    if (on && !app.gridVisible) {
      app.gridVisible = true;
      timeline.setGridVisible(true);
      this.ctx.changed();
    }
    timeline.setEditing(on);
    this.sel = null;
    timeline.setSelection(null);
    this.loadInput();
    this.ctx.refreshPage();
  }

  say(text, kind = "", ms = MESSAGE_MS) {
    this.message = text ? { text, kind, until: ms ? performance.now() + ms : Infinity } : null;
    this.refresh();
    if (ms) setTimeout(() => this.refresh(), ms + 50);
  }

  // ----- selection -------------------------------------------------------------------

  _selectAtPlayhead() {
    const n = this.grid.bars.length;
    if (!n) {
      this.select(null);
      return;
    }
    const i = clamp(barAt(this.grid, this.ctx.player.position), 0, n - 1);
    this.select({ anchor: i, lo: i, hi: i });
  }

  select(sel, { reveal = false } = {}) {
    this.commitInput();
    const n = this.grid.bars.length;
    this.sel = sel && n ? { anchor: clamp(sel.anchor ?? sel.lo, 0, n - 1), lo: clamp(sel.lo, 0, n - 1), hi: clamp(sel.hi, 0, n - 1) } : null;
    this.ctx.timeline.setSelection(this.sel);
    if (reveal && this.sel) this.ctx.timeline.revealBars(this.sel.lo, this.sel.hi);
    this.loadInput();
    this.refresh();
  }

  // From the timeline: bars selected (by their numbers or their chords). On a
  // computer a click puts the cursor in the chord field.
  onSelect(sel, info = {}) {
    if (!this.on) return;
    this.select(sel);
    if (info.done && info.tap && info.pointerType === "mouse" && !this.ctx.phone && info.lane !== "sections") this.chord.focus();
  }

  // A bar tapped in the timeline while Bars and Chords is closed: it opens
  // with that bar selected (and, with a mouse, the cursor in the chord field).
  // On a computer its tools open over the timeline: the page scrolls with
  // them, so that the timeline stays where it was under the mouse.
  openAt(index, { pointerType = "" } = {}) {
    const host = this.ctx.timeline.main;
    const before = host.getBoundingClientRect().top;
    this.setOn(true);
    if (!this.on) return;
    this.select({ anchor: index, lo: index, hi: index });
    const shift = host.getBoundingClientRect().top - before;
    if (shift) window.scrollBy(0, shift);
    if (pointerType === "mouse" && !this.ctx.phone) this.chord.focus({ preventScroll: true });
  }

  // The next or previous bar; with extend, the selection grows or shrinks.
  move(d, extend) {
    const n = this.grid.bars.length;
    if (!n) return;
    if (!this.sel) {
      this._selectAtPlayhead();
      return;
    }
    const { anchor, lo, hi } = this.sel;
    if (extend) {
      const focus = clamp((anchor === lo ? hi : lo) + d, 0, n - 1);
      this.select({ anchor, lo: Math.min(anchor, focus), hi: Math.max(anchor, focus) }, { reveal: true });
    } else {
      const i = clamp(d > 0 ? hi + 1 : lo - 1, 0, n - 1);
      this.select({ anchor: i, lo: i, hi: i }, { reveal: true });
    }
  }

  // The chord field shows the chord of the bars selected (empty if they
  // differ).
  loadInput() {
    const input = this.chord;
    input.placeholder = this._placeholder();
    if (!this.sel) {
      this.target = null;
      this.shown = "";
      input.value = "";
      return;
    }
    const { lo, hi } = this.sel;
    const texts = new Set();
    for (let i = lo; i <= hi; i++) texts.add(this.grid.chords.get(i) || "");
    const value = texts.size === 1 ? this.names.show([...texts][0]) : "";
    this.target = { lo, hi };
    this.shown = value;
    input.value = value;
    if (document.activeElement === input) input.select();
  }

  // What the chord field says while empty: what to do, or that the bars
  // selected have different chords.
  _placeholder() {
    if (!this.sel) return this.grid.bars.length ? tr("Select a bar") : tr("No grid");
    const { lo, hi } = this.sel;
    const first = this.grid.chords.get(lo) || "";
    for (let i = lo + 1; i <= hi; i++) if ((this.grid.chords.get(i) || "") !== first) return tr("Several chords");
    return tr("Chord");
  }

  // What was typed in the chord field goes to its bars (empty: no chord).
  commitInput() {
    const t = this.target;
    if (!t) return;
    const text = this.chord.value.trim().replace(/\s+/g, " ");
    if (text === this.shown) return;
    this.shown = text;
    const stored = this.names.store(text); // in the song's own key
    this._setChords(t.lo, t.hi, () => stored);
  }

  // ----- edits ------------------------------------------------------------------------

  _edited(message = "") {
    this.dirty = true;
    this.differs = true;
    this.ctx.timeline.setGrid(this.grid);
    this.ctx.timeline.setSelection(this.sel);
    this.ctx.changed();
    if (message) this.say(message);
    this.ctx.refreshPage();
  }

  _setChords(lo, hi, chordFor) {
    const chords = new Map(this.grid.chords);
    for (let i = lo; i <= hi; i++) {
      const v = chordFor(i - lo);
      if (v) chords.set(i, v);
      else chords.delete(i);
    }
    this.ctx.app.grid = { ...this.grid, chords };
    this._edited();
  }

  // The meter of the song (the Tempo and key card): the grid rebuilt from its
  // anchor; a song without bars keeps the meter alone, for the metronome and
  // for the grid to come. Returns what was done, or "".
  setMeter(meter) {
    if (!this.ctx.player.song || meter === this.grid.meter) return "";
    if (this.grid.bars.length) {
      const said = tr("Meter {meter}: grid rebuilt from the anchor.", { meter });
      this.rebuild({ meter }, said);
      return said;
    }
    this.commitInput();
    this.ctx.app.grid = { ...this.grid, meter };
    const said = tr("Meter {meter}.", { meter });
    this._edited(said);
    return said;
  }

  // Tempo, meter or anchor changed: the grid rebuilt from the anchor.
  rebuild(fields, message) {
    if (!this.ctx.player.song) return;
    this.commitInput();
    const g = this.grid;
    const next = rebuildGrid({ ...g, bpm: g.bpm || DEFAULT_BPM, ...fields }, this.duration);
    const shift = next.shift || 0;
    delete next.shift;
    this.ctx.app.grid = next;
    this.built = true;
    if (this.sel) this.sel = { anchor: this.sel.anchor + shift, lo: this.sel.lo + shift, hi: this.sel.hi + shift };
    this._edited(message);
    if (this.on && this.sel) this.select(this.sel);
  }

  // ×2 and ÷2: the tempo of the grid doubled or halved, from the anchor
  // (the tempo detection may find half or twice the tempo).
  scaleTempo(factor) {
    const bpm = Math.round((this.grid.bpm || DEFAULT_BPM) * factor * 1000) / 1000;
    if (bpm < BPM_RANGE[0] || bpm > BPM_RANGE[1]) return;
    this.rebuild({ bpm }, tr("Grid at {bpm} BPM.", { bpm: bpm.toFixed(1) }));
  }

  // Bars lo..hi made a section ({kind} or {label}), or no longer one (null):
  // what is left of the sections there stays (src/sections.js). Said with
  // its name as it shows (numbered when it comes back).
  setSectionOf(lo, hi, value) {
    if (!this.ctx.player.song || !this.grid.bars.length) return;
    this.commitInput();
    const g = this.grid;
    const sections = setSection(g.sections, lo, hi, value);
    this.ctx.app.grid = { ...g, sections };
    const from = barNumber(g, lo);
    const to = barNumber(g, hi);
    let said;
    if (value) {
      const k = sectionIndexAt(sections, lo);
      const name = k >= 0 ? sectionTitles(sections)[k] : "";
      said = from === to ? tr("{name}: bar {from}.", { name, from }) : tr("{name}: bars {from} to {to}.", { name, from, to });
    } else said = from === to ? tr("No section in bar {from}.", { from }) : tr("No section in bars {from} to {to}.", { from, to });
    this._edited(said);
  }

  // The chords go; the grid stays (hidden with the eye, if not wanted).
  clearChords() {
    if (!this.ctx.player.song) return;
    this.commitInput();
    this.ctx.app.grid = { ...this.grid, chords: new Map() };
    this.loadInput();
    this._edited(tr("Chords cleared: the grid stays."));
  }

  // The chords found in the song (app.analysis.chords, src/chords.js) in
  // every bar, spelled in the song's key, in place of the chords it had (a
  // bar without a clear chord is left empty). quiet: no message here.
  // Returns how many bars got a chord.
  writeChords({ quiet = false } = {}) {
    const { app, player } = this.ctx;
    const found = app.analysis && app.analysis.chords;
    if (!player.song || !found || !Array.isArray(found.segments)) return 0;
    this.commitInput();
    const g = this.grid;
    if (!g.bars.length) return 0;
    const chords = barChords(found.segments, g, { duration: this.duration });
    app.grid = { ...g, chords };
    this.loadInput();
    this._edited(
      quiet ? "" : chords.size ? trn(chords.size, "Chord found in {n} bar: check it by ear.", "Chords found in {n} bars: check them by ear.") : tr("No chords found in this song.")
    );
    return chords.size;
  }

  // The grid the tempo detection made (fit: {bpm, meter, anchor}), in place
  // of the song's: built from the anchor, bars numbered from 1, the chords
  // kept with the bars they were in, and shown. A change to save.
  detected(fit) {
    const { app, player, timeline } = this.ctx;
    if (!player.song) return;
    this.commitInput();
    this.on = false;
    timeline.setEditing(false);
    const next = rebuildGrid({ ...this.grid, bpm: fit.bpm, meter: fit.meter, firstBeat: fit.anchor }, this.duration);
    delete next.shift;
    next.offset = 0;
    app.grid = next;
    this.built = true;
    this.sel = null;
    app.gridVisible = true;
    timeline.setGridVisible(true);
    this.loadInput();
    this._edited();
  }

  // The selected bar gets number n; the others follow (bar_number_offset).
  renumber(n) {
    if (!this.sel || !Number.isInteger(n)) return;
    this.ctx.app.grid = { ...this.grid, offset: n - (this.sel.lo + 1) };
    this._edited(tr("Bars renumbered: this one is {n}.", { n }));
  }

  clearSelection() {
    if (!this.sel) return;
    const { lo, hi } = this.sel;
    this._setChords(lo, hi, () => "");
    this.loadInput();
  }

  copy() {
    this.commitInput();
    if (!this.sel) return;
    const { lo, hi } = this.sel;
    this.clip = [];
    for (let i = lo; i <= hi; i++) this.clip.push(this.grid.chords.get(i) || "");
    this.say(trn(this.clip.length, "Chords of {n} bar copied.", "Chords of {n} bars copied."));
  }

  // Into the bars selected, repeating the chords copied to fill them (EUTERIA
  // (Python)); one bar selected: all the chords copied, from there.
  paste() {
    this.commitInput();
    if (!this.sel || !this.clip.length) return;
    const n = this.clip.length;
    let { lo, hi } = this.sel;
    if (lo === hi) hi = Math.min(this.grid.bars.length - 1, lo + n - 1);
    this._setChords(lo, hi, (k) => this.clip[k % n]);
    this.select({ anchor: lo, lo, hi }, { reveal: true });
    this.say(trn(hi - lo + 1, "Chords pasted into {n} bar.", "Chords pasted into {n} bars."));
  }

  // Keys while editing (the focus is not in a field). Returns true if used.
  key(e) {
    if (!this.on || !this.ctx.player.song || this.locked) return false;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && !e.altKey && !e.shiftKey && (e.key === "c" || e.key === "C") && this.sel && !String(window.getSelection() || "")) {
      e.preventDefault();
      this.copy();
      return true;
    }
    if (mod && !e.altKey && !e.shiftKey && (e.key === "v" || e.key === "V") && this.sel && this.clip.length) {
      e.preventDefault();
      this.paste();
      return true;
    }
    if (mod || e.altKey) return false;
    // ← → move the bars selected; with none, they are the transport's (5 seconds).
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      if (!this.grid.bars.length || !this.sel) return false;
      e.preventDefault();
      this.move(e.key === "ArrowLeft" ? -1 : 1, e.shiftKey);
      return true;
    }
    if (!this.sel) return false;
    if (e.key === "Enter") {
      e.preventDefault();
      this.chord.focus();
      return true;
    }
    if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      this.clearSelection();
      return true;
    }
    if (e.key === "Escape") {
      this.select(null);
      return true;
    }
    if (CHORD_KEY.test(e.key) && !e.repeat) {
      // The chord starts with this key.
      e.preventDefault();
      this.keepCaret = true;
      this.chord.focus();
      this.chord.value = e.key;
      this.chord.setSelectionRange(1, 1);
      return true;
    }
    return false;
  }

  // ----- the page ------------------------------------------------------------------------

  refresh() {
    const { player, phone } = this.ctx;
    const song = player.song;
    const show = !!song;
    const g = this.grid;
    $("grid-edit").hidden = !show;
    $("chord-edit").hidden = !show;
    if (!show) return;
    // The song transposed: the chords are in the key of now.
    const keyNote = $("chord-key");
    keyNote.hidden = !this.shift;
    if (this.shift) {
      const text = tr("Key {shift}: the chords are shown, and typed, in the new key; the song keeps them in its own key.", { shift: fmtSigned(this.shift) });
      if (keyNote.textContent !== text) keyNote.textContent = text;
    }

    const busy = !!player.busy || this.locked;
    this.bpm.set(g.bpm || DEFAULT_BPM);
    this.bpm.disable(busy);
    const bpm = g.bpm || DEFAULT_BPM;
    const hasBars = g.bars.length > 0;
    this.bpm.disable(busy || !hasBars);
    $("bpm-double").disabled = busy || !hasBars || bpm * 2 > BPM_RANGE[1];
    $("bpm-half").disabled = busy || !hasBars || bpm / 2 < BPM_RANGE[0];
    if (document.activeElement !== this.meter) this.meter.value = g.meter;
    this.meter.disabled = busy;
    this.anchor.set(g.firstBeat || 0);
    this.anchor.disable(busy);
    $("set-anchor").disabled = busy;
    $("clear-chords").disabled = busy || !g.chords.size;

    const has = g.bars.length > 0;
    const sel = has ? this.sel : null;
    this.bar.set(sel ? barNumber(g, sel.lo) : 0);
    if (!sel && document.activeElement !== this.bar.input) this.bar.input.value = "";
    this.bar.disable(!sel);
    $("bar-prev").disabled = busy || !has || (!!sel && sel.lo <= 0);
    $("bar-next").disabled = busy || !has || (!!sel && sel.hi >= g.bars.length - 1);
    this.chord.disabled = !sel;
    $("chord-copy").disabled = !sel;
    $("chord-paste").disabled = !sel || !this.clip.length;

    const status = $("edit-status");
    const m = this.message && performance.now() < this.message.until ? this.message : null;
    const text = m
      ? m.text
      : this.dirty
        ? tr("Changes not saved yet: Save is at the top right.")
        : has
          ? ""
          : phone
            ? tr("No grid: set the first beat at the first beat of a bar.")
            : tr("No grid: put the playhead on the first beat of a bar and set the first beat.");
    setText(status, text);
    setAttr(status, "class", `edit-status ${m ? m.kind : this.dirty ? "dirty" : ""}`.trim());
  }
}
