# BTC, the chord model of EUTERIA Web

`btc_large_voca.onnx` is the large-vocabulary model of **BTC** (Bi-directional
Transformer for Chord recognition: Jonggwon Park, Kyoyun Choi, Sungwook Jeon, Dongheon
Kim and Jonghun Park, "A Bi-directional Transformer for Musical Chord Recognition",
ISMIR 2019), from [jayg996/BTC-ISMIR19](https://github.com/jayg996/BTC-ISMIR19)
(`test/btc_model_large_voca.pt`), under the MIT licence in `LICENSE`.

The weights are BTC's, unchanged, written as an ONNX graph by `convert.py` (numpy and
onnx, no PyTorch): the same layers as `btc_model.py` and `utils/transformer_modules.py`
in evaluation mode, with basic operators only (opset 17), so that ONNX Runtime Web runs
it on the graphics card and on the CPU. Checked against a numpy copy of the model: the
largest difference in the logits is 1.4e-5.

- Input `features` [batch, 108, 144]: 108 frames (10 s) of log(|CQT| + 1e-6), the
  constant-Q transform of librosa 0.6.3 (22050 Hz, hop 2048, 144 bins from C1, 24 per
  octave, computed per chunk of 10 s; `src/cqt.js`), normalised with the checkpoint's
  mean (−2.2279878897355596) and standard deviation (1.7191329394436938).
- Output `logits` [batch, 108, 170]: per frame, 12 roots × 14 qualities (min, maj, dim,
  aug, min6, maj6, min7, minmaj7, maj7, 7, dim7, hdim7, sus2, sus4), then X (unknown)
  and N (no chord); the label of class i is root i / 14 (C, C#, … B) and quality i % 14.

SHA-256 of `btc_large_voca.onnx`:
`02184caa013dfcf9cccfe71712ff5e595a6e047b7d1f79dbeec79e6b219c4e30` (11 945 151 bytes).
