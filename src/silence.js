// A stem the separation left empty (2.13): the instrument is not in the song,
// and the stem is not kept (app/separate.js). Empty: louder than −40 dB (1%
// of full scale) for half a second at most in all, measured in windows of 50
// ms, as the faint leftovers of the other instruments are. An instrument
// that plays, even softly or for a moment, stays.

export const EMPTY_DB = -40;
export const EMPTY_SECONDS = 0.5;
const WINDOW_SECONDS = 0.05;

// channels: the stem's samples (Float32Array[], −1…1), at `rate`.
export function isEmptyStem(channels, rate) {
  const list = channels.filter(Boolean);
  if (!list.length) return true;
  const n = Math.min(...list.map((c) => c.length));
  const win = Math.max(1, Math.round(rate * WINDOW_SECONDS));
  const floor = 10 ** (EMPTY_DB / 10); // the mean square of −40 dB
  const most = EMPTY_SECONDS * rate;
  let loud = 0;
  for (let at = 0; at < n; at += win) {
    const end = Math.min(n, at + win);
    let sum = 0;
    for (const c of list) for (let i = at; i < end; i++) sum += c[i] * c[i];
    if (sum / ((end - at) * list.length) >= floor) {
      loud += end - at;
      if (loud > most) return false;
    }
  }
  return true;
}
