import { BTN, TICK_RATE } from "@bubble/shared";

/*
 * The 2D move pad, as pure functions (no DOM, no zones): finger position -> vector -> BTN mask.
 *
 * How the sim consumes jump (shared/src/sim/player.ts): LEVEL-triggered. A tick with BTN.J set while the
 * hero is on the ground jumps; there is no buffer and no hold-height (a fixed jumpVel), and holding J
 * while landing jumps again at once. Holding J while touching a floating bubble bounces off it instead of
 * popping. So the pad's "jump" is simply a held bit: set while the thumb is pushed up, plus a short minimum
 * hold after a flick so a quick flick still covers at least one sim tick. There is no down input in BTN
 * at all (no drop-through), so pushing down does nothing.
 */

export interface Circle {
  cx: number;
  cy: number;
  r: number;
}

/** Finger offset from the pad centre in pad radii, clamped to the unit disk. x right+, y DOWN+ (up is negative). */
export interface PadVec {
  x: number;
  y: number;
}

/** Horizontal dead zone: |x| (in pad radii) must pass this before L/R registers. */
export const PAD_DEAD_X = 0.15;
/** Jump triggers when the thumb is pushed up past this many pad radii (the vertical dead zone). */
export const PAD_JUMP_ON = 0.28;
/** Once jumping, jump releases only when the thumb drops back below this (hysteresis against flicker). */
export const PAD_JUMP_OFF = 0.18;
/** Flick: the thumb rises at least this many CSS px ... */
export const FLICK_MIN_PX = 22;
/** ... within this many ms ... */
export const FLICK_WINDOW_MS = 120;
/** ... and ends at least this far above the pad centre (pad radii), so a recoil from low in the pad is not a flick. */
export const FLICK_END_FRAC = 0.1;
/** A flick holds jump for at least this many sim ticks even if the thumb comes back or lifts. */
export const FLICK_HOLD_TICKS = 4;
export const FLICK_HOLD_MS = (FLICK_HOLD_TICKS * 1000) / TICK_RATE;

/** Finger position -> clamped pad vector (overshoot keeps its direction). */
export function padVector(pad: Circle, x: number, y: number): PadVec {
  let vx = (x - pad.cx) / pad.r;
  let vy = (y - pad.cy) / pad.r;
  const len = Math.hypot(vx, vy);
  if (len > 1) {
    vx /= len;
    vy /= len;
  }
  return { x: vx, y: vy };
}

/** Pad vector -> BTN.L/R/J. `jumpHeld` is whether this touch was jumping last time (hysteresis). */
export function padButtons(v: PadVec, jumpHeld: boolean): number {
  let m = 0;
  if (v.x < -PAD_DEAD_X) m |= BTN.L;
  else if (v.x > PAD_DEAD_X) m |= BTN.R;
  if (-v.y >= (jumpHeld ? PAD_JUMP_OFF : PAD_JUMP_ON)) m |= BTN.J;
  return m;
}

/** Per-touch upward-flick detector over a short sliding window of (time, y) samples. */
export class FlickDetector {
  private samples: { t: number; y: number }[] = [];

  /** `py` is the finger y in CSS px, `endVy` the clamped pad vector y. True when this move completes a flick. */
  push(t: number, py: number, endVy: number): boolean {
    this.samples.push({ t, y: py });
    while (this.samples.length > 1 && t - this.samples[0]!.t > FLICK_WINDOW_MS) this.samples.shift();
    let rise = 0;
    for (const s of this.samples) rise = Math.max(rise, s.y - py);
    if (rise >= FLICK_MIN_PX && endVy <= -FLICK_END_FRAC) {
      this.samples = [{ t, y: py }];
      return true;
    }
    return false;
  }
}
