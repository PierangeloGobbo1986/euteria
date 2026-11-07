// The manifest a song is saved with (manifest.json of an EUTERIA project, see
// src/zipwrite.js): the grid and the chords (manifest.music) and the practice
// settings (manifest.practice), in the fields and the format EUTERIA (Python)
// writes, the takes recorded in EUTERIA Web (manifest.audio.takes), every
// other field of the project kept as it is.

import { STEM_NAMES, TAKES_DIR, isTake, takeToManifest } from "./project.js";
import { musicFields } from "./grid.js";

const EDITED_WITH = "EUTERIA Web";
const WEB_FORMAT_VERSION = 4; // as the projects exported for the web app by EUTERIA (Python)

const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

// The practice settings as EUTERIA (Python) saves them (_save_music_settings).
// state: {rate, semitones, loop: {on, start, end}, gridVisible, tracks: [{key, on, gain}]}.
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
    stem_order: Array.isArray(base.stem_order) ? base.stem_order : [...STEM_NAMES],
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

// The project's manifest with the grid, the chords, the practice settings
// and the takes of now.
export function savedManifest(manifest, grid, state, takes = []) {
  const out = JSON.parse(JSON.stringify(manifest));
  out.music = { ...(out.music || {}), ...musicFields(grid) };
  out.practice = practiceFields(out.practice || {}, grid, state);
  out.edited_with = EDITED_WITH;
  return withTakes(out, takes);
}

export function newProjectId() {
  if (crypto.randomUUID) return crypto.randomUUID().replace(/-/g, "");
  return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// The manifest of a new project made from an audio file: its Original Track
// only, as make_project_manifest() of EUTERIA (Python), in the web format.
export function newProjectManifest({ id, title, fileName, member, grid, state, takes = [] }) {
  const volumes = { original: 1, transposed: 1 };
  for (const n of STEM_NAMES) volumes[n] = 1;
  return withTakes({
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
    music: { key: null, ...musicFields(grid) },
    practice: practiceFields({ track_volumes: volumes }, grid, state),
    markers: [],
    user_corrections: [],
  }, takes);
}

// manifest.json as EUTERIA (Python) writes it: indented by two spaces, UTF-8.
export const manifestBytes = (manifest) => new TextEncoder().encode(JSON.stringify(manifest, null, 2));
