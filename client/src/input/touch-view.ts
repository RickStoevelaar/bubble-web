import type { Rect } from "../render/layout";
import type { PadVec, TouchDeck } from "./touch";

/**
 * Owns the deck's OWN canvas (inside the #deck element). The canvas covers `box`: the deck rect in
 * portrait, the whole window for the landscape layouts. Redraws only when the pressed mask, the
 * zones or the size change, never per frame.
 */
export class DeckView {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private box: Rect | null = null;
  private dpr = 1;
  private dirty = true;
  private lastMask = -1;
  private lastKnob = "";

  constructor(
    private readonly host: HTMLElement,
    private readonly deck: TouchDeck,
  ) {
    this.canvas = host.ownerDocument.createElement("canvas");
    Object.assign(this.canvas.style, { position: "absolute", left: "0", top: "0", width: "100%", height: "100%" });
    host.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d");
  }

  /** Call on every layout recompute (after TouchDeck.setZones). `box` null hides the deck. */
  setLayout(box: Rect | null, dpr: number, passThrough: boolean): void {
    this.box = box;
    this.dpr = dpr;
    this.dirty = true;
    if (!box) {
      this.host.style.display = "none";
      return;
    }
    this.host.style.display = "block";
    Object.assign(this.host.style, {
      left: `${box.x}px`,
      top: `${box.y}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
      pointerEvents: passThrough ? "none" : "auto",
      background: passThrough ? "transparent" : "",
      borderTop: passThrough ? "0" : "",
    });
    this.canvas.width = Math.max(1, Math.round(box.width * dpr));
    this.canvas.height = Math.max(1, Math.round(box.height * dpr));
  }

  /** Cheap to call every frame. */
  render(mask: number, knob: PadVec | null = null): void {
    const k = knob ? `${knob.x.toFixed(3)},${knob.y.toFixed(3)}` : "";
    if (!this.dirty && mask === this.lastMask && k === this.lastKnob) return;
    this.dirty = false;
    this.lastMask = mask;
    this.lastKnob = k;
    const { ctx, box } = this;
    if (!ctx || !box) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, -box.x * this.dpr, -box.y * this.dpr);
    this.deck.draw(ctx, mask, knob);
  }
}
