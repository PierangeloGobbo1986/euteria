// Main-thread side of the EUTERIA audio engine (see src/engine-core.js).

const loading = new WeakMap();

// Adds the engine's three scripts to the context's AudioWorklet, once.
export function loadEngine(context) {
  if (!loading.has(context)) {
    loading.set(
      context,
      (async () => {
        const base = new URL("../", import.meta.url);
        await context.audioWorklet.addModule(new URL("lib/signalsmith-stretch/signalsmith-module.js", base));
        await context.audioWorklet.addModule(new URL("src/engine-core.js", base));
        await context.audioWorklet.addModule(new URL("src/engine-processor.js", base));
      })()
    );
  }
  return loading.get(context);
}

export class Engine {
  // Creates the engine node; resolves once its WebAssembly is ready.
  static async create(context, { preset = "default" } = {}) {
    await loadEngine(context);
    const node = new AudioWorkletNode(context, "euteria-engine", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      processorOptions: { preset },
    });
    const engine = new Engine(context, node);
    engine.info = await engine.ready;
    return engine;
  }

  constructor(context, node) {
    this.context = context;
    this.node = node;
    this.position = 0;
    this.playing = false;
    this.onposition = null;
    this.onended = null;
    this.onlatency = null;
    this.requests = new Map();
    this.nextId = 1;
    this.ready = new Promise((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    node.port.onmessage = (event) => this.receive(event.data);
  }

  receive(m) {
    switch (m.type) {
      case "ready":
        this.resolveReady(m);
        break;
      case "error":
        this.rejectReady(new Error(m.message));
        break;
      case "latency":
        this.info = m;
        if (this.onlatency) this.onlatency(m);
        break;
      case "pos":
        this.position = m.heard;
        this.playing = m.playing;
        if (this.onposition) this.onposition(m.heard, m.playing);
        break;
      case "ended":
        this.playing = false;
        if (this.onended) this.onended();
        break;
      case "reply": {
        const resolve = this.requests.get(m.id);
        if (resolve) {
          this.requests.delete(m.id);
          resolve(m);
        }
        break;
      }
    }
  }

  send(message, transfer) {
    this.node.port.postMessage(message, transfer || []);
  }

  request(message) {
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.requests.set(id, resolve);
      this.send({ ...message, id });
    });
  }

  // track: {key, bus: "pitched"|"drums", channels: Int16Array[], length, gain, on}.
  // The channel arrays are handed over to the audio thread (they become empty here).
  addTrack(track) {
    const channels = track.channels.map((a) => a.buffer);
    this.send(
      { type: "track", key: track.key, bus: track.bus, channels, length: track.length, gain: track.gain ?? 1, on: track.on ?? true },
      channels
    );
  }

  setTrack(key, params) {
    this.send({ type: "set", key, ...params });
  }

  removeTrack(key) {
    this.send({ type: "remove", key });
  }

  // Takes tracks back from the audio thread (they stop playing): used to lend
  // their memory to the export worker without copying it.
  async takeTracks(keys) {
    const reply = await this.request({ type: "take", keys });
    return reply.tracks.map((t) => ({ ...t, channels: t.channels.map((b) => new Int16Array(b)) }));
  }

  play(at) {
    this.send({ type: "play", at });
  }

  pause() {
    this.send({ type: "pause" });
  }

  seek(to) {
    this.send({ type: "seek", to });
  }

  setRate(rate) {
    this.send({ type: "rate", rate });
  }

  setSemitones(semitones) {
    this.send({ type: "semitones", semitones });
  }

  setLoop(on, start, end) {
    this.send({ type: "loop", on, start, end });
  }

  setPreset(preset) {
    this.send({ type: "preset", preset });
  }

  // Resolves once every message sent before it has been handled.
  sync() {
    return this.request({ type: "ping" });
  }
}
