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

## Loaded at run time, not included

These are fetched by the browser when the separation test of the Lab runs; they
are not part of this repository.

### ONNX Runtime Web 1.24.0-dev.20251116 and 1.31.1

Runs the separation model. Loaded from the jsDelivr CDN (npm package
`onnxruntime-web`).

- Copyright (c) Microsoft Corporation. MIT License.
- https://github.com/microsoft/onnxruntime

### BS-RoFormer SW, ONNX conversion

The six-stem separation model, downloaded from Hugging Face
(`elicwhite/bs-roformer-sw-6stem-onnx`) the first time and kept in the browser.

- Conversion: bs-roformer-web, Copyright (c) 2026 Eli White, MIT License,
  https://github.com/elicwhite/bs-roformer-web
- Architecture: BS-RoFormer by Phil Wang (lucidrains), MIT License, and
  Music-Source-Separation-Training by Roman Solovyev (ZFTurbo), MIT License.
- Weights: BS-RoFormer SW by jarredou, published without a stated licence; EUTERIA
  (Python) uses the same weights.

The chunking of `src/separate-worker.js` follows `demix_track()` of
Music-Source-Separation-Training (as packaged in bs-roformer-infer, MIT License).

### Beat This!, ONNX conversion

The beat and downbeat tracker of the tempo detection, downloaded from Hugging Face
(`musetric/beat-this-onnx`, file `beat_this.onnx`) the first time and kept in the
browser.

- Beat This! by Francesco Foscarin, Jan Schlüter and Gerhard Widmer (Johannes Kepler
  University Linz, ISMIR 2024), model `final0`, MIT License,
  https://github.com/CPJKU/beat_this
- ONNX conversion with a fixed window of 1500 frames: musetric, MIT License,
  https://huggingface.co/musetric/beat-this-onnx

The spectrogram (`src/melspec.js`), the windows and the peak picking of
`src/beats-worker.js` follow `LogMelSpect`, `split_piece`, `aggregate_prediction` and
the minimal `Postprocessor` of the `beat_this` package (MIT License).

### BTC, chord recognition

The chord model, kept in this repository as `models/btc/btc_large_voca.onnx`: the
weights of BTC's large-vocabulary model (`test/btc_model_large_voca.pt`), unchanged,
written as an ONNX graph by `models/btc/convert.py`.

- BTC (Bi-directional Transformer for Chord recognition) by Jonggwon Park, Kyoyun Choi,
  Sungwook Jeon, Dongheon Kim and Jonghun Park (ISMIR 2019).
- Copyright (c) 2019 Jonggwon Park, MIT License: `models/btc/LICENSE`
- https://github.com/jayg996/BTC-ISMIR19

The constant-Q transform of `src/cqt.js` follows `cqt()` of librosa 0.6.3 (ISC
License, https://github.com/librosa/librosa), with the coefficients of the
`kaiser_fast` filter of resampy 0.2.2 (ISC License, https://github.com/bmcfee/resampy)
at the ratio 1/2.

