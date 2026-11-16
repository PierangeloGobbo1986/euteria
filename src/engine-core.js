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
 * song. The song lasts as long as its longest track, or `minLength` (a project
 * with no audio of its own); while a take is recorded (`endless`) playback
 * goes on past its end, and the take makes the song longer.
 *
 * The metronome clicks at the song times it is given (the beats of the grid,
 * or the beats found in the song: src/metronome.js), as they come out, so it
 * follows the tempo, the loop and every jump with the song; it is mixed after
 * the stretchers, at its own pitch. Its silent bars silence the clicks, the
 * tracks (faded out and in over a few milliseconds) or both. A count-in plays
 * the clicks of the bars before a downbeat (the start point, or the downbeat
 * the song comes in before: its pickup, or a start from inside a bar): those
 * before the start point with the song silent, then the song starts on time
 * with them, and those still to come go on over the song up to that
 * downbeat, the metronome off too. "emission" runs through the silent part
 * as through the stretcher's delay.
 */
(function () {
  "use strict";

  // Soft limiter, as _soft_limit() in EUTERIA (Python): untouched up to 0.9,
  // then a tanh knee that never reaches 1.0. It keeps a track raised over 100%
  // under full scale.
  const LIMIT = 0.9;
  const SPAN = 1 - LIMIT;
  function softLimit(x) {
    if (x > LIMIT) return LIMIT + SPAN * Math.tanh((x - LIMIT) / SPAN);
    if (x < -LIMIT) return -LIMIT - SPAN * Math.tanh((-x - LIMIT) / SPAN);
    return x;
  }

  // The limiter of the whole mix in live playback: where the sum would go over
  // LIMIT the gain drops at once, just enough, then comes back over
  // RELEASE_SECONDS. The peaks are lowered rather than cut, which a song and a
  // take played together need (a mastered song already reaches full scale).
  const RELEASE_SECONDS = 0.12;
  // While the metronome clicks over the song, a gain the limiter lowered stays
  // down for HOLD_BARS bars, or as many as the silent bars and one more
  // (MAX_HOLD_SECONDS at most), and then comes back over
  // CLICK_RELEASE_SECONDS. On a loud song each click goes over LIMIT: coming
  // back at once, the whole mix would dip with every click and swell between
  // them (the song pumping with the beat); held, it stays at one level.
  const HOLD_BARS = 2;
  const MAX_HOLD_SECONDS = 16;
  const CLICK_RELEASE_SECONDS = 1.5;
  // A peak this near the limit (2 dB under it) holds the gain too: a click
  // lands on the song's waveform a little differently each time, and needs a
  // little more or less, which must not move the level.
  const HOLD_NEAR = 0.8;

  // Signalsmith's default quality (120 ms blocks every 30 ms), with the work of
  // each block spread over the audio callbacks instead of done all at once:
  // done at once, it overflowed single callbacks on phones and crackled.
  const BLOCK_SECONDS = 0.12;
  const INTERVAL_SECONDS = 0.03;
  const TONALITY_HZ = 8000; // Signalsmith's default tonality limit
  const MIN_LOOP_SECONDS = 0.25;
  const MAX_BLOCK = 2048; // largest block render() accepts

  // The metronome's click: a sine burst with its octave, higher for an
  // accent, with a fast attack and a short decay; the levels are those of a
  // volume of 100%, which goes up to 200%.
  const CLICK_HZ = [1318.5, 1975.5]; // E6 for a beat, B6 for an accent
  const CLICK_OCTAVE = 0.25; // the octave above, for a brighter click
  const CLICK_LEVEL = [0.32, 0.45];
  const CLICK_ATTACK = 0.001;
  const CLICK_DECAY = 0.024;
  const CLICK_SECONDS = 0.12;
  const MAX_CLICK_VOLUME = 2;
  // The tracks of a silent bar fade out and back in over FADE_SECONDS, ending
  // LEAD_SECONDS before the bar line: the first beat of a silent bar is
  // silent, that of the bar after it whole.
  const FADE_SECONDS = 0.006;
  const LEAD_SECONDS = 0.01;

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
      // through the limiter. The MP3 export turns it off: it measures the
      // whole song first and lowers it instead, as EUTERIA (Python) does.
      this.masterLimit = true;
      this.limitGain = 1;
      this.limitRelease = 1 - Math.exp(-1 / (sampleRate * RELEASE_SECONDS));
      this.limitReleaseClicks = 1 - Math.exp(-1 / (sampleRate * CLICK_RELEASE_SECONDS));
      this.limitHold = 0; // output samples the gain stays down (the metronome on)
      this.length = 0; // samples of the longest track (or minLength)
      this.minLength = 0; // samples the song lasts at least
      this.endless = false; // a take being recorded: playback goes on past the end
      // While a take is recorded, what the tracks play without the clicks, for
      // the take's level (src/level.js).
      this.measureTracks = false;
      this.preL = new Float32Array(MAX_BLOCK);
      this.preR = new Float32Array(MAX_BLOCK);
      this.list = []; // the tracks as an array, for the audio loop
      // The metronome (setMetronome()): its clicks as song samples, their
      // kind (0 a beat, 1 an accent, 2 silent) and whether each starts a bar;
      // play/mute: bars on, then bars silent (mute 0: always on), or silent
      // at random in that proportion; silence: what a silent bar silences (0
      // the clicks, 1 the clicks and the tracks, 2 the tracks); bar: song
      // samples of a bar, for the count-in.
      this.metro = { on: false, volume: 1, times: new Float64Array(0), kinds: new Uint8Array(0), firsts: new Uint8Array(0), play: 0, mute: 0, random: false, silence: 0, bar: 0 };
      this.click = { left: 0, t: 0, w: 0, level: 0 }; // the click sounding
      this.nextClick = 0; // index of the next click along the playback path
      this.lastPos = -Infinity; // the song sample of the last output sample
      this.barsHeard = 0; // bars started since playback started
      this.barSilent = false; // the bar playing now is a silent one
      this.nextSilent = false; // the bar after it (decided ahead, for the tracks)
      this.nextFirst = 0; // index of the next click that starts a bar
      this.tracksGain = 1; // the tracks, faded out in a silent bar
      this.fadeStep = 1 / Math.max(1, FADE_SECONDS * sampleRate);
      this.lead = (FADE_SECONDS + LEAD_SECONDS) * sampleRate; // output samples
      this.seed = (Math.random() * 4294967296) >>> 0; // for the bars silent at random
      this.preroll = 0; // output samples of count-in left
      this.passes = 0; // times the loop went round (for the speed trainer)
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

    // The song lasts at least `seconds` (a project with no audio of its own).
    setMinLength(seconds) {
      this.minLength = Math.max(0, Math.round((+seconds || 0) * this.sampleRate));
      this._lengthChanged();
    }

    _lengthChanged() {
      let n = this.minLength;
      for (const t of this.tracks.values()) n = Math.max(n, t.start + t.length);
      this.length = n;
      this._tracksChanged();
    }

    // ----- transport --------------------------------------------------------

    get duration() {
      return this.length / this.sampleRate;
    }

    // countIn: bars of clicks before the song starts; countEnd: the downbeat
    // they end on (song seconds; null: the start point), at or after the
    // start point (the song comes in during the count-in's last bar) or just
    // before it.
    play(at, countIn, countEnd = null) {
      if (at !== undefined && at !== null) this.out = this._sample(at);
      if (this.out >= this.length) this.out = 0;
      // As in EUTERIA (Python): playing with the loop on starts inside it.
      if (this.loop.on && (this.out < this.loopA || this.out >= this.loopB)) this.out = this.loopA;
      this.playing = true;
      this.ended = false;
      this._restart();
      const bars = Math.max(0, Math.min(4, Math.round(+countIn || 0)));
      if (bars && this.metro.bar > 0 && this.metro.times.length) {
        const end = countEnd !== null && countEnd !== undefined && Number.isFinite(+countEnd) ? Math.round(+countEnd * this.sampleRate) : this.out;
        // The part before the start point, in whole audio blocks of 128
        // samples, so that it ends with a block.
        const samples = Math.max(0, (this.out - (end - bars * this.metro.bar)) / this.rate - this.delay);
        this.preroll = Math.ceil(samples / 128) * 128;
        this.countEnd = end;
        this._findClick(this.emission());
      }
    }

    // Stops where the listener is: the audio still on its way to the output
    // is dropped, so "out" goes back to the moment being heard.
    pause() {
      if (this.playing) this.out = Math.round(this.heard() * this.sampleRate);
      this.playing = false;
      this.preroll = 0;
      this.click.left = 0;
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
      return Math.min(Math.max(0, t / sr), this.endless ? Infinity : this.duration);
    }

    // The song sample coming out now, along the playback path and not clamped:
    // before the start point during a count-in and while the first `delay`
    // samples come out, still at the end of the loop just after "out" went
    // back to its start. A recording lines up with the song from it.
    emission() {
      if (this.sinceStart < this.delay) return this.startOut - (this.preroll + this.delay - this.sinceStart) * this.rate;
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
      // The limiter starts afresh (a gain held for the clicks of before goes).
      this.limitGain = 1;
      this.limitHold = 0;
      this.frac = 0;
      this.preroll = 0;
      this.countEnd = -Infinity;
      this.barsHeard = 0;
      this.barSilent = false;
      this.nextSilent = false;
      this.click.left = 0;
      this._findClick(this.emission());
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
      if (!this.playing) {
        if (this.measureTracks) {
          this.preL.fill(0, 0, n);
          this.preR.fill(0, 0, n);
        }
        return;
      }
      // A count-in: its clicks only, the song waiting.
      if (this.preroll > 0) {
        if (this.measureTracks) {
          this.preL.fill(0, 0, n);
          this.preR.fill(0, 0, n);
        }
        this._clicks(out0, out1, n, this.emission(), true);
        if (this.masterLimit) this._limit(out0, out1, n);
        this.preroll = Math.max(0, this.preroll - n);
        if (!this.preroll) {
          // The bars of the song are counted from here; the first is never silent.
          this.barsHeard = 0;
          this.barSilent = false;
          this.nextSilent = false;
        }
        return;
      }
      // The clicks: the metronome's, or the rest of a count-in over the song.
      const e = this.emission();
      const e0 = (this.metro.on || e < this.countEnd) && this.metro.times.length ? e : null;
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
      if (this.measureTracks) {
        this.preL.set(out0.subarray(0, n));
        this.preR.set(out1.subarray(0, n));
      }
      if (e0 !== null) this._clicks(out0, out1, n, e0, !this.metro.on);
      else {
        this.click.left = 0;
        this.barSilent = false;
        this.nextSilent = false;
        if (this.tracksGain < 1) this._fadeIn(out0, out1, n);
      }
      if (this.masterLimit) this._limit(out0, out1, n);
      this.feed = this._advance(this.feed, k);
      if (this.loop.on && this.out < this.loopB && this.out + k >= this.loopB) this.passes++;
      this.out = this._advance(this.out, k);
      this.sinceStart += n;
      if (!this.loop.on && !this.endless && this.out >= this.length + this.delay * this.rate + n) {
        this.playing = false;
        this.ended = true;
      }
    }

    // ----- metronome --------------------------------------------------------

    // m: {on, volume (0 to 2), times (song seconds, in order), kinds, firsts,
    // play, mute (bars), random, silence (0, 1, 2), bar (song seconds of a
    // bar), seed (optional: the bars silent at random repeat with it)};
    // arrays as above.
    setMetronome(m) {
      const sr = this.sampleRate;
      const metro = this.metro;
      metro.on = !!m.on;
      metro.volume = Math.max(0, Math.min(MAX_CLICK_VOLUME, +m.volume || 0));
      metro.random = !!m.random;
      metro.silence = m.silence === 1 || m.silence === 2 ? m.silence : 0;
      if (Number.isFinite(m.seed)) this.seed = m.seed >>> 0;
      if (m.times) {
        const t = m.times;
        metro.times = new Float64Array(t.length);
        for (let i = 0; i < t.length; i++) metro.times[i] = t[i] * sr;
        metro.kinds = m.kinds ? new Uint8Array(m.kinds) : new Uint8Array(t.length);
        metro.firsts = m.firsts ? new Uint8Array(m.firsts) : new Uint8Array(t.length);
      }
      metro.play = Math.max(0, Math.round(+m.play || 0));
      metro.mute = Math.max(0, Math.round(+m.mute || 0));
      metro.bar = Math.max(0, (+m.bar || 0) * sr);
      this._findClick(this.lastPos === -Infinity ? this.emission() : this.lastPos);
    }

    // The next click from song sample `pos` on.
    _findClick(pos) {
      const t = this.metro.times;
      let lo = 0;
      let hi = t.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (t[mid] < pos) lo = mid + 1;
        else hi = mid;
      }
      this.nextClick = lo;
      this.nextFirst = lo;
      this.lastPos = pos;
    }

    // Whether bar `b` (1: the first since playback started) is silent: after
    // `play` bars, `mute` bars, again and again; or, at random, as often (the
    // first `play` bars on).
    _silentBar(b) {
      const m = this.metro;
      if (!(m.mute > 0 && m.play > 0) || b <= 0) return false;
      if (m.random) return b > m.play && this._random() < m.mute / (m.play + m.mute);
      return (b - 1) % (m.play + m.mute) >= m.play;
    }

    // A number in [0, 1) (mulberry32).
    _random() {
      let s = (this.seed = (this.seed + 0x6d2b79f5) | 0);
      s = Math.imul(s ^ (s >>> 15), s | 1);
      s ^= s + Math.imul(s ^ (s >>> 7), s | 61);
      return ((s ^ (s >>> 14)) >>> 0) / 4294967296;
    }

    // The tracks back up after a silent bar, the metronome now off.
    _fadeIn(out0, out1, n) {
      let g = this.tracksGain;
      for (let i = 0; i < n && g < 1; i++) {
        g = Math.min(1, g + this.fadeStep);
        out0[i] *= g;
        out1[i] *= g;
      }
      this.tracksGain = g;
    }

    // Adds the clicks of the n output samples from song sample e0 on (the
    // loop's jump back followed), and fades the tracks (already in out0 and
    // out1) out and in for the silent bars that take them. countIn: the beats
    // as set (accent, beat, silent), on or off, outside the bars with and
    // without the clicks.
    _clicks(out0, out1, n, e0, countIn) {
      const metro = this.metro;
      const t = metro.times;
      const c = this.click;
      const sr = this.sampleRate;
      const r = this.rate;
      const wrap = this.loop.on && !countIn ? this.loopB - this.loopA : 0;
      let pos = e0;
      if (pos < this.lastPos - r * 2 || pos > this.lastPos + r * (n + 2) + 1) this._findClick(pos);
      for (let i = 0; i < n; i++, pos += r) {
        if (wrap && pos >= this.loopB && e0 < this.loopB) {
          pos -= wrap;
          this._findClick(pos);
        }
        while (this.nextClick < t.length && t[this.nextClick] <= pos) {
          const k = this.nextClick++;
          if (pos - t[k] > r * 2) continue; // passed while jumping
          if (countIn && t[k] >= this.countEnd) continue; // past the count-in's downbeat
          if (metro.firsts[k]) {
            this.barsHeard++;
            if (!countIn) {
              this.barSilent = this.nextSilent;
              this.nextSilent = this._silentBar(this.barsHeard + 1);
            }
          }
          let kind = metro.kinds[k];
          if (!countIn && this.barSilent && metro.silence !== 2) kind = 2;
          if (kind === 2) continue;
          c.left = Math.round(CLICK_SECONDS * sr);
          c.t = 0;
          c.w = (2 * Math.PI * CLICK_HZ[kind]) / sr;
          c.level = CLICK_LEVEL[kind] * metro.volume;
        }
        if (!countIn) {
          // The tracks: silent or not as the bar coming up in `lead` will be.
          while (this.nextFirst < t.length && (this.nextFirst < this.nextClick || !metro.firsts[this.nextFirst])) this.nextFirst++;
          const ahead = this.nextFirst < t.length && t[this.nextFirst] - pos <= this.lead * r;
          const target = (ahead ? this.nextSilent : this.barSilent) && metro.silence !== 0 ? 0 : 1;
          let g = this.tracksGain;
          if (g !== target) g = this.tracksGain = target > g ? Math.min(1, g + this.fadeStep) : Math.max(0, g - this.fadeStep);
          if (g !== 1) {
            out0[i] *= g;
            out1[i] *= g;
          }
        }
        if (c.left > 0) {
          const time = c.t / sr;
          const env = (time < CLICK_ATTACK ? time / CLICK_ATTACK : 1) * Math.exp(-time / CLICK_DECAY);
          const v = c.level * env * (Math.sin(c.w * c.t) + CLICK_OCTAVE * Math.sin(2 * c.w * c.t));
          out0[i] += v;
          out1[i] += v;
          c.t++;
          c.left--;
        }
      }
      this.lastPos = pos;
    }

    // The mix kept under LIMIT (see RELEASE_SECONDS); with the metronome
    // clicking over the song, the gain held down (see HOLD_BARS).
    _limit(out0, out1, n) {
      let g = this.limitGain;
      const clicking = this.metro.on && this.metro.bar > 0;
      let hold = clicking ? this.limitHold : 0;
      const bars = Math.max(HOLD_BARS, this.metro.mute + 1);
      const holdFor = clicking ? Math.min(MAX_HOLD_SECONDS * this.sampleRate, (bars * this.metro.bar) / this.rate) : 0;
      const rel = clicking ? this.limitReleaseClicks : this.limitRelease;
      for (let i = 0; i < n; i++) {
        const a = out0[i] < 0 ? -out0[i] : out0[i];
        const b = out1[i] < 0 ? -out1[i] : out1[i];
        const peak = a > b ? a : b;
        if (hold > 0) hold--;
        else g += (1 - g) * rel;
        if (peak * g > LIMIT) {
          g = LIMIT / peak;
          hold = holdFor;
        } else if (holdFor && peak * g > LIMIT * HOLD_NEAR) hold = holdFor;
        out0[i] *= g;
        out1[i] *= g;
      }
      this.limitGain = g;
      this.limitHold = hold;
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
