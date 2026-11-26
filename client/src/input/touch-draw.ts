import { BTN } from "@bubble/shared";
import type { PadVec, TouchZones } from "./touch";

/** Original, plain geometric control art in the game's palette. Coordinates are CSS px. */
const COLORS = {
  track: "#161a2e",
  trackEdge: "#3a4372",
  chevron: "#8fb4ff",
  chevronOn: "#ffffff",
  thumb: "#4a8cff",
  thumbOn: "#bcd6ff",
  jump: "#46c46a",
  bubble: "#4aa8ff",
  bubbleOn: "#b4e0ff",
  glyph: "#0b0b12",
};

const IDLE_ALPHA = 0.55;
const PRESSED_ALPHA = 0.95;
const OVERLAY_IDLE_ALPHA = 0.35;
const OVERLAY_PRESSED_ALPHA = 0.7;
const PRESSED_SCALE = 1.04;

/** Draws the whole control deck. Pure function of (zones, pressedMask, knob): redraw only when one changes. */
export function drawDeck(ctx: CanvasRenderingContext2D, z: TouchZones, mask: number, knob: PadVec | null = null): void {
  const idle = z.overlay ? OVERLAY_IDLE_ALPHA : IDLE_ALPHA;
  const on = z.overlay ? OVERLAY_PRESSED_ALPHA : PRESSED_ALPHA;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Move pad: base disc + ring, arrows (left / right / up), and a knob that follows the thumb.
  const p = z.pad;
  const left = (mask & BTN.L) !== 0;
  const right = (mask & BTN.R) !== 0;
  const jump = (mask & BTN.J) !== 0;
  const active = left || right || jump || knob !== null;
  ctx.globalAlpha = active ? on : idle;
  ctx.beginPath();
  ctx.arc(p.cx, p.cy, p.r, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.track;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = COLORS.trackEdge;
  ctx.stroke();

  const s = Math.max(8, Math.min(22, p.r * 0.17));
  const reach = p.r * 0.66;
  ctx.lineWidth = Math.max(3, s * 0.35);
  const arrow = (on_: boolean, x: number, y: number, dx: number, dy: number): void => {
    ctx.globalAlpha = on_ ? PRESSED_ALPHA : idle + 0.1;
    ctx.strokeStyle = on_ ? COLORS.chevronOn : COLORS.chevron;
    ctx.beginPath();
    // a chevron pointing along (dx, dy)
    ctx.moveTo(x - dx * s * 0.5 - dy * s, y - dy * s * 0.5 + dx * s);
    ctx.lineTo(x + dx * s * 0.5, y + dy * s * 0.5);
    ctx.lineTo(x - dx * s * 0.5 + dy * s, y - dy * s * 0.5 - dx * s);
    ctx.stroke();
  };
  if (jump) {
    // The jump trigger: a green glow behind the lit up arrow.
    ctx.globalAlpha = on;
    ctx.beginPath();
    ctx.arc(p.cx, p.cy - reach, s * 1.9, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.jump;
    ctx.fill();
  }
  arrow(left, p.cx - reach, p.cy, -1, 0);
  arrow(right, p.cx + reach, p.cy, 1, 0);
  arrow(jump, p.cx, p.cy - reach, 0, -1);

  const kr = p.r * 0.3;
  const kx = p.cx + (knob ? knob.x : 0) * (p.r - kr);
  const ky = p.cy + (knob ? knob.y : 0) * (p.r - kr);
  ctx.globalAlpha = active ? 0.8 : idle; // a little see-through so the lit arrow shows under the knob
  ctx.beginPath();
  ctx.arc(kx, ky, kr, 0, Math.PI * 2);
  ctx.fillStyle = left || right || jump ? COLORS.thumbOn : COLORS.thumb;
  ctx.fill();

  // The one button: BUBBLE (fire), a bubble outline with a highlight.
  const b = z.bubble;
  const pressed = (mask & BTN.F) !== 0;
  const k = pressed ? PRESSED_SCALE : 1;
  ctx.globalAlpha = pressed ? on : idle;
  ctx.beginPath();
  ctx.arc(b.cx, b.cy, b.r * k, 0, Math.PI * 2);
  ctx.fillStyle = pressed ? COLORS.bubbleOn : COLORS.bubble;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = pressed ? "#ffffff" : COLORS.trackEdge;
  ctx.stroke();
  ctx.globalAlpha = pressed ? 1 : Math.min(1, idle + 0.3);
  ctx.save();
  ctx.translate(b.cx, b.cy);
  ctx.scale((b.r * k) / 40, (b.r * k) / 40);
  ctx.strokeStyle = COLORS.glyph;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(0, 0, 17, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, 10, Math.PI * 1.1, Math.PI * 1.55);
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}
