import { BTN } from "@bubble/shared";
import type { Layout, Rect } from "../render/layout";
import { drawDeck } from "./touch-draw";

/*
 * Touch control model (pure geometry, no DOM).
 *
 *   portrait                          landscape, wide margins           landscape, narrow margins
 *   +----------------+                +------+--------------+------+    +-----------------------+
 *   |     field      |                |      |              |  (J) |    |        field          |
 *   +----------------+                | SLIDE|    field     |      |    |                  (J)  |
 *   |  SLIDE   (J)   |                |      |              | (B)  |    | [SLIDE]          (B)  |
 *   |  <  |  >    (B)  |              +------+--------------+------+    +-----------------------+
 *   +----------------+                                                    (translucent overlay)
 *
 * Left thumb: slide zone (left half walks left, right half walks right, small dead zone between).
 * Right thumb: BUBBLE sits at the lower right (the thumb's natural rest position), JUMP diagonally
 * above/left of it so the thumb rolls between them without lifting.
 */

export interface Circle {
  cx: number;
  cy: number;
  r: number;
}

export interface TouchZones {
  slide: Rect;
  jump: Circle;
  bubble: Circle;
  /** True when drawn over the playfield (narrow-margin landscape): translucent. */
  overlay: boolean;
}

export interface TouchPoint {
  id: number;
  x: number;
  y: number;
}

export type Owner = "slide" | "jump" | "bubble" | null;

/** Width of the do-nothing band in the middle of the slide zone, as a fraction of its width. */
export const DEAD_ZONE_FRAC = 0.12;
/** The slide zone's hit area reaches this far above/below it (CSS px) so a drifting thumb still counts. */
export const SLIDE_EXTEND_Y = 24;
/** Extra radius (CSS px) around a button that still counts as pressing it, for a fresh touch. */
export const BUTTON_FORGIVE = 10;
/** A touch that STARTED on a button stays pressed while within r + this. */
export const BUTTON_STICKY = BUTTON_FORGIVE * 2;
/** A touch that started on the slide zone stays a slide touch within this margin around it. */
export const SLIDE_STICKY_PAD = 48;
export const MIN_BUTTON_RADIUS = 40;
export const MAX_BUTTON_RADIUS = 64;
/** Share of the deck width given to the slide zone in portrait. */
export const SLIDE_FRAC = 0.45;
/** Landscape margin (per side, CSS px) needed to put controls beside the field instead of over it. */
export const MIN_MARGIN_W = 120;
const EDGE_PAD = 8;
const BUTTON_GAP = 10;

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const inset = (r: Rect, pad: number): Box => ({
  left: r.x + pad,
  top: r.y + pad,
  right: r.x + r.width - pad,
  bottom: r.y + r.height - pad,
});

/** Two big round buttons in the lower right of `b`: BUBBLE bottom-right, JUMP above and left of it. */
function placeButtons(b: Box): { jump: Circle; bubble: Circle } | null {
  const h = b.bottom - b.top;
  const rMax = Math.max(MIN_BUTTON_RADIUS, Math.min(MAX_BUTTON_RADIUS, Math.floor(h * 0.28)));
  for (let r = rMax; r >= 8; r--) {
    const bubble: Circle = { cx: b.right - r, cy: b.bottom - r, r };
    const need = 2 * r + BUTTON_GAP;
    const maxRise = bubble.cy - (b.top + r);
    for (let rise = Math.min(1.2 * r, Math.max(0, maxRise)); rise <= maxRise + 1e-9; rise += 2) {
      const run = Math.sqrt(Math.max(0, need * need - rise * rise));
      const jump: Circle = { cx: bubble.cx - run, cy: bubble.cy - rise, r };
      if (jump.cx - r >= b.left - 1e-9) return { jump, bubble };
    }
  }
  return null;
}

/**
 * Where the controls go for a layout, or null when there is no deck (mouse/keyboard desktop in a
 * wide window). `touchPrimary` comes from the caller (coarse pointer or a touch event seen).
 * `safeBottom` is the home-indicator inset in CSS px.
 */
export function computeTouchZones(
  layout: Layout,
  winW: number,
  winH: number,
  touchPrimary: boolean,
  safeBottom = 0,
): TouchZones | null {
  const usableH = Math.max(0, winH - safeBottom);

  if (layout.mode === "portrait") {
    const d = layout.deckRect;
    if (!d || d.height <= 0) return null;
    const region: Rect = { x: d.x, y: d.y, width: d.width, height: Math.max(0, d.height - safeBottom) };
    const slideBox = inset(region, EDGE_PAD);
    const btn = placeButtons(inset({ ...region, x: d.x + d.width * 0.5, width: d.width * 0.5 }, EDGE_PAD));
    if (!btn) return null;
    return {
      slide: {
        x: slideBox.left,
        y: slideBox.top,
        width: d.width * SLIDE_FRAC - EDGE_PAD,
        height: slideBox.bottom - slideBox.top,
      },
      ...btn,
      overlay: false,
    };
  }

  if (!touchPrimary) return null;
  const left = layout.gameX;
  const right = winW - (layout.gameX + layout.fieldW);

  if (Math.min(left, right) >= MIN_MARGIN_W) {
    const l = inset({ x: 0, y: 0, width: left, height: usableH }, EDGE_PAD);
    const btn = placeButtons(inset({ x: winW - right, y: 0, width: right, height: usableH }, EDGE_PAD));
    if (!btn) return null;
    return {
      slide: { x: l.left, y: l.top, width: l.right - l.left, height: l.bottom - l.top },
      ...btn,
      overlay: false,
    };
  }

  // Narrow margins: translucent controls over the bottom corners of the field.
  const cornerW = Math.max(140, Math.min(260, winW * 0.26));
  const slideH = Math.min(usableH * 0.4, 140);
  const btn = placeButtons(inset({ x: winW - cornerW, y: usableH * 0.35, width: cornerW, height: usableH * 0.65 }, EDGE_PAD));
  if (!btn) return null;
  return {
    slide: { x: EDGE_PAD, y: usableH - EDGE_PAD - slideH, width: cornerW, height: slideH },
    ...btn,
    overlay: true,
  };
}

export function zonesEqual(a: TouchZones | null, b: TouchZones | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const c = (p: Circle, q: Circle) => p.cx === q.cx && p.cy === q.cy && p.r === q.r;
  return (
    a.overlay === b.overlay &&
    a.slide.x === b.slide.x &&
    a.slide.y === b.slide.y &&
    a.slide.width === b.slide.width &&
    a.slide.height === b.slide.height &&
    c(a.jump, b.jump) &&
    c(a.bubble, b.bubble)
  );
}

const dist = (c: Circle, x: number, y: number): number => Math.hypot(x - c.cx, y - c.cy);

/** Pure hit-testing: the CURRENT touches -> BTN mask. Releasing is simply a touch being absent. */
export class TouchDeck {
  constructor(private zones: TouchZones | null) {}

  get current(): TouchZones | null {
    return this.zones;
  }

  setZones(z: TouchZones | null): void {
    this.zones = z;
  }

  /** Which zone a FRESH touch at (x, y) lands in (buttons first, nearest centre on a tie). */
  classify(x: number, y: number): Owner {
    const z = this.zones;
    if (!z) return null;
    const dj = dist(z.jump, x, y);
    const db = dist(z.bubble, x, y);
    const inJ = dj <= z.jump.r + BUTTON_FORGIVE;
    const inB = db <= z.bubble.r + BUTTON_FORGIVE;
    if (inJ && inB) return dj <= db ? "jump" : "bubble";
    if (inJ) return "jump";
    if (inB) return "bubble";
    const s = z.slide;
    if (x >= s.x && x <= s.x + s.width && y >= s.y - SLIDE_EXTEND_Y && y <= s.y + s.height + SLIDE_EXTEND_Y) {
      return "slide";
    }
    return null;
  }

  /** Whether a touch already owned by `owner` still belongs to it at (x, y) (sticky, more generous). */
  stillOwns(owner: Exclude<Owner, null>, x: number, y: number): boolean {
    const z = this.zones;
    if (!z) return false;
    if (owner === "jump") return dist(z.jump, x, y) <= z.jump.r + BUTTON_STICKY;
    if (owner === "bubble") return dist(z.bubble, x, y) <= z.bubble.r + BUTTON_STICKY;
    const s = z.slide;
    return (
      x >= s.x - SLIDE_STICKY_PAD &&
      x <= s.x + s.width + SLIDE_STICKY_PAD &&
      y >= s.y - SLIDE_STICKY_PAD &&
      y <= s.y + s.height + SLIDE_STICKY_PAD
    );
  }

  /** The buttons an owned touch at x presses. */
  maskFor(owner: Owner, x: number): number {
    if (owner === "jump") return BTN.J;
    if (owner === "bubble") return BTN.F;
    const z = this.zones;
    if (owner !== "slide" || !z) return 0;
    const half = (z.slide.width * DEAD_ZONE_FRAC) / 2;
    const centre = z.slide.x + z.slide.width / 2;
    if (x < centre - half) return BTN.L;
    if (x > centre + half) return BTN.R;
    return 0;
  }

  /** Stateless: every touch is classified fresh. Use TouchTracker for ownership and stickiness. */
  handle(touches: readonly TouchPoint[]): number {
    let mask = 0;
    for (const t of touches) mask |= this.maskFor(this.classify(t.x, t.y), t.x);
    return mask;
  }

  /** Draws in CSS px (the caller sets the context transform). */
  draw(ctx: CanvasRenderingContext2D, pressedMask = 0): void {
    if (this.zones) drawDeck(ctx, this.zones, pressedMask);
  }
}

/** Per-touch-id ownership between the DOM events and the deck. */
export class TouchTracker {
  private readonly owners = new Map<number, Owner>();

  constructor(private readonly deck: TouchDeck) {}

  /** `touches` is the full current set. Owners of vanished ids are forgotten (= released). */
  update(touches: readonly TouchPoint[]): number {
    for (const id of this.owners.keys()) {
      let present = false;
      for (const t of touches) {
        if (t.id === id) {
          present = true;
          break;
        }
      }
      if (!present) this.owners.delete(id);
    }
    let mask = 0;
    for (const t of touches) {
      let o = this.owners.get(t.id);
      if (o === undefined) {
        o = this.deck.classify(t.x, t.y);
        this.owners.set(t.id, o);
      } else if (o !== null && !this.deck.stillOwns(o, t.x, t.y)) {
        o = null; // drifted too far: released, ignored until lifted
        this.owners.set(t.id, o);
      }
      mask |= this.deck.maskFor(o, t.x);
    }
    return mask;
  }

  owns(id: number): boolean {
    return (this.owners.get(id) ?? null) !== null;
  }

  /** Releases every held touch; ones still on the glass stay ignored until they lift. */
  release(): void {
    for (const id of this.owners.keys()) this.owners.set(id, null);
  }

  /** Returns true when the zones changed (every held touch was released). */
  setZones(z: TouchZones | null): boolean {
    if (zonesEqual(this.deck.current, z)) return false;
    this.deck.setZones(z);
    this.release();
    return true;
  }
}
