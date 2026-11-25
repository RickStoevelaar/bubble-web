import { describe, expect, it } from "vitest";
import { BTN } from "@bubble/shared";
import { computeLayout } from "../src/render/layout";
import { TouchDeck, TouchTracker, computeTouchZones } from "../src/input/touch";
import { TouchInput } from "../src/input/touch-dom";

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
  const state = { enabled: true };
  const input = new TouchInput(w as unknown as Window, tracker, { isEnabled: () => state.enabled });
  const mid = z.slide.x + z.slide.width / 2;
  const my = z.slide.y + z.slide.height / 2;
  return { z, w, input, state, mid, my };
}

describe("TouchInput DOM wiring", () => {
  it("start/move/end produce the right mask over time, with multi-touch", () => {
    const { z, w, input, mid, my } = setup();
    expect(input.sample()).toBe(0);
    const a = { id: 1, x: mid - 30, y: my };
    expect(w.fire("touchstart", [a])).toBe(true);
    expect(input.sample()).toBe(BTN.L);
    const b = { id: 2, x: z.jump.cx, y: z.jump.cy };
    w.fire("touchstart", [a, b], [b]);
    expect(input.sample()).toBe(BTN.L | BTN.J);
    const a2 = { ...a, x: mid + 30 };
    w.fire("touchmove", [a2, b], [a2]);
    expect(input.sample()).toBe(BTN.R | BTN.J);
    const c = { id: 3, x: z.bubble.cx, y: z.bubble.cy };
    w.fire("touchstart", [a2, b, c], [c]);
    expect(input.sample()).toBe(BTN.R | BTN.J | BTN.F);
    expect(w.fire("touchend", [a2, c], [b])).toBe(true);
    expect(input.sample()).toBe(BTN.R | BTN.F);
    w.fire("touchend", [], [a2, c]);
    expect(input.sample()).toBe(0);
  });

  it("touchcancel releases everything", () => {
    const { z, w, input } = setup();
    const b = { id: 2, x: z.jump.cx, y: z.jump.cy };
    w.fire("touchstart", [b]);
    expect(input.sample()).toBe(BTN.J);
    w.fire("touchcancel", [], [b]);
    expect(input.sample()).toBe(0);
  });

  it("blur and reset() release held touches and ignore them until lifted", () => {
    const { z, w, input } = setup();
    const b = { id: 2, x: z.jump.cx, y: z.jump.cy };
    w.fire("touchstart", [b]);
    w.fireSimple("blur");
    expect(input.sample()).toBe(0);
    w.fire("touchmove", [b]);
    expect(input.sample()).toBe(0);
    w.fire("touchend", [], [b]);
    w.fire("touchstart", [b]);
    expect(input.sample()).toBe(BTN.J);
    input.reset();
    expect(input.sample()).toBe(0);
  });

  it("does not preventDefault outside the zones (join form keeps working) or while disabled", () => {
    const { z, w, input, state } = setup();
    expect(w.fire("touchstart", [{ id: 1, x: 5, y: 5 }])).toBe(false);
    expect(input.sample()).toBe(0);
    state.enabled = false;
    expect(w.fire("touchstart", [{ id: 2, x: z.jump.cx, y: z.jump.cy }])).toBe(false);
    expect(input.sample()).toBe(0);
  });

  it("a touch down when the input gets disabled yields 0 and never sticks", () => {
    const { z, w, input, state } = setup();
    const b = { id: 2, x: z.jump.cx, y: z.jump.cy };
    w.fire("touchstart", [b]);
    state.enabled = false;
    expect(input.sample()).toBe(0);
    w.fire("touchend", [], [b]);
    state.enabled = true;
    expect(input.sample()).toBe(0);
  });

  it("setZones (rotation mid-touch) releases the held touch", () => {
    const { z, w, input } = setup();
    const b = { id: 2, x: z.jump.cx, y: z.jump.cy };
    w.fire("touchstart", [b]);
    const land = computeTouchZones(computeLayout(844, 390, 3), 844, 390, true)!;
    input.setZones(land);
    expect(input.sample()).toBe(0);
    w.fire("touchmove", [{ id: 2, x: land.jump.cx, y: land.jump.cy }]);
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

  it("haptic tick fires on a fresh JUMP/BUBBLE press only, throttled", () => {
    const l = computeLayout(390, 844, 3);
    const z = computeTouchZones(l, 390, 844, true)!;
    let clock = 0;
    let ticks = 0;
    const w = fakeTarget();
    new TouchInput(w as unknown as Window, new TouchTracker(new TouchDeck(z)), {
      vibrate: () => void ticks++,
      now: () => clock,
    });
    const j = { id: 1, x: z.jump.cx, y: z.jump.cy };
    w.fire("touchstart", [j]);
    expect(ticks).toBe(1);
    w.fire("touchmove", [j]);
    expect(ticks).toBe(1);
    clock = 5; // inside the throttle window
    w.fire("touchend", [], [j]);
    w.fire("touchstart", [j]);
    expect(ticks).toBe(1);
    clock = 500;
    w.fire("touchend", [], [j]);
    w.fire("touchstart", [j]);
    expect(ticks).toBe(2);
    const slide = { id: 9, x: z.slide.x + 5, y: z.slide.y + 5 };
    w.fire("touchstart", [j, slide], [slide]);
    expect(ticks).toBe(2); // movement is not a button press
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
});
