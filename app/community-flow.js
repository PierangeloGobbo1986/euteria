// The community in the page (3.3, src/community.js): one window
// (#community-dialog) with four views. Search (Search the community, Song
// analysis, Import): what was typed (the song's title and performer to
// start with) searched at once; each analysis found says its song, its
// recording, how long it is (beside the song open), as on the record or an
// arrangement, who published it and when, its likes and what its author says
// of it; Import pastes it onto the song's bars (app/app.js pasteAnalysis(),
// as Analysis from a file: the arrows then); ♥, Report and, for one's own,
// Delete. Publish (Publish to the community, File export and sharing):
// the song, as on the record or an arrangement of one's own, a description,
// the public name; the same song published again by its author updates it.
// Sign in: with Google, or with an email and a password (a new account gets a
// link to check its address, needed to publish). Account: sign out, delete
// the account with what it published.
//
// The SDK of Firebase loads when the window first opens; nothing of the
// community is asked for before (no search when a song opens).

import { firebaseDriver, wordsOf, keyOf, rank, entryOf, reasonOf, NAME_MAX } from "../src/community.js";
import { analysisFrom } from "../src/shared.js";
import { h, fmtTime } from "./controls.js";
import { tr, trn, lang } from "../src/i18n.js";

const $ = (id) => document.getElementById(id);
const LIKED = "euteria.community.liked"; // the analyses liked in this browser
const VIEWS = ["search", "publish", "signin", "account"];

function loadLiked() {
  try {
    const v = JSON.parse(localStorage.getItem(LIKED) || "[]");
    return new Set(Array.isArray(v) ? v.slice(-2000) : []);
  } catch (_) {
    return new Set();
  }
}

export class CommunityFlow {
  // ctx: {app, player, notice(text, kind, ms), paste(shared, title) (puts an
  // analysis into the song open; returns whether it went in), analysisData()
  // (the analysis of the song open), details() ({title, performer, album,
  // year} of the song open), askYes({title, hint, ok}), countEvent(name),
  // refreshPage()}.
  constructor(ctx) {
    this.ctx = ctx;
    this.makeDriver = () => firebaseDriver(); // the tests give their own
    this.driver = null;
    this.user = undefined; // not known yet; null: signed out
    this.unwatch = null;
    this.view = "search";
    this.after = null; // the view to go back to once signed in
    this.results = [];
    this.existing = []; // the user's own analyses (those of the song open: sameAsMine())
    this.nameFor = null; // the user the public name in the form is for
    this.liked = loadLiked();
    this.working = false;
  }

  get dialog() {
    return $("community-dialog");
  }

  get signedIn() {
    return !!this.user;
  }

  wire() {
    $("community-close").addEventListener("click", () => this.close());
    this.dialog.addEventListener("cancel", () => this.close());
    $("community-signin").addEventListener("click", () => this.needSignIn(this.view === "signin" ? "search" : this.view));
    $("community-account").addEventListener("click", () => this.show("account"));
    $("community-form").addEventListener("submit", (e) => {
      e.preventDefault();
      this.search();
    });
    $("publish-go").addEventListener("click", () => this.publish());
    $("publish-cancel").addEventListener("click", () => this.close());
    for (const r of document.querySelectorAll("input[name=publish-kind]")) r.addEventListener("change", () => this.renderPublish());
    $("signin-google").addEventListener("click", () => this.google());
    $("signin-form").addEventListener("submit", (e) => {
      e.preventDefault();
      this.emailSignIn(false);
    });
    $("signin-create").addEventListener("click", () => this.emailSignIn(true));
    $("signin-forgot").addEventListener("click", () => this.forgot());
    $("signin-checked").addEventListener("click", () => this.checked());
    $("signin-resend").addEventListener("click", () => this.resend());
    $("account-signout").addEventListener("click", () => this.signOut());
    $("account-back").addEventListener("click", () => this.show("search"));
    $("account-delete").addEventListener("click", () => this.deleteAccount());
  }

  // ----- the window ------------------------------------------------------------------

  show(view) {
    this.view = view;
    for (const v of VIEWS) $(`cv-${v}`).hidden = v !== view;
    $("community-title").textContent = { search: tr("Community"), publish: tr("Publish to the community"), signin: tr("Sign in to the community"), account: tr("Your account") }[view];
    this.renderUser();
    if (view === "account") $("account-status").textContent = "";
  }

  open(view) {
    this.show(view);
    if (!this.dialog.open) this.dialog.showModal();
  }

  close() {
    if (this.dialog.open) this.dialog.close();
    this.ctx.refreshPage();
  }

  status(id, text, kind = "") {
    const el = $(id);
    el.textContent = text;
    el.classList.toggle("error", kind === "error");
    el.classList.toggle("ok", kind === "ok");
  }

  renderUser() {
    const u = this.user;
    $("community-user").textContent = u ? u.name || u.email : "";
    $("community-user").hidden = !u;
    $("community-account").hidden = !u || this.view === "account";
    $("community-signin").hidden = !!u || this.user === undefined || this.view === "signin";
    $("account-who").textContent = u ? tr("Signed in as {who}.", { who: u.email || u.name }) : "";
  }

  // The SDK loaded and the account known (once).
  async connect() {
    if (!this.driver) this.driver = this.makeDriver();
    await this.driver.ready();
    if (!this.unwatch) {
      let first;
      const known = new Promise((resolve) => (first = resolve));
      this.unwatch = await this.driver.watch((u) => {
        this.user = u;
        this.renderUser();
        first();
      });
      await known;
    }
  }

  // What went wrong, in words. what: "search", "publish", "write" (a like,
  // a report, a deletion), "signin".
  said(error, what = "") {
    const why = reasonOf(error);
    const words = {
      offline: tr("No connection: the community needs the internet."),
      busy: tr("The community has used up what it may do today for free: try again tomorrow."),
      "popup-blocked": tr("The browser blocked Google's window: allow pop-ups for this site, then try again."),
      "wrong-password": tr("Wrong email or password."),
      "no-account": tr("There is no account with this email: create one."),
      "email-in-use": tr("There is already an account with this email: sign in."),
      "weak-password": tr("The password is too weak: at least 6 characters."),
      "bad-email": tr("That email address is not valid."),
      "recent-login": tr("For safety, sign out and sign in again, then delete the account."),
      "too-many": tr("Too many tries: wait a little, then try again."),
      denied:
        what === "search"
          ? tr("The community did not answer: it may not be open yet.")
          : what === "publish"
            ? tr("Not allowed: you may publish once a minute, with your address checked. Wait a moment and try again.")
            : tr("Not allowed by the community."),
    }[why];
    return words || tr("Something went wrong: {error}", { error: (error && (error.message || error.code)) || String(error) });
  }

  // ----- search --------------------------------------------------------------------------

  mine() {
    const d = this.ctx.details();
    return { title: d.title, performer: d.performer, duration: this.ctx.player.song ? this.ctx.player.song.duration : 0 };
  }

  async openSearch() {
    const d = this.ctx.details();
    $("community-query").value = [d.title, d.performer].filter(Boolean).join(" ");
    this.results = [];
    this.renderResults();
    this.open("search");
    await this.search();
  }

  async search() {
    const q = $("community-query").value.trim();
    const words = wordsOf(q);
    if (!words.length) {
      this.results = [];
      this.renderResults();
      this.status("community-status", tr("Type the title or the performer of a song."));
      return;
    }
    this.status("community-status", tr("Searching the community…"));
    this.working = true;
    try {
      await this.connect();
      const word = words.reduce((a, b) => (b.length > a.length ? b : a));
      this.results = rank(await this.driver.search(word), q, this.mine());
      this.renderResults();
      this.status("community-status", this.results.length ? trn(this.results.length, "{n} analysis found.", "{n} analyses found.") : tr("Nothing found for “{q}”: try fewer words, or the performer alone.", { q }));
    } catch (error) {
      this.results = [];
      this.renderResults();
      this.status("community-status", this.said(error, "search"), "error");
    } finally {
      this.working = false;
    }
  }

  renderResults() {
    const list = $("community-results");
    list.textContent = "";
    for (const rec of this.results) list.append(this.item(rec));
  }

  item(rec) {
    const mine = this.mine();
    const own = !!(this.user && rec.owner === this.user.uid);
    const length = rec.duration > 0 ? fmtTime(rec.duration) : "";
    const yours = length && mine.duration > 0 ? tr("{length} (yours {mine})", { length, mine: fmtTime(mine.duration) }) : length;
    const meta = [rec.album, rec.year, yours, rec.kind === "arrangement" ? tr("Arrangement") : tr("As on the record"), rec.bpm ? `${Math.round(rec.bpm)} BPM` : ""].filter(Boolean).join(" · ");
    const when = rec.updated ? new Intl.DateTimeFormat(lang(), { dateStyle: "medium" }).format(new Date(rec.updated)) : "";
    const by = [tr("by {name}", { name: rec.ownerName || "?" }), when].filter(Boolean).join(" · ");
    const liked = this.liked.has(rec.id);
    const like = h("button", { type: "button", class: `small cres-like${liked ? " on" : ""}`, "aria-pressed": String(liked), title: liked ? tr("You like it: click to take the like away") : tr("Like it (signed in)"), text: `${liked ? "♥" : "♡"} ${rec.likes || 0}` });
    const imp = h("button", { type: "button", class: "small primary", text: tr("Import") });
    imp.disabled = !this.ctx.player.song;
    imp.addEventListener("click", () => this.importOne(rec));
    like.addEventListener("click", () => this.toggleLike(rec));
    const actions = h("div", { class: "cres-actions" }, imp, like);
    const report = h("div", { class: "cres-report", hidden: true });
    if (own) {
      const del = h("button", { type: "button", class: "small ghost danger", text: tr("Delete") });
      del.addEventListener("click", () => this.removeOne(rec));
      actions.append(del);
    } else {
      const rep = h("button", { type: "button", class: "small ghost", text: tr("Report") });
      rep.addEventListener("click", () => {
        if (!this.signedIn) return this.needSignIn("search");
        report.hidden = !report.hidden;
      });
      actions.append(rep);
      const why = h("select", { "aria-label": tr("Why") });
      for (const [v, t] of [
        ["wrong", tr("It is not this song")],
        ["poor", tr("Wrong chords or bars")],
        ["spam", tr("Spam or nonsense")],
        ["offensive", tr("Offensive")],
        ["other", tr("Something else")],
      ])
        why.append(h("option", { value: v, text: t }));
      const more = h("input", { type: "text", maxlength: "300", placeholder: tr("A word more (if you like)"), "aria-label": tr("A word more (if you like)") });
      const send = h("button", { type: "button", class: "small", text: tr("Send") });
      send.addEventListener("click", () => this.reportOne(rec, `${why.value}${more.value.trim() ? `: ${more.value.trim()}` : ""}`, report));
      report.append(why, more, send);
    }
    const li = h(
      "li",
      { class: "cres" },
      h("div", { class: "cres-head" }, h("b", { class: "cres-title", text: rec.title }), h("span", { class: "cres-perf", text: rec.performer })),
      h("div", { class: "cres-meta", text: meta }),
      h("div", { class: "cres-by", text: by })
    );
    if (rec.note) li.append(h("p", { class: "cres-note", text: rec.note }));
    li.append(actions, report);
    return li;
  }

  importOne(rec) {
    let shared;
    try {
      shared = analysisFrom(JSON.parse(rec.analysis));
    } catch (error) {
      this.status("community-status", (error && error.message) || tr("This analysis cannot be read."), "error");
      return;
    }
    const title = [rec.title, rec.performer].filter(Boolean).join(", ");
    if (this.ctx.paste(shared, title)) {
      this.close();
      this.ctx.countEvent("community-imported");
    }
  }

  saveLiked() {
    try {
      localStorage.setItem(LIKED, JSON.stringify([...this.liked]));
    } catch (_) {}
  }

  async toggleLike(rec) {
    if (!this.signedIn) return this.needSignIn("search");
    if (this.working) return;
    const on = !this.liked.has(rec.id);
    this.working = true;
    try {
      await this.driver.like(rec.id, on);
      rec.likes = Math.max(0, (rec.likes || 0) + (on ? 1 : -1));
      if (on) this.liked.add(rec.id);
      else this.liked.delete(rec.id);
    } catch (error) {
      // Refused: this browser did not know it was already so (liked on
      // another device): as it is, then.
      if (reasonOf(error) === "denied") {
        if (on) this.liked.add(rec.id);
        else this.liked.delete(rec.id);
      } else this.status("community-status", this.said(error, "write"), "error");
    } finally {
      this.working = false;
    }
    this.saveLiked();
    this.renderResults();
  }

  async reportOne(rec, reason, box) {
    try {
      await this.driver.report(rec.id, reason);
      box.hidden = true;
      this.status("community-status", tr("Reported: thank you. It will be looked at."), "ok");
    } catch (error) {
      this.status("community-status", this.said(error, "write"), "error");
    }
  }

  async removeOne(rec) {
    const yes = await this.ctx.askYes({ title: tr("Delete your analysis of {title}?", { title: rec.title }), hint: tr("It goes from the community for everyone; your song stays as it is."), ok: tr("Delete") });
    if (!yes) return;
    try {
      await this.driver.remove(rec.id);
      this.results = this.results.filter((r) => r.id !== rec.id);
      this.renderResults();
      this.status("community-status", tr("Deleted from the community."), "ok");
    } catch (error) {
      this.status("community-status", this.said(error, "write"), "error");
    }
  }

  // ----- publish -----------------------------------------------------------------------

  kind() {
    const r = document.querySelector("input[name=publish-kind]:checked");
    return r ? r.value : "record";
  }

  // The user's own analysis of the song open, of the kind chosen.
  sameAsMine() {
    const d = this.ctx.details();
    const k = this.kind();
    return this.existing.find((a) => a.kind === k && keyOf(a.title) === keyOf(d.title) && keyOf(a.performer) === keyOf(d.performer)) || null;
  }

  async openPublish() {
    // A song as on the record to start with, no description: those of the
    // user's own analysis of it, once read.
    document.querySelector("input[name=publish-kind][value=record]").checked = true;
    $("publish-note").value = "";
    this.existing = [];
    this.open("publish");
    this.status("publish-status", tr("Connecting to the community…"));
    $("publish-go").disabled = true;
    try {
      await this.connect();
    } catch (error) {
      this.status("publish-status", this.said(error), "error");
      return;
    }
    if (!this.signedIn) {
      this.needSignIn("publish");
      return;
    }
    await this.preparePublish();
  }

  async preparePublish() {
    this.show("publish");
    this.status("publish-status", "");
    $("publish-go").disabled = true;
    const u = this.user;
    try {
      const [name, mine] = await Promise.all([this.driver.userName(u.uid), this.driver.mine(u.uid)]);
      this.existing = mine;
      if (this.nameFor !== u.uid || !$("publish-name").value.trim()) $("publish-name").value = (name || u.name || "").slice(0, NAME_MAX);
      this.nameFor = u.uid;
    } catch (error) {
      this.existing = [];
      this.status("publish-status", this.said(error), "error");
    }
    // The user's own analysis of this song, the latest: its kind and description.
    const d = this.ctx.details();
    const same = this.existing
      .filter((a) => keyOf(a.title) === keyOf(d.title) && keyOf(a.performer) === keyOf(d.performer))
      .sort((a, b) => (b.updated || 0) - (a.updated || 0))[0];
    if (same) {
      const radio = document.querySelector(`input[name=publish-kind][value=${same.kind === "arrangement" ? "arrangement" : "record"}]`);
      if (radio) radio.checked = true;
      if (!$("publish-note").value) $("publish-note").value = same.note || "";
    }
    this.renderPublish();
  }

  renderPublish() {
    const d = this.ctx.details();
    const g = this.ctx.app.grid;
    const chords = [...g.chords.values()].reduce((n, slots) => n + slots.filter(Boolean).length, 0);
    const recording = [d.album, d.year].filter(Boolean).join(", ");
    $("publish-song").textContent = `${d.title} · ${d.performer}${recording ? ` (${recording})` : ""}`;
    $("publish-what").textContent = [trn(g.bars.length, "{n} bar", "{n} bars"), trn(g.sections.length, "{n} section", "{n} sections"), trn(chords, "{n} chord", "{n} chords")].join(" · ");
    const again = this.sameAsMine();
    $("publish-again").hidden = !again;
    if (again) $("publish-again").textContent = tr("You published this song on {date}: publishing again updates it.", { date: new Intl.DateTimeFormat(lang(), { dateStyle: "medium" }).format(new Date(again.updated || again.created || Date.now())) });
    $("publish-go").textContent = again ? tr("Update") : tr("Publish");
    $("publish-note").placeholder = this.kind() === "arrangement" ? tr("For example: what changes from the record, the key it is in.") : tr("For example: the chords as on the record; the solo is not marked.");
    $("publish-go").disabled = !this.signedIn;
  }

  async publish() {
    const u = this.user;
    if (!u) return this.needSignIn("publish");
    if (!u.verified) {
      this.needSignIn("publish");
      this.verifyStep(u.email);
      return;
    }
    const name = $("publish-name").value.trim();
    if (!name) {
      this.status("publish-status", tr("Write the name to show beside your analyses."), "error");
      $("publish-name").focus();
      return;
    }
    const entry = entryOf({ data: this.ctx.analysisData(), details: this.ctx.details(), kind: this.kind(), note: $("publish-note").value, name });
    const again = this.sameAsMine();
    $("publish-go").disabled = true;
    this.status("publish-status", tr("Publishing…"));
    try {
      await this.driver.publish(entry, again ? again.id : null);
      this.close();
      this.ctx.notice(again ? tr("Updated in the community: {title}.", { title: entry.title }) : tr("Published in the community: {title}. Whoever has the song finds it with Search the community.", { title: entry.title }), "ok", 8000);
      this.ctx.countEvent(again ? "community-updated" : "community-published");
      $("publish-note").value = "";
    } catch (error) {
      $("publish-go").disabled = false;
      this.status("publish-status", this.said(error, "publish"), "error");
    }
  }

  // ----- signing in --------------------------------------------------------------------

  // The sign-in view, to go back to `after` once signed in. The SDK is
  // loaded first, so that Google's window opens straight from the click.
  async needSignIn(after) {
    this.after = after;
    this.open("signin");
    $("signin-verify").hidden = true;
    $("signin-form").hidden = false;
    $("signin-google").disabled = true;
    this.status("signin-status", tr("Connecting to the community…"));
    try {
      await this.connect();
      this.status("signin-status", "");
    } catch (error) {
      this.status("signin-status", this.said(error, "signin"), "error");
      return;
    }
    $("signin-google").disabled = false;
  }

  afterSignIn() {
    const next = this.after || "search";
    this.after = null;
    $("signin-password").value = "";
    if (next === "publish") this.preparePublish();
    else {
      this.show(next);
      if (next === "search") this.renderResults();
    }
  }

  async google() {
    try {
      const u = await this.driver.signInGoogle();
      this.user = u;
      this.afterSignIn();
    } catch (error) {
      if (reasonOf(error) !== "popup-closed") this.status("signin-status", this.said(error, "signin"), "error");
    }
  }

  async emailSignIn(create) {
    const email = $("signin-email").value.trim();
    const password = $("signin-password").value;
    if (!email || !password) {
      this.status("signin-status", tr("Write your email and a password."), "error");
      return;
    }
    this.status("signin-status", create ? tr("Creating the account…") : tr("Signing in…"));
    try {
      const u = create ? await this.driver.createAccount(email, password) : await this.driver.signInEmail(email, password);
      this.user = u;
      if (!u.verified) this.verifyStep(email, create);
      else this.afterSignIn();
    } catch (error) {
      this.status("signin-status", this.said(error, "signin"), "error");
    }
  }

  // Waiting for the address to be checked: the link sent (sent: just now).
  verifyStep(email, sent = false) {
    $("signin-form").hidden = true;
    $("signin-verify").hidden = false;
    $("signin-verify-text").textContent = sent
      ? tr("We sent a link to {email}: open it to check your address, then come back here and press I opened the link. Look in the spam too.", { email })
      : tr("Your address {email} is not checked yet: open the link we sent you, then press I opened the link.", { email });
    this.status("signin-status", "");
  }

  async checked() {
    try {
      const u = await this.driver.refresh();
      this.user = u;
      if (u.verified) this.afterSignIn();
      else this.status("signin-status", tr("Not checked yet: open the link in the email, then press I opened the link."), "error");
    } catch (error) {
      this.status("signin-status", this.said(error, "signin"), "error");
    }
  }

  async resend() {
    try {
      await this.driver.sendVerification();
      this.status("signin-status", tr("Sent again."), "ok");
    } catch (error) {
      this.status("signin-status", this.said(error, "signin"), "error");
    }
  }

  async forgot() {
    const email = $("signin-email").value.trim();
    if (!email) {
      this.status("signin-status", tr("Write your email first: a link to choose a new password goes there."), "error");
      return;
    }
    try {
      await this.driver.resetPassword(email);
      this.status("signin-status", tr("If there is an account with {email}, a link to choose a new password is on its way.", { email }), "ok");
    } catch (error) {
      this.status("signin-status", this.said(error, "signin"), "error");
    }
  }

  async signOut() {
    try {
      await this.driver.signOut();
      this.user = null;
      this.show("search");
      this.renderResults();
    } catch (error) {
      this.status("account-status", this.said(error), "error");
    }
  }

  async deleteAccount() {
    const yes = await this.ctx.askYes({ title: tr("Delete your account?"), hint: tr("The analyses you published go with it, for everyone. It cannot be undone."), ok: tr("Delete") });
    if (!yes) return;
    this.status("account-status", tr("Deleting…"));
    try {
      await this.driver.deleteAccount();
      this.user = null;
      this.show("search");
      this.results = [];
      this.renderResults();
      this.status("community-status", tr("Your account and your analyses are deleted."), "ok");
    } catch (error) {
      this.status("account-status", this.said(error), "error");
    }
  }
}
