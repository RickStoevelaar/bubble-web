import { SFX_ENV, type Env, type VoiceSpec, type Wave } from "./sfx";

/** One scheduled voice: its source plus every node to disconnect when it is done. */
interface Voice {
  src: AudioScheduledSourceNode;
  gain: GainNode;
  nodes: AudioNode[];
  /** AudioContext time after which nothing of it can sound. */
  end: number;
}

const DUTY: Record<"pulse12" | "pulse25" | "pulse50", number> = { pulse12: 0.125, pulse25: 0.25, pulse50: 0.5 };
const HARMONICS = 32;
const NOISE_SECONDS = 1;

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

/** One shared looping white-noise buffer per context (deterministic LCG so the sound is the same every time). */
function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let b = noiseBuffers.get(ctx);
  if (!b) {
    const n = Math.floor(ctx.sampleRate * NOISE_SECONDS);
    b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0);
    let s = 0x1234567;
    for (let i = 0; i < n; i++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      d[i] = s / 0x80000000 - 1;
    }
    noiseBuffers.set(ctx, b);
  }
  return b;
}

/** Fourier series of a pulse of the given duty cycle (DC removed). */
function pulseWave(ctx: BaseAudioContext, duty: number): PeriodicWave {
  const re = new Float32Array(HARMONICS + 1);
  const im = new Float32Array(HARMONICS + 1);
  for (let n = 1; n <= HARMONICS; n++) {
    re[n] = Math.sin(2 * Math.PI * n * duty) / (n * Math.PI);
    im[n] = (1 - Math.cos(2 * Math.PI * n * duty)) / (n * Math.PI);
  }
  return ctx.createPeriodicWave(re, im);
}

/**
 * Chip-style voices over WebAudio. Every call schedules short-lived nodes at context time `t` with an amplitude
 * envelope; the nodes are stopped and disconnected after their end time (`sweep`, or earlier via `onended`).
 */
export class Chip {
  private voices: Voice[] = [];
  private readonly waves = new Map<string, PeriodicWave>();
  private noiseSeq = 0;

  constructor(
    private readonly ctx: AudioContext,
    private readonly destination: AudioNode,
  ) {}

  /** Voices scheduled and not yet released. */
  get count(): number {
    return this.voices.length;
  }

  pulse(t: number, freq: number, dur: number, duty: 0.125 | 0.25 | 0.5, vol: number, env: Env = SFX_ENV): void {
    const wave = duty === 0.125 ? "pulse12" : duty === 0.25 ? "pulse25" : "pulse50";
    this.play({ wave, freq, dur, vol, env }, t);
  }

  tri(t: number, freq: number, dur: number, vol: number, env: Env = SFX_ENV): void {
    this.play({ wave: "tri", freq, dur, vol, env }, t);
  }

  /** Filtered noise; `tone` is the band-pass centre in Hz. */
  noise(t: number, dur: number, vol: number, tone = 4000, env: Env = SFX_ENV): void {
    this.play({ wave: "noise", freq: tone, dur, vol, env }, t);
  }

  slide(t: number, wave: Wave, from: number, to: number, dur: number, vol: number, env: Env = SFX_ENV): void {
    this.play({ wave, freq: from, slideTo: to, dur, vol, env }, t);
  }

  /** Schedules one voice (spec.delay is added to `t`). `pitch` scales the frequency. */
  play(spec: VoiceSpec, t: number, pitch = 1): void {
    const ctx = this.ctx;
    const env = spec.env ?? SFX_ENV;
    const start = t + (spec.delay ?? 0);
    const dur = Math.max(0.01, spec.dur);
    const attack = Math.min(env.attack, dur);
    const decay = Math.min(env.decay, Math.max(0, dur - attack));
    // Event times must never go backwards (float sums can differ in the last bit): clamp each to the previous.
    const tAttack = start + attack;
    const tDecay = Math.max(tAttack, start + attack + decay);
    const tEnd = Math.max(tDecay, start + dur);
    const tRel = tEnd + env.release;
    const stopAt = tRel + 0.01;

    const gain = ctx.createGain();
    const g = gain.gain;
    g.setValueAtTime(0, start);
    g.linearRampToValueAtTime(spec.vol, tAttack);
    g.linearRampToValueAtTime(spec.vol * env.sustain, tDecay);
    g.linearRampToValueAtTime(spec.vol * env.sustain * env.tail, tEnd);
    g.linearRampToValueAtTime(0, tRel);

    const nodes: AudioNode[] = [gain];
    let src: AudioScheduledSourceNode;
    if (spec.wave === "noise") {
      const s = ctx.createBufferSource();
      s.buffer = noiseBuffer(ctx);
      s.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.Q.value = 0.9;
      filter.frequency.setValueAtTime(spec.freq, start);
      if (spec.slideTo) filter.frequency.exponentialRampToValueAtTime(spec.slideTo, start + dur);
      s.connect(filter);
      filter.connect(gain);
      nodes.push(s, filter);
      src = s;
      s.start(start, (this.noiseSeq++ * 0.137) % (NOISE_SECONDS * 0.8));
    } else {
      const o = ctx.createOscillator();
      if (spec.wave === "tri") o.type = "triangle";
      else {
        let w = this.waves.get(spec.wave);
        if (!w) this.waves.set(spec.wave, (w = pulseWave(ctx, DUTY[spec.wave])));
        o.setPeriodicWave(w);
      }
      const f0 = spec.freq * pitch;
      o.frequency.setValueAtTime(f0, start);
      if (spec.slideTo) o.frequency.exponentialRampToValueAtTime(spec.slideTo * pitch, start + dur);
      o.connect(gain);
      nodes.push(o);
      src = o;
      o.start(start);
    }
    gain.connect(this.destination);
    src.stop(stopAt);
    const voice: Voice = { src, gain, nodes, end: stopAt };
    src.onended = () => this.release(voice);
    this.voices.push(voice);
  }

  /** Releases every voice whose end time has passed. */
  sweep(): void {
    const now = this.ctx.currentTime;
    for (let i = this.voices.length - 1; i >= 0; i--) {
      const v = this.voices[i]!;
      if (v.end + 0.02 < now) this.release(v);
    }
  }

  /** Silences everything: a short fade (voices linger until `sweep` frees them), or at once. */
  stopAll(fade = 0.015, immediate = false): void {
    const now = this.ctx.currentTime;
    for (const v of this.voices.slice()) {
      if (immediate) {
        this.release(v);
        continue;
      }
      try {
        v.gain.gain.cancelScheduledValues(now);
        v.gain.gain.setTargetAtTime(0, now, fade / 3);
        v.src.stop(now + fade);
      } catch {
        this.release(v);
        continue;
      }
      v.end = Math.min(v.end, now + fade);
    }
  }

  private release(v: Voice): void {
    const i = this.voices.indexOf(v);
    if (i < 0) return;
    this.voices.splice(i, 1);
    v.src.onended = null;
    try {
      v.src.stop();
    } catch {
      /* never started or already stopped */
    }
    for (const n of v.nodes) {
      try {
        n.disconnect();
      } catch {
        /* already disconnected */
      }
    }
  }
}
