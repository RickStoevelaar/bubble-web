import { FIELD_H, FIELD_W, SUPER_CODE } from "@bubble/shared";
import type { GameState } from "@bubble/shared";
import { drawEx, type SpriteSheet } from "../render/sprites";
import { drawText, textWidth } from "../render/renderer";
import { bigWidth, drawBig, drawLogoLine } from "./bigtext";
import {
  BEATS,
  CODE_BEAT,
  CODE_START_TICKS,
  CREDITS,
  FRIEND_FREED_TICKS,
  SUNRISE_TICKS,
  activeBeat,
  canSkip,
  codeVisible,
  endingDone as timelineDone,
  totalTicks,
  typedLines,
  type Beat,
  type EndingKind,
} from "./ending-timeline";
import { drawCentered, fontSafe } from "./text";

export type { EndingKind } from "./ending-timeline";

/** Which scene: the true ending (both players present) or the bad one. An unknown/missing value is "bad". */
export function endingKind(state: Pick<GameState, "ending">): EndingKind {
  return state.ending === "true" ? "true" : "bad";
}

/** True once the scene's timeline is over (60 ticks per second of `state.endingTicks`). */
export function endingDone(endingTicks: number, kind: EndingKind): boolean {
  return timelineDone(endingTicks, kind);
}

// --- the code card ---------------------------------------------------------------------------------------------
/** The code is shown big, exactly as it is typed into the room field (upper case, no spaces). */
export const CODE_SCALE = 6;
export const CODE_Y = 52;
export const CODE_COLOR = "#fff27a";
export const codeX = (): number => Math.round((FIELD_W - bigWidth(SUPER_CODE, CODE_SCALE)) / 2);

// --- small pure helpers ----------------------------------------------------------------------------------------
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const rgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];
/** Linear blend of two "#rrggbb" colours; k is clamped to 0..1. */
export function mix(a: string, b: string, k: number): string {
  const x = rgb(a);
  const y = rgb(b);
  const t = clamp01(k);
  return "#" + [0, 1, 2].map((i) => Math.round(x[i]! + (y[i]! - x[i]!) * t).toString(16).padStart(2, "0")).join("");
}

const SKY_BAND = 8;
const CAPTION_TOP = 184;

function drawSky(ctx: CanvasRenderingContext2D, top: string, horizon: string): void {
  for (let y = 0; y < CAPTION_TOP; y += SKY_BAND) {
    ctx.fillStyle = mix(top, horizon, y / (CAPTION_TOP - SKY_BAND));
    ctx.fillRect(0, y, FIELD_W, SKY_BAND);
  }
}

function disc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string): void {
  ctx.fillStyle = color;
  for (let dy = -r; dy <= r; dy++) {
    const half = Math.floor(Math.sqrt(r * r - dy * dy));
    ctx.fillRect(cx - half, cy + dy, half * 2 + 1, 1);
  }
}

interface Hill {
  apexX: number;
  apexY: number;
  /** Larger = flatter. */
  flat: number;
}
const hillTop = (h: Hill, x: number): number => h.apexY + Math.floor(((x - h.apexX) * (x - h.apexX)) / h.flat);

function drawHill(ctx: CanvasRenderingContext2D, h: Hill, body: string, grass: string): void {
  for (let x = 0; x < FIELD_W; x += 4) {
    const top = hillTop(h, x + 2);
    if (top >= FIELD_H) continue;
    ctx.fillStyle = body;
    ctx.fillRect(x, top, 4, FIELD_H - top);
    ctx.fillStyle = grass;
    ctx.fillRect(x, top, 4, 2);
  }
}

/** 28 fixed star positions (a tiny linear congruential sequence, so every run draws the same sky). */
const STARS: readonly { x: number; y: number }[] = (() => {
  const out: { x: number; y: number }[] = [];
  let s = 12345;
  for (let i = 0; i < 28; i++) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const x = 6 + (Math.floor(s / 256) % 244);
    s = (s * 1103515245 + 12345) % 2147483648;
    const y = 6 + (Math.floor(s / 256) % 110);
    out.push({ x, y });
  }
  return out;
})();

function drawCaption(ctx: CanvasRenderingContext2D, sheet: SpriteSheet, beat: Beat, ticks: number, y: number, step: number): void {
  const typed = typedLines(beat, ticks);
  beat.lines.forEach((full, i) => {
    const x = Math.round((FIELD_W - textWidth(fontSafe(full))) / 2); // centred on the finished line: no sliding while typing
    drawText(ctx, sheet, fontSafe(typed[i]!), x, y + i * step);
  });
}

function drawCaptionBand(ctx: CanvasRenderingContext2D, sheet: SpriteSheet, kind: EndingKind, ticks: number): void {
  ctx.fillStyle = "#0a0e28";
  ctx.fillRect(0, CAPTION_TOP, FIELD_W, FIELD_H - CAPTION_TOP);
  ctx.fillStyle = "#3a4a8a";
  ctx.fillRect(0, CAPTION_TOP, FIELD_W, 1);
  const beats = BEATS[kind];
  // between two captions the previous one stays until the next starts typing
  const b = activeBeat(beats, ticks) ?? [...beats].reverse().find((x) => ticks >= x.start) ?? null;
  if (b && !(kind === "true" && ticks >= CODE_START_TICKS)) drawCaption(ctx, sheet, b, ticks, CAPTION_TOP + 10, 14);
}

// --- the bad ending: a hero alone on a hill at dusk ------------------------------------------------------------
const BAD_NEAR: Hill = { apexX: 70, apexY: 150, flat: 110 };
const BAD_FAR: Hill = { apexX: 215, apexY: 170, flat: 70 };

function drawBad(ctx: CanvasRenderingContext2D, sheet: SpriteSheet, ticks: number): void {
  const k = clamp01(ticks / (totalTicks("bad") * 0.8));
  drawSky(ctx, mix("#3b2a6b", "#070a1e", k), mix("#ff8a5c", "#26265a", k));
  disc(ctx, 215, 150 + Math.round(k * 46), 14, mix("#ffc27a", "#b35a4a", k)); // the sun sinks behind the far hill
  // stars come out one by one in the last part of the scene
  const first = BEATS.bad[2]!.start - 60;
  STARS.forEach((s, i) => {
    if (ticks < first + i * 14) return;
    if (i % 4 === 0) drawEx(ctx, sheet, "icon_star", ((ticks >> 5) + i) & 1, s.x, s.y);
    else {
      ctx.fillStyle = (ticks >> 4) % 5 === i % 5 ? "#9fb4ff" : "#ffffff";
      ctx.fillRect(s.x, s.y, 1, 1);
    }
  });
  drawHill(ctx, BAD_FAR, mix("#3a2a5a", "#10142e", k), mix("#5a4a7a", "#1c2248", k));
  drawEx(ctx, sheet, "npc_friend", (ticks >> 5) & 1, 215, hillTop(BAD_FAR, 215) - 3, { size: 8, alpha: 0.6 }); // far off, dim
  drawHill(ctx, BAD_NEAR, mix("#2c5a46", "#0e2228", k), mix("#4a8a5e", "#1a3a3a", k));
  drawEx(ctx, sheet, "hero_pip", 0, 70, hillTop(BAD_NEAR, 70) - 8);
  // one bubble drifts from the hero toward the friend, and never arrives
  const drift = ticks - BEATS.bad[1]!.start;
  if (drift > 0) {
    const bx = Math.min(190, 84 + Math.floor(drift * 0.12));
    drawEx(ctx, sheet, "bubble_normal", (ticks >> 4) & 1, bx, 128 - Math.floor(drift * 0.02) + Math.round(Math.sin(drift / 25) * 3));
  }
}

// --- the true ending: the rescue and a sunrise ------------------------------------------------------------------
const TRUE_HILL: Hill = { apexX: 128, apexY: 160, flat: 420 };
const hop = (ticks: number, phase: number, max: number): number => {
  const u = ((ticks + phase) % 36) / 36;
  return Math.floor(4 * u * (1 - u) * max);
};

function drawCage(ctx: CanvasRenderingContext2D, cx: number, floorY: number): void {
  ctx.fillStyle = "#c9c9d8";
  ctx.fillRect(cx - 13, floorY - 26, 26, 2);
  ctx.fillRect(cx - 13, floorY - 2, 26, 2);
  for (let i = 0; i < 5; i++) ctx.fillRect(cx - 13 + i * 6, floorY - 26, 2, 26);
}

function drawTrueScene(ctx: CanvasRenderingContext2D, sheet: SpriteSheet, ticks: number): void {
  const k = clamp01(ticks / SUNRISE_TICKS);
  drawSky(ctx, mix("#1d2260", "#58b8f0", k), mix("#6b3a7a", "#ffd27a", k));
  disc(ctx, 128, 168 - Math.round(k * 78), 20, mix("#ffb36b", "#fff2a0", k));
  drawHill(ctx, TRUE_HILL, mix("#25603f", "#2f9a5a", k), mix("#4aa868", "#7be08f", k));
  const floorY = hillTop(TRUE_HILL, 128);
  const freed = ticks >= FRIEND_FREED_TICKS;
  const cheer = ticks >= BEATS.true[2]!.start;

  if (freed) {
    // confetti-like bubbles rise from the ground, each on its own lane
    const age = ticks - FRIEND_FREED_TICKS;
    for (let i = 0; i < 14; i++) {
      const speed = 22 + (i % 4) * 7;
      const y = CAPTION_TOP + 8 - (((age * speed) / 60 + i * 29) % (CAPTION_TOP + 24));
      const x = 14 + ((i * 47) % 228) + Math.round(Math.sin(age / 40 + i) * 5);
      drawEx(ctx, sheet, "bubble_normal", ((ticks >> 4) + i) & 1, x, Math.round(y));
    }
  }
  const pipTop = hillTop(TRUE_HILL, 92) - 8;
  const popTop = hillTop(TRUE_HILL, 164) - 8;
  const pipY = pipTop - (cheer ? hop(ticks, 0, 12) : 0);
  const popY = popTop - (cheer ? hop(ticks, 18, 12) : 0);
  drawEx(ctx, sheet, "hero_pip", pipY < pipTop - 2 ? 2 : 0, 92, pipY);
  drawEx(ctx, sheet, "hero_pop", popY < popTop - 2 ? 2 : 0, 164, popY, { flipX: true });
  const fy = floorY - 8 - (freed ? hop(ticks, 9, 14) : 0);
  drawEx(ctx, sheet, "npc_friend", fy < floorY - 10 ? 1 : 0, 128, fy);
  if (!freed) drawCage(ctx, 128, floorY);
  if (cheer) {
    const age = ticks - BEATS.true[2]!.start;
    for (let j = 0; j < 5; j++) {
      const y = floorY - 28 - (((age * 30) / 60 + j * 17) % 56);
      drawEx(ctx, sheet, "icon_heart", 0, 128 + (j - 2) * 14, Math.round(y));
    }
  }
}

// --- the code card and the credits ------------------------------------------------------------------------------
function drawCodeCard(ctx: CanvasRenderingContext2D, sheet: SpriteSheet, ticks: number): void {
  ctx.fillStyle = "#ffd23f";
  ctx.fillRect(10, 22, 236, 140);
  ctx.fillStyle = "#0b1030";
  ctx.fillRect(12, 24, 232, 136);
  drawCentered(ctx, sheet, "THE SUPER CODE IS", 34);
  drawBig(ctx, SUPER_CODE, codeX() + 2, CODE_Y + 2, CODE_SCALE, "#7a4a00");
  drawBig(ctx, SUPER_CODE, codeX(), CODE_Y, CODE_SCALE, CODE_COLOR);
  drawCaption(ctx, sheet, CODE_BEAT, ticks, 118, 14);
}

function drawCredits(ctx: CanvasRenderingContext2D, sheet: SpriteSheet, ticks: number): void {
  ctx.fillStyle = "#0c1030";
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);
  const age = ticks - CREDITS.start;
  for (let i = 0; i < 9; i++) {
    const y = FIELD_H + 12 - (((age * (12 + (i % 4) * 5)) / 60 + i * 37) % (FIELD_H + 24));
    drawEx(ctx, sheet, "bubble_normal", ((ticks >> 4) + i) & 1, 20 + ((i * 53) % 216), Math.round(y));
  }
  CREDITS.lines.forEach((line, i) => {
    if (age < i * CREDITS.stagger) return;
    if (i === 0) {
      const s = fontSafe(line);
      drawLogoLine(ctx, s, Math.round((FIELD_W - bigWidth(s, 3)) / 2), 42, 3, "#ffe34a", "#ff8a3a", "#3a1a5a");
    } else drawCentered(ctx, sheet, fontSafe(line), 84 + i * 22);
  });
  for (let x = 4; x < FIELD_W; x += 8) drawEx(ctx, sheet, "tile_1", 0, x, 212);
  const bob = (ticks >> 5) & 1;
  drawEx(ctx, sheet, "hero_pip", bob, 92, 200);
  drawEx(ctx, sheet, "npc_friend", bob, 128, 200);
  drawEx(ctx, sheet, "hero_pop", bob ^ 1, 164, 200, { flipX: true });
}

/**
 * The ending scenes, drawn in 256x224 game coordinates. A pure function of `endingTicks` (60 per second): the
 * same tick always draws the same frame. `kind` picks the dusk-hill bad ending or the true ending (rescue,
 * sunrise, the SUPER CODE card, credits).
 */
export function drawEnding(
  ctx: CanvasRenderingContext2D,
  sheet: SpriteSheet,
  state: Pick<GameState, "ending">,
  endingTicks: number,
  kind: EndingKind = endingKind(state),
): void {
  const ticks = Number.isFinite(endingTicks) ? Math.max(0, Math.floor(endingTicks)) : 0;
  if (kind === "true" && ticks >= CREDITS.start) {
    drawCredits(ctx, sheet, ticks);
  } else {
    if (kind === "true") drawTrueScene(ctx, sheet, ticks);
    else drawBad(ctx, sheet, ticks);
    drawCaptionBand(ctx, sheet, kind, ticks); // (empty during the code card, which has its own text)
    if (kind === "true" && codeVisible(ticks)) drawCodeCard(ctx, sheet, ticks);
  }
  if (canSkip(ticks, kind)) drawText(ctx, sheet, "TAP TO SKIP", 4, 4);
}
