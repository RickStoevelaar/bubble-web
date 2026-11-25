import { loopSeconds, stepSeconds, voiceForNote, type Track } from "./music";
import type { VoiceSpec } from "./sfx";

/** What the scheduler needs from the synth. */
export interface VoiceSink {
  play(spec: VoiceSpec, t: number): void;
  stopAll(): void;
}

/** Notes are scheduled this far ahead of `currentTime`. */
export const LOOKAHEAD_S = 0.12;
/** Timer period for `tick` (the engine runs it; never rAF). */
export const TICK_MS = 25;
/** A note already this late is skipped rather than played (stall recovery: no burst of catch-up notes). */
const LATE_S = 0.05;
/** Delay before a track that starts from silence. */
const START_DELAY_S = 0.05;

/**
 * Plays a track ahead of time against the audio clock. Loop N's notes sit at t0 + N * loopLength + step * stepLength,
 * computed by multiplication (never accumulated) so a loop never drifts.
 */
export class Scheduler {
  private cur: Track | null = null;
  private t0 = 0;
  private idx = 0;
  private loopN = 0;
  private done = false;
  constructor(
    private readonly sink: VoiceSink,
    private readonly clock: { currentTime: number },
  ) {}

  get playing(): boolean {
    return this.cur !== null && !this.done;
  }

  /** True once a non-looping track has had all of its notes scheduled. */
  get finished(): boolean {
    return this.cur !== null && this.done;
  }

  get track(): Track | null {
    return this.cur;
  }

  /** Starts `track`; if another is playing its voices are stopped and the new one begins on the next beat boundary. */
  start(track: Track): void {
    const now = this.clock.currentTime;
    let at = now + START_DELAY_S;
    const old = this.cur;
    if (old && !this.done) {
      const beat = 60 / old.bpm;
      let k = Math.ceil((now - this.t0) / beat - 1e-9);
      let b = this.t0 + k * beat;
      while (b < now + 0.01) b = this.t0 + ++k * beat;
      at = b;
    }
    if (old) this.sink.stopAll();
    this.cur = track;
    this.t0 = at;
    this.idx = 0;
    this.loopN = 0;
    this.done = track.notes.length === 0;
  }

  stop(): void {
    if (this.cur) this.sink.stopAll();
    this.cur = null;
    this.done = false;
  }

  /** Schedules every note that falls inside the lookahead window. */
  tick(): void {
    const tr = this.cur;
    if (!tr || this.done) return;
    const now = this.clock.currentTime;
    const horizon = now + LOOKAHEAD_S;
    const stepSec = stepSeconds(tr);
    const loopSec = loopSeconds(tr);
    for (;;) {
      const n = tr.notes[this.idx];
      if (!n) {
        if (!tr.loop) {
          this.done = true;
          return;
        }
        this.idx = 0;
        this.loopN++;
        continue;
      }
      const t = this.t0 + this.loopN * loopSec + n.step * stepSec;
      if (t > horizon) return;
      this.idx++;
      if (t < now - LATE_S) continue;
      this.sink.play(voiceForNote(n, stepSec), t);
    }
  }
}
