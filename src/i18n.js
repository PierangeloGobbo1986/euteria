// The languages of EUTERIA: English, as the texts are written in the code,
// and Italian (src/i18n-it.js, keyed by the English texts).
//
// tr("text", vars) gives a text in the language in use; {name} in it stands
// for vars.name. trn(n, one, many, vars) chooses the text for one or for any
// other number ({n} is the number). The language is the one chosen in the
// menu (kept in this browser), or else the device's: Italian on a device set
// to Italian, English otherwise.
//
// The texts written in index.html are translated where they are (text nodes,
// and the title, aria-label and placeholder of the elements), from the
// English kept as the page was loaded; an element with data-i18n-html is
// translated whole, markup included (a sentence with words in bold). An
// element with translate="no" stays as it is. Texts the code writes go
// through tr(), and are written again when the language changes.

import { IT } from "./i18n-it.js";

export const LANGUAGES = { en: "English", it: "Italiano" };
const KEY = "euteria.lang";
const DICTS = { it: IT };
const ATTRS = ["title", "aria-label", "placeholder"];

let current = initialLanguage();
const listeners = new Set();
let statics = null; // the texts of index.html: [{node | el, attr, html, en}]

function initialLanguage() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && LANGUAGES[saved]) return saved;
  } catch (_) {}
  const nav = typeof navigator !== "undefined" ? navigator : null;
  const first = nav ? (nav.languages && nav.languages[0]) || nav.language || "" : "";
  return /^it\b/i.test(first) ? "it" : "en";
}

export const lang = () => current;

export function tr(text, vars) {
  const dict = DICTS[current];
  let s = dict && Object.prototype.hasOwnProperty.call(dict, text) ? dict[text] : text;
  if (vars) s = s.replace(/\{(\w+)\}/g, (all, k) => (Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : all));
  return s;
}

export const trn = (n, one, many, vars) => tr(n === 1 ? one : many, { n, ...vars });

// Switches the language (kept in this browser), translates the page and
// tells whoever listens, to write their texts again.
export function setLang(code) {
  if (!LANGUAGES[code] || code === current) return;
  current = code;
  try {
    localStorage.setItem(KEY, code);
  } catch (_) {}
  translatePage();
  for (const fn of listeners) fn(code);
}

export const onLangChange = (fn) => listeners.add(fn);

const squash = (s) => s.replace(/\s+/g, " ").trim();

// The texts of index.html in the language in use; the first call keeps their
// English, so it must come before the code changes any of them.
export function translatePage() {
  document.documentElement.lang = current;
  if (!statics) statics = collect();
  for (const s of statics) {
    if (s.html) s.el.innerHTML = tr(s.en);
    else if (s.attr) s.el.setAttribute(s.attr, tr(s.en));
    else {
      const raw = s.node.nodeValue;
      const lead = raw.match(/^\s*/)[0];
      const tail = raw.match(/\s*$/)[0];
      s.node.nodeValue = lead + tr(s.en) + tail;
    }
  }
}

function collect() {
  const list = [];
  const skip = (el) => !el || el.closest("[translate=no], script, style, noscript");
  for (const el of document.querySelectorAll("[data-i18n-html]")) list.push({ el, html: true, en: squash(el.innerHTML) });
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const en = squash(n.nodeValue);
    if (!en || skip(n.parentElement) || n.parentElement.closest("[data-i18n-html]")) continue;
    list.push({ node: n, en });
  }
  for (const el of document.body.querySelectorAll("*")) {
    if (skip(el)) continue;
    for (const attr of ATTRS) {
      const v = el.getAttribute(attr);
      if (v && v.trim()) list.push({ el, attr, en: squash(v) });
    }
  }
  return list;
}
