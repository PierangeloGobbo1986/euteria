"""Fixes the ONNX conversion of the small model of Beat This! (small0.onnx from
huggingface.co/ashudesai/songbird-models, SHA-256 c462b064a4033050ca6a5354bf866ff4610ab1fd8f1dec1e494b20b22d870aea).

Its rotary position table (rotary-embedding-torch's cached frequencies, 8192 positions x 32, shared by
every attention of the model) was written while only the first 300 positions had been computed (the
conversion traced the model on 300 frames): rows 300 to 8191 are zeros, so the model loses track of
where it is after 300 frames (6 s). Each row is its position times the frequencies of row 1
(theta 10000), so the table is written again, whole. Nothing else changes.

    python3 fix_rotary.py small0.onnx small0-fixed.onnx
"""
import sys

import numpy as np
import onnx
from onnx import numpy_helper

src, dst = sys.argv[1], sys.argv[2]
model = onnx.load(src)
done = 0
for node in model.graph.node:
    if node.op_type != "Constant":
        continue
    for attr in node.attribute:
        if attr.name != "value":
            continue
        table = numpy_helper.to_array(attr.t)
        if table.shape != (8192, 32):
            continue
        filled = np.where(np.abs(table).sum(1) > 0)[0]
        row = table[1].astype(np.float64)
        assert all(np.allclose(table[p], p * row, rtol=1e-5, atol=1e-4) for p in range(filled[-1] + 1)), "not a rotary table"
        fixed = (np.arange(8192, dtype=np.float64)[:, None] * row[None, :]).astype(np.float32)
        assert np.allclose(fixed[: filled[-1] + 1], table[: filled[-1] + 1], rtol=1e-6, atol=1e-5)
        attr.t.CopyFrom(numpy_helper.from_array(fixed, attr.t.name))
        print(f"{node.output[0]}: rows filled 0..{filled[-1]} of 8192, now all")
        done += 1
assert done == 1, f"expected one table, found {done}"
onnx.save(model, dst)
