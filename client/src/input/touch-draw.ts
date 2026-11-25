import { BTN } from "@bubble/shared";
import type { TouchZones } from "./touch";

/** Original, plain geometric control art in the game's palette. Coordinates are CSS px. */
const COLORS = {
  track: "#161a2e",
  trackEdge: "#3a4372",
  chevron: "#8fb4ff",
  chevronOn: "#ffffff",
  thumb: "#4a8cff",
  thumbOn: "#bcd6ff",
  jump: "#46c46a",
  jumpOn: "#9dffb8",
  bubble: "#4aa8ff",
  bubbleOn: "#b4e0ff",
  glyph: "#0b0b12",
};

const IDLE_ALPHA = 0.55;
const PRESSED_ALPHA = 0.95;
const OVERLAY_IDLE_ALPHA = 0.35;
const OVERLAY_PRESSED_ALPHA = 0.7;
const PRESSED_SCALE = 1.04;

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

function chevron(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, dir: -1 | 1): void {
  ctx.beginPath();
  ctx.moveTo(cx - (dir * s) / 2, cy - s);
  ctx.lineTo(cx + (dir * s) / 2, cy);
  ctx.lineTo(cx - (dir * s) / 2, cy + s);
  ctx.stroke();
}

/** Draws the whole control deck. Pure function of (zones, pressedMask): redraw only when either changes. */
export function drawDeck(ctx: CanvasRenderingContext2D, z: TouchZones, mask: number): void {
  const idle = z.overlay ? OVERLAY_IDLE_ALPHA : IDLE_ALPHA;
  const on = z.overlay ? OVERLAY_PRESSED_ALPHA : PRESSED_ALPHA;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Slide track.
  const s = z.slide;
  const left = (mask & BTN.L) !== 0;
  const right = (mask & BTN.R) !== 0;
  ctx.globalAlpha = left || right ? on : idle;
  roundedRect(ctx, s.x, s.y, s.width, s.height, Math.min(s.width, s.height) * 0.22);
  ctx.fillStyle = COLORS.track;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = COLORS.trackEdge;
  ctx.stroke();

  const cy = s.y + s.height / 2;
  const cx = s.x + s.width / 2;
  const cs = Math.max(8, Math.min(22, s.width * 0.07));
  ctx.lineWidth = Math.max(3, cs * 0.35);
  ctx.globalAlpha = left ? PRESSED_ALPHA : idle + 0.1;
  ctx.strokeStyle = left ? COLORS.chevronOn : COLORS.chevron;
  chevron(ctx, s.x + s.width * 0.18, cy, cs, -1);
  ctx.globalAlpha = right ? PRESSED_ALPHA : idle + 0.1;
  ctx.strokeStyle = right ? COLORS.chevronOn : COLORS.chevron;
  chevron(ctx, s.x + s.width * 0.82, cy, cs, 1);

  // Centre mark (the dead zone) and the thumb position indicator.
  ctx.globalAlpha = idle;
  ctx.strokeStyle = COLORS.trackEdge;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy - cs);
  ctx.lineTo(cx, cy + cs);
  ctx.stroke();
  const tr = Math.min(s.width * 0.12, s.height * 0.2, 30);
  const tx = left ? s.x + s.width * 0.3 : right ? s.x + s.width * 0.7 : cx;
  ctx.globalAlpha = left || right ? on : idle;
  ctx.beginPath();
  ctx.arc(tx, cy + cs * 2.4 + tr, tr, 0, Math.PI * 2);
  ctx.fillStyle = left || right ? COLORS.thumbOn : COLORS.thumb;
  ctx.fill();

  // Buttons.
  const button = (c: TouchZones["jump"], pressed: boolean, fill: string, fillOn: string, glyph: () => void): void => {
    const k = pressed ? PRESSED_SCALE : 1;
    ctx.globalAlpha = pressed ? on : idle;
    ctx.beginPath();
    ctx.arc(c.cx, c.cy, c.r * k, 0, Math.PI * 2);
    ctx.fillStyle = pressed ? fillOn : fill;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = pressed ? "#ffffff" : COLORS.trackEdge;
    ctx.stroke();
    ctx.globalAlpha = pressed ? 1 : Math.min(1, idle + 0.3);
    ctx.save();
    ctx.translate(c.cx, c.cy);
    ctx.scale((c.r * k) / 40, (c.r * k) / 40);
    glyph();
    ctx.restore();
  };

  // JUMP: an up arrow.
  button(z.jump, (mask & BTN.J) !== 0, COLORS.jump, COLORS.jumpOn, () => {
    ctx.fillStyle = COLORS.glyph;
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.lineTo(18, 0);
    ctx.lineTo(7, 0);
    ctx.lineTo(7, 18);
    ctx.lineTo(-7, 18);
    ctx.lineTo(-7, 0);
    ctx.lineTo(-18, 0);
    ctx.closePath();
    ctx.fill();
  });

  // BUBBLE: a bubble outline with a highlight.
  button(z.bubble, (mask & BTN.F) !== 0, COLORS.bubble, COLORS.bubbleOn, () => {
    ctx.strokeStyle = COLORS.glyph;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, 0, 17, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 10, Math.PI * 1.1, Math.PI * 1.55);
    ctx.stroke();
  });

  ctx.restore();
}
