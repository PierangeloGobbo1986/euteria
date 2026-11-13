// Recording takes, the page's side (src/recorder.js does the work): Record,
// beside Loop (pressed again, it stops the take and the song, as Stop does);
// the Recording input card (↻ looks for the inputs again, the menu chooses
// one, the meter beside it shows its level in dB); the take drawn in the
// timeline while it is recorded; the takes at the bottom of the tracks (✕
// deletes one, Sync moves it in time); and what Save, Share project and the
// separation need to write the takes in the song's file. Takes recorded,
// deleted or moved make the song "not saved", as edits to the bars and
// chords do.

import { Recorder } from "../src/recorder.js";
import { openZip } from "../src/zip.js";
import { decodeTake } from "../src/project.js";
import { h } from "./controls.js";
import { countEvent } from "./counter.js";
import { tr } from "../src/i18n.js";

const $ = (id) => document.getElementById(id);
const TOLD_KEY = "euteria.syncTold";

// An input's name in the menu: its own, or the one EUTERIA gives it.
const inputName = (d) => (d.id === "" ? (d.name ? tr("Default ({name})", { name: d.name }) : tr("Default input")) : d.n ? tr("Input {n}", { n: d.n }) : d.label);

// The level meter, as in recording programs: from FLOOR dB at its left end to
// 0 dB, the loudest a take can be; green, yellow from YELLOW dB, red (too
// loud, the take may distort) from RED dB. The bar goes up at once and comes
// down by FALL dB a second; a line holds the highest peak for HOLD_MS.
const FLOOR = -48;
const YELLOW = -12;
const RED = -3;
const SCALE_STEP = 6; // dB between the marks of the scale
const SCALE_NUMBERS = [-48, -36, -24, -18, -12, -6, 0]; // the marks with their number
const FALL = 24;
const HOLD_MS = 1500;
const meterAt = (db) => (Math.max(FLOOR, Math.min(0, db)) - FLOOR) / -FLOOR; // 0 to 1 along the bar

export class RecordingFlow {
  // ctx: {app, player, phone, notice(text, kind, ms), refreshPage(),
  // takesChanged() (the takes listed changed: the tracks are drawn again),
  // liveRow: {color, height} (the take being recorded, in the timeline)}.
  constructor(ctx) {
    this.ctx = ctx;
    this.recorder = new Recorder(ctx.player, { phone: ctx.phone });
    this.supported = Recorder.supported();
    this.dirty = false; // takes recorded, deleted or moved since the song was saved
    this.dropped = new Map(); // member -> take: takes of the song's file deleted since
    this.shownDevices = "";
    this.meter = { db: FLOOR, hold: FLOOR, holdAt: 0, at: 0 }; // what the meter shows
    const r = this.recorder;
    r.onchange = () => ctx.refreshPage();
    r.onmessage = (text, kind) => ctx.notice(text, kind, kind === "error" ? 0 : 6000);
    r.onlevel = () => this.paintLevel();
    r.ontakes = (tracks, reason, raisedDb) => this.added(tracks, reason, raisedDb);
    r.onlive = () => this.paintLive();
    this.liveQueued = false;
    this.buildMeter();
    this.wire();
  }

  // The meter's colors and its scale, from the levels above.
  buildMeter() {
    const pct = (db) => `${(meterAt(db) * 100).toFixed(2)}%`;
    const meter = $("input-meter");
    meter.style.setProperty("--meter-yellow", pct(YELLOW));
    meter.style.setProperty("--meter-red", pct(RED));
    const scale = $("input-scale");
    for (let db = FLOOR; db <= 0; db += SCALE_STEP) {
      const text = !SCALE_NUMBERS.includes(db) ? "" : db ? `−${-db}` : "0";
      scale.append(h("span", { text, style: `left: ${pct(db)}` }));
    }
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

  // Record starts a take; pressed again it stops everything, as Stop does:
  // the take, the song, back to the start (of the loop, if it is on).
  toggle() {
    const r = this.recorder;
    if (r.state === "recording") this.ctx.player.stop();
    else if (r.state === "idle") r.start();
  }

  // The take being recorded, drawn as it comes in: on a computer a red row
  // at the bottom of the timeline, a card beside it saying so; on the phone a
  // lane under the waveform. Gone once the take is kept (or not).
  paintLive() {
    if (!this.recorder.live) {
      this.drawLive(); // at once: the take's own row replaces it in the same frame
      return;
    }
    if (this.liveQueued) return;
    this.liveQueued = true;
    requestAnimationFrame(() => {
      this.liveQueued = false;
      this.drawLive();
    });
  }

  drawLive() {
    const { app, phone, liveRow } = this.ctx;
    const live = this.recorder.liveView();
    app.timeline.setLive(live && { ...live, ...liveRow });
    if (phone) return;
    const card = $("live-take");
    if (live && !card) {
      $("tl-rows").append(h("div", { id: "live-take", class: "track take live-take" }, h("span", { class: "live-dot", "aria-hidden": "true" }), h("span", { text: tr("Recording…") })));
    } else if (!live && card) card.remove();
  }

  // ----- takes ------------------------------------------------------------------------

  // raisedDb: how much the takes were raised to sit with the song.
  added(tracks, reason, raisedDb = 0) {
    const { notice, takesChanged } = this.ctx;
    if (!tracks.length) {
      notice(reason === "full" ? tr("There is no more room for takes in this song: delete one with its ✕ first.") : tr("The take was shorter than a second: nothing was kept."), "error", 6000);
      return;
    }
    this.dirty = true;
    takesChanged();
    for (let i = 0; i < tracks.length; i++) countEvent("take-recorded");
    const first = tracks[0].title;
    const last = tracks[tracks.length - 1].title;
    const db = Math.round(raisedDb);
    const raised = raisedDb >= 0.5;
    let text =
      tracks.length === 1
        ? raised
          ? tr("{first} added, raised {db} dB to sit with the song.", { first, db })
          : tr("{first} added.", { first })
        : raised
          ? tr("{first} to {last} added, raised {db} dB to sit with the song.", { first, last, db })
          : tr("{first} to {last} added.", { first, last });
    if (reason === "full") text += ` ${tr("There is no more room for takes in this song.")}`;
    let told = false;
    try {
      told = localStorage.getItem(TOLD_KEY) === "1";
      localStorage.setItem(TOLD_KEY, "1");
    } catch (_) {}
    if (!told) text += ` ${tr("If a take is not in time with the song, move it with its Sync: EUTERIA then applies the same Sync to the next takes from that input.")}`;
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
    notice(tr("{take} deleted.", { take: t.title }), "ok", 3000);
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
    if (bad) {
      throw new Error(
        bad.error
          ? tr("{take} could not be encoded ({error}): delete it and record it again.", { take: bad.title, error: bad.error })
          : tr("{take} could not be encoded: delete it and record it again.", { take: bad.title })
      );
    }
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

  // The level of the input, the latest peak (0 to 1) turned into dB.
  paintLevel() {
    const r = this.recorder;
    const m = this.meter;
    const open = !!r.input;
    const now = performance.now();
    const last = m.at;
    m.at = now;
    const v = open ? Math.min(1, r.level) : 0;
    const db = v > 0 ? Math.max(FLOOR, 20 * Math.log10(v)) : FLOOR;
    if (!open) {
      m.db = m.hold = FLOOR;
    } else {
      m.db = Math.max(db, m.db - (FALL * Math.max(0, now - last)) / 1000);
      if (db >= m.hold) {
        m.hold = db;
        m.holdAt = now;
      } else {
        const from = Math.max(last, m.holdAt + HOLD_MS); // the line comes down once its time is over
        if (now > from) m.hold = Math.max(m.db, m.hold - (FALL * (now - from)) / 1000);
      }
    }
    $("input-unlit").style.transform = `scaleX(${(1 - meterAt(m.db)).toFixed(3)})`;
    const peak = $("input-peak");
    peak.style.transform = `translateX(${(meterAt(m.hold) * 100).toFixed(2)}%)`;
    peak.classList.toggle("on", open && m.hold > FLOOR);
    $("input-meter").classList.toggle("open", open);
  }

  // The texts written here, again in the language in use.
  relabel() {
    this.shownDevices = ""; // the menu of the inputs, named again
    const card = $("live-take");
    if (card) {
      card.remove();
      this.drawLive();
    }
    this.refresh();
  }

  refresh() {
    const { player, app } = this.ctx;
    const r = this.recorder;
    const song = player.song;
    const record = $("record");
    record.hidden = !this.supported;
    $("input-card").hidden = !this.supported || !song;
    if (!this.supported) return;
    const state = r.state;
    record.disabled = !song || !!player.busy || state === "opening" || state === "finishing" || app.saving || app.sharing;
    record.classList.toggle("recording", state === "recording");
    record.classList.toggle("waiting", state === "opening" || state === "finishing");
    record.setAttribute("aria-pressed", String(state === "recording"));
    const label = state === "recording" ? tr("Stop recording") : tr("Record a take");
    if (record.getAttribute("aria-label") !== label) record.setAttribute("aria-label", label);
    const recordTip = state === "recording" ? tr("Stop recording (R)") : tr("Record a take over the song (R)");
    if (record.title !== recordTip) record.title = recordTip;
    // The inputs.
    const select = $("input-select");
    const key = JSON.stringify(r.devices);
    if (key !== this.shownDevices) {
      this.shownDevices = key;
      select.textContent = "";
      for (const d of r.devices) select.append(h("option", { value: d.id, text: inputName(d) }));
    }
    if (select.value !== r.selected) select.value = r.selected;
    select.disabled = state !== "idle";
    $("input-refresh").disabled = state !== "idle";
    const tip = r.named ? tr("Look for the inputs again") : tr("Look for the inputs: the browser asks to use the microphone the first time");
    if ($("input-refresh").title !== tip) $("input-refresh").title = tip;
    this.paintLevel();
  }
}
