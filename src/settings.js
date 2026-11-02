// Practice settings of each song, kept in this browser (localStorage): which
// tracks are on, their volumes, tempo, key, loop and position, so that a song
// opens again as it was left. A song opened for the first time starts from
// the practice settings EUTERIA (Python) saved in the project.

const PREFIX = "euteria.song.";
const MAX_SONGS = 300;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// The key of a song's settings: the project's id and the file's size (a
// project exported again is a new file, with the practice settings of that
// moment), or the name and size of an audio file.
export function settingsKey(song, file) {
  const id = song.manifest && song.manifest.project_id;
  return id ? `p:${id}:${file.size}` : `a:${file.name}:${file.size}`;
}

// Tempo, key and loop as EUTERIA (Python) saved them in the project. The key
// counts only if the project was left transposed; EUTERIA Web transposes live.
export function practiceFromManifest(manifest) {
  const p = (manifest && manifest.practice) || {};
  const tempo = +p.tempo_percent;
  const semitones = p.key_mode === "transposed" ? Math.round(+p.transpose_semitones || 0) : 0;
  const loop = p.loop && typeof p.loop === "object" ? p.loop : null;
  const start = loop ? +loop.start : NaN;
  const end = loop ? +loop.end : NaN;
  return {
    rate: isFinite(tempo) && tempo > 0 ? clamp(tempo / 100, 0.5, 2) : 1,
    semitones: clamp(semitones, -12, 12),
    loop: isFinite(start) && isFinite(end) && end > start ? { on: true, start, end } : { on: false, start: 0, end: 0 },
  };
}

export function loadSettings(key) {
  try {
    const value = localStorage.getItem(PREFIX + key);
    return value ? JSON.parse(value) : null;
  } catch (_) {
    return null;
  }
}

export function saveSettings(key, settings) {
  const value = JSON.stringify({ ...settings, savedAt: Date.now() });
  try {
    localStorage.setItem(PREFIX + key, value);
  } catch (_) {
    // Storage full: forget the songs not opened for the longest time.
    prune(MAX_SONGS / 2);
    try {
      localStorage.setItem(PREFIX + key, value);
    } catch (__) {}
  }
  prune(MAX_SONGS);
}

export function forgetSettings(key) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch (_) {}
}

function prune(keep) {
  try {
    const all = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(PREFIX)) continue;
      let at = 0;
      try {
        at = JSON.parse(localStorage.getItem(k)).savedAt || 0;
      } catch (_) {}
      all.push([k, at]);
    }
    if (all.length <= keep) return;
    all.sort((a, b) => b[1] - a[1]);
    for (const [k] of all.slice(keep)) localStorage.removeItem(k);
  } catch (_) {}
}
