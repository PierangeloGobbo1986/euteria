// The menu of the sections' names, opened by a tap or a click on the bars
// selected, in the lane of the sections (app/timeline.js): the sections of a
// song, the letters of a jazz form, Other… (a name typed) and, when the bars
// selected hold a section, Remove section. On a computer it opens under the
// click, on the phone as a panel at the bottom of the screen. A choice, a
// press outside it or Escape closes it.

import { h } from "./controls.js";
import { SECTION_KINDS, SECTION_LETTERS, sectionName, sectionColor } from "../src/sections.js";
import { tr } from "../src/i18n.js";

const GHOST_CLICK_MS = 450; // after a tap, the click a phone makes too
const BARS_IN_VIEW = 56; // pixels under the lane of the sections kept over the panel (the chords, the bar numbers)

export class SectionMenu {
  // onPick(value): {kind}, {other: true} (a name to type) or null (remove).
  constructor({ phone, onPick }) {
    this.phone = phone;
    this.onPick = onPick;
    this.el = null;
    this._outside = (e) => {
      if (this.el && !this.el.contains(e.target)) this.close();
    };
    this._key = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        this.close();
      }
    };
  }

  get open() {
    return !!this.el;
  }

  // x, y: where in the window (a computer: the menu's top left, kept in
  // view); current: the section the bars selected are ({kind} or {label}),
  // to mark; removable: they hold a section.
  show({ x = 0, y = 0, current = null, removable = false, pointerType = "" } = {}) {
    this.close();
    // Opened by a finger, the panel comes up under it: the click the phone
    // makes after the tap must not choose a name.
    const opened = performance.now();
    const settle = pointerType === "mouse" ? 0 : GHOST_CLICK_MS;
    const pick = (value) => {
      if (performance.now() - opened < settle) return;
      this.close();
      this.onPick(value);
    };
    const item = (kind) => {
      const s = { kind };
      const b = h("button", { type: "button", class: "section-item", role: "menuitem" }, h("span", { class: "section-swatch", style: `background: ${sectionColor(s)}` }), h("span", { text: sectionName(s) }));
      if (current && !current.label && current.kind === kind) b.classList.add("current");
      b.addEventListener("click", () => pick({ kind }));
      return b;
    };
    const letter = (kind) => {
      const b = h("button", { type: "button", class: "section-letter", role: "menuitem", style: `border-color: ${sectionColor({ kind })}` }, kind);
      if (current && !current.label && current.kind === kind) b.classList.add("current");
      b.addEventListener("click", () => pick({ kind }));
      return b;
    };
    const other = h("button", { type: "button", class: "section-item section-other", role: "menuitem" }, tr("Other…"));
    if (current && current.label) other.classList.add("current");
    other.addEventListener("click", () => pick({ other: true }));
    const actions = h("div", { class: "section-actions" }, other);
    if (removable) {
      const remove = h("button", { type: "button", class: "section-item section-remove ghost danger", role: "menuitem" }, tr("Remove section"));
      remove.addEventListener("click", () => pick(null));
      actions.append(remove);
    }
    const parts = [
      h("p", { class: "section-menu-title", text: tr("Section") }),
      h("div", { class: "section-kinds" }, ...SECTION_KINDS.map(item)),
      h("div", { class: "section-letters" }, ...SECTION_LETTERS.map(letter)),
      actions,
    ];
    const el = h("div", { class: `section-menu${this.phone ? " sheet" : ""}`, role: "menu", "aria-label": tr("Section") }, ...parts);
    document.body.append(el);
    this.el = el;
    if (this.phone) {
      // The bars selected stay in view over the panel: the page goes up if
      // the panel would cover them (y: under the lane of the sections).
      const top = el.getBoundingClientRect().top;
      const need = y + BARS_IN_VIEW - top;
      if (need > 0) window.scrollBy(0, need);
    } else {
      const r = el.getBoundingClientRect();
      const left = Math.max(8, Math.min(x - 16, window.innerWidth - r.width - 8));
      const top = y + r.height + 8 <= window.innerHeight ? y + 4 : Math.max(8, y - r.height - 30);
      el.style.left = `${Math.round(left)}px`;
      el.style.top = `${Math.round(top)}px`;
    }
    // Closed by a press outside it (from the next event on) or Escape.
    setTimeout(() => {
      if (this.el !== el) return;
      document.addEventListener("pointerdown", this._outside, true);
    }, 0);
    document.addEventListener("keydown", this._key, true);
    if (pointerType !== "touch") {
      const first = el.querySelector(".current") || el.querySelector("button");
      if (first) first.focus({ preventScroll: true });
    }
  }

  close() {
    if (!this.el) return;
    this.el.remove();
    this.el = null;
    document.removeEventListener("pointerdown", this._outside, true);
    document.removeEventListener("keydown", this._key, true);
  }
}
