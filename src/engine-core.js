/*
 * EUTERIA audio engine core.
 *
 * Plain script (no import/export), so the same code runs unchanged in the
 * AudioWorkletGlobalScope (src/engine-processor.js, live playback) and in a Web
 * Worker (src/render-worker.js, MP3 export and speed tests). It needs
 * globalThis.SignalsmithStretchModule, from lib/signalsmith-stretch/
 * signalsmith-module.js, loaded first.
 *
 * Every track is kept as 16-bit PCM at the output sample rate. The tracks that
 * are switched on are mixed into two buses, "pitched" (the full mix and every
 * pitched stem) and "drums", and each bus runs through one Signalsmith Stretch
 * instance. Tempo and key change live, the tracks cannot drift apart because
 * they are mixed sample by sample before stretching, and the drums keep their
 * pitch, as in EUTERIA (Python).
 *
 * Time is kept in two units: song seconds (the original recording's timeline,
 * used by the grid, the loop and the playhead) and output samples.
 */
(function () {
  "use strict";

  // Soft limiter, as _soft_limit() in EUTERIA (Python): untouched up to 0.9,
  // then a tanh knee that never reaches 1.0.
  const LIMIT = 0.9;
  const SPAN = 1 - LIMIT;
  function softLimit(x) {
    if (x > LIMIT) return LIMIT + SPAN * Math.tanh((x - LIMIT) / SPAN);
    if (x < -LIMIT) return -LIMIT - SPAN * Math.tanh((-x - LIMIT) / SPAN);
    return x;
  }

  const TONALITY_HZ = 8000; // Signalsmith's default tonality limit

  // One Signalsmith Stretch instance (its own WebAssembly memory), stereo.
  class Stretcher {
    constructor(module, sampleRate) {
      this.m = module;
      this.sampleRate = sampleRate;
      this.channels = 2;
    }

    configure(preset) {
      const m = this.m;
      if (preset === "cheaper") m._presetCheaper(this.channels, this.sampleRate);
      else m._presetDefault(this.channels, this.sampleRate);
      m._setFormantSemitones(0, false);
      m._setFormantBase(0);
      this.inputLatency = m._inputLatency();
      this.outputLatency = m._outputLatency();
      // The input window handed over on every block: long enough to cover
      // the stretcher's whole latency, so it can be re-positioned each time.
      this.bufferLength = this.inputLatency + this.outputLatency;
      const pointer = m._setBuffers(this.channels, this.bufferLength);
      const bytes = this.bufferLength * 4;
      this.inPtr = [pointer, pointer + bytes];
      this.outPtr = [pointer + 2 * bytes, pointer + 3 * bytes];
      this.semitones = null;
      this.memory = null;
      m._reset();
    }

    // Typed-array views on the WebAssembly memory, rebuilt if it ever grows.
    views() {
      const memory = this.m.exports ? this.m.exports.memory.buffer : this.m.HEAP8.buffer;
      if (memory !== this.memory) {
        this.memory = memory;
        this.input = this.inPtr.map((p) => new Float32Array(memory, p, this.bufferLength));
        this.output = this.outPtr.map((p) => new Float32Array(memory, p, this.bufferLength));
      }
    }

    setSemitones(semitones) {
      if (semitones !== this.semitones) {
        this.semitones = semitones;
        this.m._setTransposeSemitones(semitones, TONALITY_HZ / this.sampleRate);
      }
    }

    reset() {
      this.m._reset();
    }

    // Stretches the window that ends `inputLatency` samples after the current
    // position and adds `n` output samples to out0/out1.
    run(window0, window1, rate, n, out0, out1) {
      this.views();
      this.input[0].set(window0);
      this.input[1].set(window1);
      this.m._seek(this.bufferLength, rate);
      this.m._process(0, n);
      this.views();
      const o0 = this.output[0];
      const o1 = this.output[1];
      for (let i = 0; i < n; i++) {
        out0[i] += o0[i];
        out1[i] += o1[i];
      }
    }
  }

  // A bus keeps the mix of its tracks over the current input window, so each
  // block only mixes the few new samples instead of the whole window.
  class Bus {
    constructor(name, stretcher) {
      this.name = name;
      this.s = stretcher;
      this.cache = [new Float32Array(0), new Float32Array(0)];
      this.cacheStart = 0;
      this.valid = false;
      this.active = false;
    }
  }

  class EngineCore {
    static async create(sampleRate, preset) {
      const factory = globalThis.SignalsmithStretchModule;
      if (typeof factory !== "function") throw new Error("Signalsmith Stretch is not loaded");
      const modules = await Promise.all([factory(), factory()]);
      for (const m of modules) m._main();
      return new EngineCore(sampleRate, preset || "default", modules);
    }

    constructor(sampleRate, preset, modules) {
      this.sampleRate = sampleRate;
      this.tracks = new Map();
      this.buses = [
        new Bus("pitched", new Stretcher(modules[0], sampleRate)),
        new Bus("drums", new Stretcher(modules[1], sampleRate)),
      ];
      this.playing = false;
      this.ended = false;
      this.pos = 0; // song seconds of the input being fed now
      this.rate = 1;
      this.semitones = 0;
      this.loop = { on: false, start: 0, end: 0 };
      this.length = 0; // samples of the longest track
      this.configure(preset);
    }

    configure(preset) {
      this.preset = preset === "cheaper" ? "cheaper" : "default";
      for (const bus of this.buses) {
        bus.s.configure(this.preset);
        const n = bus.s.bufferLength;
        if (bus.cache[0].length !== n) bus.cache = [new Float32Array(n), new Float32Array(n)];
        bus.valid = false;
      }
      const s = this.buses[0].s;
      this.inputLatency = s.inputLatency;
      this.outputLatency = s.outputLatency;
      this.bufferLength = s.bufferLength;
      // Output samples between feeding a moment of the song and hearing it.
      this.delay = s.outputLatency;
    }

    // ----- tracks -----------------------------------------------------------

    addTrack(key, bus, channels, length, gain, on) {
      this.tracks.set(key, {
        key,
        bus: bus === "drums" ? "drums" : "pitched",
        ch: channels,
        length,
        gain: gain === undefined ? 1 : gain,
        on: on === undefined ? true : !!on,
      });
      this._lengthChanged();
      this._invalidate();
    }

    removeTrack(key) {
      this.tracks.delete(key);
      this._lengthChanged();
      this._invalidate();
    }

    // Removes and returns tracks (to hand their memory to another thread).
    takeTracks(keys) {
      const out = [];
      for (const key of keys || [...this.tracks.keys()]) {
        const t = this.tracks.get(key);
        if (t) {
          out.push(t);
          this.tracks.delete(key);
        }
      }
      this._lengthChanged();
      this._invalidate();
      return out;
    }

    setTrack(key, params) {
      const t = this.tracks.get(key);
      if (!t) return;
      if (params.gain !== undefined) t.gain = Math.max(0, +params.gain);
      if (params.on !== undefined) t.on = !!params.on;
      this._invalidate();
    }

    _lengthChanged() {
      let n = 0;
      for (const t of this.tracks.values()) n = Math.max(n, t.length);
      this.length = n;
    }

    _invalidate() {
      for (const bus of this.buses) bus.valid = false;
    }

    // ----- transport --------------------------------------------------------

    get duration() {
      return this.length / this.sampleRate;
    }

    play(at) {
      if (at !== undefined && at !== null) this.pos = this._clamp(at);
      if (this.pos >= this.duration) this.pos = this.loop.on ? this.loop.start : 0;
      this.playing = true;
      this.ended = false;
      this._restart();
    }

    pause() {
      this.playing = false;
    }

    seek(to) {
      this.pos = this._clamp(to);
      this._restart();
    }

    setRate(rate) {
      this.rate = Math.min(2, Math.max(0.5, +rate || 1));
    }

    setSemitones(semitones) {
      this.semitones = Math.min(24, Math.max(-24, +semitones || 0));
    }

    setLoop(on, start, end) {
      this.loop = { on: !!on && end > start, start: +start || 0, end: +end || 0 };
    }

    _clamp(t) {
      return Math.min(Math.max(0, +t || 0), this.duration);
    }

    _restart() {
      for (const bus of this.buses) {
        bus.s.reset();
        bus.valid = false;
      }
    }

    // Song seconds being heard right now (the input fed `delay` samples ago).
    heard() {
      let t = this.pos - (this.delay * this.rate) / this.sampleRate;
      const lp = this.loop;
      if (lp.on && t < lp.start && this.pos >= lp.start) t += lp.end - lp.start;
      return Math.min(Math.max(0, t), this.duration);
    }

    // ----- rendering --------------------------------------------------------

    // Fills out0/out1 with the next n output samples (n <= bufferLength).
    render(out0, out1, n) {
      out0.fill(0, 0, n);
      out1.fill(0, 0, n);
      if (!this.playing) return;
      const end = Math.round(this.pos * this.sampleRate) + this.inputLatency;
      for (const bus of this.buses) {
        if (!this._busActive(bus)) {
          bus.active = false;
          continue;
        }
        if (!bus.active) {
          bus.s.reset();
          bus.valid = false;
          bus.active = true;
        }
        bus.s.setSemitones(bus.name === "pitched" ? this.semitones : 0);
        this._window(bus, end - bus.s.bufferLength);
        bus.s.run(bus.cache[0], bus.cache[1], this.rate, n, out0, out1);
      }
      for (let i = 0; i < n; i++) {
        out0[i] = softLimit(out0[i]);
        out1[i] = softLimit(out1[i]);
      }
      this.pos += (this.rate * n) / this.sampleRate;
      const lp = this.loop;
      if (lp.on && this.pos >= lp.end) {
        this.pos -= lp.end - lp.start;
      } else if (!lp.on && this.pos * this.sampleRate >= this.length + this.delay * this.rate + n) {
        this.playing = false;
        this.ended = true;
      }
    }

    _busActive(bus) {
      for (const t of this.tracks.values()) {
        if (t.bus === bus.name && t.on && t.gain > 0) return true;
      }
      return false;
    }

    // Makes bus.cache hold the mix of input samples [start, start + bufferLength).
    _window(bus, start) {
      const n = bus.s.bufferLength;
      if (bus.valid && start === bus.cacheStart) return;
      if (bus.valid && start > bus.cacheStart && start < bus.cacheStart + n) {
        const shift = start - bus.cacheStart;
        const keep = n - shift;
        bus.cache[0].copyWithin(0, shift, n);
        bus.cache[1].copyWithin(0, shift, n);
        this._mix(bus, bus.cacheStart + n, shift, keep);
      } else {
        this._mix(bus, start, n, 0);
      }
      bus.cacheStart = start;
      bus.valid = true;
    }

    // Mixes input samples [absStart, absStart + count) of the bus's tracks
    // into its cache at `offset`.
    _mix(bus, absStart, count, offset) {
      const c0 = bus.cache[0];
      const c1 = bus.cache[1];
      c0.fill(0, offset, offset + count);
      c1.fill(0, offset, offset + count);
      for (const t of this.tracks.values()) {
        if (t.bus !== bus.name || !t.on || t.gain <= 0) continue;
        const a = Math.max(absStart, 0);
        const b = Math.min(absStart + count, t.length);
        if (b <= a) continue;
        const L = t.ch[0];
        const R = t.ch[1] || t.ch[0];
        const g = t.gain / 32768;
        let o = offset + (a - absStart);
        if (t.gain <= 1) {
          for (let i = a; i < b; i++, o++) {
            c0[o] += L[i] * g;
            c1[o] += R[i] * g;
          }
        } else {
          for (let i = a; i < b; i++, o++) {
            c0[o] += softLimit(L[i] * g);
            c1[o] += softLimit(R[i] * g);
          }
        }
      }
    }
  }

  EngineCore.softLimit = softLimit;
  globalThis.EuteriaEngineCore = EngineCore;
})();
