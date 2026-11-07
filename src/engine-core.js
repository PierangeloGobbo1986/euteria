/*
 * EUTERIA audio engine core.
 *
 * Plain script (no import/export), so the same code runs unchanged in the
 * AudioWorkletGlobalScope (src/engine-processor.js, live playback) and in a Web
 * Worker (src/render-worker.js: the MP3 export, the takes recorded at another
 * tempo or key, the speed test). It needs globalThis.SignalsmithStretchModule,
 * from lib/signalsmith-stretch/signalsmith-module.js, loaded first.
 *
 * Every track is kept as 16-bit PCM at the output sample rate. The tracks that
 * are switched on are mixed into two buses, "pitched" (the full mix and every
 * pitched stem) and "drums", and each bus runs through one Signalsmith Stretch
 * instance. Tempo and key change live, the tracks cannot drift apart because
 * they are mixed sample by sample before stretching, and the drums keep their
 * pitch, as in EUTERIA (Python).
 *
 * The input is streamed: each audio block feeds the stretcher the next few
 * samples of the song (rate x block length), and the stretcher is re-primed only
 * when playback starts or jumps. A loop is a sample-exact splice of the input
 * (loop end followed by loop start), so it never drifts.
 *
 * Positions are song samples at the output sample rate. "out" is the moment of
 * the song the stretcher is producing now; it is heard `delay` output samples
 * later. "feed" runs `inputLatency` samples ahead of "out" along the same path.
 *
 * A track may start later than the song (a take recorded over it): `start`
 * is the song sample of its first sample, negative if it begins before the
 * song.
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

  // Signalsmith's default quality (120 ms blocks every 30 ms), with the work of
  // each block spread over the audio callbacks instead of done all at once:
  // done at once, it overflowed single callbacks on phones and crackled.
  const BLOCK_SECONDS = 0.12;
  const INTERVAL_SECONDS = 0.03;
  const TONALITY_HZ = 8000; // Signalsmith's default tonality limit
  const MIN_LOOP_SECONDS = 0.25;
  const MAX_BLOCK = 2048; // largest block render() accepts

  // One Signalsmith Stretch instance (its own WebAssembly memory), stereo.
  class Stretcher {
    constructor(module, sampleRate) {
      const m = module;
      this.m = m;
      this.channels = 2;
      this.sampleRate = sampleRate;
      m._configure(this.channels, Math.round(BLOCK_SECONDS * sampleRate), Math.round(INTERVAL_SECONDS * sampleRate), true);
      m._reset();
      m._setFormantSemitones(0, false);
      m._setFormantBase(0);
      this.inputLatency = m._inputLatency();
      this.outputLatency = m._outputLatency();
      // Input and output buffers: room for the priming window and for a block.
      this.bufferLength = Math.max(this.inputLatency + this.outputLatency, 2 * MAX_BLOCK + 2);
      const pointer = m._setBuffers(this.channels, this.bufferLength);
      const bytes = this.bufferLength * 4;
      this.inPtr = [pointer, pointer + bytes];
      this.outPtr = [pointer + 2 * bytes, pointer + 3 * bytes];
      this.semitones = null;
      this.memory = null;
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

    // Starts afresh from the window of `windowLength` samples already in the
    // input buffer: the next output corresponds to its sample at
    // windowLength - inputLatency.
    prime(windowLength, rate) {
      this.m._reset();
      this.m._seek(windowLength, rate);
    }

    // Consumes k input samples (already in the input buffer) and adds n output
    // samples to out0/out1.
    stream(k, n, out0, out1) {
      this.m._process(k, n);
      this.views();
      const o0 = this.output[0];
      const o1 = this.output[1];
      for (let i = 0; i < n; i++) {
        out0[i] += o0[i];
        out1[i] += o1[i];
      }
    }
  }

  class EngineCore {
    static async create(sampleRate) {
      const factory = globalThis.SignalsmithStretchModule;
      if (typeof factory !== "function") throw new Error("Signalsmith Stretch is not loaded");
      const modules = await Promise.all([factory(), factory()]);
      for (const m of modules) m._main();
      return new EngineCore(sampleRate, modules);
    }

    constructor(sampleRate, modules) {
      this.sampleRate = sampleRate;
      this.tracks = new Map();
      this.buses = [
        { name: "pitched", s: new Stretcher(modules[0], sampleRate), active: false, hasAudio: false },
        { name: "drums", s: new Stretcher(modules[1], sampleRate), active: false, hasAudio: false },
      ];
      const s = this.buses[0].s;
      this.inputLatency = s.inputLatency;
      this.outputLatency = s.outputLatency;
      this.delay = s.outputLatency; // output samples between producing and hearing
      this.windowLength = s.inputLatency + s.outputLatency;
      this.playing = false;
      this.ended = false;
      this.out = 0;
      this.feed = 0;
      this.frac = 0;
      this.startOut = 0; // where playback last (re)started
      this.sinceStart = 0; // output samples produced since then
      this.rate = 1;
      this.semitones = 0;
      this.loop = { on: false, start: 0, end: 0 };
      this.loopA = 0;
      this.loopB = 0;
      // Live playback cannot know the loudest moment ahead, so the sum goes
      // through the soft limiter. The MP3 export turns it off: it measures the
      // whole song first and lowers it instead, as EUTERIA (Python) does.
      this.masterLimit = true;
      this.length = 0; // samples of the longest track
      this.list = []; // the tracks as an array, for the audio loop
    }

    // ----- tracks -----------------------------------------------------------

    addTrack(key, bus, channels, length, gain, on, start) {
      this.tracks.set(key, {
        key,
        bus: bus === "drums" ? "drums" : "pitched",
        ch: channels,
        length,
        gain: gain === undefined ? 1 : gain,
        on: on === undefined ? true : !!on,
        start: Math.round(+start || 0),
      });
      this._lengthChanged();
    }

    removeTrack(key) {
      this.tracks.delete(key);
      this._lengthChanged();
    }

    _tracksChanged() {
      this.list = [...this.tracks.values()];
      for (const bus of this.buses) {
        bus.hasAudio = this.list.some((t) => t.bus === bus.name && t.on && t.gain > 0);
      }
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
      return out;
    }

    setTrack(key, params) {
      const t = this.tracks.get(key);
      if (!t) return;
      if (params.gain !== undefined) t.gain = Math.max(0, +params.gain);
      if (params.on !== undefined) t.on = !!params.on;
      if (params.start !== undefined) {
        t.start = Math.round(+params.start || 0);
        this._lengthChanged();
        return;
      }
      this._tracksChanged();
    }

    _lengthChanged() {
      let n = 0;
      for (const t of this.tracks.values()) n = Math.max(n, t.start + t.length);
      this.length = n;
      this._tracksChanged();
    }

    // ----- transport --------------------------------------------------------

    get duration() {
      return this.length / this.sampleRate;
    }

    play(at) {
      if (at !== undefined && at !== null) this.out = this._sample(at);
      if (this.out >= this.length) this.out = 0;
      // As in EUTERIA (Python): playing with the loop on starts inside it.
      if (this.loop.on && (this.out < this.loopA || this.out >= this.loopB)) this.out = this.loopA;
      this.playing = true;
      this.ended = false;
      this._restart();
    }

    // Stops where the listener is: the audio still on its way to the output
    // is dropped, so "out" goes back to the moment being heard.
    pause() {
      if (this.playing) this.out = Math.round(this.heard() * this.sampleRate);
      this.playing = false;
    }

    seek(to) {
      this.out = this._sample(to);
      if (this.playing) {
        if (this.loop.on && (this.out < this.loopA || this.out >= this.loopB)) this.out = this.loopA;
        this._restart();
      }
    }

    setRate(rate) {
      this.rate = Math.min(2, Math.max(0.5, +rate || 1));
    }

    setSemitones(semitones) {
      this.semitones = Math.min(24, Math.max(-24, +semitones || 0));
    }

    setLoop(on, start, end) {
      start = Math.max(0, +start || 0);
      end = Math.max(0, +end || 0);
      this.loop = { on: !!on && end - start >= MIN_LOOP_SECONDS, start, end };
      this.loopA = this._sample(start);
      this.loopB = this._sample(end);
      if (this.playing) {
        if (this.loop.on && (this.out < this.loopA || this.out >= this.loopB)) this.out = this.loopA;
        this._restart();
      }
    }

    _sample(seconds) {
      return Math.min(Math.max(0, Math.round((+seconds || 0) * this.sampleRate)), this.length);
    }

    // Song seconds being heard right now. Paused, that is "out" itself; just
    // after playback starts, the start point until its sound reaches the output.
    heard() {
      const sr = this.sampleRate;
      let t;
      if (!this.playing) t = this.out;
      else if (this.sinceStart < this.delay) t = this.startOut;
      else {
        t = this.out - this.delay * this.rate;
        if (this.loop.on && t < this.loopA && this.out >= this.loopA) t += this.loopB - this.loopA;
      }
      return Math.min(Math.max(0, t / sr), this.duration);
    }

    // The song sample coming out now, along the playback path and not clamped:
    // before the start point while the first `delay` samples come out, still
    // at the end of the loop just after "out" went back to its start. A
    // recording lines up with the song from it.
    emission() {
      if (this.sinceStart < this.delay) return this.startOut - (this.delay - this.sinceStart) * this.rate;
      let e = this.out - this.delay * this.rate;
      if (this.loop.on && e < this.loopA && this.out >= this.loopA) e += this.loopB - this.loopA;
      return e;
    }

    // `x` moved forward by d samples along the playback path (loop included).
    _advance(x, d) {
      if (this.loop.on && x < this.loopB && x + d >= this.loopB) return this.loopA + (x + d - this.loopB);
      return x + d;
    }

    _restart() {
      this.startOut = this.out;
      this.sinceStart = 0;
      this.frac = 0;
      this.feed = this._advance(this.out, this.inputLatency);
      for (const bus of this.buses) {
        if (bus.hasAudio) this._prime(bus);
        else bus.active = false;
      }
    }

    // Primes a bus with the window around "out", so it joins in step.
    _prime(bus) {
      const s = bus.s;
      s.views();
      s.setSemitones(bus.name === "pitched" ? this.semitones : 0);
      this._mix(bus, this.out - this.outputLatency, this.windowLength, s.input[0], s.input[1]);
      s.prime(this.windowLength, this.rate);
      bus.active = true;
    }

    // ----- rendering --------------------------------------------------------

    // Fills out0/out1 with the next n output samples (n <= 2048).
    render(out0, out1, n) {
      out0.fill(0, 0, n);
      out1.fill(0, 0, n);
      if (!this.playing) return;
      this.frac += this.rate * n;
      const k = Math.floor(this.frac);
      this.frac -= k;
      for (let b = 0; b < this.buses.length; b++) {
        const bus = this.buses[b];
        if (!bus.hasAudio) {
          bus.active = false;
          continue;
        }
        if (!bus.active) this._prime(bus);
        const s = bus.s;
        s.views();
        s.setSemitones(bus.name === "pitched" ? this.semitones : 0);
        this._mix(bus, this.feed, k, s.input[0], s.input[1]);
        s.stream(k, n, out0, out1);
      }
      if (this.masterLimit) {
        for (let i = 0; i < n; i++) {
          out0[i] = softLimit(out0[i]);
          out1[i] = softLimit(out1[i]);
        }
      }
      this.feed = this._advance(this.feed, k);
      this.out = this._advance(this.out, k);
      this.sinceStart += n;
      if (!this.loop.on && this.out >= this.length + this.delay * this.rate + n) {
        this.playing = false;
        this.ended = true;
      }
    }

    // Mixes `count` samples of the bus's tracks along the playback path from
    // song sample `from` (following the loop) into dst0/dst1 from index 0.
    _mix(bus, from, count, dst0, dst1) {
      dst0.fill(0, 0, count);
      dst1.fill(0, 0, count);
      let x = from;
      let o = 0;
      while (o < count) {
        let len = count - o;
        const bounded = this.loop.on && x < this.loopB;
        if (bounded) len = Math.min(len, this.loopB - x);
        this._mixRange(bus, x, len, dst0, dst1, o);
        o += len;
        x += len;
        if (bounded && x >= this.loopB) x = this.loopA;
      }
    }

    _mixRange(bus, x, len, dst0, dst1, offset) {
      const list = this.list;
      for (let j = 0; j < list.length; j++) {
        const t = list[j];
        if (t.bus !== bus.name || !t.on || t.gain <= 0) continue;
        // Song samples a..b, the track's own samples a - start..b - start.
        const s = t.start;
        const a = Math.max(x, s);
        const b = Math.min(x + len, s + t.length);
        if (b <= a) continue;
        const L = t.ch[0];
        const R = t.ch[1] || t.ch[0];
        const g = t.gain / 32768;
        let o = offset + (a - x);
        const e = b - s;
        if (t.gain <= 1) {
          for (let i = a - s; i < e; i++, o++) {
            dst0[o] += L[i] * g;
            dst1[o] += R[i] * g;
          }
        } else {
          for (let i = a - s; i < e; i++, o++) {
            dst0[o] += softLimit(L[i] * g);
            dst1[o] += softLimit(R[i] * g);
          }
        }
      }
    }
  }

  globalThis.EuteriaEngineCore = EngineCore;
})();
