/*
 * Service worker of EUTERIA Web: keeps the app working without a connection
 * (a rehearsal room without signal, say). Requests to this site go to the
 * network first, so that a new version is used as soon as it is online, and
 * fall back to the copy kept here; if the network is slow, the kept copy is
 * used after a few seconds. The network is asked whether each file changed
 * (the browser's own cache could hold an older copy for minutes after an
 * update). Requests to other sites (the separation model and its runtime, in
 * the test page) and requests that must bypass every cache (the Update
 * button's check) are left alone. The songs themselves never pass through
 * here: they are files on the device.
 */
"use strict";

const CACHE = "euteria-app-v6";
const NETWORK_WAIT_MS = 4000;
const SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "version.js",
  "app/app.css",
  "app/app.js",
  "app/controls.js",
  "app/editor.js",
  "app/separate.js",
  "app/timeline.js",
  "app/icons/favicon-32.png",
  "app/icons/icon-192.png",
  "app/icons/icon-512.png",
  "app/icons/icon-maskable-512.png",
  "app/icons/apple-touch-icon.png",
  "app/icons/logo-96.png",
  "src/align.js",
  "src/device.js",
  "src/encode-worker.js",
  "src/engine.js",
  "src/engine-core.js",
  "src/engine-processor.js",
  "src/grid.js",
  "src/library.js",
  "src/library-worker.js",
  "src/manifest.js",
  "src/onnx-rewrite.js",
  "src/peaks.js",
  "src/player.js",
  "src/project.js",
  "src/recent.js",
  "src/render-worker.js",
  "src/separate-worker.js",
  "src/separation.js",
  "src/settings.js",
  "src/stft.js",
  "src/zip.js",
  "src/zipwrite.js",
  "lib/signalsmith-stretch/signalsmith-module.js",
  "lib/wasm-media-encoders/WasmMediaEncoder.min.js",
  "lib/wasm-media-encoders/mp3.wasm",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL.map((url) => new Request(url, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("euteria-app-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.headers.has("range") || request.cache === "no-store") return;
  if (new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(networkFirst(event));
});

async function networkFirst(event) {
  const request = event.request;
  const cache = await caches.open(CACHE);
  let fresh = request;
  try {
    fresh = new Request(request, { cache: "no-cache" });
  } catch (_) {}
  const network = fetch(fresh).then((response) => {
    if (response.ok && response.type === "basic") event.waitUntil(cache.put(request, response.clone()).catch(() => {}));
    return response;
  });
  event.waitUntil(network.catch(() => {}));
  const kept = () => cache.match(request, { ignoreSearch: request.mode === "navigate" });
  let timer;
  const slow = new Promise((resolve) => (timer = setTimeout(resolve, NETWORK_WAIT_MS, "slow")));
  try {
    const first = await Promise.race([network, slow]);
    if (first !== "slow") return first;
    const copy = await kept();
    return copy || (await network);
  } catch (error) {
    const copy = await kept();
    if (copy) return copy;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
