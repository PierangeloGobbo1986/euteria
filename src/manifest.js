// The manifest a song is saved with (manifest.json of an EUTERIA project, see
// src/zipwrite.js): the grid and the chords (manifest.music) and the practice
// settings (manifest.practice), in the fields and the format EUTERIA (Python)
// writes, every other field of the project kept as it is.

import { STEM_NAMES } from "./project.js";
import { musicFields } from "./grid.js";

export const EDITED_WITH = "EUTERIA Web";
const WEB_FORMAT_VERSION = 4; // as the projects exported for the web app by EUTERIA (Python)

const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

// The practice settings as EUTERIA (Python) saves them (_save_music_settings).
// state: {rate, semitones, loop: {on, start, end}, gridVisible, tracks: [{key, on, gain}]}.
// The key counts as "transposed": EUTERIA Web transposes live, and
// EUTERIA (Python), without transposed tracks in the file, plays the
// original key.
export function practiceFields(base, grid, state) {
  const percent = round(state.rate * 100, 1);
  const volumes = { ...(base.track_volumes || {}) };
  const enabled = { ...(base.track_enabled || {}) };
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

// The project's manifest with the grid, the chords and the practice settings
// of now.
export function savedManifest(manifest, grid, state) {
  const out = JSON.parse(JSON.stringify(manifest));
  out.music = { ...(out.music || {}), ...musicFields(grid) };
  out.practice = practiceFields(out.practice || {}, grid, state);
  out.edited_with = EDITED_WITH;
  return out;
}

export function newProjectId() {
  if (crypto.randomUUID) return crypto.randomUUID().replace(/-/g, "");
  return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// The manifest of a new project made from an audio file: its Original Track
// only, as make_project_manifest() of EUTERIA (Python), in the web format.
export function newProjectManifest({ id, title, fileName, member, grid, state }) {
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
  };
}

// manifest.json as EUTERIA (Python) writes it: indented by two spaces, UTF-8.
export const manifestBytes = (manifest) => new TextEncoder().encode(JSON.stringify(manifest, null, 2));
