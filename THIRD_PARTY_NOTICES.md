# Third-party notices

EUTERIA Web includes or downloads the components listed here. Each keeps its own
licence; the EUTERIA licence (see LICENSE) does not apply to them.

## Signalsmith Stretch 1.3.2

Time stretching and pitch shifting. `lib/signalsmith-stretch/signalsmith-module.js`
is the WebAssembly module factory of the npm package `signalsmith-stretch`, unchanged
except for a header comment and one line that makes it visible to the other worklet
modules.

- Copyright (c) 2022 Geraint Luff / Signalsmith Audio Ltd.
- MIT License: `lib/signalsmith-stretch/LICENSE.txt`
- https://signalsmith-audio.co.uk/code/stretch/

## wasm-media-encoders 0.7.0 and LAME 3.100

MP3 encoding. `lib/wasm-media-encoders/WasmMediaEncoder.min.js` (loader) and
`mp3.wasm` (LAME compiled to WebAssembly) from the npm package `wasm-media-encoders`,
unchanged.

- wasm-media-encoders: Copyright (c) 2020-2024 arseneyr, MIT License:
  `lib/wasm-media-encoders/LICENSE.txt`, https://github.com/arseneyr/wasm-media-encoders
- LAME: GNU Library General Public License version 2 or later:
  `lib/wasm-media-encoders/LAME-LGPL-2.0.txt`, https://lame.sourceforge.io.
  `mp3.wasm` is loaded as a separate file and can be replaced with another build.
