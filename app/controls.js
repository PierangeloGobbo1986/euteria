// Small building blocks of the app's interface: number fields with − and +
// buttons (hold a button to repeat; tap the number to type it), the key
// selector, and formatting helpers.

import { tr } from "../src/i18n.js";

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

// m:ss, or with `decimals` (true: 1) tenths or hundredths of a second.
export function fmtTime(s, decimals = 0) {
  const d = decimals === true ? 1 : +decimals || 0;
  if (!isFinite(s) || s < 0) s = 0;
  if (d) s = Math.round(s * 10 ** d) / 10 ** d;
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return d ? `${m}:${sec.toFixed(d).padStart(3 + d, "0")}` : `${m}:${String(Math.floor(sec)).padStart(2, "0")}`;
}

export function fmtSize(bytes) {
  if (!isFinite(bytes) || bytes < 0) bytes = 0;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(bytes >= 1e10 ? 0 : 1)} GB`;
  return `${(bytes / 1e6).toFixed(bytes < 1e7 ? 1 : 0)} MB`;
}

// Icons drawn as vectors in the color of the text, the same on every system
// (characters such as ❚❚ look different from one font to the other).
const ICONS = {
  play: '<path d="M8 4.8v14.4L19.6 12z"/>',
  pause: '<rect x="5.6" y="4.8" width="4.3" height="14.4" rx="1"/><rect x="14.1" y="4.8" width="4.3" height="14.4" rx="1"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
  grip: '<circle cx="9" cy="6" r="1.7"/><circle cx="15" cy="6" r="1.7"/><circle cx="9" cy="12" r="1.7"/><circle cx="15" cy="12" r="1.7"/><circle cx="9" cy="18" r="1.7"/><circle cx="15" cy="18" r="1.7"/>',
  // An eye open, and closed (its lid and lashes).
  eye: '<path d="M2 12C5.5 6.4 18.5 6.4 22 12C18.5 17.6 5.5 17.6 2 12Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="12" r="3.2"/>',
  eyeClosed: '<path d="M2 10.5C5.5 16 18.5 16 22 10.5M5.6 13.9 4 16.4M12 15.2V18M18.4 13.9 20 16.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
};

export function icon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", `icon icon-${name}`);
  svg.innerHTML = ICONS[name];
  return svg;
}

// Shows icon `name` in `el`, unless it shows it already.
export function setIcon(el, name) {
  if (el.dataset.icon === name) return;
  el.dataset.icon = name;
  el.replaceChildren(icon(name));
}

// A number with its sign: "+2", "−3", "0" (the key, the Sync of a take).
export const fmtSigned = (v) => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : "0");

// The extension of a file name, in lower case ("" if none).
export const extensionOf = (name) => ((/\.([A-Za-z0-9]{1,8})$/.exec(name || "") || [])[1] || "").toLowerCase();

// A title made safe as a file name.
export function safeName(text) {
  const name = String(text || "").replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/\s+/g, " ").replace(/^[ .]+|[ .]+$/g, "").slice(0, 120);
  return name || "EUTERIA";
}

// "1:23.4", "1:23", "83.4" (seconds), and "1.23.4" or "1,23,4" for keypads
// without a colon; a comma counts as a decimal point.
export function parseTime(text) {
  const s = String(text).trim().replace(/,/g, ".").replace(/\s+/g, "");
  if (!s) return null;
  let m = /^(\d+):(\d{1,2}(?:\.\d*)?)$/.exec(s);
  if (m) return +m[1] * 60 + parseFloat(m[2]);
  m = /^(\d+)\.(\d{1,2})\.(\d*)$/.exec(s);
  if (m) return +m[1] * 60 + +m[2] + (m[3] ? parseFloat(`0.${m[3]}`) : 0);
  if (/^\d+(?:\.\d*)?$|^\.\d+$/.test(s)) return parseFloat(s);
  return null;
}

function parseNumber(text) {
  const s = String(text).trim().replace(/,/g, ".").replace(/[^\d.+\-−]/g, "").replace("−", "-");
  if (!s) return null;
  const v = parseFloat(s);
  return isFinite(v) ? v : null;
}

// A tap runs fn once; holding the button runs it again and again, faster and
// faster. Holding starts only after a moment, so that a scroll that begins on
// the button changes nothing.
function holdRepeat(button, fn) {
  let timer = null;
  let repeated = false;
  const stop = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  button.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || button.disabled) return;
    repeated = false;
    stop();
    let delay = 450;
    const tick = () => {
      if (button.disabled) return stop();
      repeated = true;
      fn();
      delay = Math.max(50, delay * 0.75);
      timer = setTimeout(tick, delay);
    };
    timer = setTimeout(tick, delay);
  });
  button.addEventListener("pointerup", () => {
    stop();
    setTimeout(() => (repeated = false), 0);
  });
  for (const type of ["pointerleave", "pointercancel"]) button.addEventListener(type, stop);
  button.addEventListener("click", () => {
    if (repeated) {
      repeated = false;
      return;
    }
    fn();
  });
  button.addEventListener("contextmenu", (e) => e.preventDefault());
}

function stepButton(text, label) {
  return h("button", { type: "button", class: "step", "aria-label": label, text });
}

// A number with − and + buttons around it. The number is a text field: a tap
// selects it and brings up the keypad; the value is applied when the field is
// left or Return is pressed. The buttons move to the next multiple of `step`.
// `label` names it for screen readers (relabel() names it again, in another
// language).
export function numberField({
  label,
  min = 0,
  max = 100,
  step = 1,
  decimals = 0,
  unit = "",
  buttons = true,
  inputMode = "numeric",
  format = null,
  parse = parseNumber,
  onChange = () => {},
  className = "",
}) {
  const el = h("div", { class: `num ${className}`.trim() });
  const input = h("input", {
    type: "text",
    inputmode: inputMode,
    autocomplete: "off",
    autocorrect: "off",
    autocapitalize: "off",
    spellcheck: "false",
    enterkeyhint: "done",
    "aria-label": label,
  });
  const show = format || ((v) => v.toFixed(decimals));
  const factor = Math.pow(10, decimals);
  let value = min;
  let lo = min;
  let hi = max;
  const fit = (v) => Math.round(Math.min(hi, Math.max(lo, v)) * factor) / factor;
  const paint = () => {
    const text = show(value);
    if (input.value !== text) input.value = text;
  };
  const apply = (v) => {
    v = fit(v);
    if (v !== value) {
      value = v;
      onChange(v);
    }
    paint();
  };
  const stepBy = (dir) => {
    const q = value / step;
    const n = dir > 0 ? Math.floor(q + 1e-6) + 1 : Math.ceil(q - 1e-6) - 1;
    apply(n * step);
  };
  input.addEventListener("focus", () => {
    setTimeout(() => {
      try {
        input.setSelectionRange(0, input.value.length);
      } catch (_) {}
    }, 0);
  });
  input.addEventListener("blur", () => {
    const v = parse(input.value);
    if (v === null || !isFinite(v)) paint();
    else apply(v);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") input.blur();
    else if (e.key === "Escape") {
      paint();
      input.blur();
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      stepBy(e.key === "ArrowUp" ? 1 : -1);
    }
  });
  const parts = [input];
  if (unit) parts.push(h("span", { class: "unit", "aria-hidden": "true", text: unit }));
  let dec = null;
  let inc = null;
  if (buttons) {
    dec = stepButton("−", tr("{label}: less", { label }));
    inc = stepButton("+", tr("{label}: more", { label }));
    holdRepeat(dec, () => stepBy(-1));
    holdRepeat(inc, () => stepBy(1));
    el.append(dec, h("div", { class: "value" }, ...parts), inc);
  } else el.append(h("div", { class: "value" }, ...parts));
  paint();
  return {
    el,
    input,
    get value() {
      return value;
    },
    // Shows a value set elsewhere (left alone while the field is being typed in).
    set(v) {
      value = fit(v);
      if (document.activeElement !== input) paint();
    },
    setRange(a, b) {
      lo = a;
      hi = b;
    },
    disable(off) {
      input.disabled = off;
      if (dec) dec.disabled = off;
      if (inc) inc.disabled = off;
      el.classList.toggle("disabled", off);
    },
    relabel(name) {
      input.setAttribute("aria-label", name);
      if (dec) dec.setAttribute("aria-label", tr("{label}: less", { label: name }));
      if (inc) inc.setAttribute("aria-label", tr("{label}: more", { label: name }));
    },
  };
}

// The key, in semitones: a list (a wheel on phones) between − and +.
export function keyField({ label, min = -12, max = 12, onChange = () => {} }) {
  const select = h("select", { "aria-label": tr("{label} in semitones", { label }) });
  for (let v = max; v >= min; v--) select.append(new Option(fmtSigned(v), String(v)));
  select.value = "0";
  select.addEventListener("change", () => onChange(+select.value));
  const dec = stepButton("−", tr("{label}: down a semitone", { label }));
  const inc = stepButton("+", tr("{label}: up a semitone", { label }));
  const move = (d) => {
    const v = Math.min(max, Math.max(min, +select.value + d));
    if (v !== +select.value) {
      select.value = String(v);
      onChange(v);
    }
  };
  holdRepeat(dec, () => move(-1));
  holdRepeat(inc, () => move(1));
  const el = h("div", { class: "num key" }, dec, h("div", { class: "value" }, select, h("span", { class: "unit", "aria-hidden": "true", text: "st" })), inc);
  return {
    el,
    select,
    set(v) {
      if (document.activeElement !== select) select.value = String(v);
    },
    disable(off) {
      select.disabled = off;
      dec.disabled = off;
      inc.disabled = off;
      el.classList.toggle("disabled", off);
    },
    relabel(name) {
      select.setAttribute("aria-label", tr("{label} in semitones", { label: name }));
      dec.setAttribute("aria-label", tr("{label}: down a semitone", { label: name }));
      inc.setAttribute("aria-label", tr("{label}: up a semitone", { label: name }));
    },
  };
}

// A button that asks for a second tap before doing something that cannot be
// undone. confirmText: the text it shows meanwhile, or a function giving it
// (in the language in use). The button's own content comes back as it was
// (the same nodes: the page's translation keeps finding them).
export function confirmTap(button, confirmText, action, ms = 4000) {
  let timer = null;
  let normal = null; // {nodes, label}: the button's content, while it asks
  const reset = () => {
    clearTimeout(timer);
    timer = null;
    button.classList.remove("confirm");
    if (!normal) return;
    button.replaceChildren(...normal.nodes);
    if (normal.label) button.setAttribute("aria-label", normal.label);
    else button.removeAttribute("aria-label");
    normal = null;
  };
  button.addEventListener("click", () => {
    if (timer) {
      reset();
      action();
      return;
    }
    const text = typeof confirmText === "function" ? confirmText() : confirmText;
    normal = { nodes: [...button.childNodes], label: button.getAttribute("aria-label") };
    button.classList.add("confirm");
    button.textContent = text;
    button.setAttribute("aria-label", text);
    timer = setTimeout(reset, ms);
  });
  return reset;
}
