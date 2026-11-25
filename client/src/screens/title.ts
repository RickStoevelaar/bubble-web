import { FIELD_H, FIELD_W } from "@bubble/shared";
import type { SpriteSheet } from "../render/sprites";
import { drawEx } from "../render/sprites";
import { bigWidth, drawLogoLine } from "./bigtext";
import { namesText, scoreText, type ScoreRow } from "./scores";
import { drawCentered } from "./text";

export const TITLE_BUBBLES = 9;
/** The ticker shows each of the top entries for this long (ms). */
export const TICKER_MS = 2500;
export const TICKER_ENTRIES = 3;

export interface TitleModel {
  /** Milliseconds since the title appeared (drives every animation). */
  t: number;
  /** Fetched table, or null while loading/failed (the ticker is simply absent). */
  scores: readonly ScoreRow[] | null;
  /** "TOUCH TO START" on touch devices, "PRESS ANY KEY" otherwise. */
  touch: boolean;
  /** The dev round from `?round=N`, shown as a hint; null in normal play. */
  devRound: number | null;
}

/** Position of drifting bubble `i` at time `t` (ms): rises, sways, wraps below the floor again. Pure. */
export function bubblePos(i: number, t: number): { x: number; y: number; frame: number } {
  const speed = 12 + (i % 4) * 5; // game px per second
  const span = FIELD_H + 24;
  const y = FIELD_H + 12 - (((t / 1000) * speed + i * 37) % span);
  const x = 20 + ((i * 53) % (FIELD_W - 40)) + Math.sin(t / 700 + i) * 6;
  return { x: Math.round(x), y: Math.round(y), frame: Math.floor(t / 400 + i) & 1 };
}

/** Which of the top entries the ticker shows now. */
export function tickerIndex(t: number, count: number): number {
  return count <= 0 ? 0 : Math.floor(t / TICKER_MS) % Math.min(count, TICKER_ENTRIES);
}

export function drawTitle(ctx: CanvasRenderingContext2D, sheet: SpriteSheet, m: TitleModel): void {
  ctx.fillStyle = "#0c1030";
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);

  for (let i = 0; i < TITLE_BUBBLES; i++) {
    const b = bubblePos(i, m.t);
    drawEx(ctx, sheet, "bubble_normal", b.frame, b.x, b.y);
  }

  const scale = 4;
  const a = "BUBBLE";
  const b = "WEB";
  drawLogoLine(ctx, a, Math.round((FIELD_W - bigWidth(a, scale)) / 2), 22, scale, "#ffe34a", "#ff8a3a", "#3a1a5a");
  drawLogoLine(ctx, b, Math.round((FIELD_W - bigWidth(b, scale)) / 2), 58, scale, "#bfe9ff", "#4aa8ff", "#10306a");

  const top = m.scores?.slice(0, TICKER_ENTRIES) ?? [];
  if (top.length > 0) {
    const i = tickerIndex(m.t, top.length);
    const r = top[i]!;
    drawCentered(ctx, sheet, "BEST TEAMS", 100);
    drawCentered(ctx, sheet, `${i + 1} ${namesText(r.names)}`, 112);
    drawCentered(ctx, sheet, `${scoreText(r.score)} ROUND ${Math.floor(r.round)}`, 124);
  }

  if (m.devRound !== null) drawCentered(ctx, sheet, `DEV: START ROUND ${m.devRound}`, 142);

  if (Math.floor(m.t / 500) % 2 === 0) drawCentered(ctx, sheet, m.touch ? "TOUCH TO START" : "PRESS ANY KEY", 160);

  // the two heroes idling on a row of floor tiles
  for (let x = 4; x < FIELD_W; x += 8) drawEx(ctx, sheet, "tile_1", 0, x, 212);
  const bob = Math.floor(m.t / 600) & 1;
  drawEx(ctx, sheet, "hero_pip", bob, 104, 200);
  drawEx(ctx, sheet, "hero_pop", bob ^ 1, 152, 200, { flipX: true });
}
