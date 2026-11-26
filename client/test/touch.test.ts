import { describe, expect, it } from "vitest";
import { BTN } from "@bubble/shared";
import { computeLayout } from "../src/render/layout";
import {
  BUTTON_FORGIVE,
  DEAD_ZONE_FRAC,
  MIN_BUTTON_RADIUS,
  SLIDE_EXTEND_Y,
  TouchDeck,
  TouchTracker,
  computeTouchZones,
  type Circle,
  type TouchZones,
} from "../src/input/touch";

const zonesFor = (w: number, h: number, dpr = 1, touch = true, safe = 0): TouchZones | null =>
  computeTouchZones(computeLayout(w, h, dpr), w, h, touch, safe);
const need = (z: TouchZones | null): TouchZones => {
  if (!z) throw new Error("expected zones");
  return z;
};
const mid = (z: TouchZones) => ({ x: z.slide.x + z.slide.width / 2, y: z.slide.y + z.slide.height / 2 });
const t = (id: number, x: number, y: number) => ({ id, x, y });

describe("TouchDeck.handle (pure)", () => {
  const z = need(zonesFor(390, 844, 3));
  const deck = new TouchDeck(z);
  const m = mid(z);
  const quarter = z.slide.width / 4;

  it("a touch in the left half of the slide zone is L, in the right half R", () => {
    expect(deck.handle([t(1, m.x - quarter, m.y)])).toBe(BTN.L);
    expect(deck.handle([t(1, m.x + quarter, m.y)])).toBe(BTN.R);
  });

  it("sliding the same touch from left to right half flips L to R without a lift", () => {
    expect(deck.handle([t(7, m.x - quarter, m.y)])).toBe(BTN.L);
    expect(deck.handle([t(7, m.x - 1 - z.slide.width * DEAD_ZONE_FRAC, m.y)])).toBe(BTN.L);
    expect(deck.handle([t(7, m.x + quarter, m.y)])).toBe(BTN.R);
  });

  it("small central dead zone does nothing", () => {
    expect(deck.handle([t(1, m.x, m.y)])).toBe(0);
    expect(deck.handle([t(1, m.x + z.slide.width * DEAD_ZONE_FRAC * 0.4, m.y)])).toBe(0);
    expect(deck.handle([t(1, m.x - z.slide.width * DEAD_ZONE_FRAC * 0.4, m.y)])).toBe(0);
  });

  it("slide + JUMP + BUBBLE at once set L|J|F; releasing = absence", () => {
    const touches = [t(1, m.x - quarter, m.y), t(2, z.jump.cx, z.jump.cy), t(3, z.bubble.cx, z.bubble.cy)];
    expect(deck.handle(touches)).toBe(BTN.L | BTN.J | BTN.F);
    expect(deck.handle(touches.slice(1))).toBe(BTN.J | BTN.F);
    expect(deck.handle([])).toBe(0);
  });

  it("empty deck (null zones) yields nothing", () => {
    expect(new TouchDeck(null).handle([t(1, 100, 700)])).toBe(0);
  });

  it("buttons have a forgiveness margin and the slide zone a vertical one, never into buttons", () => {
    const j = z.jump;
    expect(deck.handle([t(1, j.cx + j.r + BUTTON_FORGIVE - 1, j.cy)])).toBe(BTN.J);
    expect(deck.handle([t(1, j.cx + j.r + BUTTON_FORGIVE + 20, j.cy - j.r - 40)])).toBe(0);
    const above = z.slide.y - SLIDE_EXTEND_Y + 1;
    expect(deck.handle([t(1, m.x - quarter, above)])).toBe(BTN.L);
    expect(deck.handle([t(1, m.x - quarter, z.slide.y - SLIDE_EXTEND_Y - 2)])).toBe(0);
  });

  it("where two buttons' forgiveness areas overlap, the nearest centre wins", () => {
    const a: Circle = { cx: 300, cy: 100, r: 40 };
    const b: Circle = { cx: 300 + 90, cy: 100, r: 40 };
    const d = new TouchDeck({ slide: { x: 0, y: 0, width: 100, height: 100 }, jump: a, bubble: b, overlay: false });
    expect(d.handle([t(1, 340, 100)])).toBe(BTN.J); // 40 from a, 50 from b
    expect(d.handle([t(1, 350, 100)])).toBe(BTN.F);
    expect(d.handle([t(1, 345.1, 100)])).toBe(BTN.F);
    expect(d.handle([t(1, 344.9, 100)])).toBe(BTN.J);
  });

  it("Review Focus 1: after setZones with the rotated layout the SAME screen point maps by the new zones", () => {
    const d = new TouchDeck(need(zonesFor(390, 844, 3)));
    const portrait = need(zonesFor(390, 844, 3));
    const point = { x: portrait.jump.cx, y: portrait.jump.cy };
    expect(d.handle([t(1, point.x, point.y)])).toBe(BTN.J);
    const land = need(zonesFor(844, 390, 3));
    d.setZones(land);
    expect(d.handle([t(1, point.x, point.y)])).not.toBe(BTN.J); // old JUMP spot is no button now
    expect(d.handle([t(1, land.jump.cx, land.jump.cy)])).toBe(BTN.J);
    expect(d.handle([t(1, land.bubble.cx, land.bubble.cy)])).toBe(BTN.F);
    const lm = mid(land);
    expect(d.handle([t(1, lm.x - land.slide.width / 4, lm.y)])).toBe(BTN.L);
  });
});

describe("computeTouchZones", () => {
  const inside = (z: TouchZones, w: number, h: number) => {
    expect(z.slide.x).toBeGreaterThanOrEqual(0);
    expect(z.slide.y).toBeGreaterThanOrEqual(0);
    expect(z.slide.x + z.slide.width).toBeLessThanOrEqual(w + 1e-9);
    expect(z.slide.y + z.slide.height).toBeLessThanOrEqual(h + 1e-9);
    for (const c of [z.jump, z.bubble]) {
      expect(c.cx - c.r).toBeGreaterThanOrEqual(0);
      expect(c.cy - c.r).toBeGreaterThanOrEqual(0);
      expect(c.cx + c.r).toBeLessThanOrEqual(w + 1e-9);
      expect(c.cy + c.r).toBeLessThanOrEqual(h + 1e-9);
    }
  };
  const disjoint = (z: TouchZones) => {
    expect(Math.hypot(z.jump.cx - z.bubble.cx, z.jump.cy - z.bubble.cy)).toBeGreaterThan(z.jump.r + z.bubble.r);
    for (const c of [z.jump, z.bubble]) {
      const nx = Math.max(z.slide.x, Math.min(c.cx, z.slide.x + z.slide.width));
      const ny = Math.max(z.slide.y, Math.min(c.cy, z.slide.y + z.slide.height));
      expect(Math.hypot(c.cx - nx, c.cy - ny)).toBeGreaterThan(c.r);
    }
  };

  it("portrait: slide zone is the left ~45% of the deck, buttons on the right, BUBBLE lowest/rightmost", () => {
    const l = computeLayout(390, 844, 3);
    const z = need(computeTouchZones(l, 390, 844, true));
    const d = l.deckRect!;
    expect(z.overlay).toBe(false);
    expect(z.slide.x + z.slide.width).toBeLessThanOrEqual(d.x + d.width * 0.46);
    expect(z.slide.width).toBeGreaterThan(d.width * 0.38);
    expect(z.jump.cx - z.jump.r).toBeGreaterThan(z.slide.x + z.slide.width);
    expect(z.bubble.cy).toBeGreaterThan(z.jump.cy);
    expect(z.bubble.cx).toBeGreaterThanOrEqual(z.jump.cx);
    expect(z.jump.r).toBeGreaterThanOrEqual(MIN_BUTTON_RADIUS);
    expect(z.bubble.r).toBeGreaterThanOrEqual(MIN_BUTTON_RADIUS);
    expect(z.slide.y).toBeGreaterThanOrEqual(d.y);
    disjoint(z);
    inside(z, 390, 844);
  });

  it("portrait deck still produces zones for a mouse-primary desktop (the deck area is reserved anyway)", () => {
    expect(zonesFor(500, 900, 1, false)).not.toBeNull();
  });

  it("safeBottom keeps everything above the home-indicator area", () => {
    const z = need(zonesFor(390, 844, 3, true, 34));
    expect(z.bubble.cy + z.bubble.r).toBeLessThanOrEqual(844 - 34);
    expect(z.slide.y + z.slide.height).toBeLessThanOrEqual(844 - 34);
  });

  it("buttons grow with a taller deck, capped", () => {
    const small = need(zonesFor(390, 700, 3)).jump.r;
    const tall = need(zonesFor(390, 1000, 3)).jump.r;
    expect(tall).toBeGreaterThanOrEqual(small);
    expect(tall).toBeLessThanOrEqual(64);
  });

  it("landscape touch phone with wide margins: slide left margin, buttons right margin", () => {
    const l = computeLayout(844, 390, 3);
    const z = need(computeTouchZones(l, 844, 390, true));
    expect(z.overlay).toBe(false);
    expect(z.slide.x + z.slide.width).toBeLessThanOrEqual(l.gameX + 1e-9);
    const rightStart = l.gameX + l.fieldW;
    expect(z.jump.cx - z.jump.r).toBeGreaterThanOrEqual(rightStart - 1e-9);
    expect(z.bubble.cx - z.bubble.r).toBeGreaterThanOrEqual(rightStart - 1e-9);
    expect(z.jump.r).toBeGreaterThanOrEqual(MIN_BUTTON_RADIUS);
    disjoint(z);
    inside(z, 844, 390);
  });

  it("landscape touch phone with narrow margins: translucent overlay in the bottom corners", () => {
    const l = computeLayout(600, 375, 2);
    expect(l.gameX).toBeLessThan(120);
    const z = need(computeTouchZones(l, 600, 375, true));
    expect(z.overlay).toBe(true);
    expect(z.slide.x + z.slide.width / 2).toBeLessThan(600 / 2);
    expect(z.jump.cx).toBeGreaterThan(600 / 2);
    expect(z.bubble.cx).toBeGreaterThan(600 / 2);
    expect(z.bubble.cy).toBeGreaterThan(375 / 2);
    disjoint(z);
    inside(z, 600, 375);
  });

  it("desktop with mouse/keyboard in a wide window: no deck", () => {
    expect(zonesFor(1280, 720, 1, false)).toBeNull();
    expect(zonesFor(1280, 720, 2, false)).toBeNull();
  });

  it("touch-primary very wide landscape window uses margin controls", () => {
    const z = need(zonesFor(1600, 700, 1, true));
    expect(z.overlay).toBe(false);
  });

  it("rotation 390x844 -> 844x390 produces different zones", () => {
    expect(zonesFor(390, 844, 3)).not.toEqual(zonesFor(844, 390, 3));
  });

  it("never overlaps and stays inside the window across many sizes and dprs", () => {
    let checked = 0;
    for (const dpr of [1, 1.5, 2, 2.625, 3, 3.5]) {
      for (let w = 320; w <= 1000; w += 37) {
        for (let h = 320; h <= 1000; h += 41) {
          const z = zonesFor(w, h, dpr, true, 20);
          if (!z) continue;
          checked++;
          disjoint(z);
          inside(z, w, h);
          expect(z.jump.r).toBeGreaterThan(0);
        }
      }
    }
    expect(checked).toBeGreaterThan(500);
  });

  it("real phone sizes keep the minimum button radius", () => {
    for (const [w, h, dpr] of [
      [390, 844, 3],
      [360, 640, 3],
      [412, 915, 2.625],
      [375, 667, 2],
      [844, 390, 3],
      [915, 412, 2.625],
    ] as const) {
      const z = need(zonesFor(w, h, dpr, true, w < h ? 20 : 0));
      expect(z.jump.r, `${w}x${h}`).toBeGreaterThanOrEqual(MIN_BUTTON_RADIUS);
      expect(z.bubble.r, `${w}x${h}`).toBeGreaterThanOrEqual(MIN_BUTTON_RADIUS);
    }
  });
});

describe("TouchTracker (ownership and stickiness)", () => {
  const z = need(zonesFor(390, 844, 3));
  const m = mid(z);
  const mk = () => new TouchTracker(new TouchDeck(z));

  it("a touch that starts outside every zone is ignored for its whole life", () => {
    const tr = mk();
    expect(tr.update([t(1, 5, 5)])).toBe(0);
    expect(tr.update([t(1, z.jump.cx, z.jump.cy)])).toBe(0); // dragging onto JUMP does not press it
    expect(tr.update([t(1, m.x - 30, m.y)])).toBe(0);
    expect(tr.update([])).toBe(0);
    expect(tr.update([t(1, z.jump.cx, z.jump.cy)])).toBe(BTN.J); // a fresh touch with the same id is new
  });

  it("a touch starting on a button stays pressed while drifting within r + forgiveness*2, releases beyond", () => {
    const tr = mk();
    const j = z.jump;
    expect(tr.update([t(1, j.cx, j.cy)])).toBe(BTN.J);
    expect(tr.update([t(1, j.cx - j.r - BUTTON_FORGIVE * 1.5, j.cy)])).toBe(BTN.J); // outside initial, inside sticky
    expect(tr.update([t(1, j.cx - j.r - BUTTON_FORGIVE * 2 - 5, j.cy)])).toBe(0);
    expect(tr.update([t(1, j.cx, j.cy)])).toBe(0); // released touches stay ignored until lifted
  });

  it("a button touch that slides over the slide zone does not turn into movement", () => {
    const tr = mk();
    expect(tr.update([t(1, z.jump.cx, z.jump.cy)])).toBe(BTN.J);
    expect(tr.update([t(1, m.x - 20, m.y)])).toBe(0);
  });

  it("a slide touch stays a slide touch across halves and never presses a button", () => {
    const tr = mk();
    expect(tr.update([t(1, m.x - 30, m.y)])).toBe(BTN.L);
    expect(tr.update([t(1, m.x + 30, m.y)])).toBe(BTN.R);
    expect(tr.update([t(1, m.x + 30, m.y + 20)])).toBe(BTN.R);
    expect(tr.update([t(1, z.jump.cx, z.jump.cy)])).toBe(BTN.R); // dragged over JUMP: still a slide touch, clamped x
  });

  it("a slide touch overshooting far outside the zone keeps its side by clamped x until lifted", () => {
    const tr = mk();
    const far = 400;
    expect(tr.update([t(1, m.x - 30, m.y)])).toBe(BTN.L);
    expect(tr.update([t(1, z.slide.x + z.slide.width + far, m.y)])).toBe(BTN.R);
    expect(tr.update([t(1, z.slide.x - far, m.y)])).toBe(BTN.L);
    expect(tr.update([t(1, m.x + 30, z.slide.y - far)])).toBe(BTN.R); // far above: by x
    expect(tr.update([t(1, m.x - 30, z.slide.y + z.slide.height + far)])).toBe(BTN.L); // far below
    expect(tr.update([t(1, m.x, z.slide.y - far)])).toBe(0); // clamped x in the dead zone
    expect(tr.update([])).toBe(0);
    expect(tr.update([t(1, z.slide.x + z.slide.width + far, m.y)])).toBe(0); // fresh touch out there is ignored
  });

  it("slide thumb drifting above/below the zone keeps working", () => {
    const tr = mk();
    expect(tr.update([t(1, m.x - 30, m.y)])).toBe(BTN.L);
    expect(tr.update([t(1, m.x - 30, z.slide.y - SLIDE_EXTEND_Y - 10)])).toBe(BTN.L);
  });

  it("tracks several touches by id: run + jump + shoot, lifting one leaves the others", () => {
    const tr = mk();
    expect(tr.update([t(1, m.x + 30, m.y), t(2, z.jump.cx, z.jump.cy), t(3, z.bubble.cx, z.bubble.cy)])).toBe(
      BTN.R | BTN.J | BTN.F,
    );
    expect(tr.update([t(1, m.x + 30, m.y), t(3, z.bubble.cx, z.bubble.cy)])).toBe(BTN.R | BTN.F);
    expect(tr.update([t(3, z.bubble.cx, z.bubble.cy)])).toBe(BTN.F);
    expect(tr.update([])).toBe(0);
  });

  it("release() (cancel / blur) drops everything and ignores the touches still down", () => {
    const tr = mk();
    const held = [t(1, m.x + 30, m.y), t(2, z.jump.cx, z.jump.cy)];
    expect(tr.update(held)).toBe(BTN.R | BTN.J);
    tr.release();
    expect(tr.update(held)).toBe(0);
    expect(tr.update([])).toBe(0);
    expect(tr.update(held)).toBe(BTN.R | BTN.J); // lifted and pressed again
  });

  it("zones changing under a touch (rotation mid-touch) releases it", () => {
    const tr = mk();
    expect(tr.update([t(1, z.jump.cx, z.jump.cy)])).toBe(BTN.J);
    const land = need(zonesFor(844, 390, 3));
    tr.setZones(land);
    expect(tr.update([t(1, land.jump.cx, land.jump.cy)])).toBe(0);
    expect(tr.update([])).toBe(0);
    expect(tr.update([t(1, land.jump.cx, land.jump.cy)])).toBe(BTN.J);
  });

  it("setZones with identical zones does not disturb held touches", () => {
    const tr = mk();
    expect(tr.update([t(1, z.jump.cx, z.jump.cy)])).toBe(BTN.J);
    tr.setZones({ ...z, jump: { ...z.jump } });
    expect(tr.update([t(1, z.jump.cx, z.jump.cy)])).toBe(BTN.J);
  });

  it("owns() reports whether a live touch id is claimed by a zone", () => {
    const tr = mk();
    tr.update([t(1, z.jump.cx, z.jump.cy), t(2, 3, 3)]);
    expect(tr.owns(1)).toBe(true);
    expect(tr.owns(2)).toBe(false);
    expect(tr.owns(99)).toBe(false);
  });
});

describe("landscape phones: controls in the side columns, never over the field", () => {
  const phones: [number, number, number][] = [
    [844, 390, 3],
    [915, 412, 2.625],
    [800, 360, 3],
    [800, 360, 2],
  ];
  it("slide pad left, JUMP and BUBBLE right, both outside the field and inside the window", () => {
    for (const [w, h, dpr] of phones) {
      const l = computeLayout(w, h, dpr);
      const z = need(computeTouchZones(l, w, h, true));
      const tag = `${w}x${h}@${dpr}`;
      expect(z.overlay, tag).toBe(false);
      expect(z.slide.x + z.slide.width, tag).toBeLessThanOrEqual(l.gameX + 1e-9);
      for (const c of [z.jump, z.bubble]) {
        expect(c.cx - c.r, tag).toBeGreaterThanOrEqual(l.gameX + l.fieldW - 1e-9);
        expect(c.cx + c.r, tag).toBeLessThanOrEqual(w + 1e-9);
        expect(c.cy + c.r, tag).toBeLessThanOrEqual(h + 1e-9);
        expect(c.r, tag).toBeGreaterThanOrEqual(MIN_BUTTON_RADIUS);
      }
    }
  });
  it("notch insets move both columns inward", () => {
    const l = computeLayout(844, 390, 3);
    const flat = need(computeTouchZones(l, 844, 390, true));
    const notch = need(computeTouchZones(l, 844, 390, true, 0, 44, 44));
    expect(notch.slide.x).toBeGreaterThanOrEqual(flat.slide.x + 44 - 1e-9);
    expect(notch.bubble.cx + notch.bubble.r).toBeLessThanOrEqual(844 - 44 + 1e-9);
  });
  it("a mouse desktop 1280x720 gets no controls; a touch-capable one gets side columns", () => {
    const l = computeLayout(1280, 720, 1);
    expect(computeTouchZones(l, 1280, 720, false)).toBeNull();
    expect(need(computeTouchZones(l, 1280, 720, true)).overlay).toBe(false);
  });
});
