// Undo and redo, for the song open: from the moment it opened, the steps of
// what changed in it (the bars, the chords and the sections, the takes
// recorded, deleted or moved, the tracks switched on or off, their volume and
// order, the tempo, the key, the loop, the metronome, the name). Not what is
// only looked at: the zoom, the scroll, the playhead, playing.
//
// The song is seen as a state (capture(), made by app/app.js: the grid, the
// tracks, the settings…); a step is the state before it, and the names of
// what it changed (changes()). What changes is noted (note()); the step is
// made once the action is over: at the end of the event that made it, and
// not before a press of the pointer is let go (a slider, a drag in the
// timeline: one step from where it started to where it ended). Changes to
// the same continuous value (the tempo, a volume, a Sync…) close together,
// as with − and + pressed again and again, make one step. What changes by
// itself (the speed training raising the tempo) is taken in without a step
// (absorb()).
//
// Undo puts back what the last step changed, as it was before it
// (restore(), which may take a moment: a take comes back from where its
// audio was kept), and only that: what changed by itself since stays. Redo
// puts it back as the step left it. What follows on the page is then taken
// in, as when a song opens (settle()). Undo and redo pressed again while one
// is under way wait their turn.

const MERGE_MS = 900; // changes to the same value closer than this: one step
const LIMIT = 200; // steps kept

export class History {
  // capture(): the state now (null: no song). changes(a, b): what differs
  // from state a to state b, by name ([] when nothing does). restore(state,
  // fields): puts back those parts of `state` (may return a promise).
  // continuous(name): a value whose changes close together make one step.
  // onchange(): what can be undone or redone changed. onkeep(states): the
  // states kept changed (what only they need can go).
  constructor({ capture, changes, restore, continuous = () => false, onchange = () => {}, onkeep = () => {} }) {
    this.capture = capture;
    this.changes = changes;
    this.restoreState = restore;
    this.continuous = continuous;
    this.onchange = onchange;
    this.onkeep = onkeep;
    this.undos = []; // [{state (before the step), fields, at, open}]
    this.redos = []; // [{state (after the step), fields}], the next one last
    this.base = null; // the state after the last step: the song as it is
    this.timer = null; // a step to make
    this.held = 0; // pointers pressed
    this.quiet = 0; // inside absorb()
    this.busy = false; // undoing or redoing
    this.settling = false; // taking in what follows an opening, an undo or a redo
    this.settleId = 0;
    this.settled = Promise.resolve();
    this.chain = Promise.resolve(); // undo and redo, one after the other
    this.wire();
  }

  get canUndo() {
    return this.undos.length > 0;
  }

  get canRedo() {
    return this.redos.length > 0;
  }

  // A press of the pointer anywhere: the changes wait for it to be let go.
  wire() {
    const down = () => this.held++;
    const up = () => {
      if (!this.held) return;
      this.held = 0;
      this.note();
    };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointerup", up, true);
    document.addEventListener("pointercancel", up, true);
    window.addEventListener("blur", up);
  }

  // A song opened, or none: no steps; what the opening sets (the page, the
  // metronome as every song opens with it) is taken in first.
  reset() {
    this.undos = [];
    this.redos = [];
    this.base = null;
    clearTimeout(this.timer);
    this.timer = null;
    this.settle();
  }

  // What follows an opening, an undo or a redo (the page drawn again in the
  // next frames) is the song as it is, not a step. Resolves when taken in.
  settle() {
    const id = ++this.settleId;
    this.settling = true;
    this.onchange();
    this.settled = new Promise((resolve) => {
      afterFrames(() => {
        if (id === this.settleId) {
          this.base = this.capture();
          this.settling = false;
          this.onkeep(this.states());
          this.onchange();
        }
        resolve();
      });
    });
    return this.settled;
  }

  // Something may have changed: a step, once the action is over (the page
  // hears of it from commit(), if there is one).
  note() {
    if (this.busy || this.settling || this.quiet) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.held) this.commit();
    }, 0);
  }

  // What fn changes is taken in, not a step.
  absorb(fn) {
    this.flush();
    this.quiet++;
    try {
      fn();
    } finally {
      this.quiet--;
      if (!this.settling && !this.busy && this.base) this.base = this.capture();
    }
  }

  // The step to make, now.
  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    this.commit();
  }

  commit() {
    if (this.busy || this.settling || this.quiet) return;
    const now = this.capture();
    if (!now) return;
    if (!this.base) {
      this.base = now;
      return;
    }
    const fields = this.changes(this.base, now);
    if (!fields.length) return;
    const t = performance.now();
    const last = this.undos[this.undos.length - 1];
    const same =
      last && last.open && !this.redos.length && t - last.at < MERGE_MS && fields.length === last.fields.length && fields.every((f) => last.fields.includes(f) && this.continuous(f));
    if (same) {
      // The same value again: the step it began goes on, unless it is back
      // where it started.
      last.at = t;
      if (!this.changes(last.state, now).length) this.undos.pop();
    } else {
      if (last) last.open = false;
      this.undos.push({ state: this.base, fields, at: t, open: true });
      if (this.undos.length > LIMIT) this.undos.shift();
    }
    this.redos = [];
    this.base = now;
    this.onkeep(this.states());
    this.onchange();
  }

  // Undo: what the last step changed, as it was before it. Resolves with
  // {fields, state (put back), left (the state before the undo)}, or null.
  undo() {
    return this._queue(() => this._step(true));
  }

  redo() {
    return this._queue(() => this._step(false));
  }

  _queue(fn) {
    const run = this.chain.then(fn);
    this.chain = run.catch(() => {});
    return run;
  }

  async _step(undo) {
    await this.settled;
    this.flush(); // a change not yet a step becomes one (and there is nothing to redo)
    const from = undo ? this.undos : this.redos;
    const to = undo ? this.redos : this.undos;
    if (this.settling || !this.base || !from.length) return null;
    const step = from.pop();
    const left = this.base;
    step.open = false;
    to.push(undo ? { state: left, fields: step.fields } : { state: left, fields: step.fields, at: 0, open: false });
    this.busy = true;
    this.onchange();
    try {
      await this.restoreState(step.state, step.fields);
    } finally {
      this.busy = false;
      await this.settle();
    }
    return { fields: step.fields, state: step.state, left };
  }

  // Every state kept: the steps', and the song as it is.
  states() {
    const out = [...this.undos.map((u) => u.state), ...this.redos.map((r) => r.state)];
    if (this.base) out.push(this.base);
    return out;
  }

  // Steps forgotten, one by one, until enough() says it is enough: the
  // redos first (the farthest first: a new step would end them anyway), then
  // the oldest undos.
  forget(enough) {
    let gone = false;
    while (!enough() && (this.undos.length || this.redos.length)) {
      if (this.redos.length) this.redos.shift();
      else this.undos.shift();
      gone = true;
      this.onkeep(this.states());
    }
    if (gone) this.onchange();
  }
}

// Calls fn once the page has been drawn again (two frames), or after a
// moment if it is not drawn (a page in the background).
function afterFrames(fn) {
  let called = false;
  const once = () => {
    if (called) return;
    called = true;
    fn();
  };
  requestAnimationFrame(() => requestAnimationFrame(once));
  setTimeout(once, 250);
}
