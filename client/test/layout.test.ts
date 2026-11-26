import { describe, expect, it } from "vitest";
import { FIELD_W } from "@bubble/shared";
import { computeLayout, MIN_DECK_CSS_HEIGHT, MIN_MARGIN_W } from "../src/render/layout";

describe("computeLayout", () => {
  it("portrait phone: integer scale and a deck of at least 200 css px", () => {
    const l = computeLayout(390, 844);
    expect(Number.isInteger(l.scale)).toBe(true);
    expect(l.mode).toBe("portrait");
    expect(l.deckRect).not.toBeNull();
    expect(l.deckRect!.height).toBeGreaterThanOrEqual(MIN_DECK_CSS_HEIGHT);
  });

  it("hidpi phone 390x844@3 now fills the full width at a fractional scale (was 4x = 341 of 390 css px)", () => {
    const l = computeLayout(390, 844, 3);
    expect(l.mode).toBe("portrait");
    expect(l.scale).toBe(5); // backing store: ceil(4.57)
    expect(l.fieldW).toBeCloseTo(390, 6); // 1170 device px
    expect(l.cssScale).toBeCloseTo(390 / 256, 10);
    expect(l.gameX).toBeCloseTo(0, 6);
    expect(l.deckRect!.height).toBeGreaterThanOrEqual(MIN_DECK_CSS_HEIGHT);
  });

  it("common phones: field fills at least 92% of the width, never exceeds it, deck stays comfortable", () => {
    const phones: [number, number, number][] = [
      [360, 800, 3],
      [390, 844, 3],
      [412, 915, 2.625],
      [360, 800, 2],
      [320, 568, 2],
      [390, 844, 1],
      [768, 1024, 2],
    ];
    for (const [w, h, dpr] of phones) {
      const l = computeLayout(w, h, dpr);
      const tag = `${w}x${h}@${dpr}`;
      expect(l.fieldW, tag).toBeLessThanOrEqual(w + 1e-6);
      expect(l.fieldW / w, tag).toBeGreaterThanOrEqual(0.92);
      expect(l.deckRect!.height, tag).toBeGreaterThanOrEqual(MIN_DECK_CSS_HEIGHT);
      expect(l.gameX + l.fieldW, tag).toBeLessThanOrEqual(w + 1e-6);
    }
    // Whole-device-pixel cases stay crisp (integer device scale, no fractional stretch).
    expect(computeLayout(360, 800, 3).fieldW * 3).toBeCloseTo(1024, 6); // 4x
    expect(computeLayout(412, 915, 2.625).scale).toBe(4);
    expect(computeLayout(768, 1024, 2).scale).toBe(6);
    // Fractional fits: 360@2 is 2.81x, 390@1 is 1.52x.
    expect(computeLayout(360, 800, 2).cssScale * 2).toBeCloseTo(720 / 256, 6);
    expect(computeLayout(390, 844, 1).cssScale).toBeCloseTo(390 / 256, 6);
  });

  it("a short portrait window shrinks the field rather than the minimum deck", () => {
    const l = computeLayout(390, 520, 3);
    expect(l.deckRect!.height).toBeGreaterThanOrEqual(MIN_DECK_CSS_HEIGHT);
    expect(l.fieldW).toBeLessThan(390);
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
          expect(l.cssScale * FIELD_W).toBeCloseTo(l.fieldW, 8);
          expect(l.scale, tag).toBe(Math.ceil((l.fieldW * dpr) / FIELD_W - 1e-6));
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

describe("landscape phones", () => {
  const phones: [number, number, number][] = [
    [844, 390, 3],
    [915, 412, 2.625],
    [800, 360, 3],
    [800, 360, 2],
  ];
  it("fills at least 92% of the height, stays inside the window and keeps side columns for the controls", () => {
    for (const [w, h, dpr] of phones) {
      const l = computeLayout(w, h, dpr);
      const tag = `${w}x${h}@${dpr}`;
      expect(l.mode, tag).toBe("wide");
      expect(l.deckRect, tag).toBeNull();
      expect(l.fieldH / h, tag).toBeGreaterThanOrEqual(0.92);
      expect(l.gameY + l.fieldH, tag).toBeLessThanOrEqual(h + 1e-6);
      expect(l.gameX, tag).toBeGreaterThanOrEqual(MIN_MARGIN_W - 1);
      expect(w - l.gameX - l.fieldW, tag).toBeGreaterThanOrEqual(MIN_MARGIN_W - 1);
      expect(l.cssScale * FIELD_W).toBeCloseTo(l.fieldW, 8);
    }
    // 800x360@3 was 4x (299 of 360 px tall, 83%); now fits the height at 4.82x.
    expect(computeLayout(800, 360, 3).fieldH).toBeGreaterThan(0.99 * 360);
  });
  it("a 1280x720 desktop at dpr 1 keeps strict integer scale", () => {
    const l = computeLayout(1280, 720, 1);
    expect(l.scale).toBe(3);
    expect(l.fieldW).toBe(768);
  });
});
