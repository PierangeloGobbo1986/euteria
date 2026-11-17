// The clips of a track: the parts of its audio that play, each where it is
// placed (2.10). A clip is {from, to, at, fadeIn, fadeOut}: the track's own
// audio from `from` to `to`, played from `at` (from the track's start: a take
// keeps its Sync for all its clips), faded in over its first fadeIn and out
// over its last fadeOut. The clips of a track never overlap, in the order
// they play. null: the track whole, as it was recorded or separated; []:
// nothing of it plays.
//
// The functions work in any unit (samples in the player, seconds in the
// timeline), never change what they are given, and return new lists, so that
// undo (app/history.js) can keep them as they are. `min` is the shortest a
// clip may be, in the same unit.
//
// A clip moved, or lengthened, over others of its track covers them: what is
// under it no longer plays (cover()). The engine (src/engine-core.js) fades
// every edge that is a cut in the audio by a few milliseconds, so that it
// does not click; two clips that go on from one another, as a cut leaves
// them, play on without a break.

// As src/engine-core.js plays them: an edge that cuts the sound faded over
// this, the fades of this shape.
export const EDGE_FADE_SECONDS = 0.004;
const fadeShape = (u) => 0.5 - 0.5 * Math.cos(Math.PI * u);

export const clipLength = (c) => c.to - c.from;
// Where a clip ends, from the track's start.
export const clipEnd = (c) => c.at + c.to - c.from;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// The track whole, as one clip.
export const wholeClip = (length) => ({ from: 0, to: length, at: 0, fadeIn: 0, fadeOut: 0 });

// The clips a track plays: its own, or itself whole.
export const clipsOf = (clips, length) => (clips ? clips : [wholeClip(length)]);

export function isWhole(clips, length) {
  if (!clips) return true;
  if (clips.length !== 1) return false;
  const c = clips[0];
  return c.from === 0 && c.to === length && c.at === 0 && !c.fadeIn && !c.fadeOut;
}

// The fades of clip c, within its length (in, then out).
function fitFades(c) {
  const len = clipLength(c);
  const fadeIn = clamp(c.fadeIn || 0, 0, len);
  const fadeOut = clamp(c.fadeOut || 0, 0, len - fadeIn);
  return fadeIn === c.fadeIn && fadeOut === c.fadeOut ? c : { ...c, fadeIn, fadeOut };
}

// Clip c without what is before `at` (from its track's start).
function startAt(c, at) {
  const d = at - c.at;
  return fitFades({ ...c, from: c.from + d, at, fadeIn: 0 });
}

// Clip c without what is after `at`.
function endAt(c, at) {
  return fitFades({ ...c, to: c.from + (at - c.at), fadeOut: 0 });
}

// The clips `placed` over the others (`rest`): what of these is under them
// goes (a clip covered in the middle is left in two). Sorted.
export function cover(rest, placed, min = 0) {
  const out = [];
  for (const c of rest) {
    let parts = [c];
    for (const m of placed) {
      const a = m.at;
      const b = clipEnd(m);
      const next = [];
      for (const p of parts) {
        if (clipEnd(p) <= a || p.at >= b) {
          next.push(p);
          continue;
        }
        if (p.at < a) next.push(endAt(p, a));
        if (clipEnd(p) > b) next.push(startAt(p, b));
      }
      parts = next;
    }
    for (const p of parts) if (clipLength(p) > 0 && clipLength(p) >= min) out.push(p);
  }
  return [...out, ...placed].sort((x, y) => x.at - y.at);
}

// A list as it may be: each clip within the audio (0..length) and at least
// `min` long, the fades within it, sorted; where two overlap, the later one
// in the list covers the earlier. null if it is the track whole.
export function normalize(clips, length, min = 0) {
  if (!Array.isArray(clips)) return null;
  let out = [];
  for (const raw of clips) {
    if (!raw || ![raw.from, raw.to, raw.at].every(Number.isFinite)) continue;
    const from = clamp(raw.from, 0, length);
    const to = clamp(raw.to, from, length);
    if (to - from <= 0 || to - from < min) continue;
    const c = fitFades({ from, to, at: raw.at + (from - raw.from), fadeIn: Math.max(0, +raw.fadeIn || 0), fadeOut: Math.max(0, +raw.fadeOut || 0) });
    out = cover(out, [c], min);
  }
  return isWhole(out, length) ? null : out;
}

// The clip that plays at `pos` (from the track's start): its index, or -1.
export function clipAt(clips, pos) {
  for (let i = 0; i < clips.length; i++) if (pos >= clips[i].at && pos < clipEnd(clips[i])) return i;
  return -1;
}

// Clip i cut in two at `pos`: {clips, index} (index: the part after the cut),
// or null if pos is not inside it by at least `min` from either end.
export function cut(clips, i, pos, min = 0) {
  const c = clips[i];
  if (!c || pos - c.at < Math.max(min, 1e-9) || clipEnd(c) - pos < Math.max(min, 1e-9)) return null;
  const d = pos - c.at;
  const left = fitFades({ ...c, to: c.from + d, fadeOut: 0 });
  const right = fitFades({ ...c, from: c.from + d, at: pos, fadeIn: 0 });
  return { clips: [...clips.slice(0, i), left, right, ...clips.slice(i + 1)], index: i + 1 };
}

// Without the clips of `indexes`.
export function remove(clips, indexes) {
  const gone = new Set(indexes);
  return clips.filter((_, i) => !gone.has(i));
}

// The clips of `indexes` moved by `delta`, over the others of the track:
// {clips, indexes (where the moved ones are now)}.
export function move(clips, indexes, delta, min = 0) {
  const chosen = new Set(indexes);
  const moved = clips.filter((_, i) => chosen.has(i)).map((c) => ({ ...c, at: c.at + delta }));
  const out = cover(
    clips.filter((_, i) => !chosen.has(i)),
    moved,
    min
  );
  return { clips: out, indexes: moved.map((m) => out.indexOf(m)) };
}

// An edge of clip i ("start" or "end") moved to `pos` (from the track's
// start), as far as the audio goes and leaving the clip at least `min` long;
// lengthened over others, it covers them. {clips, index}.
export function trim(clips, i, edge, pos, length, min = 0) {
  const c = clips[i];
  let next;
  if (edge === "start") {
    const at = clamp(pos, c.at - c.from, clipEnd(c) - Math.max(min, 1e-9));
    next = fitFades({ ...c, from: c.from + (at - c.at), at });
  } else {
    const end = clamp(pos, c.at + Math.max(min, 1e-9), c.at + (length - c.from));
    next = fitFades({ ...c, to: c.from + (end - c.at) });
  }
  const out = cover(
    clips.filter((_, j) => j !== i),
    [next],
    min
  );
  return { clips: out, index: out.indexOf(next) };
}

// The fade at one end of clip i ("in" or "out") made `len` long, within the
// clip and the other fade.
export function fade(clips, i, side, len) {
  const c = clips[i];
  const room = clipLength(c);
  const next = side === "in" ? { ...c, fadeIn: clamp(len, 0, room - (c.fadeOut || 0)) } : { ...c, fadeOut: clamp(len, 0, room - (c.fadeIn || 0)) };
  return clips.map((x, j) => (j === i ? next : x));
}

// Copy (2.11): clips of a track (some of its own, in the order they play)
// as one piece of audio that sounds as they do in the track: each clip's
// audio in its place, its fades in it, an edge that cuts the sound faded
// over `edge` (where the clip next to it in the track is not one of them, as
// src/engine-core.js _parts() does), silence between them. Samples only.
// audio[i]: clip i's own audio, from..to of the track (Int16Array[], one by
// channel); length: the track's. Returns {at (where the piece begins, from
// the track's start), length, channels}.
export function bake(list, audio, length, edge) {
  const at = list[0].at;
  const n = Math.max(...list.map(clipEnd)) - at;
  const channels = audio[0].map(() => new Int16Array(n));
  list.forEach((c, i) => {
    const m = clipLength(c);
    const prev = list[i - 1];
    const next = list[i + 1];
    const joinedIn = !!prev && prev.to === c.from && clipEnd(prev) === c.at;
    const joinedOut = !!next && next.from === c.to && clipEnd(c) === next.at;
    let fi = Math.max(Math.round(c.fadeIn || 0), c.from > 0 && !joinedIn ? edge : 0);
    let fo = Math.max(Math.round(c.fadeOut || 0), c.to < length && !joinedOut ? edge : 0);
    if (fi + fo > m) {
      const k = m / (fi + fo);
      fi = Math.floor(fi * k);
      fo = Math.floor(fo * k);
    }
    const o = c.at - at;
    channels.forEach((dst, ch) => {
      const src = audio[i][ch] || audio[i][0];
      dst.set(src.subarray(0, Math.min(m, src.length)), o);
      for (let j = 0; j < fi; j++) dst[o + j] = Math.round(src[j] * fadeShape((j + 0.5) / fi));
      for (let j = m - fo; j < m; j++) dst[o + j] = Math.round(src[j] * fadeShape((m - j - 0.5) / fo));
    });
  });
  return { at, length: n, channels };
}

// Where the last clip ends (from the track's start); 0 with none.
export function clipsEnd(clips, length) {
  if (!clips) return length;
  let end = 0;
  for (const c of clips) end = Math.max(end, clipEnd(c));
  return end;
}

export function sameClips(a, b) {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((c, i) => {
    const d = b[i];
    return c.from === d.from && c.to === d.to && c.at === d.at && (c.fadeIn || 0) === (d.fadeIn || 0) && (c.fadeOut || 0) === (d.fadeOut || 0);
  });
}

// From one unit to another: times `k` (samples to seconds: 1 / rate),
// rounded to whole samples when `whole`.
export function scaleClips(clips, k, whole = false) {
  if (!clips) return null;
  const f = whole ? (v) => Math.round(v * k) : (v) => v * k;
  return clips.map((c) => ({ from: f(c.from), to: f(c.to), at: f(c.at), fadeIn: f(c.fadeIn || 0), fadeOut: f(c.fadeOut || 0) }));
}

// In the project's manifest (manifest.audio.clips[key]): seconds, rounded
// to the microsecond.
const r6 = (v) => Math.round(v * 1e6) / 1e6;
export function clipsToManifest(clips, rate) {
  if (!clips) return null;
  return clips.map((c) => ({ from: r6(c.from / rate), to: r6(c.to / rate), at: r6(c.at / rate), fade_in: r6((c.fadeIn || 0) / rate), fade_out: r6((c.fadeOut || 0) / rate) }));
}

// The clips a manifest gives a track of `length` samples, at `rate`.
export function clipsFromManifest(list, rate, length) {
  if (!Array.isArray(list)) return null;
  const s = (v) => Math.round(+v * rate);
  return normalize(
    list.map((c) => c && { from: s(c.from), to: s(c.to), at: s(c.at), fadeIn: s(c.fade_in || 0), fadeOut: s(c.fade_out || 0) }),
    length,
    1
  );
}
