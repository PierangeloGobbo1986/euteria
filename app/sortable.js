// Putting the cards of a list in another order: a card is dragged by its
// grip (mouse, finger or pen) and the others make room for it; on the grip,
// the arrow keys move it up or down by one. The page scrolls by itself when
// the card is dragged near the top or the bottom of the screen.
//
// sortable(box, {grip, onMove, top}): box holds the cards (its children);
// grip is the selector of the grip inside a card; onMove(from, to, byKey) is
// called once the card is dropped at another place (indexes among the
// cards); top() is the height covered at the top of the screen (a bar that
// stays in view), where the page scrolls up.

const EDGE = 56; // pixels from the edge of the screen where the page scrolls
const SPEED = 14; // pixels per frame, at the very edge

export function sortable(box, { grip, onMove, top = () => 0 }) {
  let drag = null;

  const cardOf = (el) => [...box.children].find((c) => c.contains(el)) || null;

  box.addEventListener("pointerdown", (e) => {
    const handle = e.target.closest(grip);
    if (!handle || !box.contains(handle) || drag || (e.pointerType === "mouse" && e.button !== 0)) return;
    const card = cardOf(handle);
    if (!card) return;
    e.preventDefault();
    const cards = [...box.children];
    const rects = cards.map((c) => {
      const r = c.getBoundingClientRect();
      return { top: r.top + window.scrollY, height: r.height };
    });
    const from = cards.indexOf(card);
    const next = rects[from + 1] || rects[from - 1];
    const gap = next ? Math.abs(next.top - rects[from].top) - (next.top > rects[from].top ? rects[from].height : next.height) : 0;
    drag = { id: e.pointerId, handle, card, cards, rects, from, to: from, gap: Math.max(0, gap), y0: e.clientY + window.scrollY, y: e.clientY, frame: 0 };
    try {
      handle.setPointerCapture(e.pointerId);
    } catch (_) {}
    card.classList.add("dragging");
    box.classList.add("sorting");
    // On the window: the events still arrive if the list is drawn again.
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", end, true);
    window.addEventListener("pointercancel", end, true);
    drag.frame = requestAnimationFrame(scroll);
  });

  function move(e) {
    if (!drag || e.pointerId !== drag.id) return;
    e.preventDefault();
    place(e.clientY);
  }

  function end(e) {
    if (!drag || e.pointerId !== drag.id) return;
    finish(e.type === "pointerup" && drag.card.isConnected);
  }

  box.addEventListener("keydown", (e) => {
    if (drag || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    const handle = e.target.closest(grip);
    if (!handle || !box.contains(handle)) return;
    const cards = [...box.children];
    const from = cards.indexOf(cardOf(handle));
    const to = from + (e.key === "ArrowUp" ? -1 : 1);
    e.preventDefault();
    if (from >= 0 && to >= 0 && to < cards.length) onMove(from, to, true);
  });

  // The dragged card follows the pointer; the cards between its place and
  // the new one move by its height.
  function place(clientY) {
    const d = drag;
    d.y = clientY;
    const dy = clientY + window.scrollY - d.y0;
    const r = d.rects[d.from];
    const middle = r.top + dy + r.height / 2;
    let to = d.from;
    for (let i = 0; i < d.cards.length; i++) {
      const m = d.rects[i].top + d.rects[i].height / 2;
      if (i < d.from && middle < m) to = Math.min(to, i);
      if (i > d.from && middle > m) to = Math.max(to, i);
    }
    d.to = to;
    const shift = r.height + d.gap;
    d.cards.forEach((c, i) => {
      if (i === d.from) c.style.transform = `translateY(${dy}px)`;
      else {
        const by = d.from < to && i > d.from && i <= to ? -shift : d.from > to && i >= to && i < d.from ? shift : 0;
        c.style.transform = by ? `translateY(${by}px)` : "";
      }
    });
  }

  // Near the top or the bottom of the screen the page scrolls, and the card
  // goes on following the pointer.
  function scroll() {
    const d = drag;
    if (!d) return;
    const high = top() + EDGE;
    const low = window.innerHeight - EDGE;
    let by = 0;
    if (d.y < high) by = -SPEED * Math.min(1, (high - d.y) / EDGE);
    else if (d.y > low) by = SPEED * Math.min(1, (d.y - low) / EDGE);
    if (by) {
      const before = window.scrollY;
      window.scrollBy(0, by);
      if (window.scrollY !== before) place(d.y);
    }
    d.frame = requestAnimationFrame(scroll);
  }

  function finish(drop) {
    const d = drag;
    drag = null;
    window.removeEventListener("pointermove", move, true);
    window.removeEventListener("pointerup", end, true);
    window.removeEventListener("pointercancel", end, true);
    cancelAnimationFrame(d.frame);
    for (const c of d.cards) c.style.transform = "";
    d.card.classList.remove("dragging");
    box.classList.remove("sorting");
    try {
      d.handle.releasePointerCapture(d.id);
    } catch (_) {}
    if (drop && d.to !== d.from) onMove(d.from, d.to, false);
  }
}
