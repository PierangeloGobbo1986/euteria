// Editing the grid and the chords of the open song: the tempo of the grid
// (BPM, doubled or halved with ×2 and ÷2), the meter, the first beat (a bar
// starts there; Set first beat puts it at the playhead), the numbers of the
// bars, the chords of each bar beat by beat, copying and pasting the chords
// of several bars, clearing the chords. Every edit is kept in this browser
// at once (src/settings.js), and written in the song's file by Save (app.js).
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
// Escape lets it go. The chord fields are the beats of the bar a chord may
// start on (its slots, src/grid.js: four in 4/4, three in 3/4, two in 6/8): a
// click on a chord, or on a beat, in the timeline opens the field of that
// beat. A chord typed applies to that beat of every bar selected; chords typed
// one after the other in a field are spread over the rest of the bar (two
// from beat 1 on beats 1 and 3, src/grid.js spread()); an empty field removes
// the chord of its beat. Tab goes on to the next beat (from the last one, to
// the next bar), Return to the next bar. With the song transposed (Key), the
// fields show and take the chords in the key of now, and the bars keep them in
// the song's own key (src/chordnames.js), so that the song saved is the same
// in any key. Detect chords (Song analysis, wired in app/app.js) writes the
// chords found in the song (app/detect.js, src/chords.js) on the beats of
// every bar.
//
// The notes (2.21, src/notes.js): the field Note (in the tab Bars and chords
// on a computer, under the chord fields on a smartphone) shows and takes the
// note of the bars selected, those exactly. Bars are selected for it in the
// lane of the notes (app/timeline.js says how); a computer puts the cursor in
// the field at once, a smartphone at a tap again (the first one only
// selects). Return keeps the note, Escape gives back the one before, an empty
// note is taken away.

import { h, numberField, fmtTime, fmtSigned, parseTime } from "./controls.js";
import { chordView } from "../src/chordnames.js";
import { barChords } from "../src/chords.js";
import { setSection, sectionTitles, sectionIndexAt } from "../src/sections.js";
import { noteOf, setNote } from "../src/notes.js";
import {
  METERS,
  BPM_RANGE,
  DEFAULT_BPM,
  rebuildGrid,
  gridEdits,
  barNumber,
  barAt,
  slotBeats,
  slotCount,
  chordWords,
  spread,
  toSlots,
  chordTexts,
  chordsInMeter,
} from "../src/grid.js";
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
  // refreshPage(), locked() (the tempo detection is running), notice(text,
  // kind, ms) (the band of the messages, app.js), step(back) (undo, or redo,
  // app.js), barsSelected() (bars were selected: the clips selected let go)}.
  // Saving is in the Project files card (app.js).
  constructor(ctx) {
    this.ctx = ctx;
    this.on = false;
    this.sel = null; // {anchor, lo, hi}: bar indexes
    this.clip = []; // chords copied: the slots of each bar (null for none)
    this.clipChord = null; // a chord copied alone (2.20), as its field showed it
    this.clipKind = "bars"; // what was copied last: "bars" or "chord"
    // The beat of the bar chosen (a click again on the bar, a field clicked,
    // Tab or ← → among the fields): Ctrl+C, ⌘C copy its chord alone (2.20).
    this.beatMode = false;
    this.noteShown = ""; // the note the field showed (2.21)
    this.clipSections = []; // the sections copied with them (2.15), from their first bar
    this.target = null; // the bars whose chords the fields show
    this.shown = []; // what each field showed
    this.slot = 0; // the beat being written (its slot)
    this.shift = 0; // the song moved by these semitones (Key)
    this.dirty = false; // edits not saved in the file yet
    this.differs = false; // the grid is not the file's (kept in this browser)
    this.built = false; // its beats and bars were rebuilt here
    this._build();
  }

  get grid() {
    return this.ctx.app.grid;
  }

  // The chords of the song seen in the key of now.
  get names() {
    return chordView(chordTexts(this.grid.chords), this.shift);
  }

  // How many fields the meter has, and the beat each one is.
  get slotCount() {
    return slotCount(this.grid.meter);
  }

  // The field of the beat being written.
  get chord() {
    return this.slots[Math.min(this.slot, this.slotCount - 1)];
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
    $("clear-chords").addEventListener("click", () => this.clearChords());

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

    // The fields of the beats of a bar.
    this.slots = [0, 1, 2, 3].map((k) => $(`chord-slot-${k}`));
    this.slots.forEach((input, k) => {
      input.addEventListener("focus", () => {
        this.slot = k;
        this._showSlot();
        // The whole chord selected, to type over it (not when a key started
        // it). Some browsers place the caret after the focus: selected again
        // then, unless something was typed already.
        if (this.keepCaret) {
          this.keepCaret = false;
          return;
        }
        const value = input.value;
        input.select();
        setTimeout(() => document.activeElement === input && input.value === value && input.select(), 0);
      });
      input.addEventListener("blur", () => this.commitInput(k));
      input.addEventListener("keydown", (e) => this._inputKey(e, k));
      input.addEventListener("pointerdown", () => (this.beatMode = true)); // a beat chosen
    });
    this._labelSlots();
    // The note of the bars selected (2.21).
    this.note = $("note-text");
    this.note.addEventListener("blur", () => this.commitNote());
    this.note.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        this.commitNote();
        this.note.blur();
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.note.value = this.noteShown;
        this.note.blur();
      }
    });
  }

  // The names of the fields: the beat of each (in 6/8, beats 1 and 4).
  _labelSlots() {
    const beats = slotBeats(this.grid.meter);
    this.slots.forEach((input, k) => {
      if (k < beats.length) input.setAttribute("aria-label", tr("Chord on beat {n}", { n: beats[k] + 1 }));
    });
  }

  // The field of beat k, with the cursor in it.
  focusSlot(k) {
    this.slot = clamp(k, 0, this.slotCount - 1);
    if (this.ctx.showTools) this.ctx.showTools(); // a computer: the fields are in the tab Bars and chords
    const input = this.chord;
    // A smartphone: not scrolled at once, or the mouse events a tap sends
    // after it would land elsewhere and take the focus away (it scrolls the
    // field into view with the keyboard).
    if (!input.disabled) input.focus(this.ctx.phone ? { preventScroll: true } : undefined);
    this._showSlot();
  }

  // The beat being written: marked among the fields and in the timeline.
  _showSlot() {
    const n = this.slotCount;
    if (this.slot >= n) this.slot = n - 1;
    const on = !!this.sel;
    this.slots.forEach((input, k) => input.classList.toggle("current", on && k === this.slot));
    this.ctx.timeline.setActiveSlot(on ? this.slot : null);
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
    this._labelSlots();
    if (this.ctx.player.song) {
      this.commitInput();
      this.loadInput();
    }
    this.refresh();
  }

  // In the field of beat k. Return: the next bar, from its beat 1 (Shift:
  // the previous one), the keyboard stays up. Tab: the next beat, from the
  // last one beat 1 of the next bar (Shift: back). ← → at an end of the text:
  // the beat beside. Escape: the chord as it was. Ctrl+C and Ctrl+V (⌘ on a
  // Mac) copy and paste the chords of the bars, unless part of the text is
  // selected (copy) or nothing was copied (paste); with a beat chosen
  // (beatMode), Ctrl+C copies its chord alone, and a chord copied alone is
  // pasted on the beat of the field (2.20). Ctrl+Z undoes the last change to
  // the song while nothing is typed in the field.
  _inputKey(e, k) {
    const input = this.slots[k];
    const mod = e.metaKey || e.ctrlKey;
    const n = this.slotCount;
    if (e.key === "Enter" && !mod && !e.altKey) {
      e.preventDefault();
      this.commitInput();
      this.move(e.shiftKey ? -1 : 1, false);
      this.focusSlot(0);
      this.chord.select();
    } else if (e.key === "Tab" && !mod && !e.altKey) {
      const next = k + (e.shiftKey ? -1 : 1);
      if (next >= 0 && next < n) {
        this.beatMode = true; // the browser goes on to that field: a beat chosen
        return;
      }
      const i = this.sel ? (e.shiftKey ? this.sel.lo - 1 : this.sel.hi + 1) : -1;
      if (i < 0 || i >= this.grid.bars.length) return; // out of the fields
      e.preventDefault();
      this.commitInput();
      this.select({ anchor: i, lo: i, hi: i }, { reveal: true });
      this.focusSlot(e.shiftKey ? n - 1 : 0);
    } else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !mod && !e.altKey && !e.shiftKey) {
      const a = input.selectionStart;
      const b = input.selectionEnd;
      const left = e.key === "ArrowLeft";
      if (a !== b || a !== (left ? 0 : input.value.length)) return;
      const next = k + (left ? -1 : 1);
      if (next < 0 || next >= n) return;
      e.preventDefault();
      this.focusSlot(next);
      this.beatMode = true;
    } else if (e.key === "Escape") {
      e.preventDefault();
      input.value = this.shown[k] || "";
      input.blur();
    } else if (mod && !e.altKey && !e.shiftKey && (e.key === "c" || e.key === "C")) {
      const all = input.selectionStart === input.selectionEnd || (input.selectionStart === 0 && input.selectionEnd === input.value.length);
      if (!all) return;
      e.preventDefault();
      if (this.beatMode) this.copyChord(k);
      else this.copy();
    } else if (mod && !e.altKey && !e.shiftKey && (e.key === "v" || e.key === "V")) {
      if (this.clipKind === "chord" && this.clipChord !== null) {
        e.preventDefault();
        this.pasteChord(k);
        return;
      }
      if (!this.clip.length) return;
      e.preventDefault();
      this.paste();
      this.focusSlot(k);
      this.chord.select();
    } else if (mod && !e.altKey && (e.key === "z" || e.key === "Z" || (e.ctrlKey && !e.metaKey && !e.shiftKey && (e.key === "y" || e.key === "Y")))) {
      // Ctrl+Z, ⌘Z (Shift, or Ctrl+Y: redo): nothing typed in the field, the
      // song's undo and redo (app.js); else the field's own.
      if (input.value !== (this.shown[k] || "") || !this.ctx.step) return;
      e.preventDefault();
      this.ctx.step((e.key === "z" || e.key === "Z") && !e.shiftKey);
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
    this.slot = 0;
    this.anchor.setRange(0, this.duration);
    // The bars and the chords can be edited whenever they are shown.
    this.on = !!this.ctx.player.song && this.ctx.app.gridVisible && !this.locked;
    this.ctx.timeline.setEditing(this.on);
    this.ctx.timeline.setSelection(null);
    this._labelSlots();
    this.loadInput();
    this.loadNote();
    this._showSlot();
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
    this._labelSlots();
    this.loadInput();
    this.loadNote();
    this._showSlot();
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

  // Undo and redo (app/history.js): the grid of a step, as it was then
  // (edits not saved, the grid not the file's, rebuilt here). The bars
  // selected stay selected while the grid has them.
  restore(grid, { dirty, differs, built }) {
    this.target = null; // what the fields show is not written over the grid put back
    this.ctx.app.grid = grid;
    this.dirty = dirty;
    this.differs = differs;
    this.built = built;
    if (this.sel && this.sel.hi >= grid.bars.length) this.sel = null;
    this.ctx.timeline.setGrid(grid);
    this.ctx.timeline.setSelection(this.sel);
    this._labelSlots();
    this.loadInput();
    this.loadNote();
    this._showSlot();
    this.ctx.refreshPage();
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
    this._showSlot();
    this.ctx.refreshPage();
  }

  // What an edit did, in the band of the messages, wherever the page is (the
  // chord tools are over the tracks, the grid's in Song analysis).
  say(text, kind = "", ms = MESSAGE_MS) {
    if (text && this.ctx.notice) this.ctx.notice(text, kind, ms);
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
    this.commitNote();
    this.beatMode = false;
    const n = this.grid.bars.length;
    this.sel = sel && n ? { anchor: clamp(sel.anchor ?? sel.lo, 0, n - 1), lo: clamp(sel.lo, 0, n - 1), hi: clamp(sel.hi, 0, n - 1) } : null;
    this.ctx.timeline.setSelection(this.sel);
    if (this.sel && this.ctx.barsSelected) this.ctx.barsSelected(); // the clips selected let go
    if (reveal && this.sel) this.ctx.timeline.revealBars(this.sel.lo, this.sel.hi);
    this.loadInput();
    this.loadNote();
    this._showSlot();
    this.refresh();
  }

  // From the timeline: bars selected (by their numbers or their chords), and
  // the beat the press was on (slot): the first beat of a bar clicked, the
  // beat clicked when the bar was selected already (again, 2.20). On a
  // computer a click puts the cursor in the field of that beat; on a
  // smartphone a tap again on the bar opens the keyboard there (the first
  // one only selects it).
  onSelect(sel, info = {}) {
    if (!this.on) return;
    if (info.lane === "notes") {
      // The lane of the notes (2.21): the field Note, at once on a computer,
      // at a tap again on a smartphone.
      this.select(sel);
      if (sel && this.ctx.showTools) this.ctx.showTools();
      if (info.done && sel && (!this.ctx.phone || info.again)) this.focusNote();
      return;
    }
    if (Number.isInteger(info.slot)) this.slot = info.slot;
    this.select(sel);
    if (info.done && info.again) this.beatMode = true;
    if (sel && this.ctx.showTools) this.ctx.showTools(); // a computer: the tab Bars and chords
    const tap = info.done && info.tap && info.lane !== "sections";
    if (tap && info.pointerType === "mouse" && !this.ctx.phone) this.focusSlot(this.slot);
    else if (tap && info.again && this.ctx.phone) this.focusSlot(this.slot);
  }

  // A bar tapped in the timeline while Bars and Chords is closed: it opens
  // with that bar selected (and, with a mouse, the cursor in the field of
  // the beat tapped). On a computer its tools open over the timeline: the
  // page scrolls with them, so that the timeline stays where it was under the
  // mouse.
  openAt(index, { pointerType = "", slot = 0 } = {}) {
    const host = this.ctx.timeline.main;
    const before = host.getBoundingClientRect().top;
    this.setOn(true);
    if (!this.on) return;
    this.select({ anchor: index, lo: index, hi: index });
    this.slot = Number.isInteger(slot) ? slot : 0;
    this._showSlot();
    if (this.ctx.showTools) this.ctx.showTools(); // a computer: the tab Bars and chords
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

  // The fields show the chords of the bars selected, beat by beat (a field
  // is empty where they differ, with … in it). As many fields as the meter
  // has beats a chord may start on.
  loadInput() {
    const beats = slotBeats(this.grid.meter);
    const n = beats.length;
    this.slots.forEach((input, k) => (input.hidden = k >= n));
    if (this.slot >= n) this.slot = n - 1;
    this.shown = [];
    if (!this.sel) {
      this.target = null;
      this.slots.forEach((input, k) => {
        input.value = "";
        input.placeholder = k < n ? String(beats[k] + 1) : "";
        input.removeAttribute("title");
      });
      return;
    }
    const { lo, hi } = this.sel;
    const names = this.names;
    this.target = { lo, hi };
    for (let k = 0; k < n; k++) {
      const texts = new Set();
      for (let i = lo; i <= hi; i++) texts.add((this.grid.chords.get(i) || [])[k] || "");
      const same = texts.size === 1;
      const value = same ? names.show([...texts][0]) : "";
      const input = this.slots[k];
      this.shown[k] = value;
      input.value = value;
      input.placeholder = same ? String(beats[k] + 1) : "…";
      if (same) input.removeAttribute("title");
      else input.title = tr("Several chords");
    }
    const active = this.slots.indexOf(document.activeElement);
    if (active >= 0) this.slots[active].select();
  }

  // What was typed in the fields (only: in that one) goes to their beats in
  // the bars selected: one chord on its beat, several spread over the rest of
  // the bar, nothing removes the chord of that beat.
  commitInput(only = null) {
    const t = this.target;
    if (!t) return;
    const n = this.slotCount;
    const names = this.names;
    const edits = [];
    for (let k = 0; k < n; k++) {
      if (only !== null && k !== only) continue;
      const text = this.slots[k].value.trim().replace(/\s+/g, " ");
      if (text === (this.shown[k] || "")) continue;
      this.shown[k] = text;
      edits.push([k, chordWords(names.store(text))]); // in the song's own key
    }
    if (!edits.length) return;
    this._setChords(t.lo, t.hi, (_, current) => {
      const slots = current ? [...current] : new Array(n).fill("");
      for (const [k, words] of edits) {
        if (words.length <= 1) slots[k] = words[0] || "";
        else spread(words, n - k).forEach((w, j) => (slots[k + j] = w));
      }
      return slots;
    });
    // The chords spread over the next beats show in their fields.
    if (edits.some(([, words]) => words.length > 1)) this.loadInput();
  }

  // ----- the notes (2.21) --------------------------------------------------------------

  // The field Note shows the note of the bars selected (those exactly), and
  // says which bars it is for.
  loadNote() {
    const sel = this.sel;
    const note = sel ? noteOf(this.grid.notes, sel.lo, sel.hi) : null;
    this.noteShown = note ? note.text : "";
    if (document.activeElement !== this.note || !sel) this.note.value = this.noteShown;
    const g = this.grid;
    let place = tr("Select bars in the Notes lane to write a note");
    if (sel) {
      const from = barNumber(g, sel.lo);
      const to = barNumber(g, sel.hi);
      place = from === to ? tr("Note on bar {n}", { n: from }) : tr("Note on bars {from} to {to}", { from, to });
    }
    this.note.placeholder = place;
    this.note.disabled = !sel;
  }

  // The cursor in the field Note (a computer: the tab Bars and chords opens),
  // at the end of its text.
  focusNote() {
    if (!this.sel) return;
    if (this.ctx.showTools) this.ctx.showTools();
    const field = this.note;
    field.disabled = false;
    // Not scrolled at once: a tap's mouse events, which come after it, would
    // land elsewhere and take the focus away (a smartphone scrolls it into
    // view with the keyboard).
    field.focus({ preventScroll: true });
    const n = field.value.length;
    try {
      field.setSelectionRange(n, n);
    } catch (_) {}
  }

  // What was typed in the field Note goes to the bars it is for.
  commitNote() {
    const sel = this.sel;
    if (!sel || !this.note) return;
    const text = this.note.value.replace(/\s+/g, " ").trim();
    if (text === this.noteShown) return;
    this.setNoteOf(sel.lo, sel.hi, text);
  }

  // Bars lo..hi given the note `text` (empty: theirs taken away); one step to
  // undo.
  setNoteOf(lo, hi, text) {
    if (!this.ctx.player.song || !this.grid.bars.length) return;
    const g = this.grid;
    const notes = setNote(g.notes, lo, hi, text);
    this.ctx.app.grid = { ...g, notes };
    const note = noteOf(notes, Math.min(lo, hi), Math.max(lo, hi));
    if (this.sel && this.sel.lo === Math.min(lo, hi) && this.sel.hi === Math.max(lo, hi)) this.noteShown = note ? note.text : "";
    const from = barNumber(g, Math.min(lo, hi));
    const to = barNumber(g, Math.max(lo, hi));
    const said = note
      ? from === to
        ? tr("Note on bar {n} written.", { n: from })
        : tr("Note on bars {from} to {to} written.", { from, to })
      : from === to
        ? tr("Note on bar {n} removed.", { n: from })
        : tr("Note on bars {from} to {to} removed.", { from, to });
    this._edited(said);
    if (document.activeElement !== this.note && this.sel) this.note.value = this.noteShown;
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

  // The chords of bars lo..hi: chordFor(k (from lo), the bar's slots or
  // null) gives the new slots (null: none).
  _setChords(lo, hi, chordFor) {
    const chords = new Map(this.grid.chords);
    for (let i = lo; i <= hi; i++) {
      const v = chordFor(i - lo, chords.get(i) || null);
      if (v && v.some(Boolean)) chords.set(i, v);
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
    this.ctx.app.grid = { ...this.grid, meter, chords: chordsInMeter(this.grid.chords, meter) };
    this._labelSlots();
    this.loadInput();
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
    this._labelSlots();
    this._edited(message);
    if (this.on && this.sel) this.select(this.sel);
    else this.loadInput();
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

  // The chords found in the song (app.analysis.chords, src/chords.js) on
  // the beats of every bar, spelled in the song's key, in place of the chords
  // it had (a bar without a clear chord is left empty). quiet: no message
  // here. Returns how many bars got a chord.
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
    this._labelSlots();
    this.loadInput();
    this._edited();
  }

  // The grid with an analysis imported (3.2, src/shared.js pasteShared()):
  // its chords and sections on the song's bars, or with its own bars when the
  // song had none; shown. built: kept as the tempo detection keeps one, by
  // its tempo and anchor (null: as it was). A change to save, one step.
  imported(grid, built) {
    const { app, player, timeline } = this.ctx;
    if (!player.song) return;
    this.commitInput();
    this.on = false;
    timeline.setEditing(false);
    app.grid = grid;
    if (built !== null) this.built = built;
    this.sel = null;
    app.gridVisible = true;
    timeline.setGridVisible(true);
    this._labelSlots();
    this.loadInput();
    this.loadNote();
    this._edited();
  }

  // What an import pasted, moved by its arrows (app/app.js shiftImport()):
  // these chords and sections in place of the grid's.
  shifted(chords, sections, message) {
    if (!this.ctx.player.song) return;
    this.commitInput();
    this.ctx.app.grid = { ...this.grid, chords, sections };
    this.loadInput();
    this._edited(message);
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
    this._setChords(lo, hi, () => null);
    this.loadInput();
  }

  // The chords of the bars selected, and the sections wholly in them (2.15:
  // a section selected is copied with its name).
  copy() {
    this.commitInput();
    if (!this.sel) return;
    const { lo, hi } = this.sel;
    this.clipKind = "bars";
    this.clip = [];
    for (let i = lo; i <= hi; i++) {
      const slots = this.grid.chords.get(i);
      this.clip.push(slots ? [...slots] : null);
    }
    // From the first bar copied.
    this.clipSections = (this.grid.sections || []).filter((s) => s.lo >= lo && s.hi <= hi).map((s) => ({ ...s, lo: s.lo - lo, hi: s.hi - lo }));
    const n = this.clip.length;
    this.say(this.clipSections.length ? trn(n, "Chords and sections of {n} bar copied.", "Chords and sections of {n} bars copied.") : trn(n, "Chords of {n} bar copied.", "Chords of {n} bars copied."));
  }

  // The chord of beat k of the bars selected, as its field shows it (in the
  // key of now), copied alone (2.20); also as text, for other apps.
  copyChord(k) {
    this.commitInput();
    if (!this.sel) return;
    const text = (this.slots[k].value || "").trim();
    if (!text) {
      this.say(tr("No chord on this beat to copy."));
      return;
    }
    this.clipChord = text;
    this.clipKind = "chord";
    try {
      if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
    } catch (_) {}
    this.say(tr("Chord copied: {chord}.", { chord: text }));
  }

  // The chord copied alone, on beat k of the bars selected, as if typed in
  // its field.
  pasteChord(k) {
    if (!this.sel || this.clipChord === null) return;
    const n = this.sel.hi - this.sel.lo + 1;
    const input = this.slots[k];
    input.value = this.clipChord;
    this.commitInput(k);
    this.loadInput();
    if (document.activeElement === input) input.select();
    const beat = slotBeats(this.grid.meter)[k] + 1;
    this.say(trn(n, "{chord} pasted on beat {beat} of {n} bar.", "{chord} pasted on beat {beat} of {n} bars.", { chord: this.clipChord, beat }));
  }

  // Into the bars selected, repeating the chords copied to fill them; one bar
  // selected: all the chords copied, from there. Copied in another meter,
  // they move to the beats of this one. Sections copied take the place of
  // those in the bars pasted into, repeated with the chords (each one whole),
  // numbered again in order (Verse 2 after Verse 1); one step to undo.
  paste() {
    this.commitInput();
    if (!this.sel || !this.clip.length) return;
    const n = this.clip.length;
    let { lo, hi } = this.sel;
    if (lo === hi) hi = Math.min(this.grid.bars.length - 1, lo + n - 1);
    const meter = this.grid.meter;
    const copied = this.clipSections || [];
    if (copied.length) {
      let sections = setSection(this.grid.sections, lo, hi, null);
      for (let base = lo; base <= hi; base += n) for (const s of copied) if (base + s.hi <= hi) sections = setSection(sections, base + s.lo, base + s.hi, s);
      this.ctx.app.grid = { ...this.grid, sections };
    }
    this._setChords(lo, hi, (k) => (this.clip[k % n] ? toSlots(this.clip[k % n], meter) : null));
    this.select({ anchor: lo, lo, hi }, { reveal: true });
    const m = hi - lo + 1;
    this.say(copied.length ? trn(m, "Chords and sections pasted into {n} bar.", "Chords and sections pasted into {n} bars.") : trn(m, "Chords pasted into {n} bar.", "Chords pasted into {n} bars."));
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
    if (mod && !e.altKey && !e.shiftKey && (e.key === "v" || e.key === "V") && this.sel && this.clipKind === "chord" && this.clipChord !== null) {
      e.preventDefault();
      this.pasteChord(this.slot);
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
      this.focusSlot(this.slot);
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
      // The chord of the beat being written starts with this key.
      e.preventDefault();
      const input = this.chord;
      this.keepCaret = true;
      input.focus();
      input.value = e.key;
      input.setSelectionRange(1, 1);
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
    for (const input of this.slots) input.disabled = !sel;
    this.note.disabled = !sel;
    $("chord-slots").classList.toggle("off", !sel);
    $("chord-copy").disabled = !sel;
    $("chord-paste").disabled = !sel || !this.clip.length;
    $("deselect-bars").hidden = !sel; // beside Sections (a computer, 2.15)

    // Under the grid's tools: changes not saved yet, or no grid.
    const status = $("edit-status");
    const text = this.dirty
      ? tr("Changes not saved yet: Save is at the top right.")
      : has
        ? ""
        : phone
          ? tr("No grid: set the first beat at the first beat of a bar.")
          : tr("No grid: put the playhead on the first beat of a bar and set the first beat.");
    setText(status, text);
    setAttr(status, "class", `edit-status ${this.dirty ? "dirty" : ""}`.trim());
  }
}
