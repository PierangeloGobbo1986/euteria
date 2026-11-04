/*
 * AudioWorkletProcessor that plays the tracks through EuteriaEngineCore, and
 * records its input (a microphone, an audio interface) while they play.
 *
 * Plain script added with audioWorklet.addModule() after
 * lib/signalsmith-stretch/signalsmith-module.js and src/engine-core.js, which
 * share this AudioWorkletGlobalScope. The main thread talks to it through
 * src/engine.js.
 *
 * Recording: the input of each audio block is kept with the moment of the
 * song that the same block sends out ("rec-begin" gives it for the first
 * block), so that the main thread can line the take up with the song sample
 * by sample, once it adds the delay of the devices. The input goes to the
 * main thread as 16-bit PCM, in chunks. With the loop on, playback stops by
 * itself at the end of the pass that completes the takes asked for; the input
 * is kept for `tail` samples more, the sound still on its way from the
 * devices.
 */
(function () {
  "use strict";

  const REPORT_SECONDS = 0.04;
  const LEVEL_SECONDS = 0.05;
  const CHUNK = 16384; // input samples per message to the main thread

  class EuteriaEngineProcessor extends AudioWorkletProcessor {
    constructor(options) {
      super();
      this.core = null;
      this.queue = [];
      this.reportEvery = Math.round(sampleRate * REPORT_SECONDS);
      this.counter = 0;
      this.scratch = new Float32Array(128);
      this.rec = null; // the recording under way
      this.meter = false; // the input level is reported
      this.meterPeak = 0;
      this.levelEvery = Math.round(sampleRate * LEVEL_SECONDS);
      this.meterLeft = this.levelEvery;
      this.port.onmessage = (event) => {
        if (this.core) this.handle(event.data);
        else this.queue.push(event.data);
      };
      globalThis.EuteriaEngineCore.create(sampleRate).then(
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
        delay: c.delay,
      };
    }

    handle(m) {
      const core = this.core;
      switch (m.type) {
        case "track":
          core.addTrack(m.key, m.bus, m.channels.map((b) => new Int16Array(b)), m.length, m.gain, m.on, m.start);
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
            return { key: t.key, bus: t.bus, channels, length: t.length, gain: t.gain, on: t.on, start: t.start };
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
        case "rec-start":
          this.recStart(m);
          break;
        case "rec-stop":
          if (this.rec && this.rec.id === m.id) this.recEnd("stop");
          break;
        case "meter":
          this.meter = !!m.on;
          this.meterPeak = 0;
          this.meterLeft = this.levelEvery;
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

    // ----- recording ---------------------------------------------------------

    // m: {id, play (where playback starts, or null if it plays already),
    // latency (samples the devices add, in and out), takes (with the loop on,
    // passes to record), minFirst (song samples a first pass needs to count
    // as a take), tail}.
    recStart(m) {
      if (this.rec) this.recEnd("stop");
      if (m.play !== null && m.play !== undefined) this.core.play(m.play);
      this.rec = {
        id: m.id,
        latency: Math.max(0, m.latency || 0),
        takes: m.takes || 0,
        minFirst: m.minFirst || 0,
        tail: Math.max(0, m.tail || 0),
        begun: false,
        frames: 0,
        nch: 1,
        bufs: null,
        fill: 0,
        emitted: 0,
        e0: 0,
        rate: 1,
        stopAt: Infinity,
        tailLeft: -1,
        reason: "stop",
      };
    }

    // The first block: the moment of the song it sends out, and where the
    // loop stops playback.
    recBegin(input) {
      const c = this.core;
      const r = this.rec;
      r.nch = Math.min(2, Math.max(1, input ? input.length : 0));
      r.bufs = this.newBuffers(r.nch);
      r.e0 = c.emission();
      r.rate = c.rate;
      const from = c.sinceStart < c.delay ? c.startOut : null;
      if (c.loop.on && r.takes > 0) {
        const span = c.loopB - c.loopA;
        // The first pass as it lands in the take: too short, it does not count.
        const first = c.loopB - Math.max(from === null ? -Infinity : from, r.e0 - r.latency * r.rate);
        const passes = r.takes + (first < r.minFirst ? 1 : 0);
        r.stopAt = c.loopB + (passes - 1) * span;
      }
      r.begun = true;
      this.port.postMessage({
        type: "rec-begin",
        id: r.id,
        e0: r.e0,
        rate: r.rate,
        semitones: c.semitones,
        loop: { on: c.loop.on, a: c.loopA, b: c.loopB },
        // Playback starting with the take: the song sample it starts from
        // (what comes out before it is the stretcher getting ready).
        from,
        channels: r.nch,
        sampleRate,
        latency: r.latency,
      });
    }

    newBuffers(n) {
      const out = [];
      for (let c = 0; c < n; c++) out.push(new Int16Array(CHUNK));
      return out;
    }

    capture(input, n) {
      const r = this.rec;
      if (r.fill + n > CHUNK) this.flush();
      for (let c = 0; c < r.nch; c++) {
        const src = input && input.length ? input[c] || input[0] : null;
        const dst = r.bufs[c];
        const o = r.fill;
        if (!src) {
          dst.fill(0, o, o + n);
          continue;
        }
        for (let i = 0; i < n; i++) {
          let v = src[i];
          v = v < -1 ? -1 : v > 1 ? 1 : v;
          dst[o + i] = v < 0 ? v * 32768 : v * 32767;
        }
      }
      r.fill += n;
      r.frames += n;
    }

    flush() {
      const r = this.rec;
      if (!r || !r.fill) return;
      const channels = r.bufs.map((b) => (r.fill === b.length ? b : b.slice(0, r.fill)).buffer);
      this.port.postMessage({ type: "rec-data", id: r.id, channels, frames: r.fill }, channels);
      r.bufs = this.newBuffers(r.nch);
      r.fill = 0;
    }

    recEnd(reason) {
      const r = this.rec;
      if (!r) return;
      if (r.begun) this.flush();
      this.rec = null;
      this.port.postMessage({ type: "rec-end", id: r.id, reason, frames: r.frames, begun: r.begun });
    }

    // After the block is rendered: the loop finished the takes (playback
    // stops), the song ended, or the tail is being kept.
    recAfter(n, wasPlaying) {
      const r = this.rec;
      if (r.tailLeft >= 0) {
        r.tailLeft -= n;
        if (r.tailLeft <= 0) this.recEnd(r.reason);
        return;
      }
      r.emitted += n;
      if (wasPlaying && this.core.playing && r.e0 + r.emitted * r.rate >= r.stopAt) {
        this.core.pause();
        r.reason = "loop";
        r.tailLeft = r.tail;
        this.report();
      } else if (!this.core.playing) {
        r.reason = "end";
        r.tailLeft = r.tail;
      }
      if (r.tailLeft === 0) this.recEnd(r.reason);
    }

    measure(input, n) {
      if (input) {
        for (const ch of input) {
          for (let i = 0; i < n; i++) {
            const v = ch[i] < 0 ? -ch[i] : ch[i];
            if (v > this.meterPeak) this.meterPeak = v;
          }
        }
      }
      this.meterLeft -= n;
      if (this.meterLeft <= 0) {
        this.port.postMessage({ type: "level", peak: this.meterPeak, channels: input ? input.length : 0 });
        this.meterPeak = 0;
        this.meterLeft = this.levelEvery;
      }
    }

    // ----- audio ------------------------------------------------------------------

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
      const input = inputs && inputs[0];
      const rec = this.rec;
      if (rec) {
        if (!rec.begun) {
          if (this.core.playing) this.recBegin(input);
          else this.recEnd("stop"); // nothing plays: nothing to line it up with
        }
        if (this.rec) this.capture(input, n);
      }
      if (this.meter) this.measure(input, n);
      if (this.scratch.length < n) this.scratch = new Float32Array(n);
      const wasPlaying = this.core.playing;
      this.core.render(left, right || this.scratch, n);
      if (this.core.ended) {
        this.core.ended = false;
        this.port.postMessage({ type: "ended" });
      }
      if (this.rec && this.rec === rec) this.recAfter(n, wasPlaying);
      if (wasPlaying) {
        this.counter -= n;
        if (this.counter <= 0 || !this.core.playing) this.report();
      }
      return true;
    }
  }

  registerProcessor("euteria-engine", EuteriaEngineProcessor);
})();
