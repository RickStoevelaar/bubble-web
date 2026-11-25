import { describe, expect, it } from "vitest";
import { computeLayout, MIN_DECK_CSS_HEIGHT } from "../src/render/layout";

describe("computeLayout", () => {
  it("portrait phone: integer scale and a deck of at least 200 css px", () => {
    const l = computeLayout(390, 844);
    expect(Number.isInteger(l.scale)).toBe(true);
    expect(l.mode).toBe("portrait");
    expect(l.deckRect).not.toBeNull();
    expect(l.deckRect!.height).toBeGreaterThanOrEqual(MIN_DECK_CSS_HEIGHT);
  });

  it("hidpi phone gets scale 4 (device-pixel integer) with fractional css scale", () => {
    const l = computeLayout(390, 844, 3);
    expect(l.scale).toBe(4);
    expect(l.cssScale).toBeCloseTo(4 / 3, 10);
    expect(l.fieldW).toBeCloseTo(1024 / 3, 6);
    expect(l.deckRect!.height).toBeGreaterThanOrEqual(200);
  });

  it("desktop: no deck, centered field, scale 4", () => {
    const l = computeLayout(1920, 1080);
    expect(l.deckRect).toBeNull();
    expect(l.mode).toBe("wide");
    expect(l.scale).toBe(4);
    expect(Math.abs(l.gameX - (1920 - (l.gameX + l.fieldW)))).toBeLessThanOrEqual(1);
    expect(Math.abs(l.gameY - (1080 - (l.gameY + l.fieldH)))).toBeLessThanOrEqual(1);
  });

  it("is pure: same inputs give deep-equal outputs", () => {
    expect(computeLayout(390, 844, 3)).toEqual(computeLayout(390, 844, 3));
    expect(computeLayout(1920, 1080)).toEqual(computeLayout(1920, 1080));
  });

  it("rotation recomputes cleanly to wide mode", () => {
    const p = computeLayout(390, 844, 3);
    const w = computeLayout(844, 390, 3);
    expect(p.mode).toBe("portrait");
    expect(w.mode).toBe("wide");
    expect(w.deckRect).toBeNull();
    expect(w.scale).toBeGreaterThanOrEqual(1);
    expect(w.gameY + w.fieldH).toBeLessThanOrEqual(390 + 1e-9);
  });

  it("falls back to scale >= 1 when no deck can fit", () => {
    const l = computeLayout(300, 330);
    expect(l.scale).toBe(1);
    expect(l.deckRect).not.toBeNull();
  });

  it("sweep: integer scale, field inside window, no field/deck overlap", () => {
    const dprs = [1, 1.25, 1.5, 2, 2.625, 3];
    for (const dpr of dprs) {
      for (let w = 260; w <= 2600; w += 97) {
        for (let h = 260; h <= 1700; h += 83) {
          const l = computeLayout(w, h, dpr);
          const tag = `${w}x${h}@${dpr}`;
          expect(Number.isInteger(l.scale), tag).toBe(true);
          expect(l.scale, tag).toBeGreaterThanOrEqual(1);
          expect(l.cssScale).toBeCloseTo(l.scale / dpr, 10);
          expect(l.gameX, tag).toBeGreaterThanOrEqual(-1e-9);
          expect(l.gameY, tag).toBeGreaterThanOrEqual(-1e-9);
          expect(l.gameX + l.fieldW, tag).toBeLessThanOrEqual(w + 1e-6);
          expect(l.gameY + l.fieldH, tag).toBeLessThanOrEqual(h + 1e-6);
          if (l.mode === "portrait") {
            expect(h > w).toBe(true);
            const d = l.deckRect!;
            expect(d.y, tag).toBeGreaterThanOrEqual(l.gameY + l.fieldH - 1e-6);
            expect(d.y + d.height, tag).toBeLessThanOrEqual(h + 1e-6);
            expect(d.width).toBe(w);
          } else {
            expect(l.deckRect).toBeNull();
          }
        }
      }
    }
  });
});
