import { describe, expect, it } from "vitest";
import { BTN, TICK_RATE } from "@bubble/shared";
import {
  FLICK_END_FRAC,
  FLICK_HOLD_MS,
  FLICK_HOLD_TICKS,
  FLICK_MIN_PX,
  FLICK_WINDOW_MS,
  FlickDetector,
  PAD_DEAD_X,
  PAD_JUMP_OFF,
  PAD_JUMP_ON,
  padButtons,
  padVector,
} from "../src/input/pad";

const pad = { cx: 100, cy: 300, r: 100 };
const at = (vx: number, vy: number) => padVector(pad, pad.cx + vx * pad.r, pad.cy + vy * pad.r);

describe("pad constants", () => {
  it("are sane: vertical dead zone 25-30% of the radius, hysteresis below it", () => {
    expect(PAD_JUMP_ON).toBeGreaterThanOrEqual(0.25);
    expect(PAD_JUMP_ON).toBeLessThanOrEqual(0.3);
    expect(PAD_JUMP_OFF).toBeLessThan(PAD_JUMP_ON);
    expect(PAD_JUMP_OFF).toBeGreaterThan(0);
    expect(PAD_DEAD_X).toBeGreaterThan(0);
    expect(PAD_DEAD_X).toBeLessThan(PAD_JUMP_ON);
    expect(FLICK_HOLD_TICKS).toBeGreaterThanOrEqual(2);
    expect(FLICK_HOLD_MS).toBeCloseTo((FLICK_HOLD_TICKS * 1000) / TICK_RATE, 6);
  });
});

describe("padVector", () => {
  it("is the finger offset in radius units, y negative = up", () => {
    expect(at(0, 0)).toEqual({ x: 0, y: 0 });
    expect(at(0.5, -0.25)).toEqual({ x: 0.5, y: -0.25 });
  });
  it("clamps overshoot to the unit disk, keeping the direction", () => {
    const v = padVector(pad, pad.cx + 1000, pad.cy - 1000);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 9);
    expect(v.x).toBeCloseTo(Math.SQRT1_2, 9);
    expect(v.y).toBeCloseTo(-Math.SQRT1_2, 9);
    expect(padVector(pad, pad.cx + 5000, pad.cy)).toEqual({ x: 1, y: 0 });
  });
});

describe("padButtons", () => {
  it("horizontal dead zone: neutral until |x| passes PAD_DEAD_X", () => {
    expect(padButtons(at(0, 0), false)).toBe(0);
    expect(padButtons(at(PAD_DEAD_X * 0.9, 0), false)).toBe(0);
    expect(padButtons(at(-PAD_DEAD_X * 0.9, 0), false)).toBe(0);
    expect(padButtons(at(PAD_DEAD_X * 1.1, 0), false)).toBe(BTN.R);
    expect(padButtons(at(-PAD_DEAD_X * 1.1, 0), false)).toBe(BTN.L);
  });
  it("ordinary left-right sliding (vertical wobble up to 0.2) never jumps", () => {
    for (const y of [0, 0.1, -0.1, -0.2, 0.5, 0.9]) {
      expect(padButtons(at(0.8, y), false) & BTN.J, `y=${y}`).toBe(0);
      expect(padButtons(at(-0.8, y), false) & BTN.J, `y=${y}`).toBe(0);
    }
  });
  it("pushing up past PAD_JUMP_ON jumps; straight up is jump only", () => {
    expect(padButtons(at(0, -(PAD_JUMP_ON - 0.02)), false)).toBe(0);
    expect(padButtons(at(0, -(PAD_JUMP_ON + 0.02)), false)).toBe(BTN.J);
  });
  it("diagonals: up-left and up-right give move + jump in one motion", () => {
    expect(padButtons(at(0.6, -0.6), false)).toBe(BTN.R | BTN.J);
    expect(padButtons(at(-0.6, -0.6), false)).toBe(BTN.L | BTN.J);
    expect(padButtons(padVector(pad, pad.cx + 900, pad.cy - 900), false)).toBe(BTN.R | BTN.J);
  });
  it("hysteresis: once jumping, stays until the thumb drops below PAD_JUMP_OFF", () => {
    const mid = -(PAD_JUMP_ON + PAD_JUMP_OFF) / 2;
    expect(padButtons(at(0, mid), false)).toBe(0);
    expect(padButtons(at(0, mid), true)).toBe(BTN.J);
    expect(padButtons(at(0, -(PAD_JUMP_OFF - 0.02)), true)).toBe(0);
  });
  it("moving down does nothing at all (no drop-through in this game)", () => {
    expect(padButtons(at(0, 1), false)).toBe(0);
    expect(padButtons(at(0, 0.6), true)).toBe(0);
    expect(padButtons(at(0.7, 0.7), false)).toBe(BTN.R);
  });
});

describe("FlickDetector (injected clock)", () => {
  const up = -FLICK_END_FRAC - 0.05;
  it("a quick upward move of >= FLICK_MIN_PX within the window is a flick", () => {
    const f = new FlickDetector();
    expect(f.push(0, 300, 0)).toBe(false);
    expect(f.push(FLICK_WINDOW_MS - 10, 300 - FLICK_MIN_PX, up)).toBe(true);
  });
  it("too short, too slow, or ending low is not a flick", () => {
    const short = new FlickDetector();
    short.push(0, 300, 0);
    expect(short.push(50, 300 - (FLICK_MIN_PX - 2), up)).toBe(false);
    const slow = new FlickDetector();
    slow.push(0, 300, 0);
    slow.push(FLICK_WINDOW_MS * 2, 300 - FLICK_MIN_PX / 2, up);
    expect(slow.push(FLICK_WINDOW_MS * 4, 300 - FLICK_MIN_PX - 5, up)).toBe(false);
    const recoil = new FlickDetector(); // from low in the pad back to the centre
    recoil.push(0, 380, 0.8);
    expect(recoil.push(50, 300, 0)).toBe(false);
  });
  it("forgets its history after firing so it needs a fresh flick", () => {
    const f = new FlickDetector();
    f.push(0, 300, 0);
    expect(f.push(40, 270, up)).toBe(true);
    expect(f.push(60, 268, up)).toBe(false);
  });
});
