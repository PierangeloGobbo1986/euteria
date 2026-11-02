// The timeline of the player, drawn as EUTERIA (Python) draws it: bar numbers
// and time, the chords, the waveform of each track (one row on the phone, one
// per track on a computer) with the bar grid over it, the loop and the
// playhead. Only the part of the song in view is drawn.
//
// A tap moves the playhead; dragging pans (with momentum on touch screens);
// pinching, ctrl+wheel (a trackpad pinch) or the zoom buttons zoom from the
// whole song (100%) to about 100 pixels per second. The loop's edges are
// dragged, snapping to the bars and beats (Alt or Option turns snapping off);
// with a mouse the whole loop can be dragged too. The overview under the
// timeline shows the whole song and the part in view, which can be dragged.
// While the song plays the view follows the playhead, except for a few
// seconds after the user moved it.

import { barNumber } from "../src/grid.js";
import { PEAK_BUCKET } from "../src/peaks.js";

const C = {
  ruler: "#141a1b",
  row: "#131719",
  overview: "#101416",
  border: "#30383d",
  text: "#edf0ec",
  dim: "#697471",
  time: "#7f8c8e",
  chord: "#e8cf9c",
  beat: "#465b59",
  bar: "rgba(215, 220, 218, 0.5)",
  sep: "rgba(215, 220, 218, 0.22)",
  loop: "#6bb7aa",
  loopGlow: "rgba(107, 183, 170, 0.28)",
  loopFill: "rgba(107, 183, 170, 0.12)",
  playhead: "#e7bd6d",
  window: "rgba(237, 240, 236, 0.09)",
  windowEdge: "rgba(237, 240, 236, 0.6)",
};
const FONT = '-apple-system, "SF Pro Text", "Helvetica Neue", Arial, sans-serif';
const TAP_SLOP = 6; // pixels a press may move and still be a tap
const SNAP_PX = 10; // loop edges snap to a bar or beat closer than this
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
  // onSeek(t), onLoop({on, start, end}) when a loop drag ends, onView() when
  // the user has panned or zoomed, onChange() after every redraw of the view.
  // varsOn: the element that gets --tl-head and --tl-row (the height of the
  // ruler and chords, and of a row), so that a column beside can line up.
  constructor(host, { compact = false, varsOn = null, onSeek, onLoop, onView, onChange } = {}) {
    this.host = host;
    this.varsOn = varsOn || host;
    this.compact = compact;
    this.onSeek = onSeek || (() => {});
    this.onLoop = onLoop || (() => {});
    this.onView = onView || (() => {});
    this.onChange = onChange || (() => {});
    this.dims = compact ? { ruler: 32, chords: 22, row: 64, overview: 24 } : { ruler: 46, chords: 24, row: 56, overview: 26 };
    this.duration = 0;
    this.sampleRate = 48000;
    this.rows = [];
    this.grid = { beats: [], bars: [], offset: 0, chords: new Map(), bpm: null, meter: "4/4" };
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
    this.main.setAttribute("aria-label", "Timeline: tap to move the playhead, drag to scroll, pinch to zoom, drag the edges of the loop to change it");
    this.base = document.createElement("canvas");
    this.base.className = "tl-base";
    this.top = document.createElement("canvas");
    this.top.className = "tl-top";
    this.main.append(this.base, this.top);
    this.over = document.createElement("canvas");
    this.over.className = "tl-overview";
    this.over.setAttribute("aria-label", "Overview of the whole song: drag to move the view");
    host.append(this.main, this.over);
    this._bind();
    this.resizer = new ResizeObserver(() => this.layout());
    this.resizer.observe(this.main);
  }

  // ----- content ------------------------------------------------------------

  // rows: [{key, color, peaks: {min, max} | null, on}], grid as readGrid().
  setSong({ duration, sampleRate, rows, grid, gridVisible = true, view = null }) {
    this.duration = duration;
    this.sampleRate = sampleRate || 48000;
    this.rows = rows;
    this.grid = grid;
    this.gridVisible = gridVisible;
    this.barSec = spacing(grid.bars, grid.bpm ? (60 / grid.bpm) * 4 : 2);
    this.beatSec = spacing(grid.beats, grid.bpm ? 60 / grid.bpm : 0.5);
    this.zoom = 1;
    this.start = 0;
    this.loop = { on: false, start: 0, end: 0 };
    this.dragLoop = null;
    this.position = 0;
    this.overviewCache = null;
    this.layout();
    if (view) this.setView(view);
  }

  setRowOn(key, on) {
    const row = this.rows.find((r) => r.key === key);
    if (row && row.on !== on) {
      row.on = on;
      this.requestDraw();
    }
  }

  setGridVisible(on) {
    this.gridVisible = !!on;
    this.layout();
  }

  get hasGrid() {
    return this.grid.bars.length > 0;
  }

  get showChords() {
    return this.gridVisible && this.hasGrid;
  }

  // ----- geometry -------------------------------------------------------------

  get headHeight() {
    return this.dims.ruler + (this.showChords ? this.dims.chords : 0);
  }

  get height() {
    return this.headHeight + this.rows.length * this.dims.row;
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
    if (!this.gesture) this.dragLoop = null;
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
    this.main.style.height = `${h}px`;
    for (const c of [this.base, this.top]) {
      c.width = Math.max(1, Math.round(w * this.dpr));
      c.height = Math.max(1, Math.round(h * this.dpr));
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
    }
    const o = this.dims.overview;
    this.over.width = Math.max(1, Math.round(w * this.dpr));
    this.over.height = Math.round(o * this.dpr);
    this.over.style.width = `${w}px`;
    this.over.style.height = `${o}px`;
    this.overviewCache = null;
    this.varsOn.style.setProperty("--tl-head", `${this.headHeight}px`);
    this.varsOn.style.setProperty("--tl-row", `${this.dims.row}px`);
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

  draw() {
    this.queued = false;
    const ctx = this.base.getContext("2d");
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    if (!(this.duration > 0) || !this.width) {
      this.drawTop();
      return;
    }
    this._ruler(ctx);
    if (this.showChords) this._chords(ctx);
    const y0 = this.headHeight;
    this.rows.forEach((row, i) => this._row(ctx, row, y0 + i * this.dims.row));
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

  _ruler(ctx) {
    const R = this.dims.ruler;
    const W = this.width;
    ctx.fillStyle = C.ruler;
    ctx.fillRect(0, 0, W, R);
    const g = this.grid;
    const barPx = this.barSec * this.pps;
    const beatPx = this.beatSec * this.pps;
    const tickTop = this.compact ? 18 : 19;
    const tickBottom = this.compact ? R : 31;
    if (this.hasGrid) {
      if (beatPx >= 5) {
        ctx.fillStyle = C.dim;
        const [a, b] = this._range(g.beats, 0);
        for (let i = a; i < b; i++) ctx.fillRect(Math.round(this.x(g.beats[i])), tickTop + 5, 1, tickBottom - tickTop - 5);
      }
      const lines = this._every(barPx, 6);
      const labels = this._every(barPx, this.compact ? 24 : 28);
      ctx.font = `700 11px ${FONT}`;
      ctx.textBaseline = "alphabetic";
      const [a, b] = this._range(g.bars, this.barSec);
      for (let i = a; i < b; i++) {
        const n = barNumber(g, i);
        const x = Math.round(this.x(g.bars[i]));
        if (mod(n - 1, lines) === 0) {
          ctx.fillStyle = C.text;
          ctx.fillRect(x, tickTop, 1, tickBottom - tickTop);
        }
        if (mod(n - 1, labels) === 0) {
          ctx.fillStyle = C.text;
          ctx.fillText(String(n), x + 3, 13);
        }
      }
    }
    if (!this.compact || !this.hasGrid) {
      const step = TIME_STEPS.find((s) => s * this.pps >= 64) || 600;
      const y = this.hasGrid ? R - 5 : 14;
      ctx.font = `500 11px ${FONT}`;
      ctx.fillStyle = C.time;
      for (let s = Math.floor(this.start / step) * step; s <= this.start + this.span; s += step) {
        const x = Math.round(this.x(s));
        if (x < -40) continue;
        ctx.fillRect(x, this.hasGrid ? R - 16 : 18, 1, this.hasGrid ? 4 : R - 18);
        ctx.fillText(fmtClock(s), x + 3, y);
      }
    }
    ctx.fillStyle = C.border;
    ctx.fillRect(0, R - 1, W, 1);
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

  _chords(ctx) {
    const y0 = this.dims.ruler;
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
    for (let i = Math.max(0, a - 1); i < b; i++) {
      const x0 = this.x(g.bars[i]);
      if (x0 > W) break;
      if (mod(barNumber(g, i) - 1, lines) === 0 && x0 >= 0) {
        ctx.fillStyle = C.sep;
        ctx.fillRect(Math.round(x0), y0, 1, h);
      }
      const text = g.chords.get(i);
      if (!text) continue;
      // A chord may use the following bars that have none.
      let j = i + 1;
      while (j < g.bars.length && !g.chords.has(j) && this.x(g.bars[j]) - x0 < 160) j++;
      const x1 = j < g.bars.length ? this.x(g.bars[j]) : this.x(this.duration);
      if (x1 < 0) continue;
      const room = x1 - x0 - 6;
      if (room < 9) continue;
      ctx.fillStyle = C.chord;
      const fitted = this._fit(ctx, text, room);
      if (fitted) {
        ctx.fillText(fitted, Math.round(x0) + 4, y0 + h / 2 + 1);
      } else {
        // Too narrow even for one letter and "…": the beginning, cut at the next chord.
        ctx.save();
        ctx.beginPath();
        ctx.rect(x0 + 1, y0, room + 4, h);
        ctx.clip();
        ctx.fillText(text, Math.round(x0) + 4, y0 + h / 2 + 1);
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

  // The envelope of `peaks` between song times t0 and t1 drawn as one
  // vertical line per device pixel, in the area x 0..width, y y0..y0+h.
  _wave(ctx, peaks, color, alpha, y0, h, t0, pxPerSec, width) {
    if (!peaks) return;
    const { min, max } = peaks;
    const n = min.length;
    const dpr = this.dpr;
    const bucketSec = PEAK_BUCKET / this.sampleRate;
    const mid = (y0 + h / 2) * dpr;
    const amp = ((h / 2) * 0.88 * dpr) / 128;
    const cols = Math.ceil(width * dpr);
    const perCol = 1 / (pxPerSec * dpr * bucketSec); // buckets per device pixel
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    const base = t0 / bucketSec;
    for (let px = 0; px < cols; px++) {
      const a = Math.floor(base + px * perCol);
      const b = Math.max(a + 1, Math.floor(base + (px + 1) * perCol));
      if (b > 0 && a < n) {
        let lo = 127;
        let hi = -128;
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

  _row(ctx, row, y0) {
    const h = this.dims.row;
    ctx.fillStyle = C.row;
    ctx.fillRect(0, y0, this.width, h);
    this._wave(ctx, row.peaks, row.color, row.on || this.compact ? 0.9 : 0.3, y0, h, this.start, this.pps, this.width);
    this._gridLines(ctx, y0, h);
    ctx.fillStyle = C.border;
    ctx.fillRect(0, y0 + h - 1, this.width, 1);
  }

  // Loop and playhead, on their own canvas over the rest.
  drawTop() {
    const ctx = this.top.getContext("2d");
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    if (!(this.duration > 0)) return;
    const H = this.height;
    const R = this.dims.ruler;
    const lp = this.dragLoop || this.loop;
    if (lp.on && lp.end > lp.start) {
      const x1 = this.x(lp.start);
      const x2 = this.x(lp.end);
      if (x2 >= -10 && x1 <= this.width + 10) {
        ctx.fillStyle = C.loopFill;
        ctx.fillRect(x1, R, x2 - x1, H - R);
        ctx.fillStyle = C.loop;
        ctx.fillRect(x1, R - 4, x2 - x1, 3);
        const tab = this.compact ? { w: 12, h: 20 } : { w: 9, h: 16 };
        for (const x of [x1, x2]) {
          ctx.fillStyle = C.loopGlow;
          ctx.fillRect(x - 2.5, R, 5, H - R);
          ctx.fillStyle = C.loop;
          ctx.fillRect(x - 1, R, 2, H - R);
          this._roundRect(ctx, x - tab.w / 2, R - tab.h / 2 - 2, tab.w, tab.h, 3);
        }
      }
    }
    const x = this.x(this.position);
    if (x >= -4 && x <= this.width + 4) {
      ctx.fillStyle = "rgba(231, 189, 109, 0.18)";
      ctx.fillRect(x - 2.5, 0, 5, H);
      ctx.fillStyle = C.playhead;
      ctx.fillRect(x - 1, 0, 2, H);
      ctx.beginPath();
      ctx.moveTo(x - 6, 0);
      ctx.lineTo(x + 6, 0);
      ctx.lineTo(x, 8);
      ctx.closePath();
      ctx.fill();
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
      const row = this.rows.find((r) => r.peaks);
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
    ctx.fillRect(Math.round(this.position * k) - 0.5, 0, 1.5, H);
  }

  // ----- interaction -----------------------------------------------------------------

  _bind() {
    const el = this.main;
    el.addEventListener("pointerdown", (e) => this._down(e));
    el.addEventListener("pointermove", (e) => this._move(e));
    el.addEventListener("pointerup", (e) => this._up(e, false));
    el.addEventListener("pointercancel", (e) => this._up(e, true));
    el.addEventListener("wheel", (e) => this._wheel(e), { passive: false });
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
    const ov = this.over;
    const toView = (e) => {
      const r = ov.getBoundingClientRect();
      const t = ((e.clientX - r.left) / Math.max(1, r.width)) * this.duration;
      this.start = this.clampStart(t - this.span / 2);
      this.lastUser = now();
      this.requestDraw();
    };
    ov.addEventListener("pointerdown", (e) => {
      if (!(this.duration > 0)) return;
      this._stopInertia();
      try {
        ov.setPointerCapture(e.pointerId);
      } catch (_) {}
      this.overDrag = e.pointerId;
      toView(e);
    });
    ov.addEventListener("pointermove", (e) => this.overDrag === e.pointerId && toView(e));
    const end = (e) => {
      if (this.overDrag !== e.pointerId) return;
      this.overDrag = null;
      this.onView();
    };
    ov.addEventListener("pointerup", end);
    ov.addEventListener("pointercancel", end);
  }

  _point(e) {
    const r = this.main.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  // What a press at (x, y) grabs: a loop edge, the loop itself, or nothing.
  _hit(x, y, type) {
    const lp = this.loop;
    if (!lp.on || !(lp.end > lp.start)) return null;
    const reach = type === "mouse" ? 6 : 16;
    const d1 = Math.abs(x - this.x(lp.start));
    const d2 = Math.abs(x - this.x(lp.end));
    if (Math.min(d1, d2) <= reach && y >= this.dims.ruler - 14) return d1 <= d2 ? "start" : "end";
    if (x > this.x(lp.start) && x < this.x(lp.end) && y >= this.dims.ruler) return "body";
    return null;
  }

  // The nearest bar (or beat, when beats are far enough apart) within SNAP_PX.
  _snap(t) {
    const g = this.grid;
    if (!this.hasGrid) return t;
    const near = (list) => {
      const i = lowerBound(list, t);
      let best = null;
      for (const j of [i - 1, i]) {
        if (j < 0 || j >= list.length) continue;
        const d = Math.abs(list[j] - t) * this.pps;
        if (d <= SNAP_PX && (!best || d < best.d)) best = { t: list[j], d };
      }
      return best;
    };
    const bar = near(g.bars);
    if (bar) return bar.t;
    if (this.beatSec * this.pps >= 12) {
      const beat = near(g.beats);
      if (beat) return beat.t;
    }
    return t;
  }

  _down(e) {
    if (!(this.duration > 0)) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const p = this._point(e);
    this.pointers.set(e.pointerId, { x: p.x, y: p.y });
    try {
      this.main.setPointerCapture(e.pointerId);
    } catch (_) {}
    this._stopInertia();
    if (this.pointers.size >= 2) {
      // A second finger: pinch (Safari reports it with gesture events instead).
      this.dragLoop = null;
      const [a, b] = [...this.pointers.values()];
      this.gesture = { kind: "pinch", dist0: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), zoom0: this.zoom, anchor: this.t((a.x + b.x) / 2) };
      this.drawTop();
      return;
    }
    const zone = this._hit(p.x, p.y, e.pointerType);
    if (zone === "start" || zone === "end") this.gesture = { kind: zone, id: e.pointerId };
    else if (zone === "body" && e.pointerType === "mouse") this.gesture = { kind: "body", id: e.pointerId, x0: p.x, loop0: { ...this.loop }, moved: false };
    else this.gesture = { kind: "press", id: e.pointerId, x0: p.x, y0: p.y, start0: this.start, samples: [{ x: p.x, t: e.timeStamp }] };
    if (e.pointerType === "mouse" && this.gesture.kind !== "press") this.main.style.cursor = zone === "body" ? "grabbing" : "ew-resize";
  }

  _move(e) {
    const p = this._point(e);
    const pt = this.pointers.get(e.pointerId);
    if (!pt) {
      if (e.pointerType === "mouse") {
        const zone = this._hit(p.x, p.y, "mouse");
        this.main.style.cursor = zone === "start" || zone === "end" ? "ew-resize" : zone === "body" ? "grab" : "";
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
    if (g.kind === "start" || g.kind === "end") {
      let t = clamp(this.t(p.x), 0, this.duration);
      if (!e.altKey) t = this._snap(t);
      let { start, end } = this.loop;
      if (g.kind === "start") start = clamp(t, 0, end - MIN_LOOP);
      else end = clamp(t, start + MIN_LOOP, this.duration);
      this.dragLoop = { on: true, start, end };
      this.drawTop();
      this.drawOverview();
      return;
    }
    if (g.kind === "body") {
      const dx = p.x - g.x0;
      if (!g.moved && Math.abs(dx) < TAP_SLOP) return;
      g.moved = true;
      const w = g.loop0.end - g.loop0.start;
      let s = clamp(g.loop0.start + dx / this.pps, 0, Math.max(0, this.duration - w));
      if (!e.altKey) {
        const snapped = this._snap(s);
        if (snapped + w <= this.duration) s = snapped;
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
    if (e.pointerType === "mouse") this.main.style.cursor = "";
    const commitLoop = () => {
      if (!this.dragLoop) return;
      const lp = this.dragLoop;
      this.dragLoop = null;
      this.loop = { ...lp };
      this.onLoop(lp);
    };
    if (g.kind === "start" || g.kind === "end") commitLoop();
    else if (g.kind === "body") {
      if (g.moved) commitLoop();
      else if (!cancelled && pt) this.onSeek(clamp(this.t(pt.x), 0, this.duration));
    } else if (g.kind === "press") {
      if (!cancelled && pt) this.onSeek(clamp(this.t(pt.x), 0, this.duration));
    } else if (g.kind === "pan") {
      if (!cancelled) this._inertia(g.samples, e.pointerType);
      this.onView();
    }
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
}
