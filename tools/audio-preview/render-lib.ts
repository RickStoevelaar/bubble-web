// Pure-JS software synth for listening to the game's audio without a browser. It reads the SAME data tables as the
// client (client/src/audio/sfx.ts and music.ts) but has its own, independent voice renderer that mirrors the Chip's
// waveforms and envelopes (pulse 12.5/25/50 %, triangle, band-passed noise, slide, attack/decay/sustain/tail/release).
import { MIX, SFX, SFX_ENV, SFX_NAMES, type Env, type SfxName, type VoiceSpec, type Wave } from "../../client/src/audio/sfx";
import { TRACKS, loopSeconds, stepSeconds, voiceForNote, type TrackName } from "../../client/src/audio/music";

export const SAMPLE_RATE = 44100;

const DUTY: Record<string, number> = { pulse12: 0.125, pulse25: 0.25, pulse50: 0.5 };

function envAt(t: number, dur: number, vol: number, e: Env): number {
  if (t < 0) return 0;
  const attack = Math.min(e.attack, dur);
  const decay = Math.min(e.decay, Math.max(0, dur - attack));
  if (t < attack) return (vol * t) / attack;
  const sus = vol * e.sustain;
  if (t < attack + decay) return vol + ((sus - vol) * (t - attack)) / decay;
  const tail = sus * e.tail;
  if (t < dur) return sus + ((tail - sus) * (t - attack - decay)) / Math.max(1e-9, dur - attack - decay);
  if (t < dur + e.release) return (tail * (dur + e.release - t)) / e.release;
  return 0;
}

/** Deterministic noise + RBJ band-pass (Q 0.9), matching the engine's looped white noise through a band-pass. */
function makeNoise(freq: number, sr: number, seed: number): () => number {
  let s = (0x1234567 + seed * 7919) >>> 0;
  const w0 = (2 * Math.PI * Math.min(freq, sr * 0.45)) / sr;
  const alpha = Math.sin(w0) / (2 * 0.9);
  const a0 = 1 + alpha;
  const b0 = alpha / a0;
  const b2 = -alpha / a0;
  const a1 = (-2 * Math.cos(w0)) / a0;
  const a2 = (1 - alpha) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const x = s / 0x80000000 - 1;
    const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    return y * 2.2; // the band-pass strips most of the energy: bring it back near the oscillators' level
  };
}

/** Mixes one voice into `out` starting at sample `start` (indices past the end wrap when `wrap`, else are dropped). */
export function renderVoice(
  out: Float32Array,
  start: number,
  wave: Wave,
  freq: number,
  slideTo: number | undefined,
  dur: number,
  vol: number,
  env: Env = SFX_ENV,
  gain = 1,
  wrap = false,
  seed = 0,
): void {
  const sr = SAMPLE_RATE;
  const total = Math.ceil((dur + env.release) * sr);
  const noise = wave === "noise" ? makeNoise(freq, sr, seed) : null;
  let phase = 0;
  for (let i = 0; i < total; i++) {
    let idx = start + i;
    if (idx >= out.length) {
      if (!wrap) break;
      idx %= out.length;
    }
    const t = i / sr;
    const f = slideTo ? freq * Math.pow(slideTo / freq, Math.min(1, t / dur)) : freq;
    let x: number;
    if (noise) x = noise();
    else {
      phase += f / sr;
      phase -= Math.floor(phase);
      if (wave === "tri") x = 4 * Math.abs(phase - 0.5) - 1;
      else x = phase < DUTY[wave]! ? 1 : -1;
    }
    out[idx]! += x * envAt(t, dur, vol, env) * gain;
  }
}

const sfxGain = MIX.master * MIX.defaultVolume * MIX.sfx;
const musicGain = MIX.master * MIX.defaultVolume * MIX.music;

function addVoice(out: Float32Array, spec: VoiceSpec, atSec: number, gain: number, wrap: boolean, seed: number): void {
  renderVoice(out, Math.round((atSec + (spec.delay ?? 0)) * SAMPLE_RATE), spec.wave, spec.freq, spec.slideTo, spec.dur, spec.vol, spec.env, gain, wrap, seed);
}

export function renderSfx(name: SfxName): Float32Array {
  const voices = SFX[name].voices;
  const end = Math.max(...voices.map((v) => (v.delay ?? 0) + v.dur + (v.env ?? SFX_ENV).release));
  const out = new Float32Array(Math.ceil((end + 0.05) * SAMPLE_RATE));
  voices.forEach((v, i) => addVoice(out, v, 0, sfxGain, false, i));
  return out;
}

/** One loop (a play-once track plays once, then its release tail). Loop tails wrap to the start for a seamless join. */
export function renderTrack(name: TrackName): Float32Array {
  const t = TRACKS[name];
  const len = Math.round(loopSeconds(t) * SAMPLE_RATE);
  const out = new Float32Array(t.loop ? len : len + Math.round(0.5 * SAMPLE_RATE));
  const stepSec = stepSeconds(t);
  t.notes.forEach((n, i) => addVoice(out, voiceForNote(n, stepSec), n.step * stepSec, musicGain, t.loop, i));
  return out;
}

export function rms(s: Float32Array): number {
  let a = 0;
  for (let i = 0; i < s.length; i++) a += s[i]! * s[i]!;
  return Math.sqrt(a / Math.max(1, s.length));
}

export function peak(s: Float32Array): number {
  let p = 0;
  for (let i = 0; i < s.length; i++) p = Math.max(p, Math.abs(s[i]!));
  return p;
}

/** 16-bit mono PCM WAV. */
export function encodeWav(samples: Float32Array, rate: number): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const v = new DataView(bytes.buffer);
  const tag = (o: number, s: string): void => void [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  tag(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  tag(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, samples[i]!)) * 32767), true);
  return bytes;
}

export function parseWav(b: Uint8Array): { channels: number; sampleRate: number; bits: number; dataBytes: number; samples: number } {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const tag = (o: number): string => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE" || tag(12) !== "fmt " || tag(36) !== "data") throw new Error("not a WAV");
  const bits = v.getUint16(34, true);
  const dataBytes = v.getUint32(40, true);
  return { channels: v.getUint16(22, true), sampleRate: v.getUint32(24, true), bits, dataBytes, samples: dataBytes / (bits / 8) };
}

export interface Rendered {
  file: string;
  samples: Float32Array;
}

/** Every sound effect and every track, in a stable order. */
export function renderAll(): Rendered[] {
  return [
    ...SFX_NAMES.map((n) => ({ file: `sfx-${n}.wav`, samples: renderSfx(n) })),
    ...(Object.keys(TRACKS) as TrackName[]).map((n) => ({ file: `music-${n}.wav`, samples: renderTrack(n) })),
  ];
}
