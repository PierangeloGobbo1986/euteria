// Editing the grid and the chords of the open song, as in EUTERIA (Python):
// the tempo of the grid (BPM), the meter, the anchor (the first beat of a
// bar; Set anchor puts it at the playhead), clearing the grid, the numbers
// of the bars, a chord per bar, copying and pasting the chords of several
// bars. Every edit is kept in this browser at once (src/settings.js), and
// written in the song's file by Save (app.js).
//
// Bars are selected in the chord lane of the timeline: a tap or a click
// selects one, dragging along the lane (or shift-click) several. The chord
// typed applies to every bar selected; Return goes on to the next bar.

import { h, numberField, fmtTime, parseTime, confirmTap } from "./controls.js";
import { METERS, BPM_RANGE, DEFAULT_BPM, rebuildGrid, clearedGrid, gridEdits, barNumber, barAt } from "../src/grid.js";

const $ = (id) => document.getElementById(id);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
// Keys that start typing a chord when bars are selected (a computer).
const CHORD_KEY = /^[A-Ga-gN%]$/;
const MESSAGE_MS = 4000;
// Text and attributes set only when they change (the page is refreshed at
// every frame while the song plays).
const setText = (el, text) => el.textContent !== text && (el.textContent = text);
const setAttr = (el, name, value) => el.getAttribute(name) !== value && el.setAttribute(name, value);

export class Editor {
  // ctx: {app, player, phone, timeline, changed() (the edits are to be kept),
  // refreshPage()}. Saving is in the Project files card (app.js).
  constructor(ctx) {
    this.ctx = ctx;
    this.on = false;
    this.sel = null; // {anchor, lo, hi}: bar indexes
    this.clip = []; // chords copied, one per bar ("" for none)
    this.target = null; // the bars whose chord the chord field shows
    this.shown = ""; // what it showed
    this.dirty = false; // edits not saved in the file yet
    this.differs = false; // the grid is not the file's (kept in this browser)
    this.built = false; // its beats and bars were rebuilt here
    this.message = null; // {text, kind, until}
    this._build();
  }

  get grid() {
    return this.ctx.app.grid;
  }

  get duration() {
    const song = this.ctx.player.song;
    return song ? song.duration : 0;
  }

  // ----- controls ----------------------------------------------------------------

  _build() {
    const phone = this.ctx.phone;
    this.bpm = numberField({
      label: "Tempo of the grid",
      min: BPM_RANGE[0],
      max: BPM_RANGE[1],
      step: 0.5,
      decimals: 1,
      unit: "bpm",
      inputMode: "decimal",
      className: "bpm",
      onChange: (v) => this.rebuild({ bpm: v }, `Grid at ${v.toFixed(1)} BPM.`),
    });
    $("bpm-box").append(this.bpm.el);
    this.meter = h("select", { "aria-label": "Meter" });
    for (const m of METERS) this.meter.append(new Option(m, m));
    this.meter.addEventListener("change", () => this.rebuild({ meter: this.meter.value }, `Meter ${this.meter.value}: grid rebuilt from the anchor.`));
    $("meter-box").append(h("div", { class: "num meter" }, h("div", { class: "value" }, this.meter)));
    this.anchor = numberField({
      label: "Anchor",
      min: 0,
      max: 0,
      step: 0.01,
      decimals: 3,
      inputMode: "decimal",
      format: (v) => fmtTime(v, 3),
      parse: parseTime,
      className: "time anchor",
      onChange: (v) => this.rebuild({ firstBeat: v }, `Anchor at ${fmtTime(v, 3)}.`),
    });
    $("anchor-box").append(this.anchor.el);
    $("set-anchor").addEventListener("click", () => {
      const t = clamp(this.ctx.player.position, 0, this.duration);
      this.rebuild({ firstBeat: t }, `Anchor at ${fmtTime(t, 3)}: a bar starts there, the grid goes both ways.`);
    });
    confirmTap($("clear-grid"), phone ? "Tap again to clear" : "Click again to clear", () => this.clearGrid());

    this.bar = numberField({
      label: "Number of the selected bar",
      min: -9999,
      max: 9999,
      step: 1,
      buttons: false,
      className: "bar",
      onChange: (v) => this.renumber(v),
    });
    this.bar.input.title = "Type a number to renumber the bars from here";
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

    $("edit-toggle").addEventListener("click", () => this.setOn(!this.on));
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
    if (!this.ctx.player.song) this.on = false;
    this.ctx.timeline.setEditing(this.on);
    if (this.on) this._selectAtPlayhead();
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
    if (this.on) this._selectAtPlayhead();
    else this.ctx.timeline.setSelection(null);
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

  setOn(on) {
    const { app, player, timeline } = this.ctx;
    on = !!on && !!player.song;
    if (on === this.on) return;
    this.commitInput();
    this.on = on;
    if (on && !app.gridVisible) {
      app.gridVisible = true;
      timeline.setGridVisible(true);
      this.ctx.changed();
    }
    timeline.setEditing(on);
    if (on) this._selectAtPlayhead();
    else this.sel = null;
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

  // From the timeline: bars selected in the chord lane. On a computer a
  // click puts the cursor in the chord field.
  onSelect(sel, info = {}) {
    if (!this.on) return;
    this.select(sel);
    if (info.done && info.tap && info.pointerType === "mouse" && !this.ctx.phone) this.chord.focus();
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
    if (!this.sel) {
      this.target = null;
      this.shown = "";
      input.value = "";
      input.placeholder = this.grid.bars.length ? "Select a bar" : "No grid";
      return;
    }
    const { lo, hi } = this.sel;
    const texts = new Set();
    for (let i = lo; i <= hi; i++) texts.add(this.grid.chords.get(i) || "");
    const value = texts.size === 1 ? [...texts][0] : "";
    this.target = { lo, hi };
    this.shown = value;
    input.value = value;
    input.placeholder = texts.size > 1 ? "Several chords" : "Chord";
    if (document.activeElement === input) input.select();
  }

  // What was typed in the chord field goes to its bars (empty: no chord).
  commitInput() {
    const t = this.target;
    if (!t) return;
    const text = this.chord.value.trim().replace(/\s+/g, " ");
    if (text === this.shown) return;
    this.shown = text;
    this._setChords(t.lo, t.hi, () => text);
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
    if (this.on) {
      if (this.sel) this.select(this.sel);
      else this._selectAtPlayhead();
    }
  }

  clearGrid() {
    if (!this.ctx.player.song) return;
    this.commitInput();
    this.ctx.app.grid = clearedGrid(this.grid);
    this.built = true;
    this.sel = null;
    this.loadInput();
    this._edited("Grid and chords cleared. Set the anchor to make a new grid.");
  }

  // The selected bar gets number n; the others follow (bar_number_offset).
  renumber(n) {
    if (!this.sel || !Number.isInteger(n)) return;
    this.ctx.app.grid = { ...this.grid, offset: n - (this.sel.lo + 1) };
    this._edited(`Bars renumbered: this one is ${n}.`);
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
    this.say(`Chords of ${plural(this.clip.length, "bar")} copied.`);
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
    this.say(`Chords pasted into ${plural(hi - lo + 1, "bar")}.`);
  }

  // Keys while editing (the focus is not in a field). Returns true if used.
  key(e) {
    if (!this.on || !this.ctx.player.song) return false;
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
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      if (!this.grid.bars.length) return false;
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
    const show = this.on && !!song;
    const g = this.grid;
    const toggle = $("edit-toggle");
    toggle.classList.toggle("on", show);
    toggle.classList.toggle("dirty", !!song && this.dirty);
    setAttr(toggle, "aria-pressed", String(show));
    toggle.disabled = !song;
    setAttr(toggle, "title", this.dirty ? "Edit the bars and the chords (changes not saved)" : "Edit the bars and the chords");
    $("grid-edit").hidden = !show;
    $("chord-edit").hidden = !show;
    if (!show) return;

    const busy = !!player.busy;
    this.bpm.set(g.bpm || DEFAULT_BPM);
    this.bpm.disable(busy);
    if (document.activeElement !== this.meter) this.meter.value = g.meter;
    this.meter.disabled = busy;
    this.anchor.set(g.firstBeat || 0);
    this.anchor.disable(busy);
    $("set-anchor").disabled = busy;
    $("clear-grid").disabled = busy || (!g.bars.length && !g.chords.size);

    const has = g.bars.length > 0;
    const sel = has ? this.sel : null;
    this.bar.set(sel ? barNumber(g, sel.lo) : 0);
    if (!sel && document.activeElement !== this.bar.input) this.bar.input.value = "";
    this.bar.disable(!sel);
    $("bar-prev").disabled = !sel || sel.lo <= 0;
    $("bar-next").disabled = !sel || sel.hi >= g.bars.length - 1;
    this.chord.disabled = !sel;
    $("chord-copy").disabled = !sel;
    $("chord-paste").disabled = !sel || !this.clip.length;

    const status = $("edit-status");
    const m = this.message && performance.now() < this.message.until ? this.message : null;
    const text = m
      ? m.text
      : this.dirty
        ? "Changes not saved yet: Save is at the top right."
        : has
          ? ""
          : phone
            ? "No grid: set the anchor at the first beat of a bar."
            : "No grid: put the playhead on the first beat of a bar and set the anchor.";
    setText(status, text);
    setAttr(status, "class", `edit-status ${m ? m.kind : this.dirty ? "dirty" : ""}`.trim());
  }
}
