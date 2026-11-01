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

- **`.euteria`**: light project for EUTERIA Web, written by EUTERIA (Python) 4.2 with
  *Export for Webapp version*. A zip (members stored, not compressed) holding
  `manifest.json`, `audio/original.mp3` and `audio/stems/<stem>.mp3` (MP3, 320 kbps
  CBR, no ID3 tags). The manifest is the one of `.musicproj` with `format_version` 4,
  `variant: "web"` and `audio.tracks`, which gives for every audio member its codec,
  bitrate, sample rate, channels, exact length in samples (`frames`), and the MP3
  encoder delay and padding read from the LAME/Info tag. Transposed tracks are left
  out: EUTERIA Web transposes live.
- **`.musicproj`**: full project written by EUTERIA (Python), same layout with 16-bit
  WAV audio.

## Phase 0 test page (`lab/`)

Open it on each device (phone, tablet, computer) and go through the cards in order:

1. **This device**: browser, memory, audio support, WebGPU, and the mode the device
   would get (full or listening).
2. **Open a song**: a `.euteria` file (or a `.musicproj`). Every track is decoded and its
   length checked against the manifest. **Sync test** opens a small built-in project
   whose tracks all have a click at exactly 1.000 s and reports how far each track lands
   from it, in samples.
3. **Play**: switch tracks on and off, volumes up to 200% (+20 dB), tempo 50-200%,
   key ±12 semitones (drums excluded), loop, and the engine quality setting.
4. **Export MP3**: the stems that are on, as they sound, named `Song_BassDrumsVocals.mp3`;
   then **Share** (WhatsApp, Save to Files) or **Download**.
5. **Stress test**: loads a synthetic seven-track song of 1, 3, 5 or 8 minutes to find
   how much audio the device can hold. If the page reloads by itself, the next visit
   reports which step was interrupted.
6. **Engine speed**: how many times faster than real time the engine runs on this
   device, with all tracks on.

**Copy report** puts every result in the clipboard, ready to paste back.

## How the audio engine works

All tracks are held as 16-bit PCM in one AudioWorklet (`src/engine-processor.js`,
`src/engine-core.js`). The tracks that are on are mixed sample by sample into two
buses, the pitched instruments with the full mix, and the drums, and each bus runs
through one [Signalsmith Stretch](https://signalsmith-audio.co.uk/code/stretch/)
instance. Tempo and key change live, the tracks cannot drift apart, and the drums keep
their pitch, as in EUTERIA (Python). Volumes above 100% use the same soft limiter as
EUTERIA (Python). The same engine code runs in a Web Worker (`src/render-worker.js`)
for the MP3 export, which is encoded with LAME compiled to WebAssembly. The PCM of
the tracks is lent to the worker during an export (moved, not copied), so an export
does not double the memory in use.

## Repository layout

- `index.html`: the app (a placeholder for now).
- `lab/`: the Phase 0 test page, and `sync-test.euteria`.
- `src/`: shared code: project files (`zip.js`, `project.js`), the audio engine
  (`engine*.js`), the export worker (`render-worker.js`), device checks (`device.js`)
  and the synthetic test song (`synth.js`).
- `lib/`: third-party components, unchanged, each with its licence.

The site is plain HTML, CSS and JavaScript modules: there is no build step, and the
repository is published as it is by GitHub Pages.

## Roadmap

- **Phase 0**: feasibility tests on real devices: audio engine on iPhone, opening
  `.euteria` files with exact alignment, MP3 export and sharing (test page online),
  then in-browser separation on a computer (next).
- **Phase 1**: listening mode.
- **Phase 2**: full mode with in-browser separation.
- **Phase 3**: band features.

## Licence

Copyright (c) 2026 Pierangelo Gobbo. All rights reserved. No licence is granted:
using, copying or modifying this software requires the written permission of the
copyright holder. See [LICENSE](LICENSE). Third-party components keep their own
licences, listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
