// Waveform envelopes for the timeline: the lowest and highest sample of a
// track in buckets of PEAK_BUCKET samples (about 5 ms), as EUTERIA (Python)
// draws them, kept as 8-bit values (a few hundred kilobytes for a long song
// with every track). Computed once, when the song opens, before its audio
// goes to the audio thread.

export const PEAK_BUCKET = 256;

// channels: Int16Array[] (one or two), length in samples. Returns
// {min, max} (Int8Array each), the envelope of both channels together.
export function int16Peaks(channels, length) {
  const L = channels[0];
  const R = channels[1] || channels[0];
  const n = Math.max(1, Math.ceil(length / PEAK_BUCKET));
  const min = new Int8Array(n);
  const max = new Int8Array(n);
  for (let b = 0; b < n; b++) {
    const a = b * PEAK_BUCKET;
    const e = Math.min(length, a + PEAK_BUCKET);
    let lo = 32767;
    let hi = -32768;
    for (let i = a; i < e; i++) {
      const l = L[i];
      const r = R[i];
      if (l < lo) lo = l;
      if (l > hi) hi = l;
      if (r < lo) lo = r;
      if (r > hi) hi = r;
    }
    if (lo > hi) lo = hi = 0;
    min[b] = lo >> 8;
    max[b] = hi >> 8;
  }
  return { min, max };
}
