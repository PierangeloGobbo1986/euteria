# EUTERIA Web

Practise with the separated parts of a song, in the browser: switch instruments on
and off, change tempo and key in real time, loop a passage, follow the bar grid and
the chords, and export the parts you need as MP3.

**Status: in development.** Phase 0 (feasibility tests on real devices) is starting.
The app is not usable yet.

Live site: https://pierangelogobbo1986.github.io/euteria/

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

## Roadmap

- **Phase 0**: feasibility tests on real devices: audio engine on iPhone, opening
  `.euteria` files with exact alignment, MP3 export and sharing, in-browser
  separation on a computer.
- **Phase 1**: listening mode.
- **Phase 2**: full mode with in-browser separation.
- **Phase 3**: band features.

## Licence

Copyright (c) 2026 Pierangelo Gobbo. All rights reserved. No licence is granted:
using, copying or modifying this software requires the written permission of the
copyright holder. See [LICENSE](LICENSE). Third-party components keep their own
licences, listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
