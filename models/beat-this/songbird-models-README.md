---
license: mit
tags:
  - audio
  - beat-tracking
  - music
  - onnx
  - mir
---

# Beat This! ONNX Models

ONNX conversions of the [Beat This!](https://github.com/CPJKU/beat_this) beat and downbeat tracking models from Johannes Kepler University Linz (ISMIR 2024).

## Models

| Model | Parameters | Size | Description |
|-------|-----------|------|-------------|
| `final0.onnx` | 20.3M | ~80 MB | Main model, seed 0 (default) |
| `final1.onnx` | 20.3M | ~80 MB | Main model, seed 1 |
| `final2.onnx` | 20.3M | ~80 MB | Main model, seed 2 |
| `small0.onnx` | 2.1M | ~10 MB | Small model, seed 0 |
| `small1.onnx` | 2.1M | ~10 MB | Small model, seed 1 |
| `small2.onnx` | 2.1M | ~10 MB | Small model, seed 2 |

The `final` and `small` variants are the same architecture trained with different random seeds for statistical robustness. Performance is essentially equivalent across seeds. The `small` models are faster but slightly less accurate.

## Input/Output

- **Input**: `input_spectrogram` — mel spectrogram tensor of shape `(batch, time, 128)` where time is variable length (128 mel bins)
- **Output**: `beat` — beat logits of shape `(batch, time)`, `downbeat` — downbeat logits of shape `(batch, time)`

Apply sigmoid to convert logits to probabilities, then use peak picking to extract beat/downbeat positions.

## Usage with Rust (beat-this crate)

```rust
use beat_this::{BeatThis, OrtRuntime};

let runtime = OrtRuntime;
let tracker = BeatThis::new(&runtime, "final0.onnx")?;
let analysis = tracker.analyze_file("audio.wav")?;
```

See [danigb/beat-this-rs](https://github.com/danigb/beat-this-rs) for the Rust implementation.

## Usage with Python (ONNX Runtime)

```python
import onnxruntime as ort
import numpy as np

sess = ort.InferenceSession("final0.onnx")
# spect: mel spectrogram of shape (1, num_frames, 128)
beat, downbeat = sess.run(None, {"input_spectrogram": spect})
```

## Citation

```bibtex
@inproceedings{foscarin2024beatthis,
  title={Beat This! Accurate Beat Tracking Without DBN Postprocessing},
  author={Foscarin, Francesco and Schl{\"u}ter, Jan and Widmer, Gerhard},
  booktitle={Proceedings of the 25th International Society for Music Information Retrieval Conference (ISMIR)},
  year={2024}
}
```

## License

MIT — same as the original [CPJKU/beat_this](https://github.com/CPJKU/beat_this).

## Converted by

Converted from upstream PyTorch Lightning checkpoints hosted at `cloud.cp.jku.at` using `torch.onnx.export` (opset 14, TorchScript tracer). Verified with ONNX Runtime (max abs diff < 0.00002 vs PyTorch).
