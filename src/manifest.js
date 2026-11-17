// The manifest a song is saved with (manifest.json of an EUTERIA project, see
// src/zipwrite.js): the grid and the chords (manifest.music) and the practice
// settings (manifest.practice), in the fields and the format EUTERIA (Python)
// writes, the takes recorded in EUTERIA Web (manifest.audio.takes) and the
// clips of the tracks cut there (manifest.audio.clips), every other field of
// the project kept as it is.

import { STEM_NAMES, TAKES_DIR, isTake, takeToManifest } from "./project.js";
import { musicFields } from "./grid.js";

const EDITED_WITH = "EUTERIA Web";
const WEB_FORMAT_VERSION = 4; // as the projects exported for the web app by EUTERIA (Python)

const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

// The stems in the order of the tracks, as EUTERIA (Python) reads them
// (stem_order: the six stems; the ones the song does not have after them).
function stemOrder(tracks) {
  const shown = tracks.map((t) => t.key).filter((k) => STEM_NAMES.includes(k));
  return [...shown, ...STEM_NAMES.filter((k) => !shown.includes(k))];
}

// The practice settings as EUTERIA (Python) saves them (_save_music_settings),
// with the order of every track (track_order) that EUTERIA Web adds.
// state: {rate, semitones, loop: {on, start, end}, gridVisible, tracks: [{key,
// on, gain, clips}]}, the tracks in their order (clips: as the manifest has
// them, src/clips.js clipsToManifest(), or null).
// The key counts as "transposed": EUTERIA Web transposes live, and
// EUTERIA (Python), without transposed tracks in the file, plays the
// original key.
function practiceFields(base, grid, state) {
  const percent = round(state.rate * 100, 1);
  const volumes = { ...(base.track_volumes || {}) };
  const enabled = { ...(base.track_enabled || {}) };
  // The settings of takes deleted go with them.
  const current = new Set(state.tracks.map((t) => t.key));
  for (const map of [volumes, enabled]) for (const k of Object.keys(map)) if (isTake(k) && !current.has(k)) delete map[k];
  for (const t of state.tracks) {
    volumes[t.key] = round(t.gain, 3);
    enabled[t.key] = !!t.on;
  }
  const lp = state.loop;
  return {
    ...base,
    tempo_bpm: grid.bpm ? round((grid.bpm * percent) / 100, 3) : null,
    tempo_percent: percent,
    transpose_semitones: state.semitones,
    key_mode: state.semitones ? "transposed" : "original",
    loop: lp && lp.on && lp.end > lp.start ? { start: round(lp.start, 6), end: round(lp.end, 6) } : null,
    grid_visible: !!state.gridVisible,
    track_volumes: volumes,
    track_enabled: enabled,
    stem_order: stemOrder(state.tracks),
    track_order: state.tracks.map((t) => t.key),
  };
}

// The takes of the song (src/project.js takeFromManifest()) in the manifest:
// audio.takes, and the gapless information of their MP3 files in
// audio.tracks. They replace the takes listed before.
export function withTakes(manifest, takes) {
  const audio = (manifest.audio = { ...(manifest.audio || {}) });
  const had = !!audio.tracks;
  const tracks = { ...(audio.tracks || {}) };
  for (const member of Object.keys(tracks)) if (member.startsWith(TAKES_DIR)) delete tracks[member];
  for (const t of takes) if (t.info) tracks[t.member] = t.info;
  if (had || Object.keys(tracks).length) audio.tracks = tracks;
  if (takes.length) audio.takes = takes.map(takeToManifest);
  else delete audio.takes;
  return manifest;
}

// The clips of the tracks cut (src/clips.js) in audio.clips, by track; with
// none cut, no audio.clips. Those of tracks gone (a take deleted) go too.
function withClips(manifest, tracks) {
  const audio = (manifest.audio = { ...(manifest.audio || {}) });
  const clips = {};
  for (const t of tracks || []) if (Array.isArray(t.clips)) clips[t.key] = t.clips;
  if (Object.keys(clips).length) audio.clips = clips;
  else delete audio.clips;
  return manifest;
}

// The tempo and chord detection of the song (app/detect.js) in
// manifest.music, when there is one: beat_tracking, and its chords in
// chord_recognition.
function withAnalysis(music, analysis) {
  if (!analysis) return music;
  const { chords, ...beats } = analysis;
  if (Array.isArray(beats.beats)) music.beat_tracking = beats;
  if (chords) music.chord_recognition = chords;
  return music;
}

// The project's manifest with the grid, the chords, the practice settings,
// the tempo detection, the takes and the name (title) of now.
export function savedManifest(manifest, grid, state, takes = [], analysis = null, title = null) {
  const out = JSON.parse(JSON.stringify(manifest));
  if (title) out.title = title;
  out.music = withAnalysis({ ...(out.music || {}), ...musicFields(grid) }, analysis);
  out.practice = practiceFields(out.practice || {}, grid, state);
  out.edited_with = EDITED_WITH;
  return withTakes(withClips(out, state.tracks), takes);
}

export function newProjectId() {
  if (crypto.randomUUID) return crypto.randomUUID().replace(/-/g, "");
  return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// The manifest of a new project made from an audio file: its Original Track
// only, as make_project_manifest() of EUTERIA (Python), in the web format.
export function newProjectManifest({ id, title, fileName, member, grid, state, takes = [], analysis = null }) {
  const volumes = { original: 1, transposed: 1 };
  for (const n of STEM_NAMES) volumes[n] = 1;
  const manifest = {
    format: "EUTERIA.musicproj",
    format_version: WEB_FORMAT_VERSION,
    variant: "web",
    project_id: id,
    title,
    artist: "",
    created_with: EDITED_WITH,
    audio: {
      original_filename: fileName,
      original_member: member,
      stems: Object.fromEntries(STEM_NAMES.map((n) => [n, null])),
      transposed_member: null,
      transposed_stems: {},
    },
    separation: { status: "not_started", model: null, quality: "standard", error: null, job_id: null },
    music: withAnalysis({ key: null, ...musicFields(grid) }, analysis),
    practice: practiceFields({ track_volumes: volumes }, grid, state),
    markers: [],
    user_corrections: [],
  };
  return withTakes(withClips(manifest, state.tracks), takes);
}

// The manifest of a project made empty in EUTERIA Web, to record into: no
// audio of its own but its length (audio.length_seconds), a grid to play to.
export function emptyProjectManifest({ id, title, grid, state, length }) {
  const volumes = { original: 1, transposed: 1 };
  for (const n of STEM_NAMES) volumes[n] = 1;
  return {
    format: "EUTERIA.musicproj",
    format_version: WEB_FORMAT_VERSION,
    variant: "web",
    project_id: id,
    title,
    artist: "",
    created_with: EDITED_WITH,
    audio: {
      original_filename: null,
      original_member: null,
      stems: Object.fromEntries(STEM_NAMES.map((n) => [n, null])),
      transposed_member: null,
      transposed_stems: {},
      length_seconds: Math.round(length * 1000) / 1000,
    },
    separation: { status: "not_started", model: null, quality: "standard", error: null, job_id: null },
    music: { key: null, ...musicFields(grid) },
    practice: practiceFields({ track_volumes: volumes }, grid, state),
    markers: [],
    user_corrections: [],
  };
}

// manifest.json as EUTERIA (Python) writes it: indented by two spaces, UTF-8.
export const manifestBytes = (manifest) => new TextEncoder().encode(JSON.stringify(manifest, null, 2));
