// The level of a take, brought near the song's (src/recorder.js). A song is
// mastered: loud and even, its average close to its peaks. A take is the sound
// as it comes in, its peaks far above its average, and an input sends it with
// room to spare (an audio interface peaks around −18 dB, a phone's microphone
// lower still): played beside the song it is too quiet, and raising its volume
// pushes its peaks over full scale.
//
// While a take is recorded, the audio engine measures every 100 ms the
// loudness of the input and of what it plays (K-weighted, as ITU-R BS.1770
// measures the loudness of programmes). Here: the integrated loudness of
// each, the gain that puts the take TAKE_UNDER_SONG dB under the song (only
// ever up), and that gain applied to the take through a limiter with a short
// look-ahead, which lowers its few highest peaks under CEILING instead of
// cutting them.

export const TAKE_UNDER_SONG = 6; // dB: clearly heard, as a guitar in a band
const ALONE = -20; // LUFS: the take's level when no track of the song plays
const MAX_GAIN = 30; // dB
const CEILING = 10 ** (-1 / 20); // −1 dBFS
const LOOKAHEAD = 0.0015; // seconds the gain starts to drop before a peak
const RELEASE = 0.06; // seconds the gain takes to come back
const YIELD_EVERY = 1 << 20; // samples between pauses that keep the page responsive

const lufs = (power) => -0.691 + 10 * Math.log10(power);
const mean = (list) => list.reduce((a, b) => a + b, 0) / list.length;

// Integrated loudness (LUFS) from mean powers every 100 ms: blocks of 400 ms
// every 100 ms, gated at −70 LUFS, then at 10 LU under the level of the
// rest. null if nothing is loud enough to count.
export function integratedLoudness(hops) {
  const blocks = [];
  for (let i = 0; i + 4 <= hops.length; i++) blocks.push((hops[i] + hops[i + 1] + hops[i + 2] + hops[i + 3]) / 4);
  if (!blocks.length && hops.length) blocks.push(mean([...hops]));
  const loud = blocks.filter((p) => p > 0 && lufs(p) > -70);
  if (!loud.length) return null;
  const gate = lufs(mean(loud)) - 10;
  return lufs(mean(loud.filter((p) => lufs(p) > gate)));
}

// The gain (dB) that puts a take TAKE_UNDER_SONG dB under the song; with no
// song playing, at ALONE. Never negative: a take already loud stays as it is.
export function takeGain(takeLufs, songLufs) {
  if (takeLufs === null) return 0;
  const target = songLufs === null ? ALONE : songLufs - TAKE_UNDER_SONG;
  return Math.max(0, Math.min(MAX_GAIN, target - takeLufs));
}

// Raises 16-bit channels (one or two, in place) by gainDb. Where a peak would
// go over CEILING the gain drops just enough, starting LOOKAHEAD before it,
// and comes back over RELEASE: the gain at each sample is the lowest any
// sample of the next 2 x LOOKAHEAD needs, averaged over LOOKAHEAD (so it moves
// smoothly and is low enough at every peak), and it rises no faster than
// RELEASE allows.
export async function levelChannels(channels, length, sampleRate, gainDb) {
  const up = 10 ** (gainDb / 20);
  const k = up / 32768; // 16-bit to full scale, raised
  const L = Math.max(1, Math.round(sampleRate * LOOKAHEAD));
  const W = 2 * L;
  const rel = 1 - Math.exp(-1 / (sampleRate * RELEASE));
  const A = channels[0];
  const B = channels[channels.length - 1];
  const need = (j) => {
    if (j >= length) return 1;
    const a = A[j] < 0 ? -A[j] : A[j];
    const b = B[j] < 0 ? -B[j] : B[j];
    const p = (a > b ? a : b) * k;
    return p > CEILING ? CEILING / p : 1;
  };
  // The lowest need over the window ahead: a queue of [sample, need], the
  // needs rising from its front to its back.
  const size = W + 2;
  const qi = new Int32Array(size);
  const qv = new Float64Array(size);
  let head = 0;
  let count = 0;
  const push = (j) => {
    const v = need(j);
    while (count && qv[(head + count - 1) % size] >= v) count--;
    const t = (head + count) % size;
    qi[t] = j;
    qv[t] = v;
    count++;
  };
  for (let j = 0; j < W; j++) push(j);
  const recent = new Float64Array(L);
  let sum = 0;
  let g = 1;
  for (let i = 0; i < length; i++) {
    push(i + W);
    while (qi[head] < i) {
      head = (head + 1) % size;
      count--;
    }
    const lowest = qv[head];
    const slot = i % L;
    sum += lowest - (i >= L ? recent[slot] : 0);
    recent[slot] = lowest;
    const smooth = sum / (i < L ? i + 1 : L);
    g = smooth < g ? smooth : g + (smooth - g) * rel;
    const f = up * g;
    for (const c of channels) {
      const v = Math.round(c[i] * f);
      c[i] = v > 32767 ? 32767 : v < -32768 ? -32768 : v;
    }
    if (i % YIELD_EVERY === YIELD_EVERY - 1) await new Promise((r) => setTimeout(r, 0));
  }
}
