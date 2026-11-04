// Recording takes, the page's side (src/recorder.js does the work): Record,
// beside Loop; Input, in the timeline's toolbar (↻ looks for the inputs
// again, the menu chooses one, the bar beside it shows its level); the takes
// at the bottom of the tracks (✕ deletes one, Sync moves it in time); and
// what Save, Share project and the separation need to write the takes in the
// song's file. Takes recorded, deleted or moved make the song "not saved",
// as edits to the bars and chords do.

import { Recorder } from "../src/recorder.js";
import { openZip } from "../src/zip.js";
import { decodeTake } from "../src/project.js";
import { h } from "./controls.js";

const $ = (id) => document.getElementById(id);
const TOLD_KEY = "euteria.syncTold";

export class RecordingFlow {
  // ctx: {app, player, phone, notice(text, kind, ms), refreshPage(),
  // takesChanged() (the takes listed changed: the tracks are drawn again)}.
  constructor(ctx) {
    this.ctx = ctx;
    this.recorder = new Recorder(ctx.player, { phone: ctx.phone });
    this.supported = Recorder.supported();
    this.dirty = false; // takes recorded, deleted or moved since the song was saved
    this.dropped = new Map(); // member -> take: takes of the song's file deleted since
    this.shownDevices = "";
    const r = this.recorder;
    r.onchange = () => ctx.refreshPage();
    r.onmessage = (text, kind) => ctx.notice(text, kind, kind === "error" ? 0 : 6000);
    r.onlevel = () => this.paintLevel();
    r.ontakes = (tracks, reason) => this.added(tracks, reason);
    this.wire();
  }

  get busy() {
    return this.recorder.busy;
  }

  get recording() {
    return this.recorder.state === "recording";
  }

  wire() {
    const r = this.recorder;
    $("record").addEventListener("click", () => {
      this.ctx.player.unlock();
      this.toggle();
    });
    $("input-refresh").addEventListener("click", () => {
      this.ctx.player.unlock();
      r.refresh({ ask: true });
    });
    $("input-select").addEventListener("change", (e) => {
      this.ctx.player.unlock();
      r.choose(e.target.value);
    });
    // A page sent to the background stops recording what it can no longer hear.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") r.stop();
    });
    if (this.supported) r.refresh();
  }

  toggle() {
    const r = this.recorder;
    if (r.state === "recording") r.stop();
    else if (r.state === "idle") r.start();
  }

  // ----- takes ------------------------------------------------------------------------

  added(tracks, reason) {
    const { notice, takesChanged } = this.ctx;
    if (!tracks.length) {
      notice(reason === "full" ? "There is no more room for takes in this song: delete one with its ✕ first." : "The take was shorter than a second: nothing was kept.", "error", 6000);
      return;
    }
    this.dirty = true;
    takesChanged();
    const first = tracks[0].title;
    let text = tracks.length === 1 ? `${first} added.` : `${first} to ${tracks[tracks.length - 1].title} added.`;
    if (reason === "full") text += " There is no more room for takes in this song.";
    let told = false;
    try {
      told = localStorage.getItem(TOLD_KEY) === "1";
      localStorage.setItem(TOLD_KEY, "1");
    } catch (_) {}
    if (!told) text += " If a take is not in time with the song, move it with its Sync: EUTERIA then applies the same Sync to the next takes from that input.";
    notice(text, reason === "full" ? "error" : "ok", told ? 5000 : 12000);
  }

  deleteTake(key) {
    const { player, takesChanged, notice } = this.ctx;
    if (this.busy) return;
    const t = player.removeTake(key);
    if (!t) return;
    if (t.take.saved) this.dropped.set(t.take.member, t.take);
    this.dirty = true;
    takesChanged();
    notice(`${t.title} deleted.`, "ok", 3000);
  }

  setSync(key, ms) {
    const { player, refreshPage } = this.ctx;
    const t = player.track(key);
    if (!t || !t.take) return;
    player.setTakeSync(key, ms);
    this.recorder.rememberSync(t.take.input, t.take.syncMs);
    this.dirty = true;
    refreshPage();
  }

  // ----- the song's file ----------------------------------------------------------------

  // A song opened or closed: nothing pending.
  reset() {
    this.dirty = false;
    this.dropped.clear();
  }

  get takes() {
    return this.ctx.player.takes.map((t) => t.take);
  }

  // The file must be written anew: takes recorded or deleted since it was.
  get rewrite() {
    return this.dropped.size > 0 || this.takes.some((t) => !t.saved);
  }

  get dropMembers() {
    return [...this.dropped.keys()];
  }

  // The takes to add to the file ([{name, data, crc}]), or null while one
  // is still being encoded.
  membersToAdd() {
    const out = [];
    for (const take of this.takes) {
      if (take.saved) continue;
      if (!take.mp3) return null;
      out.push({ name: take.member, data: take.mp3, crc: take.crc });
    }
    return out;
  }

  // Waits for the takes to be encoded; fails if one could not be.
  async ready() {
    await this.recorder.encoded();
    const bad = this.takes.find((t) => !t.saved && !t.mp3);
    if (bad) throw new Error(`${bad.title} could not be encoded${bad.error ? ` (${bad.error})` : ""}: delete it and record it again.`);
  }

  // The song was saved: in its own file (inPlace), or as a copy.
  saved(inPlace) {
    this.dirty = false;
    if (!inPlace) return;
    for (const take of this.takes) {
      take.saved = true;
      take.mp3 = null; // in the file now
    }
    this.dropped.clear();
  }

  // "Don't save": the takes as the song's file has them.
  async revert() {
    const { player, app } = this.ctx;
    const song = player.song;
    if (!song || (!this.dirty && !this.rewrite)) return;
    await this.recorder.settle();
    for (const t of [...player.takes]) if (!t.take.saved) player.removeTake(t.key);
    const audio = (song.manifest && song.manifest.audio) || {};
    const entries = Array.isArray(audio.takes) ? audio.takes : [];
    const listed = entries.map((t) => String(t.id));
    for (const t of player.takes) {
      const entry = entries.find((x) => String(x.id) === t.take.id);
      const ms = entry ? Math.round(+entry.sync_ms || 0) : t.take.syncMs;
      if (ms !== t.take.syncMs) player.setTakeSync(t.key, ms);
    }
    if (this.dropped.size && app.current) {
      try {
        const zip = await openZip(app.current.file);
        const practice = (song.manifest && song.manifest.practice) || {};
        for (const take of this.dropped.values()) {
          const track = await decodeTake(zip, take, player.context);
          const enabled = (practice.track_enabled || {})[track.key];
          const gain = (practice.track_volumes || {})[track.key];
          player.addTake({ ...track, on: enabled === undefined ? true : !!enabled, gain: isFinite(gain) ? gain : 1 });
        }
      } catch (_) {}
      // In the order of the file.
      const order = (key) => listed.indexOf(key.slice(5));
      player.tracks = [...player.tracks.filter((t) => !t.take), ...player.tracks.filter((t) => t.take).sort((a, b) => order(a.key) - order(b.key))];
    }
    this.reset();
    this.ctx.takesChanged();
  }

  // The takes for a new project made from this song (the separation):
  // {takes, members}, their MP3 files read from the song's file if they are
  // in it.
  async forNewProject() {
    await this.ready();
    const { app } = this.ctx;
    const takes = this.takes;
    const members = [];
    let zip = null;
    for (const take of takes) {
      if (take.mp3) members.push({ name: take.member, data: take.mp3 });
      else {
        zip = zip || (await openZip(app.current.file));
        members.push({ name: take.member, data: await zip.bytes(take.member) });
      }
    }
    return { takes, members };
  }

  // ----- the page ----------------------------------------------------------------------

  paintLevel() {
    const r = this.recorder;
    const bar = $("input-level");
    if (!bar) return;
    const open = !!r.input;
    const v = open ? Math.min(1, r.level) : 0;
    // A scale in decibels from -48 dB: quiet playing still shows.
    const db = v > 0 ? 20 * Math.log10(v) : -96;
    const fill = Math.max(0, Math.min(1, (db + 48) / 48));
    bar.style.transform = `scaleY(${fill.toFixed(3)})`;
    bar.classList.toggle("hot", v >= 0.98);
    $("input-meter").classList.toggle("open", open);
  }

  refresh() {
    const { player, app } = this.ctx;
    const r = this.recorder;
    const song = player.song;
    const record = $("record");
    record.hidden = !this.supported;
    $("input-group").hidden = !this.supported || !song;
    if (!this.supported) return;
    const state = r.state;
    record.disabled = !song || !!player.busy || state === "opening" || state === "finishing" || app.saving || app.sharing;
    record.classList.toggle("recording", state === "recording");
    record.classList.toggle("waiting", state === "opening" || state === "finishing");
    record.setAttribute("aria-pressed", String(state === "recording"));
    const label = state === "recording" ? "Stop recording" : "Record a take";
    if (record.getAttribute("aria-label") !== label) {
      record.setAttribute("aria-label", label);
      record.title = state === "recording" ? "Stop recording (R)" : "Record a take over the song (R)";
    }
    // The inputs.
    const select = $("input-select");
    const key = JSON.stringify(r.devices);
    if (key !== this.shownDevices) {
      this.shownDevices = key;
      select.textContent = "";
      for (const d of r.devices) select.append(h("option", { value: d.id, text: d.label }));
    }
    if (select.value !== r.selected) select.value = r.selected;
    select.disabled = state !== "idle";
    $("input-refresh").disabled = state !== "idle";
    const tip = r.named ? "Look for the inputs again" : "Look for the inputs: the browser asks to use the microphone the first time";
    if ($("input-refresh").title !== tip) $("input-refresh").title = tip;
    this.paintLevel();
  }
}
