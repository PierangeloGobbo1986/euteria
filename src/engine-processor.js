/*
 * AudioWorkletProcessor that plays the tracks through EuteriaEngineCore.
 *
 * Plain script added with audioWorklet.addModule() after
 * lib/signalsmith-stretch/signalsmith-module.js and src/engine-core.js, which
 * share this AudioWorkletGlobalScope. The main thread talks to it through
 * src/engine.js.
 */
(function () {
  "use strict";

  const REPORT_SECONDS = 0.04;

  class EuteriaEngineProcessor extends AudioWorkletProcessor {
    constructor(options) {
      super();
      this.core = null;
      this.queue = [];
      this.reportEvery = Math.round(sampleRate * REPORT_SECONDS);
      this.counter = 0;
      this.scratch = new Float32Array(128);
      this.port.onmessage = (event) => {
        if (this.core) this.handle(event.data);
        else this.queue.push(event.data);
      };
      const preset = (options && options.processorOptions && options.processorOptions.preset) || "default";
      globalThis.EuteriaEngineCore.create(sampleRate, preset).then(
        (core) => {
          this.core = core;
          this.port.postMessage({ type: "ready", ...this.latencies() });
          const queued = this.queue;
          this.queue = null;
          for (const message of queued) this.handle(message);
        },
        (error) => this.port.postMessage({ type: "error", message: String((error && error.message) || error) })
      );
    }

    latencies() {
      const c = this.core;
      return {
        sampleRate,
        inputLatency: c.inputLatency,
        outputLatency: c.outputLatency,
        bufferLength: c.bufferLength,
        delay: c.delay,
        preset: c.preset,
      };
    }

    handle(m) {
      const core = this.core;
      switch (m.type) {
        case "track":
          core.addTrack(m.key, m.bus, m.channels.map((b) => new Int16Array(b)), m.length, m.gain, m.on);
          break;
        case "set":
          core.setTrack(m.key, m);
          break;
        case "remove":
          core.removeTrack(m.key);
          break;
        case "take": {
          const transfer = [];
          const tracks = core.takeTracks(m.keys).map((t) => {
            const channels = t.ch.map((a) => a.buffer);
            transfer.push(...channels);
            return { key: t.key, bus: t.bus, channels, length: t.length, gain: t.gain, on: t.on };
          });
          this.port.postMessage({ type: "reply", id: m.id, tracks }, transfer);
          break;
        }
        case "play":
          core.play(m.at);
          break;
        case "pause":
          core.pause();
          break;
        case "seek":
          core.seek(m.to);
          break;
        case "rate":
          core.setRate(m.rate);
          break;
        case "semitones":
          core.setSemitones(m.semitones);
          break;
        case "loop":
          core.setLoop(m.on, m.start, m.end);
          break;
        case "preset":
          core.configure(m.preset);
          this.port.postMessage({ type: "latency", ...this.latencies() });
          break;
        case "ping":
          this.port.postMessage({ type: "reply", id: m.id });
          break;
      }
      this.report();
    }

    report() {
      this.counter = this.reportEvery;
      this.port.postMessage({ type: "pos", heard: this.core.heard(), playing: this.core.playing });
    }

    process(inputs, outputs) {
      const out = outputs[0];
      if (!out || !out.length) return true;
      const left = out[0];
      const right = out.length > 1 ? out[1] : null;
      if (!this.core) {
        left.fill(0);
        if (right) right.fill(0);
        return true;
      }
      const n = left.length;
      if (this.scratch.length < n) this.scratch = new Float32Array(n);
      const wasPlaying = this.core.playing;
      this.core.render(left, right || this.scratch, n);
      if (this.core.ended) {
        this.core.ended = false;
        this.port.postMessage({ type: "ended" });
      }
      if (wasPlaying) {
        this.counter -= n;
        if (this.counter <= 0 || !this.core.playing) this.report();
      }
      return true;
    }
  }

  registerProcessor("euteria-engine", EuteriaEngineProcessor);
})();
