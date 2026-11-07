// Opening EUTERIA projects (.euteria from "Export for Webapp version", or a
// full .musicproj) and the naming rules shared with EUTERIA (Python).
//
// A project may also hold takes, recorded in EUTERIA Web over the song
// (src/recorder.js): MP3 files in audio/takes/, listed in manifest.audio.takes
// with the moment of the song where each begins.

import { openZip } from "./zip.js";
import { alignOriginal } from "./align.js";

export const STEM_NAMES = ["vocals", "drums", "bass", "guitar", "piano", "other"];
export const TRACK_TITLES = {
  original: "Original Track",
  vocals: "Vocals",
  drums: "Drums",
  bass: "Bass",
  guitar: "Guitar",
  piano: "Piano",
  other: "Other",
};

// Takes: track keys "take-<id>", members "audio/takes/<id>.mp3".
const TAKE_PREFIX = "take-";
export const TAKES_DIR = "audio/takes/";
export const isTake = (key) => typeof key === "string" && key.startsWith(TAKE_PREFIX);
export const takeKey = (id) => TAKE_PREFIX + id;
export const takeMember = (id) => `${TAKES_DIR}${id}.mp3`;

// A take as the app keeps it, from its entry in manifest.audio.takes.
function takeFromManifest(t, info = null) {
  return {
    id: String(t.id),
    title: String(t.title || "Take"),
    member: String(t.member),
    start: isFinite(+t.start) ? +t.start : 0, // seconds of the song, before Sync
    syncMs: isFinite(+t.sync_ms) ? Math.round(+t.sync_ms) : 0,
    channels: t.channels === 1 ? 1 : 2,
    input: t.input ? String(t.input) : "",
    recorded: t.recorded ? String(t.recorded) : "",
    tempoPercent: isFinite(+t.tempo_percent) ? +t.tempo_percent : 100,
    semitones: isFinite(+t.transpose_semitones) ? Math.round(+t.transpose_semitones) : 0,
    info,
    saved: true, // its MP3 is in the song's file
    mp3: null, // the MP3 in memory, until it is in the file
    crc: null,
  };
}

// Its entry in manifest.audio.takes.
export function takeToManifest(t) {
  return {
    id: t.id,
    title: t.title,
    member: t.member,
    start: Math.round(t.start * 1e6) / 1e6,
    sync_ms: t.syncMs,
    channels: t.channels,
    input: t.input,
    recorded: t.recorded,
    tempo_percent: t.tempoPercent,
    transpose_semitones: t.semitones,
  };
}

// The song sample where a take plays from, Sync included.
export const takeStartSample = (take, rate) => Math.round((take.start + take.syncMs / 1000) * rate);

// A take of a project, decoded at the context's sample rate: a track.
export async function decodeTake(zip, take, context) {
  const bytes = await zip.bytes(take.member);
  const buffer = await context.decodeAudioData(bytes.buffer);
  const align = checkAlignment(buffer.length, take.info, context.sampleRate);
  return {
    key: takeKey(take.id),
    member: take.member,
    title: take.title,
    bus: "pitched",
    channels: toInt16(buffer, align.trimStart, align.length),
    length: align.length,
    align,
    start: takeStartSample(take, context.sampleRate),
    take,
  };
}

// Samples an MP3 decoder adds in front of the encoder delay (MP3 standard).
const MP3_DECODER_DELAY = 529;

// Volume slider 0-200 to gain, as _slider_to_gain() in EUTERIA (Python):
// 0-100 is a plain percentage, 100-200 rises to x10 (+20 dB).
export const BOOST_CEILING = 10;
export function sliderToGain(v) {
  v = Math.min(200, Math.max(0, +v));
  return v <= 100 ? v / 100 : 1 + ((v - 100) / 100) * (BOOST_CEILING - 1);
}
export function gainToSlider(g) {
  g = Math.min(BOOST_CEILING, Math.max(0, +g));
  return Math.round(g <= 1 ? g * 100 : 100 + ((g - 1) / (BOOST_CEILING - 1)) * 100);
}

// The imported file's name without its extension, as in EUTERIA (Python).
function songName(manifest) {
  const original = (manifest.audio && manifest.audio.original_filename) || "";
  const stem = original.replace(/\.[^./\\]*$/, "");
  return stem || manifest.title || "EUTERIA";
}

// Stem keys sorted by their display name: Bass, Drums, Guitar, Other, Piano, Vocals.
function stemsInExportOrder(keys) {
  return keys.filter((k) => STEM_NAMES.includes(k)).sort((a, b) => TRACK_TITLES[a].localeCompare(TRACK_TITLES[b]));
}

// "<song>_BassDrumsVocals.mp3", as stems_export_file_name() in EUTERIA (Python).
// `extra`: what follows the stems, as "Original" or "Take1".
export function stemsExportFileName(song, keys, extra = []) {
  let name = (song || "").replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
  name = name.replace(/\s+/g, " ").replace(/^[ .]+|[ .]+$/g, "").slice(0, 120) || "EUTERIA";
  const parts = [...stemsInExportOrder(keys).map((k) => TRACK_TITLES[k]), ...extra.map((x) => String(x).replace(/[^A-Za-z0-9]+/g, ""))];
  return `${name}_${parts.join("")}.mp3`;
}

// How a decoded track lines up with the exact length written in the manifest.
// Decoders that honour the MP3 LAME tag return exactly the original samples;
// the others keep the encoder priming samples, which are removed here.
export function checkAlignment(decodedLength, info, rate) {
  if (!info || !info.frames || !info.sample_rate) {
    return { status: "unchecked", expected: null, diff: 0, trimStart: 0, length: decodedLength };
  }
  const ratio = rate / info.sample_rate;
  const expected = Math.round(info.frames * ratio);
  const diff = decodedLength - expected;
  const tolerance = Math.max(2, Math.ceil(2 * ratio));
  if (Math.abs(diff) <= tolerance) {
    return { status: "exact", expected, diff, trimStart: 0, length: Math.min(expected, decodedLength) };
  }
  if (info.codec === "mp3" && info.encoder_delay != null) {
    const delay = info.encoder_delay;
    const padding = info.padding || 0;
    for (const lead of [delay + MP3_DECODER_DELAY, delay, MP3_DECODER_DELAY]) {
      for (const tail of [padding, Math.max(0, padding - MP3_DECODER_DELAY), 0, padding + MP3_DECODER_DELAY]) {
        if (Math.abs(diff - Math.round((lead + tail) * ratio)) <= tolerance) {
          const trimStart = Math.round(lead * ratio);
          return { status: "realigned", expected, diff, trimStart, length: Math.min(expected, decodedLength - trimStart) };
        }
      }
    }
  }
  return { status: "mismatch", expected, diff, trimStart: 0, length: Math.min(expected, decodedLength) };
}

// 16-bit copies of the decoded channels (at most two), from `start`, `length` samples.
export function toInt16(buffer, start, length) {
  const channels = [];
  for (let c = 0; c < Math.min(2, buffer.numberOfChannels); c++) {
    const src = buffer.getChannelData(c);
    const dst = new Int16Array(length);
    const end = Math.min(length, src.length - start);
    for (let i = 0; i < end; i++) {
      let v = src[start + i];
      v = v < -1 ? -1 : v > 1 ? 1 : v;
      dst[i] = v < 0 ? v * 32768 : v * 32767;
    }
    channels.push(dst);
  }
  return channels;
}

// Opens a project file and decodes its tracks at the context's sample rate.
// onProgress(done, total, key) is called before each track.
export async function openProject(file, context, onProgress = () => {}) {
  const zip = await openZip(file);
  if (!zip.has("manifest.json")) throw new Error("This file is not an EUTERIA project (no manifest.json).");
  const manifest = JSON.parse(await zip.text("manifest.json"));
  const audio = manifest.audio || {};
  const info = audio.tracks || {};
  const members = [["original", audio.original_member]];
  for (const stem of STEM_NAMES) members.push([stem, (audio.stems || {})[stem]]);
  const present = members.filter(([, member]) => member && zip.has(member));
  if (!present.length) throw new Error("This project has no audio.");
  const takeList = (Array.isArray(audio.takes) ? audio.takes : [])
    .filter((t) => t && t.id && typeof t.member === "string" && zip.has(t.member))
    .map((t) => takeFromManifest(t, info[t.member] || null));
  const total = present.length + takeList.length;

  const tracks = [];
  for (let i = 0; i < present.length; i++) {
    const [key, member] = present[i];
    onProgress(i, total, key);
    const t0 = performance.now();
    const bytes = await zip.bytes(member);
    const size = bytes.byteLength;
    const t1 = performance.now();
    const buffer = await context.decodeAudioData(bytes.buffer);
    const t2 = performance.now();
    const align = checkAlignment(buffer.length, info[member], context.sampleRate);
    const channels = toInt16(buffer, align.trimStart, align.length);
    tracks.push({
      key,
      member,
      title: TRACK_TITLES[key],
      bus: key === "drums" ? "drums" : "pitched",
      channels,
      length: align.length,
      align,
      fileBytes: size,
      readMs: t1 - t0,
      decodeMs: t2 - t1,
    });
  }
  const takes = [];
  for (let j = 0; j < takeList.length; j++) {
    onProgress(present.length + j, total, takeKey(takeList[j].id));
    takes.push(await decodeTake(zip, takeList[j], context));
  }
  onProgress(total, total, null);

  // The full mix must line up with the stems whatever the browser's decoder did.
  const t3 = performance.now();
  const alignment = alignOriginal(tracks, context.sampleRate);
  alignment.measureMs = performance.now() - t3;

  const practice = manifest.practice || {};
  const order = Array.isArray(practice.stem_order) && [...practice.stem_order].sort().join() === [...STEM_NAMES].sort().join()
    ? practice.stem_order
    : STEM_NAMES;
  tracks.sort((a, b) => (a.key === "original" ? -1 : b.key === "original" ? 1 : order.indexOf(a.key) - order.indexOf(b.key)));
  const enabled = practice.track_enabled || {};
  const volumes = practice.track_volumes || {};
  for (const t of tracks) {
    t.on = t.key in enabled ? !!enabled[t.key] : t.key === "original";
    t.gain = Math.min(BOOST_CEILING, Math.max(0, volumes[t.key] ?? 1));
  }
  // The takes after the song's own tracks, in the order they were recorded.
  for (const t of takes) {
    t.on = t.key in enabled ? !!enabled[t.key] : true;
    t.gain = Math.min(BOOST_CEILING, Math.max(0, volumes[t.key] ?? 1));
  }
  const length = Math.max(...tracks.map((t) => t.length));
  return {
    manifest,
    title: manifest.title || songName(manifest),
    songName: songName(manifest),
    tracks: [...tracks, ...takes],
    alignment,
    sampleRate: context.sampleRate,
    duration: length / context.sampleRate,
  };
}
