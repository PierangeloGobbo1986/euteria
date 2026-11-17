// The ribbon (2.12): the tabs of the song's tools over its name (index.html
// #ribbon-tabs) and their panels (#ribbon), as the ribbon of a word
// processor. A tab opens its panel, a click again closes it: one at a time.
// A computer shows the panel as a band under the transport and keeps the tab
// open from one visit to the next (this browser); on the phone the panel comes
// up from the bottom of the screen and closes with its ✕, or its tab again.
// A panel hidden (Recording, with no input to record from) hides its tab.

const KEY = "euteria-ribbon";

export class Ribbon {
  constructor({ tabs, panels, remember = false, onchange = () => {} }) {
    this.tabs = [...tabs.querySelectorAll(".rtab")];
    this.panels = panels;
    this.remember = remember;
    this.onchange = onchange;
    this.current = ""; // the tab open ("" none)
    this.wanted = ""; // the tab to open as soon as its panel can be (the one kept)
    for (const t of this.tabs) t.addEventListener("click", () => this.toggle(t.dataset.tab));
    for (const b of panels.querySelectorAll(".rpanel-close")) b.addEventListener("click", () => this.close());
    if (remember) {
      try {
        this.wanted = localStorage.getItem(KEY) || "";
      } catch (_) {}
    }
    this.sync();
  }

  panel(name) {
    return name ? this.panels.querySelector(`.rpanel[data-tab="${name}"]`) : null;
  }

  usable(name) {
    const p = this.panel(name);
    return !!p && !p.hidden;
  }

  toggle(name) {
    this.open(this.current === name ? "" : name);
  }

  // Opens the panel of tab `name` ("" closes the one open). keep: the choice
  // is the user's, to keep (a computer).
  open(name, keep = true) {
    if (keep) {
      this.wanted = name;
      if (this.remember) {
        try {
          localStorage.setItem(KEY, name);
        } catch (_) {}
      }
    }
    if (name && !this.usable(name)) name = "";
    if (name === this.current) return;
    this.current = name;
    for (const p of this.panels.querySelectorAll(".rpanel")) p.classList.toggle("open", p.dataset.tab === name);
    for (const t of this.tabs) t.setAttribute("aria-expanded", String(t.dataset.tab === name));
    this.onchange(name);
  }

  close() {
    this.open("");
  }

  // The panel holding `target` (an element or a selector) opened, to use what
  // is in it; anything else, the phone's panel closed, as it may cover it.
  reveal(target, phone = false) {
    const el = typeof target === "string" ? document.querySelector(target) : target;
    const panel = el && el.closest ? el.closest(".rpanel") : null;
    if (panel && this.panels.contains(panel)) {
      if (this.current !== panel.dataset.tab) this.open(panel.dataset.tab, false);
    } else if (phone && this.current && el && !(el.closest && el.closest(".ribbon-tabs"))) this.open("", false);
  }

  // The tabs of the panels that can be used now; the one open closes if its
  // panel cannot, and the one kept opens once it can.
  sync() {
    for (const t of this.tabs) {
      const hide = !this.usable(t.dataset.tab);
      if (t.hidden !== hide) t.hidden = hide;
    }
    if (this.current && !this.usable(this.current)) this.open("", false);
    else if (!this.current && this.wanted && this.usable(this.wanted)) this.open(this.wanted, false);
  }
}
