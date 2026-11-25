import { describe, expect, test } from "vitest";
import { Rng } from "../src/rng";

describe("Rng", () => {
  test("same seed, same sequence", () => {
    const a = new Rng(42), b = new Rng(42);
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });
  test("int stays in range", () => {
    const r = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.int(10);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(10);
    }
  });
});

describe("Rng state", () => {
  test("setState resumes the exact stream", () => {
    const a = new Rng(7);
    a.next();
    a.next();
    const b = new Rng(999);
    b.setState(a.getState());
    expect([b.next(), b.int(100), b.next()]).toEqual([a.next(), a.int(100), a.next()]);
  });
});
