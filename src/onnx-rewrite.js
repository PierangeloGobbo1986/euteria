// Rewrites the attention of an ONNX model so that ONNX Runtime Web computes it
// with its fast matrix product: every Einsum node with an equation such as
// "bhid,bhjd->bhij" (queries times keys) becomes Transpose + MatMul, and every
// one such as "bhij,bhjd->bhid" (weights times values) becomes MatMul. The result
// is the same; ONNX Runtime 1.24 ran these Einsum nodes about 30 times slower
// than MatMul on Apple graphics cards, each one occupying the card for a tenth
// of a second.
//
// The model is edited at the level of the protobuf encoding: the nodes of the
// graph are read, the matching ones re-encoded, and everything else (the
// weights above all) is copied byte for byte.

const MODEL_GRAPH = 7; // ModelProto.graph
const GRAPH_NODE = 1; // GraphProto.node
const NODE = { input: 1, output: 2, name: 3, opType: 4, attribute: 5, domain: 7 };
const ATTR = { name: 1, s: 4, ints: 8, type: 20 };
const ATTR_INTS = 7; // AttributeProto.AttributeType.INTS

const utf8 = new TextDecoder();
const encoder = new TextEncoder();

function readVarint(buf, pos) {
  let value = 0;
  let scale = 1;
  let byte;
  do {
    if (pos >= buf.length) throw new Error("Truncated ONNX model.");
    byte = buf[pos++];
    value += (byte & 0x7f) * scale;
    scale *= 128;
  } while (byte & 0x80);
  return [value, pos];
}

// The fields of the message in buf[start, end): {field, wire, start, data, end}.
function fields(buf, start, end) {
  const out = [];
  let pos = start;
  while (pos < end) {
    const at = pos;
    let key;
    [key, pos] = readVarint(buf, pos);
    const field = Math.floor(key / 8);
    const wire = key % 8;
    let data = pos;
    if (wire === 0) [, pos] = readVarint(buf, pos);
    else if (wire === 1) pos += 8;
    else if (wire === 5) pos += 4;
    else if (wire === 2) {
      let length;
      [length, data] = readVarint(buf, pos);
      pos = data + length;
    } else throw new Error(`Unsupported protobuf wire type ${wire}.`);
    if (pos > end) throw new Error("Truncated ONNX model.");
    out.push({ field, wire, start: at, data, end: pos });
  }
  return out;
}

function varint(value) {
  const bytes = [];
  while (value > 127) {
    bytes.push((value % 128) | 0x80);
    value = Math.floor(value / 128);
  }
  bytes.push(value);
  return bytes;
}

function lengthDelimited(field, payload) {
  return [...varint(field * 8 + 2), ...varint(payload.length), ...payload];
}

const text = (field, s) => lengthDelimited(field, [...encoder.encode(s)]);

function encodeNode({ inputs, outputs, name, opType, attributes = [] }) {
  const bytes = [];
  for (const i of inputs) bytes.push(...text(NODE.input, i));
  for (const o of outputs) bytes.push(...text(NODE.output, o));
  bytes.push(...text(NODE.name, name), ...text(NODE.opType, opType));
  for (const a of attributes) bytes.push(...lengthDelimited(NODE.attribute, a));
  return lengthDelimited(GRAPH_NODE, bytes);
}

function intsAttribute(name, values) {
  const bytes = [...text(ATTR.name, name), ...varint(ATTR.type * 8), ...varint(ATTR_INTS)];
  for (const v of values) bytes.push(...varint(ATTR.ints * 8), ...varint(v));
  return bytes;
}

// What a node is made of, as far as the rewrite needs it.
function readNode(buf, f) {
  const node = { inputs: [], outputs: [], name: "", opType: "", domain: "", equation: null };
  for (const g of fields(buf, f.data, f.end)) {
    if (g.wire !== 2) continue;
    const s = () => utf8.decode(buf.subarray(g.data, g.end));
    if (g.field === NODE.input) node.inputs.push(s());
    else if (g.field === NODE.output) node.outputs.push(s());
    else if (g.field === NODE.name) node.name = s();
    else if (g.field === NODE.opType) node.opType = s();
    else if (g.field === NODE.domain) node.domain = s();
    else if (g.field === NODE.attribute) {
      let attrName = "";
      let value = null;
      for (const h of fields(buf, g.data, g.end)) {
        if (h.field === ATTR.name && h.wire === 2) attrName = utf8.decode(buf.subarray(h.data, h.end));
        if (h.field === ATTR.s && h.wire === 2) value = utf8.decode(buf.subarray(h.data, h.end));
      }
      if (attrName === "equation") node.equation = value;
    }
  }
  return node;
}

// Batched matrix products written as Einsum, with any number of shared
// leading indices: "...ik,...jk->...ij" (A times B transposed, as
// "bhid,bhjd->bhij") and "...ik,...kj->...ij" (as "bhij,bhjd->bhid").
// Returns {kind, rank} or null.
function matmulKind(equation) {
  const eq = (equation || "").replace(/\s+/g, "");
  const m = /^([a-z]+),([a-z]+)->([a-z]+)$/.exec(eq);
  if (!m) return null;
  const [, a, b, c] = m;
  const n = a.length;
  if (n < 2 || b.length !== n || c.length !== n || new Set(a + b + c).size !== n + 1) return null;
  const batch = a.slice(0, n - 2);
  if (b.slice(0, n - 2) !== batch || c.slice(0, n - 2) !== batch || a[n - 2] !== c[n - 2]) return null;
  if (b[n - 2] === c[n - 1] && b[n - 1] === a[n - 1]) return { kind: "transposed", rank: n };
  if (b[n - 2] === a[n - 1] && b[n - 1] === c[n - 1]) return { kind: "plain", rank: n };
  return null;
}

// Returns {bytes, rewritten}: the model with its attention Einsum nodes
// replaced, and how many were replaced.
export function rewriteAttention(model) {
  const buf = model instanceof Uint8Array ? model : new Uint8Array(model);
  const top = fields(buf, 0, buf.length);
  const graph = top.find((f) => f.field === MODEL_GRAPH && f.wire === 2);
  if (!graph) throw new Error("This ONNX model has no graph.");
  const parts = [];
  let rewritten = 0;
  for (const f of fields(buf, graph.data, graph.end)) {
    if (f.field === GRAPH_NODE && f.wire === 2) {
      const node = readNode(buf, f);
      const match = node.opType === "Einsum" && (node.domain === "" || node.domain === "ai.onnx") ? matmulKind(node.equation) : null;
      if (match && node.inputs.length === 2 && node.outputs.length === 1) {
        let right = node.inputs[1];
        if (match.kind === "transposed") {
          const perm = [...Array(match.rank - 2).keys(), match.rank - 1, match.rank - 2];
          const transposed = `${node.outputs[0]}__euteria_t`;
          parts.push(
            Uint8Array.from(
              encodeNode({ inputs: [right], outputs: [transposed], name: `${node.name}__euteria_t`, opType: "Transpose", attributes: [intsAttribute("perm", perm)] })
            )
          );
          right = transposed;
        }
        parts.push(Uint8Array.from(encodeNode({ inputs: [node.inputs[0], right], outputs: node.outputs, name: `${node.name}__euteria_mm`, opType: "MatMul" })));
        rewritten++;
        continue;
      }
    }
    parts.push(buf.subarray(f.start, f.end));
  }
  if (!rewritten) return { bytes: buf, rewritten };
  const graphLength = parts.reduce((n, p) => n + p.length, 0);
  const graphHead = Uint8Array.from([...varint(MODEL_GRAPH * 8 + 2), ...varint(graphLength)]);
  let total = graphHead.length + graphLength;
  for (const f of top) if (f !== graph) total += f.end - f.start;
  const out = new Uint8Array(total);
  let at = 0;
  for (const f of top) {
    if (f === graph) {
      out.set(graphHead, at);
      at += graphHead.length;
      for (const p of parts) {
        out.set(p, at);
        at += p.length;
      }
    } else {
      out.set(buf.subarray(f.start, f.end), at);
      at += f.end - f.start;
    }
  }
  return { bytes: out, rewritten };
}
