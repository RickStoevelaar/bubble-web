import type { SimEvent } from "@bubble/shared";

/** Pure data and mapping: no WebAudio here, so the offline preview renderer can share it. */

export type Wave = "pulse12" | "pulse25" | "pulse50" | "tri" | "noise";

/** Amplitude envelope in seconds; `sustain` is the level after the decay, `tail` the level reached by the note's end. */
export interface Env {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  tail: number;
}

export const SFX_ENV: Env = { attack: 0.003, decay: 0.05, sustain: 0.7, release: 0.03, tail: 0.5 };

/** One synthesized voice. For `noise`, `freq` is the band-pass centre in Hz. */
export interface VoiceSpec {
  wave: Wave;
  freq: number;
  /** Exponential glide target at the end of the note (Hz). */
  slideTo?: number;
  dur: number;
  vol: number;
  /** Start offset in seconds from the sound's start. */
  delay?: number;
  env?: Env;
}

/** Gain staging shared by the engine and the preview: master = 0.5 x user volume, then the two buses. */
export const MIX = { master: 0.5, music: 0.45, sfx: 0.8, defaultVolume: 0.7 } as const;

const POP_SEMITONES = [0, 2, 4, 7, 9, 12, 14, 16]; // major pentatonic climb from C5
const POP_BASE = 523.25;
const hz = (semi: number): number => POP_BASE * Math.pow(2, semi / 12);

export type PopName = `pop${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`;
export type SfxName =
  | "jump"
  | "blow"
  | PopName
  | "fizzle"
  | "boing"
  | "collect"
  | "death"
  | "deathSoft"
  | "oneup"
  | "hurry"
  | "clear"
  | "continue"
  | "join"
  | "gameover";

export interface SfxDef {
  voices: VoiceSpec[];
  /** Minimum spacing between two starts of this sound (a family shares it), in seconds. */
  gap: number;
  /** A sound that would have to wait longer than this to respect `gap` is dropped. */
  maxDelay: number;
  /** Rate-limit family; defaults to the name. */
  group?: string;
}

const popDef = (i: number): SfxDef => {
  const f = hz(POP_SEMITONES[i]!);
  return {
    voices: [
      { wave: "pulse50", freq: f, slideTo: f * 0.55, dur: 0.075, vol: 0.32 },
      { wave: "noise", freq: 3200, dur: 0.03, vol: 0.18 },
    ],
    gap: 0.055,
    maxDelay: 0.45,
    group: "pop",
  };
};

const seq = (wave: Wave, freqs: number[], step: number, dur: number, vol: number): VoiceSpec[] =>
  freqs.map((freq, i) => ({ wave, freq, dur, vol, delay: i * step }));

const deathVoices = (k: number): VoiceSpec[] => [
  { wave: "pulse25", freq: 620, slideTo: 90, dur: 0.5 * (0.6 + 0.4 * k), vol: 0.4 * k },
  { wave: "noise", freq: 900, dur: 0.18, vol: 0.14 * k },
];

export const SFX: Record<SfxName, SfxDef> = {
  jump: { voices: [{ wave: "pulse25", freq: 330, slideTo: 700, dur: 0.12, vol: 0.34 }], gap: 0.05, maxDelay: 0.12 },
  blow: {
    voices: [
      { wave: "tri", freq: 420, slideTo: 760, dur: 0.08, vol: 0.4 },
      { wave: "noise", freq: 1800, dur: 0.05, vol: 0.1 },
    ],
    gap: 0.06,
    maxDelay: 0.12,
  },
  pop1: popDef(0),
  pop2: popDef(1),
  pop3: popDef(2),
  pop4: popDef(3),
  pop5: popDef(4),
  pop6: popDef(5),
  pop7: popDef(6),
  pop8: popDef(7),
  // The soft neutral sound for bubble expiry / escape / special expiry: a faint airy hiss, far below a real pop.
  fizzle: { voices: [{ wave: "noise", freq: 2600, dur: 0.06, vol: 0.05 }], gap: 0.12, maxDelay: 0.05 },
  boing: {
    voices: [
      { wave: "tri", freq: 180, slideTo: 520, dur: 0.13, vol: 0.45 },
      { wave: "tri", freq: 520, slideTo: 260, dur: 0.1, vol: 0.3, delay: 0.12 },
    ],
    gap: 0.09,
    maxDelay: 0.12,
  },
  collect: {
    voices: [
      { wave: "pulse25", freq: 880, dur: 0.05, vol: 0.3 },
      { wave: "pulse25", freq: 1319, dur: 0.1, vol: 0.28, delay: 0.05 },
    ],
    gap: 0.06,
    maxDelay: 0.2,
  },
  death: { voices: deathVoices(1), gap: 0.4, maxDelay: 0.05 },
  deathSoft: { voices: deathVoices(0.45), gap: 0.4, maxDelay: 0.05, group: "death" },
  oneup: { voices: seq("pulse50", [523, 659, 784, 1047, 1319], 0.075, 0.09, 0.32), gap: 0.5, maxDelay: 0.05 },
  hurry: {
    voices: [
      { wave: "pulse25", freq: 784, dur: 0.09, vol: 0.3 },
      { wave: "pulse25", freq: 784, dur: 0.09, vol: 0.3, delay: 0.13 },
      { wave: "pulse25", freq: 988, dur: 0.2, vol: 0.3, delay: 0.26 },
    ],
    gap: 1,
    maxDelay: 0.05,
  },
  clear: {
    voices: [
      ...seq("pulse25", [523, 659, 784, 1047], 0.11, 0.1, 0.3).map((v, i) => (i === 3 ? { ...v, dur: 0.4 } : v)),
      { wave: "tri", freq: 262, dur: 0.55, vol: 0.4 },
    ],
    gap: 1.5,
    maxDelay: 0.05,
  },
  continue: {
    voices: [
      { wave: "pulse50", freq: 392, slideTo: 784, dur: 0.18, vol: 0.32 },
      { wave: "pulse50", freq: 784, dur: 0.22, vol: 0.3, delay: 0.2 },
    ],
    gap: 0.6,
    maxDelay: 0.05,
  },
  join: {
    voices: [
      { wave: "pulse25", freq: 523, dur: 0.06, vol: 0.28 },
      { wave: "pulse25", freq: 784, dur: 0.11, vol: 0.28, delay: 0.07 },
    ],
    gap: 0.3,
    maxDelay: 0.05,
  },
  gameover: {
    voices: [
      { wave: "tri", freq: 392, dur: 0.2, vol: 0.45 },
      { wave: "tri", freq: 330, dur: 0.2, vol: 0.45, delay: 0.22 },
      { wave: "tri", freq: 262, dur: 0.2, vol: 0.45, delay: 0.44 },
      { wave: "tri", freq: 196, dur: 0.5, vol: 0.45, delay: 0.66 },
    ],
    gap: 1,
    maxDelay: 0.05,
  },
};

export const SFX_NAMES = Object.keys(SFX) as SfxName[];

// --- event -> sound ------------------------------------------------------------------------

/** Pop-chain and clear de-duplication state, owned by whoever feeds events in (one per game). */
export interface MapperState {
  chain: number;
  lastPopAt: number;
  lastClearAt: number;
}
export const newMapperState = (): MapperState => ({ chain: 0, lastPopAt: -Infinity, lastClearAt: -Infinity });

export interface EventContext {
  localPlayer: 0 | 1;
  /** Monotonic ms. */
  now: number;
  state: MapperState;
}

/** A chain resets after this much silence between pops. */
export const POP_CHAIN_RESET_MS = 400;
/** A second "clear" inside this window is the same victory (letter completion + round clear, boss kill). */
export const CLEAR_DEDUP_MS = 1500;

/**
 * The sound for a sim event, or null for none. Carried rules: a player-less "pop" (bubble expiry, escape,
 * special expiry) is the soft "fizzle" and does not advance the chain; "clear" plays once per 1500 ms.
 */
export function sfxForEvent(e: SimEvent, c: EventContext): SfxName | null {
  const s = c.state;
  switch (e.kind) {
    case "jump":
      return "jump";
    case "fire":
      return "blow";
    case "pop": {
      if (e.player === undefined) return "fizzle";
      if (c.now - s.lastPopAt > POP_CHAIN_RESET_MS) s.chain = 0;
      s.lastPopAt = c.now;
      const step = Math.min(s.chain, POP_SEMITONES.length - 1);
      s.chain++;
      return `pop${step + 1}` as PopName;
    }
    case "bounce":
      return "boing";
    case "collect":
      return "collect";
    case "die":
      return e.player !== undefined && e.player !== c.localPlayer ? "deathSoft" : "death";
    case "oneup":
      return "oneup";
    case "hurry":
      return "hurry";
    case "clear":
      if (c.now - s.lastClearAt < CLEAR_DEDUP_MS) return null;
      s.lastClearAt = c.now;
      return "clear";
    case "continue":
      return "continue";
  }
}
