# Beat This! (small), the tempo model of EUTERIA Web on phones

`small0.onnx` is the small model of **Beat This!** (Francesco Foscarin, Jan Schlüter and
Gerhard Widmer, "Beat this! Accurate beat tracking without DBN postprocessing", ISMIR 2024),
checkpoint `small0` (2.1 million parameters), from
[CPJKU/beat_this](https://github.com/CPJKU/beat_this), under the MIT licence in `LICENSE`.
EUTERIA Web runs it on the CPU (WebAssembly) on phones and tablets, and in browsers and on
computers without a graphics card WebGPU can use; a computer with Chrome or Edge and such a
graphics card runs the full model (`final0`, about 191 MB, from
[musetric/beat-this-onnx](https://huggingface.co/musetric/beat-this-onnx)) on it.

## Where it comes from

The ONNX conversion is the one published in
[ashudesai/songbird-models](https://huggingface.co/ashudesai/songbird-models) (`small0.onnx`,
MIT, made with `torch.onnx.export`, opset 14): 10,401,044 bytes, SHA-256
`c462b064a4033050ca6a5354bf866ff4610ab1fd8f1dec1e494b20b22d870aea`.

## What was fixed

Its table of rotary positions (rotary-embedding-torch's cached frequencies, 8192 positions ×
32, shared by every attention of the model) was written while only the first 300 positions had
been computed: the conversion traced the model on 300 frames, so rows 300 to 8191 were zeros
and the model lost track of where it was after 6 s of a window (the same music, moved past
frame 300 of a window, was no longer found). Each row of the table is its position times the
frequencies of row 1 (theta 10000), so `fix_rotary.py` writes the table again, whole; nothing
else changes. The fixed file (in this folder) is 10,401,044 bytes, SHA-256
`463a3dabe3764aa1367ea70cf815a54335cc826674f212b723e890fdccbab6be`.

- Input `spectrogram` [batch, time, 128]: the log-mel spectrogram of Beat This! (22050 Hz,
  50 frames a second, 128 bands; `src/melspec.js`), taken in windows of 1500 frames as for the
  full model (`src/beats-worker.js`).
- Outputs `beat` and `downbeat` [batch, time]: a logit per frame. EUTERIA Web counts a beat
  from a logit of −1 (the full model: 0) and a downbeat from 0.

Measured in EUTERIA Web on the CPU, on test songs whose beats are known (beats and downbeats
found within 70 ms, F-measure): a band at 96 BPM 0.96 and 0.97, clicks at 120 BPM 0.99 and
1.00, a waltz of clicks at 93.5 BPM 0.97 and 0.89; the grid made from them had the tempo, the
meter and the first downbeat right in each. Before the fix, in windows of 1500 frames: 0.61 and
0.17 on the band (the grid at 288 BPM).
