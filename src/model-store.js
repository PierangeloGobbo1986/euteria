// Model files kept in the browser's private storage (OPFS), for the workers
// that run them (src/beats-worker.js): downloaded once, checked, and found
// again the next time. A model counts as present when its description file
// exists: that file is written only after the download is complete and
// checked. The same folder holds the separation model (src/separate-worker.js).

const MODEL_DIR = "euteria-models";

// An error for the user: `text` in English, {name} standing for vars.name.
export const fail = (text, vars = null) =>
  Object.assign(new Error(vars ? text.replace(/\{(\w+)\}/g, (all, k) => (k in vars ? String(vars[k]) : all)) : text), { text, vars });

export async function modelsDir() {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(MODEL_DIR, { create: true });
}

export async function fileHandle(dir, name) {
  try {
    return await dir.getFileHandle(name);
  } catch (_) {
    return null;
  }
}

// model: {file, url, sha256?, bytes?}. {cached, bytes}.
export async function modelStatus(model) {
  const dir = await modelsDir();
  const handle = await fileHandle(dir, model.file);
  const metaHandle = await fileHandle(dir, `${model.file}.json`);
  if (!handle || !metaHandle) return { cached: false };
  const meta = JSON.parse(await (await metaHandle.getFile()).text());
  const size = (await handle.getFile()).size;
  if (size !== meta.bytes || meta.url !== model.url) return { cached: false };
  return { cached: true, bytes: size, sha256: meta.sha256, savedAt: meta.savedAt };
}

// Downloads the model; `onProgress(phase, data)`: "download" {done, total, ms}
// now and then, "verify" at the end. A model whose SHA-256 is known
// (model.sha256) must have it; a compressed download (Content-Encoding) is
// measured by the bytes it gives, not by its Content-Length.
export async function downloadModel(model, onProgress = () => {}) {
  const dir = await modelsDir();
  await dir.removeEntry(`${model.file}.json`).catch(() => {});
  const handle = await dir.getFileHandle(model.file, { create: true });
  const access = await handle.createSyncAccessHandle();
  const t0 = performance.now();
  let bytes = 0;
  let total;
  try {
    access.truncate(0);
    const response = await fetch(model.url);
    if (!response.ok) throw fail("The model download failed (HTTP {status}).", { status: response.status });
    const encoded = (response.headers.get("content-encoding") || "identity") !== "identity";
    total = (!encoded && Number(response.headers.get("content-length"))) || model.bytes || 0;
    const reader = response.body.getReader();
    let reported = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      access.write(value, { at: bytes });
      bytes += value.byteLength;
      const now = performance.now();
      if (now - reported > 250) {
        reported = now;
        onProgress("download", { done: bytes, total, ms: now - t0 });
      }
    }
    access.flush();
  } finally {
    access.close();
  }
  if (total && bytes < total) throw fail("The model download stopped early ({bytes} of {total} bytes).", { bytes, total });
  onProgress("verify", { done: bytes, total: bytes });
  const data = await (await handle.getFile()).arrayBuffer();
  const sha256 = [...new Uint8Array(await crypto.subtle.digest("SHA-256", data))].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (model.sha256 && sha256 !== model.sha256) throw fail("The model downloaded is not the one expected: try again.");
  const meta = { bytes, sha256, url: model.url, savedAt: new Date().toISOString() };
  const metaHandle = await dir.getFileHandle(`${model.file}.json`, { create: true });
  const writer = await metaHandle.createSyncAccessHandle();
  try {
    const text = new TextEncoder().encode(JSON.stringify(meta));
    writer.truncate(0);
    writer.write(text, { at: 0 });
    writer.flush();
  } finally {
    writer.close();
  }
  return { cached: true, bytes, sha256 };
}

// The model's bytes (it must be downloaded).
export async function modelBytes(model) {
  const dir = await modelsDir();
  const handle = await fileHandle(dir, model.file);
  if (!handle) throw fail("The model is not downloaded.");
  return new Uint8Array(await (await handle.getFile()).arrayBuffer());
}
