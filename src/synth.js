// Synthetic test song for the Phase 0 stress test: seven tracks (full mix and
// six stems) of any length, generated directly as 16-bit PCM, so the engine can
// be loaded with as much audio as a long real song without any file.

import { STEM_NAMES, TRACK_TITLES } from "./project.js";

const TABLE_SIZE = 4096;
const SINE = new Float32Array(TABLE_SIZE + 1);
for (let i = 0; i <= TABLE_SIZE; i++) SINE[i] = Math.sin((2 * Math.PI * i) / TABLE_SIZE);

// Am7 - D7 - Gmaj7 - Cmaj7, one chord per bar at 120 BPM.
const CHORDS = [
  [110.0, 130.81, 164.81, 196.0],
  [146.83, 185.0, 220.0, 261.63],
  [98.0, 123.47, 146.83, 185.0],
  [130.81, 164.81, 196.0, 246.94],
];

function decayTable(length, sampleRate, rate) {
  const table = new Float32Array(length);
  for (let i = 0; i < length; i++) table[i] = Math.exp((-i / sampleRate) * rate);
  return table;
}

export function generateSong(minutes, sampleRate) {
  const n = Math.round(minutes * 60 * sampleRate);
  const beatLen = Math.round(sampleRate * 0.5); // 120 BPM
  const eighthLen = beatLen >> 1;
  const barLen = beatLen * 4;
  const env = {
    bass: decayTable(beatLen, sampleRate, 4),
    guitar: decayTable(beatLen, sampleRate, 6),
    piano: decayTable(eighthLen, sampleRate, 9),
    kick: decayTable(beatLen, sampleRate, 14),
    kickPitch: decayTable(beatLen, sampleRate, 30),
    snare: decayTable(beatLen, sampleRate, 22),
    hat: decayTable(eighthLen, sampleRate, 80),
  };
  const mix = new Float32Array(n);
  const stems = {};
  let seed = 12345;
  const noise = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2147483648 - 1;
  };
  const phase = new Float64Array(4);
  const step = TABLE_SIZE / sampleRate;
  const osc = (slot, freq) => {
    let p = phase[slot] + freq * step;
    if (p >= TABLE_SIZE) p -= TABLE_SIZE;
    phase[slot] = p;
    return SINE[p | 0];
  };

  for (const stem of STEM_NAMES) {
    const out = new Float32Array(n);
    phase.fill(0);
    for (let i = 0; i < n; i++) {
      const chord = CHORDS[Math.floor(i / barLen) % 4];
      const iBeat = i % beatLen;
      const iEighth = i % eighthLen;
      const beat = Math.floor(i / beatLen) % 4;
      let v = 0;
      if (stem === "bass") {
        const f = beat === 3 ? chord[2] / 2 : chord[0] / 2;
        v = (osc(0, f) + 0.4 * osc(1, 2 * f)) * env.bass[iBeat] * 0.45;
      } else if (stem === "guitar") {
        if (beat % 2 === 1) v = (osc(0, chord[0] * 2) + osc(1, chord[1] * 2) + osc(2, chord[2] * 2)) * env.guitar[iBeat] * 0.15;
      } else if (stem === "piano") {
        v = osc(0, chord[Math.floor(i / eighthLen) % 4] * 4) * env.piano[iEighth] * 0.25;
      } else if (stem === "vocals") {
        const note = chord[(Math.floor(i / (2 * beatLen)) + 1) % 4] * 4;
        const vibrato = 1 + 0.006 * SINE[((i * 5.5 * step) | 0) % TABLE_SIZE];
        const swell = 0.6 + 0.4 * Math.min(1, ((i % barLen) / sampleRate) * 3);
        v = (osc(0, note * vibrato) + 0.3 * osc(1, 2 * note * vibrato)) * swell * 0.18;
      } else if (stem === "other") {
        v = (osc(0, chord[0] * 2) + osc(1, chord[2] * 2 * 1.003) + osc(2, chord[3] * 2 * 0.997)) * 0.07;
      } else if (stem === "drums") {
        if (beat === 0 || beat === 2) v += osc(0, 50 + 70 * env.kickPitch[iBeat]) * env.kick[iBeat] * 0.6;
        else v += (noise() * 0.5 + osc(1, 180) * 0.3) * env.snare[iBeat] * 0.5;
        v += noise() * env.hat[iEighth] * 0.12;
      }
      out[i] = v;
      mix[i] += v;
    }
    stems[stem] = out;
  }

  const toTrack = (key, mono, gain) => {
    const left = new Int16Array(n);
    const right = new Int16Array(n);
    const pan = key === "guitar" ? 0.3 : key === "piano" ? -0.3 : 0;
    const gl = gain * (1 - pan) * 32767;
    const gr = gain * (1 + pan) * 32767 * 0.999;
    for (let i = 0; i < n; i++) {
      const v = mono[i];
      left[i] = Math.max(-32768, Math.min(32767, v * gl));
      right[i] = Math.max(-32768, Math.min(32767, v * gr));
    }
    return {
      key,
      title: TRACK_TITLES[key],
      bus: key === "drums" ? "drums" : "pitched",
      channels: [left, right],
      length: n,
      gain: 1,
      on: key !== "original",
    };
  };
  const tracks = [toTrack("original", mix, 0.5)];
  for (const stem of STEM_NAMES) tracks.push(toTrack(stem, stems[stem], 1));
  return {
    title: `Stress test (${minutes} min)`,
    songName: "Stress test",
    tracks,
    sampleRate,
    duration: n / sampleRate,
    manifest: null,
  };
}
