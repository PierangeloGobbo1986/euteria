"""Converts BTC's large-vocabulary checkpoint (jayg996/BTC-ISMIR19,
test/btc_model_large_voca.pt, MIT) into btc_large_voca.onnx for EUTERIA Web,
without PyTorch: the checkpoint (an old-style torch.save file) is read by a
restricted unpickler that knows only the few names such a file needs, and the
model of btc_model.py and utils/transformer_modules.py is written as an ONNX
graph (opset 17, basic operators). Input "features" [B, 108, 144]: log(|CQT| +
1e-6) normalised with the checkpoint's mean and std (stored in the model's
metadata); output "logits" [B, 108, 170].

Needs numpy and onnx. Usage: python3 -I convert.py btc_model_large_voca.pt btc_large_voca.onnx
"""
import collections, math, pickle, struct, sys
import numpy as np
import onnx
from onnx import helper, numpy_helper, TensorProto

DTYPES = {"FloatStorage": np.float32, "DoubleStorage": np.float64, "LongStorage": np.int64,
          "IntStorage": np.int32, "HalfStorage": np.float16, "ByteStorage": np.uint8}

class StorageType:
    def __init__(self, name): self.name = name

class Storage:
    def __init__(self, dtype, key, size): self.dtype, self.key, self.size, self.data = dtype, key, size, None

class Tensor:
    def __init__(self, storage, offset, size, stride): self.storage, self.offset, self.size, self.stride = storage, offset, tuple(size), tuple(stride)
    def array(self):
        base = self.storage.data
        item = base.itemsize
        return np.lib.stride_tricks.as_strided(base[self.offset:], shape=self.size, strides=[s * item for s in self.stride]).copy()

def rebuild_v2(storage, offset, size, stride, requires_grad=False, hooks=None, *rest):
    return Tensor(storage, offset, size, stride)

def rebuild(storage, offset, size, stride):
    return Tensor(storage, offset, size, stride)

storages = {}

class U(pickle.Unpickler):
    def find_class(self, module, name):
        if module == "collections" and name == "OrderedDict": return collections.OrderedDict
        if module == "torch._utils" and name == "_rebuild_tensor_v2": return rebuild_v2
        if module == "torch._utils" and name == "_rebuild_tensor": return rebuild
        if module == "torch" and name in DTYPES: return StorageType(name)
        if module in ("numpy.core.multiarray", "numpy._core.multiarray") and name == "scalar":
            return lambda dt, b: np.frombuffer(b, dtype=dt)[0]
        if module == "numpy" and name == "dtype": return np.dtype
        if module == "_codecs" and name == "encode":
            import codecs; return codecs.encode
        if module in ("numpy.core.multiarray", "numpy._core.multiarray") and name == "_reconstruct":
            return np._core.multiarray._reconstruct
        if module == "numpy" and name == "ndarray": return np.ndarray
        raise pickle.UnpicklingError(f"refused global {module}.{name}")
    def persistent_load(self, pid):
        kind, stype, key, location, size, view = pid
        assert kind == "storage", pid
        if key not in storages: storages[key] = Storage(DTYPES[stype.name], key, size)
        return storages[key]


def read_checkpoint(path):
    """The model's weights (float32, by name) and the features' mean and std."""
    with open(path, "rb") as f:
        pickle.load(f)  # magic number
        pickle.load(f)  # protocol version
        pickle.load(f)  # system info
        obj = U(f).load()
        for key in pickle.load(f):
            s = storages[key]
            (n,) = struct.unpack("<q", f.read(8))
            s.data = np.frombuffer(f.read(n * np.dtype(s.dtype).itemsize), dtype=s.dtype)
            assert n == s.size, (n, s.size)
    weights = {name: t.array().astype(np.float32) for name, t in obj["model"].items()}
    return weights, float(np.asarray(obj["mean"]).item()), float(np.asarray(obj["std"]).item())


def timing_signal(length, channels, min_ts=1.0, max_ts=1.0e4):
    position = np.arange(length)
    n = channels // 2
    inc = math.log(max_ts / min_ts) / (n - 1)
    inv = min_ts * np.exp(np.arange(n).astype(np.float64) * -inc)
    scaled = position[:, None] * inv[None, :]
    sig = np.concatenate([np.sin(scaled), np.cos(scaled)], axis=1)
    return sig.astype(np.float32)  # [length, channels]


T, F, H, HEADS, C = 108, 144, 128, 4, 170
W, MEAN, STD = read_checkpoint(sys.argv[1])

nodes, inits = [], []
counter = [0]

def name(prefix):
    counter[0] += 1
    return f'{prefix}_{counter[0]}'

def const(arr, prefix='c'):
    n = name(prefix)
    inits.append(numpy_helper.from_array(np.asarray(arr), n))
    return n

def op(kind, inputs, prefix=None, **attrs):
    out = name(prefix or kind.lower())
    nodes.append(helper.make_node(kind, inputs, [out], **attrs))
    return out

def matmul(x, w):  # x [..., in] @ w [in, out]
    return op('MatMul', [x, const(w.astype(np.float32), 'w')])

def linear(x, weight, bias=None):  # torch Linear: weight [out, in]
    y = matmul(x, weight.T.copy())
    return op('Add', [y, const(bias, 'b')]) if bias is not None else y

def layer_norm(x, g, b, eps=1e-6):
    # BTC's LayerNorm: gamma * (x - mean) / (std + eps) + beta, std unbiased
    m = op('ReduceMean', [x], axes=[-1], keepdims=1)
    d = op('Sub', [x, m])
    v = op('ReduceMean', [op('Mul', [d, d])], axes=[-1], keepdims=1)
    v = op('Mul', [v, const(np.float32(H / (H - 1)))])
    s = op('Add', [op('Sqrt', [v]), const(np.float32(eps))])
    y = op('Div', [d, s])
    return op('Add', [op('Mul', [y, const(g)]), const(b)])

SHAPE_SPLIT = None
SHAPE_MERGE = None

def mha(x, p, mask):
    q = matmul(x, (W[p + 'query_linear.weight'] * np.float32((H // HEADS) ** -0.5)).T.copy())
    k = matmul(x, W[p + 'key_linear.weight'].T.copy())
    v = matmul(x, W[p + 'value_linear.weight'].T.copy())
    q = op('Transpose', [op('Reshape', [q, SHAPE_SPLIT])], perm=[0, 2, 1, 3])  # [B,h,T,d]
    k = op('Transpose', [op('Reshape', [k, SHAPE_SPLIT])], perm=[0, 2, 3, 1])  # [B,h,d,T]
    v = op('Transpose', [op('Reshape', [v, SHAPE_SPLIT])], perm=[0, 2, 1, 3])  # [B,h,T,d]
    logits = op('Add', [op('MatMul', [q, k]), mask])
    w = op('Softmax', [logits], axis=-1)
    c = op('Transpose', [op('MatMul', [w, v])], perm=[0, 2, 1, 3])  # [B,T,h,d]
    c = op('Reshape', [c, SHAPE_MERGE])
    return matmul(c, W[p + 'output_linear.weight'].T.copy())

PAD_PREV = None
PAD_NEXT = None

def conv3(x, w, b):
    # Conv1d(kernel 3, zero padding 1 each side) on [B,T,C] as one MatMul:
    # [x(t-1), x(t), x(t+1)] @ [w0; w1; w2]
    prev = op('Slice', [op('Pad', [x, PAD_PREV]), S_START0, S_END_T, S_AXIS1])  # x(t-1)
    nxt = op('Slice', [op('Pad', [x, PAD_NEXT]), S_START1, S_END_T1, S_AXIS1])  # x(t+1)
    cat = op('Concat', [prev, x, nxt], axis=-1)
    wm = np.concatenate([w[:, :, 0].T, w[:, :, 1].T, w[:, :, 2].T], axis=0)  # [3C, out]
    return op('Add', [matmul(cat, wm), const(b, 'b')])

def block(x, p, mask):
    xn = layer_norm(x, W[p + 'layer_norm_mha.gamma'], W[p + 'layer_norm_mha.beta'])
    x = op('Add', [x, mha(xn, p + 'multi_head_attention.', mask)])
    xn = layer_norm(x, W[p + 'layer_norm_ffn.gamma'], W[p + 'layer_norm_ffn.beta'])
    pc = p + 'positionwise_convolution.layers.'
    y = op('Relu', [conv3(xn, W[pc + '0.conv.weight'], W[pc + '0.conv.bias'])])
    y = op('Relu', [conv3(y, W[pc + '1.conv.weight'], W[pc + '1.conv.bias'])])
    return op('Add', [x, y])

SHAPE_SPLIT = const(np.array([-1, T, HEADS, H // HEADS], dtype=np.int64), 'shape')
SHAPE_MERGE = const(np.array([-1, T, H], dtype=np.int64), 'shape')
PAD_PREV = const(np.array([0, 1, 0, 0, 0, 0], dtype=np.int64), 'pads')  # one zero frame before
PAD_NEXT = const(np.array([0, 0, 0, 0, 1, 0], dtype=np.int64), 'pads')  # one zero frame after
S_START0 = const(np.array([0], dtype=np.int64), 'st')
S_END_T = const(np.array([T], dtype=np.int64), 'en')
S_START1 = const(np.array([1], dtype=np.int64), 'st')
S_END_T1 = const(np.array([T + 1], dtype=np.int64), 'en')
S_AXIS1 = const(np.array([1], dtype=np.int64), 'ax')

NEG = np.float32(-1e9)
fwd = np.triu(np.full((T, T), NEG, dtype=np.float32), 1)  # attends to itself and the past
bwd = fwd.T.copy()  # itself and the future
MASK_F = const(fwd, 'mask_fwd')
MASK_B = const(bwd, 'mask_bwd')

x = matmul('features', W['self_attn_layers.embedding_proj.weight'].T.copy())
x = op('Add', [x, const(timing_signal(T, H), 'timing')])
for l in range(8):
    p = f'self_attn_layers.self_attn_layers.{l}.'
    a = block(x, p + 'attn_block.', MASK_F)
    b = block(x, p + 'backward_attn_block.', MASK_B)
    x = linear(op('Concat', [a, b], axis=-1), W[p + 'linear.weight'], W[p + 'linear.bias'])
x = layer_norm(x, W['self_attn_layers.layer_norm.gamma'], W['self_attn_layers.layer_norm.beta'])
logits = linear(x, W['output_layer.output_projection.weight'], W['output_layer.output_projection.bias'])
nodes.append(helper.make_node('Identity', [logits], ['logits']))

graph = helper.make_graph(
    nodes, 'btc_large_voca',
    [helper.make_tensor_value_info('features', TensorProto.FLOAT, ['batch', T, F])],
    [helper.make_tensor_value_info('logits', TensorProto.FLOAT, ['batch', T, C])],
    initializer=inits)
model = helper.make_model(graph, producer_name='EUTERIA Web (BTC conversion)', opset_imports=[helper.make_opsetid('', 17)])
model.ir_version = 8
for k, v in {'source': 'jayg996/BTC-ISMIR19 test/btc_model_large_voca.pt (MIT)',
             'feature_mean': repr(MEAN), 'feature_std': repr(STD),
             'features': 'log(|CQT| + 1e-6), librosa 0.6.3 cqt: 22050 Hz, hop 2048, 144 bins, 24 per octave, from C1; per 10 s chunk',
             'labels': 'BTC idx2voca_chord: root*14 + quality (min maj dim aug min6 maj6 min7 minmaj7 maj7 7 dim7 hdim7 sus2 sus4), 168 X, 169 N'}.items():
    e = model.metadata_props.add(); e.key = k; e.value = v
onnx.checker.check_model(model)
onnx.save(model, sys.argv[2])
print('nodes', len(nodes), 'initializers', len(inits), 'mean', MEAN, 'std', STD)
