import { describe, expect, it } from "vitest";
import { BTN } from "@bubble/shared";
import { computeLayout } from "../src/render/layout";
import { TouchDeck, TouchTracker, computeTouchZones } from "../src/input/touch";
import { TouchInput } from "../src/input/touch-dom";
import { FLICK_HOLD_MS, FLICK_MIN_PX } from "../src/input/pad";

type H = (e: unknown) => void;
type P = { id: number; x: number; y: number };

function fakeTarget() {
  const handlers = new Map<string, Set<H>>();
  const opts = new Map<string, unknown>();
  const list = (l: P[]) => l.map((p) => ({ identifier: p.id, clientX: p.x, clientY: p.y }));
  return {
    addEventListener: (type: string, h: H, o?: unknown) => {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type)!.add(h);
      opts.set(type, o);
    },
    removeEventListener: (type: string, h: H) => void handlers.get(type)?.delete(h),
    /** Fires a touch event; `touches` is the full current list, `changed` the ones that changed. */
    fire(type: string, touches: P[], changed: P[] = touches): boolean {
      let prevented = false;
      const e = { touches: list(touches), changedTouches: list(changed), preventDefault: () => (prevented = true) };
      handlers.get(type)?.forEach((h) => h(e));
      return prevented;
    },
    fireSimple(type: string): boolean {
      let prevented = false;
      handlers.get(type)?.forEach((h) => h({ preventDefault: () => (prevented = true) }));
      return prevented;
    },
    count: () => [...handlers.values()].reduce((n, s) => n + s.size, 0),
    opts,
  };
}

function setup() {
  const l = computeLayout(390, 844, 3);
  const z = computeTouchZones(l, 390, 844, true)!;
  const tracker = new TouchTracker(new TouchDeck(z));
  const w = fakeTarget();
  const state = { enabled: true, clock: 0 };
  const input = new TouchInput(w as unknown as Window, tracker, { isEnabled: () => state.enabled, now: () => state.clock });
  const pad = (vx: number, vy: number, id = 1) => ({ id, x: z.pad.cx + vx * z.pad.r, y: z.pad.cy + vy * z.pad.r });
  const fire = { id: 9, x: z.bubble.cx, y: z.bubble.cy };
  return { z, w, input, state, pad, fire };
}

describe("TouchInput DOM wiring", () => {
  it("start/move/end produce the right mask over time, with multi-touch (pad thumb + fire thumb)", () => {
    const { w, input, state, pad, fire } = setup();
    expect(input.sample()).toBe(0);
    const a = pad(-0.6, 0);
    expect(w.fire("touchstart", [a])).toBe(true);
    expect(input.sample()).toBe(BTN.L);
    w.fire("touchstart", [a, fire], [fire]);
    expect(input.sample()).toBe(BTN.L | BTN.F);
    const a2 = pad(0.6, -0.6);
    state.clock = 100;
    w.fire("touchmove", [a2, fire], [a2]);
    expect(input.sample()).toBe(BTN.R | BTN.J | BTN.F);
    expect(w.fire("touchend", [a2], [fire])).toBe(true);
    expect(input.sample()).toBe(BTN.R | BTN.J);
    state.clock = 1000; // past any flick hold
    w.fire("touchend", [], [a2]);
    expect(input.sample()).toBe(0);
  });

  it("a flick is held for FLICK_HOLD_MS of the injected clock even after the thumb is back or lifted", () => {
    const { w, input, state, pad } = setup();
    w.fire("touchstart", [pad(0, 0)]);
    state.clock = 40;
    w.fire("touchmove", [{ id: 1, x: pad(0, 0).x, y: pad(0, 0).y - FLICK_MIN_PX - 3 }]);
    expect(input.sample() & BTN.J).toBe(BTN.J);
    state.clock = 55;
    w.fire("touchmove", [pad(0, 0)]);
    expect(input.sample()).toBe(BTN.J);
    w.fire("touchend", [], [pad(0, 0)]);
    state.clock = 40 + FLICK_HOLD_MS - 1;
    expect(input.sample()).toBe(BTN.J);
    state.clock = 40 + FLICK_HOLD_MS + 1;
    expect(input.sample()).toBe(0);
  });

  it("touchcancel releases everything, including a pending flick", () => {
    const { w, input, state, pad, fire } = setup();
    w.fire("touchstart", [pad(0, 0)]);
    state.clock = 30;
    w.fire("touchmove", [pad(0, -0.6)]);
    w.fire("touchstart", [pad(0, -0.6), fire], [fire]);
    expect(input.sample()).toBe(BTN.J | BTN.F);
    w.fire("touchcancel", [], [fire]);
    expect(input.sample()).toBe(0);
  });

  it("blur and reset() release held touches and ignore them until lifted", () => {
    const { w, input, fire } = setup();
    w.fire("touchstart", [fire]);
    w.fireSimple("blur");
    expect(input.sample()).toBe(0);
    w.fire("touchmove", [fire]);
    expect(input.sample()).toBe(0);
    w.fire("touchend", [], [fire]);
    w.fire("touchstart", [fire]);
    expect(input.sample()).toBe(BTN.F);
    input.reset();
    expect(input.sample()).toBe(0);
  });

  it("does not preventDefault outside the zones (join form keeps working) or while disabled", () => {
    const { w, input, state, fire } = setup();
    expect(w.fire("touchstart", [{ id: 1, x: 5, y: 5 }])).toBe(false);
    expect(input.sample()).toBe(0);
    state.enabled = false;
    expect(w.fire("touchstart", [{ id: 2, x: fire.x, y: fire.y }])).toBe(false);
    expect(input.sample()).toBe(0);
  });

  it("a touch down when the input gets disabled yields 0 and never sticks", () => {
    const { w, input, state, fire } = setup();
    w.fire("touchstart", [fire]);
    state.enabled = false;
    expect(input.sample()).toBe(0);
    w.fire("touchend", [], [fire]);
    state.enabled = true;
    expect(input.sample()).toBe(0);
  });

  it("setZones (rotation mid-touch) releases the held touch", () => {
    const { w, input, fire } = setup();
    w.fire("touchstart", [fire]);
    const land = computeTouchZones(computeLayout(844, 390, 3), 844, 390, true)!;
    input.setZones(land);
    expect(input.sample()).toBe(0);
    w.fire("touchmove", [{ id: 9, x: land.bubble.cx, y: land.bubble.cy }]);
    expect(input.sample()).toBe(0);
  });

  it("blocks context menu, double tap and gesture zoom; touch listeners are non-passive; dispose removes all", () => {
    const { w, input } = setup();
    expect(w.fireSimple("contextmenu")).toBe(true);
    expect(w.fireSimple("dblclick")).toBe(true);
    expect(w.fireSimple("gesturestart")).toBe(true);
    expect(w.opts.get("touchstart")).toEqual({ passive: false });
    expect(w.opts.get("touchmove")).toEqual({ passive: false });
    input.dispose();
    expect(w.count()).toBe(0);
  });

  it("haptic tick fires on a fresh fire press or jump trigger only, throttled; sliding sideways is silent", () => {
    const l = computeLayout(390, 844, 3);
    const z = computeTouchZones(l, 390, 844, true)!;
    let clock = 0;
    let ticks = 0;
    const w = fakeTarget();
    new TouchInput(w as unknown as Window, new TouchTracker(new TouchDeck(z)), {
      vibrate: () => void ticks++,
      now: () => clock,
    });
    const b = { id: 1, x: z.bubble.cx, y: z.bubble.cy };
    w.fire("touchstart", [b]);
    expect(ticks).toBe(1);
    w.fire("touchmove", [b]);
    expect(ticks).toBe(1);
    clock = 5; // inside the throttle window
    w.fire("touchend", [], [b]);
    w.fire("touchstart", [b]);
    expect(ticks).toBe(1);
    clock = 500;
    w.fire("touchend", [], [b]);
    w.fire("touchstart", [b]);
    expect(ticks).toBe(2);
    clock = 1000;
    const side = { id: 9, x: z.pad.cx - z.pad.r * 0.6, y: z.pad.cy };
    w.fire("touchstart", [b, side], [side]);
    expect(ticks).toBe(2); // movement is not a button press
    clock = 1500;
    const up = { id: 9, x: z.pad.cx - z.pad.r * 0.6, y: z.pad.cy - z.pad.r * 0.7 };
    w.fire("touchmove", [b, up], [up]);
    expect(ticks).toBe(3); // the jump trigger ticks
  });

  it("onTouch is reported once a real touch is seen (touch-primary detection)", () => {
    const l = computeLayout(390, 844, 3);
    const tr = new TouchTracker(new TouchDeck(computeTouchZones(l, 390, 844, true)));
    const w = fakeTarget();
    let seen = 0;
    new TouchInput(w as unknown as Window, tr, { onTouch: () => void seen++ });
    w.fire("touchstart", [{ id: 1, x: 1, y: 1 }]);
    w.fire("touchstart", [{ id: 2, x: 1, y: 1 }]);
    expect(seen).toBe(1);
  });

  it("exposes the knob vector for drawing", () => {
    const { w, input, pad } = setup();
    expect(input.knob).toBeNull();
    w.fire("touchstart", [pad(0.5, -0.25)]);
    expect(input.knob).toEqual({ x: 0.5, y: -0.25 });
    w.fire("touchend", [], [pad(0.5, -0.25)]);
    expect(input.knob).toBeNull();
  });
});
