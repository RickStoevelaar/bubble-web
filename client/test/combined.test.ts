import { describe, expect, it } from "vitest";
import { BTN } from "@bubble/shared";
import { CombinedInput, type InputSource } from "../src/input/input";

const src = (v: number) => {
  const s = { v, resets: 0, sample: () => s.v, reset: () => void s.resets++ };
  return s;
};

describe("CombinedInput", () => {
  it("ORs every source", () => {
    const a = src(BTN.L);
    const b = src(BTN.J | BTN.F);
    const c = src(0);
    const merged = new CombinedInput([a, b, c]);
    expect(merged.sample()).toBe(BTN.L | BTN.J | BTN.F);
    a.v = BTN.R;
    expect(merged.sample()).toBe(BTN.R | BTN.J | BTN.F);
  });

  it("reset() resets all sources, including ones without reset", () => {
    const a = src(1);
    const b = src(2);
    const plain: InputSource = { sample: () => 4 };
    new CombinedInput([a, plain, b]).reset();
    expect([a.resets, b.resets]).toEqual([1, 1]);
  });

  it("an empty combination samples 0", () => {
    expect(new CombinedInput([]).sample()).toBe(0);
  });
});
