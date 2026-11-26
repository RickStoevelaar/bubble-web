import { describe, expect, it } from "vitest";
import { BTN } from "@bubble/shared";
import { computeLayout } from "../src/render/layout";
import { FLICK_HOLD_MS, FLICK_MIN_PX, PAD_DEAD_X, PAD_JUMP_OFF, PAD_JUMP_ON } from "../src/input/pad";
import {
  BUTTON_FORGIVE,
  MAX_BUTTON_RADIUS,
  MIN_BUTTON_RADIUS,
  PAD_FORGIVE,
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
const t = (id: number, x: number, y: number) => ({ id, x, y });
/** A point at (vx, vy) pad radii from the pad centre (y negative = up). */
const pp = (z: TouchZones, vx: number, vy: number, id = 1) => t(id, z.pad.cx + vx * z.pad.r, z.pad.cy + vy * z.pad.r);
const bp = (z: TouchZones, id = 2) => t(id, z.bubble.cx, z.bubble.cy);

describe("TouchDeck.handle (pure)", () => {
  const z = need(zonesFor(390, 844, 3));
  const deck = new TouchDeck(z);

  it("pad horizontal: left of centre is L, right R, dead zone neutral", () => {
    expect(deck.handle([pp(z, -0.6, 0)])).toBe(BTN.L);
    expect(deck.handle([pp(z, 0.6, 0)])).toBe(BTN.R);
    expect(deck.handle([pp(z, 0, 0)])).toBe(0);
    expect(deck.handle([pp(z, PAD_DEAD_X * 0.8, 0)])).toBe(0);
    expect(deck.handle([pp(z, -PAD_DEAD_X * 0.8, 0)])).toBe(0);
  });

  it("pad up is jump, up-right / up-left are diagonal, down does nothing", () => {
    expect(deck.handle([pp(z, 0, -0.6)])).toBe(BTN.J);
    expect(deck.handle([pp(z, 0.5, -0.6)])).toBe(BTN.R | BTN.J);
    expect(deck.handle([pp(z, -0.5, -0.6)])).toBe(BTN.L | BTN.J);
    expect(deck.handle([pp(z, 0, 0.8)])).toBe(0);
    expect(deck.handle([pp(z, -0.5, 0.6)])).toBe(BTN.L);
  });

  it("pad + BUBBLE at once give move + jump + fire; releasing = absence", () => {
    const touches = [pp(z, -0.5, -0.6), bp(z)];
    expect(deck.handle(touches)).toBe(BTN.L | BTN.J | BTN.F);
    expect(deck.handle(touches.slice(1))).toBe(BTN.F);
    expect(deck.handle([])).toBe(0);
  });

  it("there is exactly one button: no JUMP circle in the zones", () => {
    expect("jump" in z).toBe(false);
    expect(z.bubble.r).toBeGreaterThan(0);
  });

  it("empty deck (null zones) yields nothing", () => {
    expect(new TouchDeck(null).handle([t(1, 100, 700)])).toBe(0);
  });

  it("BUBBLE has a forgiveness margin, the pad too; the gap between them is dead", () => {
    const b = z.bubble;
    expect(deck.handle([t(1, b.cx + b.r + BUTTON_FORGIVE - 1, b.cy)])).toBe(BTN.F);
    expect(deck.handle([t(1, b.cx + b.r + BUTTON_FORGIVE + 30, b.cy - b.r - 60)])).toBe(0);
    expect(deck.classify(z.pad.cx + z.pad.r + PAD_FORGIVE - 1, z.pad.cy)).toBe("pad");
    expect(deck.classify(z.pad.cx + z.pad.r + PAD_FORGIVE + 3, z.pad.cy)).toBe(null);
  });

  it("where the pad's and the button's hit areas overlap, the nearer edge wins", () => {
    const pad: Circle = { cx: 100, cy: 100, r: 100 };
    const bubble: Circle = { cx: 280, cy: 100, r: 60 };
    const d = new TouchDeck({ pad, bubble, overlay: false });
    // pad edge at x=200, bubble edge at x=220: 205 is only in the pad area; 215 is in both and nearer the bubble edge
    expect(d.classify(205, 100)).toBe("pad");
    expect(d.classify(215, 100)).toBe("bubble");
  });

  it("after setZones with the rotated layout the SAME screen point maps by the new zones", () => {
    const d = new TouchDeck(z);
    const point = { x: z.bubble.cx, y: z.bubble.cy };
    expect(d.handle([t(1, point.x, point.y)])).toBe(BTN.F);
    const land = need(zonesFor(844, 390, 3));
    d.setZones(land);
    expect(d.handle([t(1, point.x, point.y)])).not.toBe(BTN.F);
    expect(d.handle([bp(land, 1)])).toBe(BTN.F);
    expect(d.handle([pp(land, -0.6, 0)])).toBe(BTN.L);
  });
});

describe("computeTouchZones", () => {
  const inside = (z: TouchZones, w: number, h: number) => {
    for (const c of [z.pad, z.bubble]) {
      expect(c.cx - c.r).toBeGreaterThanOrEqual(-1e-9);
      expect(c.cy - c.r).toBeGreaterThanOrEqual(-1e-9);
      expect(c.cx + c.r).toBeLessThanOrEqual(w + 1e-9);
      expect(c.cy + c.r).toBeLessThanOrEqual(h + 1e-9);
    }
  };
  const disjoint = (z: TouchZones) => {
    expect(Math.hypot(z.pad.cx - z.bubble.cx, z.pad.cy - z.bubble.cy)).toBeGreaterThan(z.pad.r + z.bubble.r);
  };

  for (const [w, h] of [
    [390, 844],
    [360, 800],
  ] as const) {
    it(`portrait ${w}x${h}@3: big pad in the left ~58% of the deck, fire button right and lower, nothing overlaps`, () => {
      const l = computeLayout(w, h, 3);
      const z = need(computeTouchZones(l, w, h, true));
      const d = l.deckRect!;
      expect(z.overlay).toBe(false);
      expect(z.pad.cx + z.pad.r).toBeLessThanOrEqual(d.x + d.width * 0.6);
      expect(z.pad.cx - z.pad.r).toBeGreaterThanOrEqual(d.x);
      expect(z.pad.cy - z.pad.r).toBeGreaterThanOrEqual(d.y);
      expect(z.pad.cy + z.pad.r).toBeLessThanOrEqual(d.y + d.height + 1e-9);
      // the pad fills what it can: limited by the deck height or the 58% width
      const room = Math.min(d.height - 16, d.width * 0.58 - 8) / 2;
      expect(z.pad.r).toBeGreaterThanOrEqual(room * 0.9);
      expect(z.pad.r).toBeGreaterThanOrEqual(70);
      expect(z.bubble.cx - z.bubble.r).toBeGreaterThanOrEqual(z.pad.cx + z.pad.r - 1e-9);
      expect(z.bubble.r).toBeGreaterThan(MIN_BUTTON_RADIUS);
      expect(z.bubble.r).toBeLessThanOrEqual(MAX_BUTTON_RADIUS);
      expect(z.bubble.cy).toBeGreaterThan(d.y + d.height / 2);
      disjoint(z);
      inside(z, w, h);
    });
  }

  it("the button is bigger than the old 64 px maximum where the deck allows it (portrait 390x844)", () => {
    expect(need(zonesFor(390, 844, 3)).bubble.r).toBeGreaterThan(64);
    expect(MAX_BUTTON_RADIUS).toBeLessThanOrEqual(64 * 1.35 + 1);
  });

  for (const [w, h] of [
    [844, 390],
    [800, 360],
  ] as const) {
    it(`landscape ${w}x${h}@3: pad in the left column, fire button in the right column, outside the field`, () => {
      const l = computeLayout(w, h, 3);
      const z = need(computeTouchZones(l, w, h, true));
      expect(z.overlay).toBe(false);
      expect(z.pad.cx + z.pad.r).toBeLessThanOrEqual(l.gameX + 1e-9);
      expect(z.bubble.cx - z.bubble.r).toBeGreaterThanOrEqual(l.gameX + l.fieldW - 1e-9);
      expect(z.pad.r).toBeGreaterThanOrEqual(50);
      expect(z.bubble.r).toBeGreaterThanOrEqual(MIN_BUTTON_RADIUS);
      // vertically centred-lower: below the middle of the screen
      expect(z.bubble.cy).toBeGreaterThanOrEqual(h / 2);
      disjoint(z);
      inside(z, w, h);
    });
  }

  it("landscape overlay (narrow margins): smaller translucent pad bottom-left, one button bottom-right", () => {
    const l = computeLayout(600, 375, 2);
    expect(l.gameX).toBeLessThan(120);
    const z = need(computeTouchZones(l, 600, 375, true));
    expect(z.overlay).toBe(true);
    expect(z.pad.cx).toBeLessThan(300);
    expect(z.bubble.cx).toBeGreaterThan(300);
    expect(z.bubble.cy).toBeGreaterThan(375 / 2);
    expect(z.pad.cy).toBeGreaterThan(375 / 2);
    expect(z.pad.r).toBeGreaterThanOrEqual(45);
    disjoint(z);
    inside(z, 600, 375);
  });

  it("safeBottom keeps everything above the home-indicator area", () => {
    const z = need(zonesFor(390, 844, 3, true, 34));
    expect(z.bubble.cy + z.bubble.r).toBeLessThanOrEqual(844 - 34);
    expect(z.pad.cy + z.pad.r).toBeLessThanOrEqual(844 - 34);
  });

  it("portrait deck still produces zones for a mouse-primary desktop (the deck area is reserved anyway)", () => {
    expect(zonesFor(500, 900, 1, false)).not.toBeNull();
  });

  it("desktop with mouse/keyboard in a wide window: no deck", () => {
    expect(zonesFor(1280, 720, 1, false)).toBeNull();
    expect(zonesFor(1280, 720, 2, false)).toBeNull();
  });

  it("touch-primary very wide landscape window uses margin controls", () => {
    expect(need(zonesFor(1600, 700, 1, true)).overlay).toBe(false);
  });

  it("notch insets move both landscape columns inward", () => {
    const l = computeLayout(844, 390, 3);
    const notch = need(computeTouchZones(l, 844, 390, true, 0, 44, 44));
    expect(notch.pad.cx - notch.pad.r).toBeGreaterThanOrEqual(44 - 1e-9);
    expect(notch.bubble.cx + notch.bubble.r).toBeLessThanOrEqual(844 - 44 + 1e-9);
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
          expect(z.bubble.r).toBeGreaterThan(0);
          expect(z.pad.r).toBeGreaterThan(0);
        }
      }
    }
    expect(checked).toBeGreaterThan(500);
  });

  it("real phone sizes keep the minimum button radius and a usable pad", () => {
    for (const [w, h, dpr] of [
      [390, 844, 3],
      [360, 640, 3],
      [412, 915, 2.625],
      [375, 667, 2],
      [844, 390, 3],
      [915, 412, 2.625],
    ] as const) {
      const z = need(zonesFor(w, h, dpr, true, w < h ? 20 : 0));
      expect(z.bubble.r, `${w}x${h}`).toBeGreaterThanOrEqual(MIN_BUTTON_RADIUS);
      expect(z.pad.r, `${w}x${h}`).toBeGreaterThanOrEqual(50);
    }
  });
});

describe("TouchTracker (ownership and stickiness)", () => {
  const z = need(zonesFor(390, 844, 3));
  const mk = () => new TouchTracker(new TouchDeck(z));

  it("a touch that starts outside every zone is ignored for its whole life", () => {
    const tr = mk();
    expect(tr.update([t(1, 5, 5)], 0)).toBe(0);
    expect(tr.update([bp(z, 1)], 10)).toBe(0); // dragging onto BUBBLE does not press it
    expect(tr.update([pp(z, -0.6, 0)], 20)).toBe(0);
    expect(tr.update([], 30)).toBe(0);
    expect(tr.update([bp(z, 1)], 40)).toBe(BTN.F); // a fresh touch with the same id is new
  });

  it("a touch starting on BUBBLE stays pressed within r + forgiveness*2, releases beyond", () => {
    const tr = mk();
    const b = z.bubble;
    expect(tr.update([t(1, b.cx, b.cy)], 0)).toBe(BTN.F);
    expect(tr.update([t(1, b.cx - b.r - BUTTON_FORGIVE * 1.5, b.cy)], 10)).toBe(BTN.F);
    expect(tr.update([t(1, b.cx - b.r - BUTTON_FORGIVE * 2 - 5, b.cy)], 20)).toBe(0);
    expect(tr.update([t(1, b.cx, b.cy)], 30)).toBe(0); // released touches stay ignored until lifted
  });

  it("a BUBBLE touch that slides over the pad does not turn into movement", () => {
    const tr = mk();
    expect(tr.update([bp(z, 1)], 0)).toBe(BTN.F);
    expect(tr.update([pp(z, -0.6, 0)], 10)).toBe(0);
  });

  it("a pad touch stays a pad touch across directions and never presses BUBBLE", () => {
    const tr = mk();
    expect(tr.update([pp(z, -0.6, 0)], 0)).toBe(BTN.L);
    expect(tr.update([pp(z, 0.6, 0)], 100)).toBe(BTN.R);
    expect(tr.update([pp(z, 0.6, 0.3)], 200)).toBe(BTN.R);
    expect(tr.update([bp(z, 1)], 300)).toBe(BTN.R); // dragged over BUBBLE: still a pad touch, clamped
  });

  it("a pad touch overshooting far outside keeps its direction (clamped) until lifted", () => {
    const tr = mk();
    const far = 600;
    expect(tr.update([pp(z, -0.6, 0)], 0)).toBe(BTN.L);
    expect(tr.update([t(1, z.pad.cx + far, z.pad.cy)], 200)).toBe(BTN.R);
    expect(tr.update([t(1, z.pad.cx - far, z.pad.cy)], 400)).toBe(BTN.L);
    expect(tr.update([t(1, z.pad.cx, z.pad.cy + far)], 600)).toBe(0); // far below: neutral, never a drop
    expect(tr.update([t(1, z.pad.cx + far, z.pad.cy - far)], 800)).toBe(BTN.R | BTN.J); // far up-right
    expect(tr.update([], 1000)).toBe(0);
    expect(tr.update([t(1, z.pad.cx + z.pad.r + 200, z.pad.cy)], 1100)).toBe(0); // fresh touch out there is ignored
  });

  it("jump hysteresis through the tracker: stays on above PAD_JUMP_OFF, releases below, no flick needed", () => {
    const tr = mk();
    const band = -(PAD_JUMP_ON + PAD_JUMP_OFF) / 2;
    expect(tr.update([pp(z, 0, 0)], 0)).toBe(0);
    expect(tr.update([pp(z, 0, -(PAD_JUMP_ON + 0.2))], 500)).toBe(BTN.J);
    expect(tr.update([pp(z, 0, band)], 1000)).toBe(BTN.J);
    expect(tr.update([pp(z, 0, -(PAD_JUMP_OFF - 0.05))], 1500)).toBe(0);
    expect(tr.update([pp(z, 0, band)], 2000)).toBe(0); // back in the band: still off
  });

  it("diagonal in one motion: slide up-right from the centre, R and J together; lift releases all", () => {
    const tr = mk();
    expect(tr.update([pp(z, 0, 0)], 0)).toBe(0);
    expect(tr.update([pp(z, 0.4, -0.2)], 300)).toBe(BTN.R);
    expect(tr.update([pp(z, 0.6, -0.5)], 600)).toBe(BTN.R | BTN.J);
    expect(tr.update([], 1000)).toBe(0);
  });

  it("flick: a quick upward move triggers a minimum jump hold even if the thumb returns", () => {
    const tr = mk();
    tr.update([pp(z, 0, 0)], 0);
    expect(tr.update([t(1, z.pad.cx, z.pad.cy - FLICK_MIN_PX - 2)], 40) & BTN.J).toBe(BTN.J);
    // back to the centre at once: the pad alone would release, the flick hold keeps J
    expect(tr.update([pp(z, 0, 0)], 55)).toBe(BTN.J);
    expect(tr.held(40 + FLICK_HOLD_MS - 1)).toBe(BTN.J);
    expect(tr.held(40 + FLICK_HOLD_MS + 1)).toBe(0);
  });

  it("flick then lift: J outlasts the touch by the hold time, then ends", () => {
    const tr = mk();
    tr.update([pp(z, 0, 0)], 0);
    tr.update([t(1, z.pad.cx, z.pad.cy - FLICK_MIN_PX - 2)], 30);
    expect(tr.update([], 45)).toBe(BTN.J);
    expect(tr.held(30 + FLICK_HOLD_MS + 5)).toBe(0);
  });

  it("a slow upward drift that never crosses the threshold is not a flick", () => {
    const tr = mk();
    const px = PAD_JUMP_ON * z.pad.r * 0.8;
    tr.update([pp(z, 0, 0)], 0);
    for (let i = 1; i <= 10; i++) expect(tr.update([t(1, z.pad.cx, z.pad.cy - (px * i) / 10)], i * 100)).toBe(0);
  });

  it("release() clears a pending flick hold", () => {
    const tr = mk();
    tr.update([pp(z, 0, 0)], 0);
    tr.update([t(1, z.pad.cx, z.pad.cy - FLICK_MIN_PX - 2)], 30);
    tr.release();
    expect(tr.held(35)).toBe(0);
  });

  it("tracks several touches by id: run+jump on the pad and shoot at once, lifting one leaves the other", () => {
    const tr = mk();
    expect(tr.update([pp(z, 0.6, -0.6, 1), bp(z, 3)], 0)).toBe(BTN.R | BTN.J | BTN.F);
    expect(tr.update([bp(z, 3)], 500)).toBe(BTN.F);
    expect(tr.update([], 600)).toBe(0);
  });

  it("pad thumb and fire thumb are independent: moving one does not disturb the other", () => {
    const tr = mk();
    expect(tr.update([pp(z, -0.6, 0, 1), bp(z, 2)], 0)).toBe(BTN.L | BTN.F);
    expect(tr.update([pp(z, 0.6, 0, 1), bp(z, 2)], 100)).toBe(BTN.R | BTN.F);
    expect(tr.update([pp(z, 0.6, 0, 1)], 200)).toBe(BTN.R);
  });

  it("release() (cancel / blur) drops everything and ignores the touches still down", () => {
    const tr = mk();
    const held = [pp(z, 0.6, -0.6, 1), bp(z, 2)];
    expect(tr.update(held, 0)).toBe(BTN.R | BTN.J | BTN.F);
    tr.release();
    expect(tr.update(held, 100)).toBe(0);
    expect(tr.update([], 200)).toBe(0);
    expect(tr.update(held, 300)).toBe(BTN.R | BTN.J | BTN.F); // lifted and pressed again
  });

  it("zones changing under a touch (rotation mid-touch) releases it", () => {
    const tr = mk();
    expect(tr.update([bp(z, 1)], 0)).toBe(BTN.F);
    const land = need(zonesFor(844, 390, 3));
    tr.setZones(land);
    expect(tr.update([bp(land, 1)], 10)).toBe(0);
    expect(tr.update([], 20)).toBe(0);
    expect(tr.update([bp(land, 1)], 30)).toBe(BTN.F);
  });

  it("setZones with identical zones does not disturb held touches", () => {
    const tr = mk();
    expect(tr.update([bp(z, 1)], 0)).toBe(BTN.F);
    tr.setZones({ ...z, bubble: { ...z.bubble }, pad: { ...z.pad } });
    expect(tr.update([bp(z, 1)], 10)).toBe(BTN.F);
  });

  it("owns() reports whether a live touch id is claimed by a zone", () => {
    const tr = mk();
    tr.update([bp(z, 1), t(2, 3, 3)], 0);
    expect(tr.owns(1)).toBe(true);
    expect(tr.owns(2)).toBe(false);
    expect(tr.owns(99)).toBe(false);
  });

  it("knob reports the pad vector of the pad-owned touch (null when none), clamped to the unit disk", () => {
    const tr = mk();
    expect(tr.knob()).toBeNull();
    tr.update([pp(z, 0.5, -0.25, 1)], 0);
    expect(tr.knob()).toEqual({ x: 0.5, y: -0.25 });
    tr.update([t(1, z.pad.cx + 900, z.pad.cy)], 10);
    expect(tr.knob()).toEqual({ x: 1, y: 0 });
    tr.update([], 20);
    expect(tr.knob()).toBeNull();
  });
});
