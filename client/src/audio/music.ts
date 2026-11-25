import type { VoiceSpec, Wave } from "./sfx";

/**
 * Original compositions as data. Everything is on a 16th-note step grid (4 steps per beat, 16 per bar, 4/4).
 * The tunes are written here in a tiny notation (one bar per string, "name/steps", "r" = rest) and expanded to
 * flat note events at load. Motifs are invented from scale patterns and rhythms; none quotes an existing piece.
 */

export type Ch = "lead" | "bass" | "hat" | "harm";
export type TrackName = "main" | "hurry" | "boss" | "ending" | "secret";

/** `note` is a MIDI number, except on "hat" where it selects the noise colour (0 closed, 1 open, 2 snare). */
export interface Note {
  step: number;
  ch: Ch;
  note: number;
  len: number;
}

export interface Track {
  name: TrackName;
  bpm: number;
  key: string;
  /** Loop (or play-once) length in 16th steps. */
  length: number;
  loop: boolean;
  notes: Note[];
}

export const STEPS_PER_BEAT = 4;
export const stepSeconds = (t: Pick<Track, "bpm">): number => 60 / t.bpm / STEPS_PER_BEAT;
export const loopSeconds = (t: Pick<Track, "bpm" | "length">): number => t.length * stepSeconds(t);

const midiToHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

// --- channel voicing -------------------------------------------------------------------------

const MUSIC_ENV = { attack: 0.004, decay: 0.09, sustain: 0.62, release: 0.035, tail: 0.55 };

export const CHANNELS: Record<Ch, { wave: Wave; vol: number }> = {
  lead: { wave: "pulse25", vol: 0.26 },
  harm: { wave: "pulse12", vol: 0.14 },
  bass: { wave: "tri", vol: 0.42 },
  hat: { wave: "noise", vol: 0.2 },
};

const HAT_VOICES = [
  { freq: 7500, dur: 0.03, vol: 0.5 }, // closed
  { freq: 5200, dur: 0.1, vol: 0.45 }, // open
  { freq: 2400, dur: 0.09, vol: 0.8 }, // snare-ish
];

/** The synth voice for a note; shared by the scheduler and the offline renderer. */
export function voiceForNote(n: Note, stepSec: number): VoiceSpec {
  const c = CHANNELS[n.ch];
  if (n.ch === "hat") {
    const h = HAT_VOICES[n.note] ?? HAT_VOICES[0]!;
    return { wave: "noise", freq: h.freq, dur: h.dur, vol: c.vol * h.vol };
  }
  return { wave: c.wave, freq: midiToHz(n.note), dur: Math.max(0.03, n.len * stepSec * 0.96), vol: c.vol, env: MUSIC_ENV };
}

// --- notation --------------------------------------------------------------------------------

const SEMI: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

function pitch(name: string): number {
  const m = /^([a-g])(#|b)?(\d)$/.exec(name);
  if (!m) throw new Error(`bad note name ${name}`);
  return 12 * (Number(m[3]) + 1) + SEMI[m[1]!]! + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
}

/** One bar of 16 steps -> notes starting at `at`. Throws if the bar is not exactly 16 steps (caught by tests/at load). */
function bar(src: string, ch: Ch, at: number): Note[] {
  const out: Note[] = [];
  let s = 0;
  for (const tok of src.trim().split(/\s+/)) {
    const [name, l] = tok.split("/");
    const len = l ? Number(l) : 1;
    if (name !== "r") out.push({ step: at + s, ch, note: pitch(name!), len });
    s += len;
  }
  if (s !== 16) throw new Error(`bar "${src}" is ${s} steps`);
  return out;
}

const melody = (bars: string[], ch: Ch = "lead"): Note[] => bars.flatMap((b, i) => bar(b, ch, i * 16));

type Pat = [step: number, offset: number, len: number][];
/** Per-bar accompaniment from chord roots (MIDI) and a [step, semitone offset, len] pattern. */
const fromRoots = (roots: number[], pat: Pat, ch: Ch): Note[] =>
  roots.flatMap((r, b) => pat.map(([s, off, len]) => ({ step: b * 16 + s, ch, note: r + off, len })));

const hatBars = (bars: number, pat: [number, number][]): Note[] =>
  Array.from({ length: bars }, (_, b) => pat.map(([s, k]) => ({ step: b * 16 + s, ch: "hat" as Ch, note: k, len: 1 }))).flat();

const sortNotes = (n: Note[]): Note[] => n.map((x, i) => ({ x, i })).sort((a, b) => a.x.step - b.x.step || a.i - b.i).map((o) => o.x);

const N = (name: string): number => pitch(name);

// --- main: F major, 150 bpm, 16 bars (A, A', B, C), bright and bouncy ---------------------------

const MAIN_LEAD = [
  // A (bars 1-4): F  Am  Bb  C
  "f4/2 a4/2 c5/2 a4/2 f5/4 c5/2 r/2",
  "e5/2 c5/2 a4/2 c5/2 e5/4 r/4",
  "d5/2 bb4/2 d5/2 f5/2 d5/4 c5/2 bb4/2",
  "c5/2 e5/2 g5/2 e5/2 c5/4 r/4",
  // A' (5-8): F  Dm  Bb  C
  "f4/2 a4/2 c5/2 a4/2 f5/2 a5/2 g5/2 f5/2",
  "d5/2 f5/2 a5/2 f5/2 d5/4 r/4",
  "bb4/2 d5/2 f5/2 d5/2 bb4/2 c5/2 d5/4",
  "c5/4 bb4/2 g4/2 c5/4 r/4",
  // B (9-12): Gm  Dm  C  F   (syncopated 3-3-2)
  "g4/3 bb4/3 d5/2 r/2 d5/3 bb4/3",
  "a4/3 d5/3 f5/2 r/2 f5/3 d5/3",
  "g4/3 c5/3 e5/2 r/2 e5/3 c5/3",
  "a4/2 c5/2 f5/4 e5/2 d5/2 c5/4",
  // C (13-16): Bb  Gm  C  C(turnaround)
  "d5/2 f5/2 bb5/4 a5/2 f5/2 d5/4",
  "g5/2 f5/2 d5/2 bb4/2 g4/4 r/4",
  "e5/2 g5/2 c5/4 bb4/2 g4/2 e4/4",
  "g4/2 c5/2 e5/2 g5/2 r/8",
];
const MAIN_ROOTS = ["f2", "a2", "bb2", "c3", "f2", "d3", "bb2", "c3", "g2", "d3", "c3", "f2", "bb2", "g2", "c3", "c3"].map(N);
const BOUNCE: Pat = [[0, 0, 2], [3, 12, 1], [4, 7, 2], [8, 0, 2], [11, 12, 1], [12, 7, 2]];
const MAIN_HAT: [number, number][] = [[2, 0], [4, 2], [6, 0], [10, 0], [12, 2], [14, 1]];

// --- hurry: the same harmony, 25% faster, stuttered lead, running bass, busy hats ---------------

/** Splits every held note of 4+ steps into two shorter ones: the urgent stutter. */
const stutter = (notes: Note[]): Note[] =>
  notes.flatMap((n) => (n.len >= 4 ? [{ ...n, len: n.len / 2 }, { ...n, step: n.step + n.len / 2, len: n.len / 2 }] : [n]));
const RUN: Pat = [[0, 0, 1], [2, 12, 1], [4, 0, 1], [6, 12, 1], [8, 0, 1], [10, 12, 1], [12, 7, 1], [14, 12, 1]];
const HURRY_HAT: [number, number][] = [[0, 0], [2, 0], [4, 2], [6, 0], [8, 0], [10, 0], [12, 2], [13, 0], [14, 1], [15, 0]];

// --- boss: A minor, 138 bpm, 16 bars; driving 8ths, chromatic stabs ----------------------------

const BOSS_LEAD = [
  // Am Am F E
  "a4/3 r/1 a4/2 c5/2 r/2 e5/3 r/3",
  "d5/3 r/1 c5/2 b4/2 r/2 a4/4 r/2",
  "f4/3 r/1 f4/2 a4/2 r/2 c5/3 r/3",
  "e5/2 d#5/2 e5/2 b4/2 g#4/4 r/4",
  // Am Dm Bb E
  "a4/2 a4/2 c5/2 e5/2 a5/4 g5/2 e5/2",
  "f5/3 r/1 e5/2 d5/2 r/2 a4/3 r/3",
  "bb4/3 r/1 d5/2 f5/2 r/2 e5/3 r/3",
  "g#4/2 b4/2 e5/2 g#5/2 f5/4 e5/4",
  // Am Am F E
  "e5/4 r/2 e5/2 a5/4 r/2 g5/2",
  "a5/2 g5/2 e5/2 c5/2 a4/4 r/4",
  "c5/4 r/2 c5/2 f5/4 r/2 e5/2",
  "d#5/2 e5/2 f5/2 e5/2 b4/4 r/4",
  // Dm Bb E E
  "d5/2 f5/2 a5/2 f5/2 d5/4 r/4",
  "bb4/2 d5/2 f5/2 d5/2 bb4/4 r/4",
  "e5/2 b4/2 g#4/2 b4/2 e5/4 r/4",
  "r/8 e4/2 f4/2 f#4/2 g#4/2",
];
const BOSS_ROOTS = ["a2", "a2", "f2", "e2", "a2", "d2", "bb2", "e2", "a2", "a2", "f2", "e2", "d2", "bb2", "e2", "e2"].map(N);
const DRIVE: Pat = [0, 2, 4, 6, 8, 10, 12, 14].map((s, i) => [s, i % 4 === 3 ? 12 : 0, 1] as [number, number, number]);
const BOSS_HAT: [number, number][] = [[0, 0], [4, 2], [6, 0], [8, 0], [10, 0], [12, 2], [14, 0]];
/** Short pulse stabs on the off-beats; the E bars end with a chromatic slide down. */
const bossStabs = (): Note[] => {
  const out: Note[] = [];
  BOSS_ROOTS.forEach((r, b) => {
    out.push({ step: b * 16 + 6, ch: "harm", note: r + 24, len: 1 }, { step: b * 16 + 10, ch: "harm", note: r + 31, len: 1 });
    if (r % 12 === N("e2") % 12) {
      [N("b4"), N("bb4"), N("a4"), N("g#4")].forEach((m, i) => out.push({ step: b * 16 + 12 + i, ch: "harm", note: m, len: 1 }));
    }
  });
  return out;
};

// --- ending: D major, 96 bpm, 12 bars, warm and triumphant, once, ends on a long tonic ---------

const END_LEAD = [
  "d4/4 f#4/4 a4/4 d5/2 r/2",
  "d5/6 c#5/2 b4/4 f#4/4",
  "g4/4 b4/4 d5/4 g5/2 r/2",
  "e5/6 d5/2 c#5/4 r/4",
  "a4/4 d5/4 f#5/4 a5/2 r/2",
  "a5/6 f#5/2 c#5/4 f#5/4",
  "g5/4 f#5/2 e5/2 d5/4 b4/2 r/2",
  "c#5/4 e5/4 a5/4 e5/2 r/2",
  "b4/4 d5/4 f#5/4 d5/2 r/2",
  "d5/4 g5/4 f#5/4 e5/2 r/2",
  "a4/2 c#5/2 e5/4 d5/4 c#5/4",
  "d5/16",
];
const END_ROOTS = ["d3", "b2", "g2", "a2", "d3", "f#2", "g2", "a2", "b2", "g2", "a2", "d3"].map(N);
const END_BASS: Pat = [[0, 0, 8], [8, 7, 8]];
const END_ARP: Pat = [[0, 12, 2], [2, 16, 2], [4, 19, 2], [6, 16, 2], [8, 12, 2], [10, 16, 2], [12, 19, 2], [14, 16, 2]];

// --- secret: C lydian, 140 bpm, 8 bars, quirky and bubbly --------------------------------------

const SECRET_A = "c5/1 e5/1 f#5/1 e5/1 r/2 g5/2 f#5/2 e5/2 r/2 c5/2";
const SECRET_B = "d5/1 f#5/1 a5/1 f#5/1 r/2 b4/2 a4/2 f#4/2 r/2 d5/2";
const SECRET_C = "c5/1 e5/1 f#5/1 e5/1 r/2 g5/2 f#5/2 e5/2 d5/2 b4/2";
const SECRET_D = "c5/2 g4/2 e4/2 g4/2 c5/4 r/4";
const SECRET_LEAD = [SECRET_A, SECRET_B, SECRET_A, SECRET_D, SECRET_A, SECRET_B, SECRET_C, SECRET_D];
const SECRET_ROOTS = ["c3", "d3", "c3", "g2", "c3", "d3", "c3", "g2"].map(N);
const SECRET_BASS: Pat = [[0, 0, 1], [2, 12, 1], [4, 0, 1], [6, 12, 1], [8, 0, 1], [10, 12, 1], [12, 7, 1], [14, 12, 1]];
const SECRET_HAT: [number, number][] = [0, 2, 4, 6, 8, 10, 12, 14].map((s, i) => [s, i % 4 === 2 ? 2 : 0] as [number, number]);

// --- assembly --------------------------------------------------------------------------------

const lead16 = melody(MAIN_LEAD);

export const TRACKS: Record<TrackName, Track> = {
  main: {
    name: "main",
    bpm: 150,
    key: "F major",
    length: 256,
    loop: true,
    notes: sortNotes([...lead16, ...fromRoots(MAIN_ROOTS, BOUNCE, "bass"), ...hatBars(16, MAIN_HAT)]),
  },
  hurry: {
    name: "hurry",
    bpm: 188,
    key: "F major",
    length: 256,
    loop: true,
    notes: sortNotes([...stutter(lead16), ...fromRoots(MAIN_ROOTS, RUN, "bass"), ...hatBars(16, HURRY_HAT)]),
  },
  boss: {
    name: "boss",
    bpm: 138,
    key: "A minor",
    length: 256,
    loop: true,
    notes: sortNotes([...melody(BOSS_LEAD), ...fromRoots(BOSS_ROOTS, DRIVE, "bass"), ...hatBars(16, BOSS_HAT), ...bossStabs()]),
  },
  ending: {
    name: "ending",
    bpm: 96,
    key: "D major",
    length: 192,
    loop: false,
    notes: sortNotes([
      ...melody(END_LEAD),
      ...fromRoots(END_ROOTS.slice(0, 11), END_BASS, "bass"),
      { step: 11 * 16, ch: "bass" as Ch, note: END_ROOTS[11]!, len: 16 },
      ...fromRoots(END_ROOTS.slice(0, 11), END_ARP, "harm"),
      ...fromRoots(END_ROOTS.slice(11).map((r) => r + 12), [[0, 4, 16]], "harm").map((n) => ({ ...n, step: n.step + 11 * 16 })),
      ...hatBars(11, [[0, 1], [8, 0]]),
    ]),
  },
  secret: {
    name: "secret",
    bpm: 140,
    key: "C lydian",
    length: 128,
    loop: true,
    notes: sortNotes([...melody(SECRET_LEAD), ...fromRoots(SECRET_ROOTS, SECRET_BASS, "bass"), ...hatBars(8, SECRET_HAT)]),
  },
};

export const TRACK_NAMES = Object.keys(TRACKS) as TrackName[];
