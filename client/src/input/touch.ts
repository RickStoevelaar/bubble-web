import { BTN } from "@bubble/shared";
import { MIN_MARGIN_W as LAYOUT_MIN_MARGIN_W, type Layout, type Rect } from "../render/layout";
import { FLICK_HOLD_MS, FlickDetector, padButtons, padVector, type Circle, type PadVec } from "./pad";
import { drawDeck } from "./touch-draw";

export type { Circle, PadVec } from "./pad";

/*
 * Touch control model (pure geometry, no DOM).
 *
 *   portrait                          landscape, wide margins           landscape, narrow margins
 *   +----------------+                +------+--------------+------+    +-----------------------+
 *   |     field      |                |      |              |      |    |        field          |
 *   +----------------+                |  PAD |    field     |      |    |                       |
 *   |   ( PAD  )  (B)|                | (^)  |              | (B)  |    | (PAD)             (B) |
 *   |   (<  o  >)    |                +------+--------------+------+    +-----------------------+
 *   +----------------+                                                    (translucent overlay)
 *
 * Left thumb: a FIXED-centre 2D pad. Horizontal offset from the centre = left/right (with a dead zone), pushing
 * UP = jump (see pad.ts). Right thumb: one big BUBBLE (fire) button at the lower right, where the thumb rests.
 */

export interface TouchZones {
  pad: Circle;
  bubble: Circle;
  /** True when drawn over the playfield (narrow-margin landscape): translucent. */
  overlay: boolean;
}

export interface TouchPoint {
  id: number;
  x: number;
  y: number;
}

export type Owner = "pad" | "bubble" | null;

/** Extra radius (CSS px) around the pad circle that still starts a pad touch (a drifting thumb must not miss). */
export const PAD_FORGIVE = 24;
/** Extra radius (CSS px) around the button that still counts as pressing it, for a fresh touch. */
export const BUTTON_FORGIVE = 10;
/** A touch that STARTED on the button stays pressed while within r + this. */
export const BUTTON_STICKY = BUTTON_FORGIVE * 2;
export const MIN_BUTTON_RADIUS = 40;
/** 1.35 x the old maximum (64): the freed JUMP space goes to the one remaining button. */
export const MAX_BUTTON_RADIUS = 86;
/** Button radius as a share of the usable height (old 0.28, x1.35). */
const BUTTON_HEIGHT_FRAC = 0.28 * 1.35;
/** Largest pad radius (CSS px): bigger than this is wasted on a thumb. */
export const MAX_PAD_RADIUS = 150;
/** Share of the deck width given to the pad column in portrait (the fire button gets the rest). */
export const PAD_COLUMN_FRAC = 0.58;
/** Landscape margin (per side, CSS px) needed to put controls beside the field instead of over it. */
export const MIN_MARGIN_W = LAYOUT_MIN_MARGIN_W;
const EDGE_PAD = 8;

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

/** `vFrac`: 0 = top of the free vertical space, 1 = bottom. */
function placePad(b: Box, vFrac: number): Circle | null {
  const w = b.right - b.left;
  const h = b.bottom - b.top;
  const r = Math.min(MAX_PAD_RADIUS, Math.floor(Math.min(w, h) / 2));
  if (r < 20) return null;
  return { cx: b.left + w / 2, cy: b.top + r + (h - 2 * r) * vFrac, r };
}

function placeButton(b: Box, hAlign: "right" | "center", vFrac: number): Circle | null {
  const w = b.right - b.left;
  const h = b.bottom - b.top;
  const rMax = Math.max(MIN_BUTTON_RADIUS, Math.min(MAX_BUTTON_RADIUS, Math.floor(h * BUTTON_HEIGHT_FRAC)));
  const r = Math.min(rMax, Math.floor(w / 2), Math.floor(h / 2));
  if (r < 8) return null;
  return { cx: hAlign === "right" ? b.right - r : b.left + w / 2, cy: b.top + r + (h - 2 * r) * vFrac, r };
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
  safeLeft = 0,
  safeRight = 0,
): TouchZones | null {
  const usableH = Math.max(0, winH - safeBottom);

  if (layout.mode === "portrait") {
    const d = layout.deckRect;
    if (!d || d.height <= 0) return null;
    const hgt = Math.max(0, d.height - safeBottom);
    const split = d.width * PAD_COLUMN_FRAC;
    const pad = placePad(inset({ x: d.x, y: d.y, width: split, height: hgt }, EDGE_PAD), 0.5);
    const bubble = placeButton(inset({ x: d.x + split, y: d.y, width: d.width - split, height: hgt }, EDGE_PAD), "right", 0.8);
    if (!pad || !bubble) return null;
    return { pad, bubble, overlay: false };
  }

  if (!touchPrimary) return null;
  const left = layout.gameX;
  const right = winW - (layout.gameX + layout.fieldW);

  if (Math.min(left, right) >= MIN_MARGIN_W) {
    // Notch insets keep the controls out of the cut-out; the columns hug the screen edges (thumbs rest there).
    const pad = placePad(inset({ x: safeLeft, y: 0, width: Math.max(0, left - safeLeft), height: usableH }, EDGE_PAD), 0.65);
    const bubble = placeButton(
      inset({ x: winW - right, y: 0, width: Math.max(0, right - safeRight), height: usableH }, EDGE_PAD),
      "center",
      0.65,
    );
    if (!pad || !bubble) return null;
    return { pad, bubble, overlay: false };
  }

  // Narrow margins: translucent controls over the bottom corners of the field (a smaller pad).
  const cornerW = Math.max(140, Math.min(260, winW * 0.26));
  const cornerY = usableH * 0.3;
  const cornerH = usableH - cornerY;
  const pad = placePad(inset({ x: 0, y: cornerY, width: cornerW, height: cornerH }, EDGE_PAD), 1);
  const bubble = placeButton(inset({ x: winW - cornerW, y: cornerY, width: cornerW, height: cornerH }, EDGE_PAD), "right", 1);
  if (!pad || !bubble) return null;
  return { pad, bubble, overlay: true };
}

export function zonesEqual(a: TouchZones | null, b: TouchZones | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const c = (p: Circle, q: Circle) => p.cx === q.cx && p.cy === q.cy && p.r === q.r;
  return a.overlay === b.overlay && c(a.pad, b.pad) && c(a.bubble, b.bubble);
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

  /** Which zone a FRESH touch at (x, y) lands in (the nearer edge wins where the hit areas overlap). */
  classify(x: number, y: number): Owner {
    const z = this.zones;
    if (!z) return null;
    const ep = dist(z.pad, x, y) - z.pad.r;
    const eb = dist(z.bubble, x, y) - z.bubble.r;
    const inP = ep <= PAD_FORGIVE;
    const inB = eb <= BUTTON_FORGIVE;
    if (inP && inB) return ep <= eb ? "pad" : "bubble";
    if (inB) return "bubble";
    if (inP) return "pad";
    return null;
  }

  /** Whether a touch already owned by `owner` still belongs to it at (x, y) (sticky, more generous). */
  stillOwns(owner: Exclude<Owner, null>, x: number, y: number): boolean {
    const z = this.zones;
    if (!z) return false;
    if (owner === "bubble") return dist(z.bubble, x, y) <= z.bubble.r + BUTTON_STICKY;
    // A pad touch stays pad-owned for its whole life (only a lift/cancel/blur/rezone ends it);
    // the vector is clamped to the pad, so overshooting keeps the direction it overshot toward.
    return true;
  }

  /** The pad vector of a touch at (x, y), or null with no zones. */
  vector(x: number, y: number): PadVec | null {
    return this.zones ? padVector(this.zones.pad, x, y) : null;
  }

  /** The buttons an owned touch at (x, y) presses (stateless: no jump hysteresis). */
  maskFor(owner: Owner, x: number, y: number, jumpHeld = false): number {
    if (owner === "bubble") return BTN.F;
    if (owner !== "pad") return 0;
    const v = this.vector(x, y);
    return v ? padButtons(v, jumpHeld) : 0;
  }

  /** Stateless: every touch is classified fresh. Use TouchTracker for ownership, hysteresis and flicks. */
  handle(touches: readonly TouchPoint[]): number {
    let mask = 0;
    for (const t of touches) mask |= this.maskFor(this.classify(t.x, t.y), t.x, t.y);
    return mask;
  }

  /** Draws in CSS px (the caller sets the context transform). `knob` is the pad vector of the pad thumb, if any. */
  draw(ctx: CanvasRenderingContext2D, pressedMask = 0, knob: PadVec | null = null): void {
    if (this.zones) drawDeck(ctx, this.zones, pressedMask, knob);
  }
}

interface PadTouch {
  jump: boolean;
  vec: PadVec;
  flick: FlickDetector;
}

/** Per-touch-id ownership between the DOM events and the deck. */
export class TouchTracker {
  private readonly owners = new Map<number, Owner>();
  private readonly pads = new Map<number, PadTouch>();
  /** Buttons held by the current touches (without the flick hold). */
  private base = 0;
  private flickUntil = -Infinity;

  constructor(
    private readonly deck: TouchDeck,
    private readonly now: () => number = () => performance.now(),
  ) {}

  /** `touches` is the full current set. Owners of vanished ids are forgotten (= released). Returns the held mask at `now`. */
  update(touches: readonly TouchPoint[], now: number = this.now()): number {
    for (const id of [...this.owners.keys()]) {
      if (!touches.some((t) => t.id === id)) {
        this.owners.delete(id);
        this.pads.delete(id);
      }
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
      if (o === "pad") {
        const v = this.deck.vector(t.x, t.y);
        if (!v) continue;
        let p = this.pads.get(t.id);
        if (!p) {
          p = { jump: false, vec: v, flick: new FlickDetector() };
          this.pads.set(t.id, p);
        }
        const m = padButtons(v, p.jump);
        p.jump = (m & BTN.J) !== 0;
        p.vec = v;
        if (p.flick.push(now, t.y, v.y)) this.flickUntil = now + FLICK_HOLD_MS;
        mask |= m;
      } else {
        this.pads.delete(t.id);
        mask |= this.deck.maskFor(o, t.x, t.y);
      }
    }
    this.base = mask;
    return this.held(now);
  }

  /** The mask to report at `now`: the touches' buttons plus a flick's minimum jump hold. */
  held(now: number = this.now()): number {
    return this.base | (now < this.flickUntil ? BTN.J : 0);
  }

  /** The pad vector of a live pad-owned touch (for the knob), or null. */
  knob(): PadVec | null {
    for (const p of this.pads.values()) return p.vec;
    return null;
  }

  owns(id: number): boolean {
    return (this.owners.get(id) ?? null) !== null;
  }

  /** Releases every held touch (and a pending flick hold); ones still on the glass stay ignored until they lift. */
  release(): void {
    for (const id of this.owners.keys()) this.owners.set(id, null);
    this.pads.clear();
    this.base = 0;
    this.flickUntil = -Infinity;
  }

  /** Returns true when the zones changed (every held touch was released). */
  setZones(z: TouchZones | null): boolean {
    if (zonesEqual(this.deck.current, z)) return false;
    this.deck.setZones(z);
    this.release();
    return true;
  }
}
