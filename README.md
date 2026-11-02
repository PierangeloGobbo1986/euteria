# EUTERIA Web

Practise with the separated parts of a song, in the browser: switch instruments on
and off, change tempo and key in real time, loop a passage, follow the bar grid and
the chords, and export the parts you need as MP3.

**Status: in development.** Phase 0 (feasibility tests on real devices) is under way;
the app itself is not usable yet.

- Live site: https://pierangelogobbo1986.github.io/euteria/
- Phase 0 test page: https://pierangelogobbo1986.github.io/euteria/lab/

## How it will work

Two modes, chosen from what the device can do:

- **Full mode** (computer with Chrome or Edge and WebGPU): import songs and separate
  them into six stems (vocals, drums, bass, guitar, piano, other) inside the browser,
  plus everything in listening mode.
- **Listening mode** (phones, tablets, Safari, Firefox): open a project, choose the
  stems, set volumes, change tempo and key, loop, bar grid, metronome, chords, MP3
  export and sharing. A banner explains how to reach the full mode.

There is no server and no account: the audio stays on each device, and projects
travel as files (for example over WhatsApp).

## Project files

- **`.euteria`**: light project for EUTERIA Web, written by EUTERIA (Python) with
  *Export for Webapp version*. A zip (members stored, not compressed) holding
  `manifest.json`, `audio/original.mp3` and `audio/stems/<stem>.mp3` (MP3, 320 kbps
  CBR, no ID3 tags). The manifest is the one of `.musicproj` with `format_version` 4,
  `variant: "web"` and `audio.tracks`, which gives for every audio member its codec,
  bitrate, sample rate, channels, exact length in samples (`frames`), and the MP3
  encoder delay and padding read from the LAME/Info tag. Transposed tracks are left
  out: EUTERIA Web transposes live. Since EUTERIA 4.3 every track is at 48 kHz (the
  stems' rate; the Original Track is resampled when needed) and as long as the
  Original Track, so that every browser decodes them all alike. Files from 4.2 keep
  the Original Track at its own rate; they still open, and the web app lines the
  Original Track up with the stems (see below).
- **`.musicproj`**: full project written by EUTERIA (Python), same layout with 16-bit
  WAV audio.

## Phase 0 test page (`lab/`)

Open it on each device (phone, tablet, computer) and go through the cards in order:

1. **This device**: browser, memory, audio support, WebGPU, and the mode the device
   would get (full or listening).
2. **Open a song**: a `.euteria` file (or a `.musicproj`). Every track is decoded, its
   length checked against the manifest, and the Original Track compared with the stems
   and lined up with them if a decoder shifted it. **Sync test** opens a small built-in
   project in the EUTERIA 4.3 format whose tracks all have a click at exactly 1.000 s,
   and reports how far each track lands from it, in samples; **Sync test, old format**
   does the same with the EUTERIA 4.2 format (Original Track at 44.1 kHz).
3. **Play**: switch tracks on and off, volumes up to 200% (+20 dB), tempo 50-200%,
   key ±12 semitones (drums excluded), loop.
4. **Export MP3**: the stems that are on, as they sound, named `Song_BassDrumsVocals.mp3`.
   Every export joins a list: tick the files you want, then **Download selected** saves
   them as separate files (the browser may ask once to allow several downloads); on
   phones and tablets **Share selected…** opens the share sheet (WhatsApp, Save to Files).
5. **Stress test**: loads a synthetic seven-track song of 1, 3, 5 or 8 minutes to find
   how much audio the device can hold. If the page reloads by itself, the next visit
   reports which step was interrupted.
6. **Engine speed**: how many times faster than real time the engine runs on this
   device with all tracks on, and its slowest moments (a single audio block, and a
   stretch of about 23 ms) against the time playback gives them.
7. **Separation (computer)**: separates the Original Track of the open song, or an
   audio file, into the six stems in the browser (Chrome or Edge with WebGPU), and
   reports the speed. With a project that already has stems from EUTERIA (Python),
   the new stems join the track list next to them ("Vocals · web" and so on) and the
   report gives, for each pair, how close they are (SI-SDR in dB, correlation, level).
   Options: the model at half or full precision, the rate it runs at (44.1 kHz, the
   rate it was trained at, or 48 kHz, as EUTERIA (Python) runs it), the ONNX Runtime
   build (1.24, 1.31, or 1.31 with the graph optimiser), and the overlap between
   blocks (50% as EUTERIA (Python), or 25%, a third less time). **Compare runtimes**
   times the first blocks of the open song with each runtime, estimates the time for
   the whole song, profiles the graphics card with ONNX Runtime 1.24 (time per kind
   of operation), and selects the fastest runtime.

**Copy report** puts every result in the clipboard, ready to paste back.

## How the audio engine works

All tracks are held as 16-bit PCM in one AudioWorklet (`src/engine-processor.js`,
`src/engine-core.js`). The tracks that are on are mixed sample by sample into two
buses, the pitched instruments with the full mix, and the drums, and each bus runs
through one [Signalsmith Stretch](https://signalsmith-audio.co.uk/code/stretch/)
instance. Tempo and key change live, the tracks cannot drift apart, and the drums keep
their pitch, as in EUTERIA (Python). Volumes above 100% use the same soft limiter as
EUTERIA (Python), and the sum goes through it too during playback.

The stretchers run at Signalsmith's default quality (120 ms blocks every 30 ms) with
the work of each block spread over the audio callbacks: done all at once, it
overflowed single callbacks on phones and playback crackled. The song is streamed
into them a few samples per callback; they are primed again only when playback starts
or jumps, and a loop is a sample-exact splice (loop end followed by loop start), so it
never drifts.

The same engine code runs in a Web Worker (`src/render-worker.js`) for the MP3 export,
which is encoded with LAME compiled to WebAssembly. The export renders the song twice:
the first pass finds the peak, the second lowers the whole song under -1 dBFS if
needed and encodes it, as EUTERIA (Python) does, so memory stays flat whatever the
length. The PCM of the tracks is lent to the worker during an export (moved, not
copied), so an export does not double the memory in use.

When a project opens, `src/align.js` compares the Original Track with the sum of the
stems (cross-correlation of their energy envelopes, as `measure_alignment_offset()`
in EUTERIA (Python)) and shifts the Original Track when a browser's decoder placed it
more than 5 ms away. Safari, for one, decoded a 44.1 kHz MP3 one MP3 frame early.

## How the separation works

The model is the one of EUTERIA (Python): BS-RoFormer SW, six stems (vocals, drums,
bass, guitar, piano, other). In the browser it runs as the ONNX conversion published
by [bs-roformer-web](https://github.com/elicwhite/bs-roformer-web): the checkpoint
without its STFT, fixed at 345 STFT frames (176128 samples), at half (336 MB) or full
(669 MB) precision. It is downloaded from Hugging Face the first time and kept in the
browser's private storage (OPFS); it is not part of this repository.

`src/separate-worker.js` runs it in a Web Worker with
[ONNX Runtime Web](https://onnxruntime.ai) on the graphics card (WebGPU), loaded from
the jsDelivr CDN. The worker computes the STFT and the inverse STFT itself
(`src/stft.js`, identical to `torch.stft` / `torch.istft` as the model uses them) and
cuts the song as `demix_track()` does in EUTERIA (Python): chunks that overlap by
half (or by a quarter, which needs a third fewer chunks), linear fades a tenth of a
chunk long, mirrored edges. The inverse STFT of a chunk runs while the graphics card
computes the next one.

Before the session is created, `src/onnx-rewrite.js` rewrites the attention of the
model: its `Einsum` nodes (queries times keys, weights times values) become
`MatMul` nodes, with a `Transpose` where needed. The result is the same, but ONNX
Runtime computes `Einsum` with a generic kernel: on an Apple graphics card these 48
nodes took three quarters of the time of every block, each holding the card for
about a tenth of a second, which most likely is also what made Chrome stutter. The model
file is edited in memory, at the level of its protobuf encoding; the downloaded file
stays as it is. Rates are converted with
`src/resample.js`, the same filter as `scipy.signal.resample_poly`.

The whole chain was checked against PyTorch with a small model of the same
architecture and random weights, exported the same way: on the CPU the stems agree
to within rounding, on WebGPU to within the graphics card's arithmetic.

Graphics cards whose WebGPU lacks 16-bit floats cannot run the half-precision model
(it would return silence instead of failing): there the Lab offers full precision
only, and the worker refuses the half-precision model. Any chunk that comes back
silent or not finite stops the separation with an error.

## Repository layout

- `index.html`: the app (a placeholder for now).
- `lab/`: the Phase 0 test page, and the sync test projects `sync-test.euteria`
  (EUTERIA 4.3 format) and `sync-test-old.euteria` (4.2 format).
- `src/`: shared code: project files (`zip.js`, `project.js`), the alignment of the
  Original Track (`align.js`), the audio engine (`engine*.js`), the export worker
  (`render-worker.js`), the separation (`separation.js`, `separate-worker.js`,
  `stft.js`, `resample.js`, `onnx-rewrite.js`), device checks (`device.js`) and the
  synthetic test song (`synth.js`).
- `lib/`: third-party components, unchanged, each with its licence.

The site is plain HTML, CSS and JavaScript modules: there is no build step, and the
repository is published as it is by GitHub Pages.

## Roadmap

- **Phase 0**: feasibility tests on real devices: audio engine on iPhone, opening
  `.euteria` files with exact alignment, MP3 export and sharing (done), then
  in-browser separation on a computer (test page online).
- **Phase 1**: listening mode.
- **Phase 2**: full mode with in-browser separation.
- **Phase 3**: band features.

## Licence

Copyright (c) 2026 Pierangelo Gobbo. All rights reserved. No licence is granted:
using, copying or modifying this software requires the written permission of the
copyright holder. See [LICENSE](LICENSE). Third-party components keep their own
licences, listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
