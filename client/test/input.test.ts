import { describe, expect, it } from "vitest";
import { BTN } from "@bubble/shared";
import { KeyboardInput } from "../src/input/input";

function fakeWindow() {
  const handlers = new Map<string, Set<(e: unknown) => void>>();
  return {
    addEventListener: (t: string, h: (e: unknown) => void) => {
      if (!handlers.has(t)) handlers.set(t, new Set());
      handlers.get(t)!.add(h);
    },
    removeEventListener: (t: string, h: (e: unknown) => void) => void handlers.get(t)?.delete(h),
    fire: (t: string, e: object = {}) => handlers.get(t)?.forEach((h) => h({ preventDefault() {}, ...e })),
    count: () => [...handlers.values()].reduce((n, s) => n + s.size, 0),
  };
}

describe("KeyboardInput", () => {
  it("maps keys to the button mask and combines them", () => {
    const w = fakeWindow();
    const k = new KeyboardInput(w as unknown as Window);
    expect(k.sample()).toBe(0);
    w.fire("keydown", { code: "ArrowRight" });
    w.fire("keydown", { code: "Space" });
    w.fire("keydown", { code: "KeyZ" });
    expect(k.sample()).toBe(BTN.R | BTN.J | BTN.F);
    w.fire("keyup", { code: "Space" });
    expect(k.sample()).toBe(BTN.R | BTN.F);
    w.fire("keydown", { code: "KeyA" });
    expect(k.sample() & BTN.L).toBe(BTN.L);
  });

  it("ignores key repeat, unknown keys, and resets on blur", () => {
    const w = fakeWindow();
    const k = new KeyboardInput(w as unknown as Window);
    w.fire("keydown", { code: "KeyD", repeat: true });
    w.fire("keydown", { code: "KeyQ" });
    expect(k.sample()).toBe(0);
    w.fire("keydown", { code: "KeyD" });
    w.fire("blur");
    expect(k.sample()).toBe(0);
  });

  it("two keys for one button need both released", () => {
    const w = fakeWindow();
    const k = new KeyboardInput(w as unknown as Window);
    w.fire("keydown", { code: "ArrowLeft" });
    w.fire("keydown", { code: "KeyA" });
    w.fire("keyup", { code: "ArrowLeft" });
    expect(k.sample()).toBe(BTN.L);
  });

  it("dispose removes listeners", () => {
    const w = fakeWindow();
    const k = new KeyboardInput(w as unknown as Window);
    k.dispose();
    expect(w.count()).toBe(0);
  });
});
