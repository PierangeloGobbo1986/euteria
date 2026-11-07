// What the device and browser can do: decides between full mode and
// listening mode, and fills the Phase 0 lab report.

// A WebAssembly module that uses SIMD (from wasm-feature-detect).
const SIMD_TEST = Uint8Array.from(atob("AGFzbQEAAAABBQFgAAF7AwIBAAoKAQgAQQD9D/1iCw=="), (c) => c.charCodeAt(0));

export function detectBrowser() {
  const ua = navigator.userAgent;
  const brands = (navigator.userAgentData && navigator.userAgentData.brands) || [];
  const brand = (name) => brands.some((b) => b.brand === name);
  const version = (re) => (ua.match(re) || [])[1] || "";
  if (/CriOS\//.test(ua)) return { name: "Chrome (iOS)", engine: "WebKit", version: version(/CriOS\/([\d.]+)/) };
  if (/FxiOS\//.test(ua)) return { name: "Firefox (iOS)", engine: "WebKit", version: version(/FxiOS\/([\d.]+)/) };
  if (/EdgiOS\//.test(ua)) return { name: "Edge (iOS)", engine: "WebKit", version: version(/EdgiOS\/([\d.]+)/) };
  if (brand("Microsoft Edge") || /Edg\//.test(ua)) return { name: "Edge", engine: "Chromium", version: version(/Edg\/([\d.]+)/) };
  if (/SamsungBrowser\//.test(ua)) return { name: "Samsung Internet", engine: "Chromium", version: version(/SamsungBrowser\/([\d.]+)/) };
  if (/OPR\//.test(ua)) return { name: "Opera", engine: "Chromium", version: version(/OPR\/([\d.]+)/) };
  if (brand("Google Chrome") || /Chrome\//.test(ua)) return { name: "Chrome", engine: "Chromium", version: version(/Chrome\/([\d.]+)/) };
  if (/Firefox\//.test(ua)) return { name: "Firefox", engine: "Gecko", version: version(/Firefox\/([\d.]+)/) };
  if (/Safari\//.test(ua)) return { name: "Safari", engine: "WebKit", version: version(/Version\/([\d.]+)/) };
  return { name: "Unknown", engine: "Unknown", version: "" };
}

// Phones and tablets, including iPads that present themselves as Macs.
export function detectHandheld() {
  const ua = navigator.userAgent;
  if (navigator.userAgentData && navigator.userAgentData.mobile) return true;
  if (/iPhone|iPad|iPod|Android|Mobile/.test(ua)) return true;
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
}

export async function webgpuInfo() {
  if (!("gpu" in navigator)) return { available: false, reason: "no WebGPU in this browser" };
  try {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) return { available: false, reason: "no suitable graphics adapter" };
    const info = adapter.info || {};
    return {
      available: true,
      vendor: info.vendor || "",
      architecture: info.architecture || "",
      description: info.description || info.device || "",
      fallback: !!(info.isFallbackAdapter || adapter.isFallbackAdapter),
      shaderF16: adapter.features.has("shader-f16"),
      maxBufferMB: Math.round(adapter.limits.maxBufferSize / 1048576),
      maxStorageBindingMB: Math.round(adapter.limits.maxStorageBufferBindingSize / 1048576),
    };
  } catch (error) {
    return { available: false, reason: String((error && error.message) || error) };
  }
}

export async function deviceReport() {
  const browser = detectBrowser();
  const handheld = detectHandheld();
  const gpu = await webgpuInfo();
  let shareFiles = false;
  try {
    shareFiles = !!(navigator.canShare && navigator.canShare({ files: [new File([new Uint8Array(4)], "test.mp3", { type: "audio/mpeg" })] }));
  } catch (_) {}
  let storage = null;
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const e = await navigator.storage.estimate();
      storage = { quotaGB: e.quota / 1e9, usageMB: e.usage / 1e6 };
      if (navigator.storage.persisted) storage.persisted = await navigator.storage.persisted();
    }
  } catch (_) {
    storage = null;
  }
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const full = !handheld && browser.engine === "Chromium" && (browser.name === "Chrome" || browser.name === "Edge") && gpu.available && !gpu.fallback;
  return {
    browser,
    handheld,
    platform: (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "",
    userAgent: navigator.userAgent,
    cores: navigator.hardwareConcurrency || null,
    memoryGB: navigator.deviceMemory || null,
    screen: `${screen.width}x${screen.height} @${window.devicePixelRatio || 1}x`,
    audioContext: !!AudioCtx,
    audioWorklet: !!(AudioCtx && "audioWorklet" in AudioCtx.prototype),
    audioSession: "audioSession" in navigator,
    wakeLock: "wakeLock" in navigator,
    wasmSimd: typeof WebAssembly === "object" && WebAssembly.validate(SIMD_TEST),
    shareFiles,
    savePicker: "showSaveFilePicker" in window,
    opfs: !!(navigator.storage && navigator.storage.getDirectory),
    storage,
    gpu,
    mode: full ? "full" : "listening",
  };
}
