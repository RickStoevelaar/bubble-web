import {
  FIELD_H,
  FIELD_W,
  GRID_H,
  GRID_W,
  TILE,
  TUNING,
  type BubbleState,
  type EnemyState,
  type GameState,
  type LevelData,
  type PlayerState,
} from "@bubble/shared";
import {
  FONT_CHARS,
  HERO_FRAME,
  ITEM_NAMES,
  THEME_BG,
  drawEx,
  type FontName,
  type ItemName,
  type SpriteName,
  type SpriteSheet,
} from "./sprites";

/** HUD text advance in game pixels (glyphs are 5 wide plus spacing). */
export const TEXT_ADVANCE = 6;
/** How long the local-player arrow shows at the start of a round. */
export const MARKER_TICKS = 120;
/** Trapped enemies are drawn at this size inside their bubble. */
const TRAPPED_SIZE = 12;

const KNOWN_GLYPHS = new Set<string>(FONT_CHARS);

export function textWidth(s: string): number {
  return s.length * TEXT_ADVANCE;
}

/** Draw `s` with its top-left at (x, y). Lowercase maps to uppercase except the symbol "x". */
export function drawText(ctx: CanvasRenderingContext2D, sheet: SpriteSheet, s: string, x: number, y: number): void {
  for (let i = 0; i < s.length; i++) {
    let ch = s[i]!;
    if (ch !== "x") ch = ch.toUpperCase();
    if (!KNOWN_GLYPHS.has(ch)) continue;
    drawEx(ctx, sheet, `font_${ch}` as FontName, 0, x + i * TEXT_ADVANCE + TILE / 2, y + TILE / 2);
  }
}

/** Items are a placeholder in the shared types for now; read optional fields defensively. */
interface LooseItem {
  id: number;
  x?: number;
  y?: number;
  kind?: string;
}

function itemSprite(it: LooseItem): ItemName {
  const pick = (names: ItemName[]) => names[Math.abs(it.id) % names.length]!;
  switch (it.kind) {
    case "power":
      return "item_potion";
    case "treasure":
      return pick(["item_gem", "item_crown", "item_star"]);
    case "food":
      return pick(["item_plum", "item_cake", "item_fish", "item_pear"]);
    default:
      return ITEM_NAMES[Math.abs(it.id) % ITEM_NAMES.length]!;
  }
}

function enemySprite(e: Pick<EnemyState, "type" | "angry">): SpriteName {
  return `enemy_${e.type}${e.angry ? "_angry" : ""}` as SpriteName;
}

function drawEnemy(ctx: CanvasRenderingContext2D, sheet: SpriteSheet, e: EnemyState, walkFrame: number): void {
  const name = enemySprite(e);
  if (e.state === "dead") {
    drawEx(ctx, sheet, name, walkFrame, e.x, e.y, { rotate: (e.deadTicks ?? 0) * 0.5, flipX: e.dir === -1 });
  } else if (e.state === "spawning") {
    drawEx(ctx, sheet, name, walkFrame, e.x, e.y, { alpha: 0.45, flipX: e.dir === -1 });
  } else {
    drawEx(ctx, sheet, name, walkFrame, e.x, e.y, { flipX: e.dir === -1 });
  }
}

function drawBubble(
  ctx: CanvasRenderingContext2D,
  sheet: SpriteSheet,
  b: BubbleState,
  enemies: EnemyState[],
  roundTicks: number,
): void {
  if (b.kind === "letter") {
    drawEx(ctx, sheet, "bubble_letter", b.letter ?? 0, b.x, b.y);
    return;
  }
  const frame = (b.ageTicks >> 4) & 1;
  drawEx(ctx, sheet, `bubble_${b.kind}`, frame, b.x, b.y);
  if (b.trapped) {
    const owner = enemies.find((e) => e.id === b.trapped!.enemyId);
    const flashing = b.trapped.escapeIn < 60 && (roundTicks >> 2) % 2 === 0;
    drawEx(ctx, sheet, enemySprite({ type: b.trapped.type, angry: flashing || (owner?.angry ?? false) }), frame, b.x, b.y, {
      size: TRAPPED_SIZE,
    });
  }
}

function heroFrame(p: PlayerState, roundTicks: number): number {
  if (p.state === "dying") return HERO_FRAME.death0 + ((p.stateTicks >> 2) & 3);
  if (p.fireCooldown > TUNING.fireCooldownTicks - 10) return HERO_FRAME.blow;
  if (!p.onGround) return p.vy < 0 ? HERO_FRAME.jump : HERO_FRAME.fall;
  if (Math.abs(p.vx) > 0.01) return (roundTicks >> 3) & 1;
  return HERO_FRAME.walk0;
}

function playerVisible(p: PlayerState): boolean {
  if (p.state === "gone") return false;
  if (p.state === "respawning") return ((p.stateTicks >> 2) & 1) === 0;
  if (p.state === "alive" && p.invulnTicks > 0) return ((p.invulnTicks >> 2) & 1) === 0;
  return true;
}

function drawHud(
  ctx: CanvasRenderingContext2D,
  sheet: SpriteSheet,
  state: GameState,
  localPlayer: 0 | 1,
): void {
  ctx.fillStyle = "rgba(0,0,0,0.78)";
  ctx.fillRect(0, 0, FIELD_W, TILE);

  const score = (p: PlayerState) => String(Math.max(0, Math.floor(p.score))).padStart(6, "0");
  const lives = (p: PlayerState, x: number) => {
    const icon = p.id === 0 ? "icon_pip" : "icon_pop";
    if (p.lives > 4) {
      drawEx(ctx, sheet, icon, 0, x + TILE / 2, TILE + TILE / 2);
      drawText(ctx, sheet, `x${p.lives}`, x + TILE + 1, TILE);
    } else {
      for (let i = 0; i < p.lives; i++) drawEx(ctx, sheet, icon, 0, x + i * (TILE + 1) + TILE / 2, TILE + TILE / 2);
    }
  };

  const p1 = state.players.find((p) => p.id === 0);
  const p2 = state.players.find((p) => p.id === 1);
  const left = 12;
  if (p1) {
    drawText(ctx, sheet, `1UP ${score(p1)}`, left, 0);
    lives(p1, left);
  }
  if (p2) {
    const text = `2UP ${score(p2)}`;
    const x = FIELD_W - left - textWidth(text);
    drawText(ctx, sheet, text, x, 0);
    lives(p2, x);
  }
  const round = `ROUND ${state.round}`;
  drawText(ctx, sheet, round, Math.round((FIELD_W - textWidth(round)) / 2), 0);

  const me = state.players.find((p) => p.id === localPlayer);
  if (me && me.state !== "gone" && state.roundTicks < MARKER_TICKS) {
    const bob = (state.roundTicks >> 3) & 1 ? 2 : 0;
    drawEx(ctx, sheet, "icon_arrow", 0, me.x, me.y - 16 - bob);
  }

  if (state.hurryActive && ((state.roundTicks >> 4) & 1) === 0) {
    const t = "HURRY!";
    drawText(ctx, sheet, t, Math.round((FIELD_W - textWidth(t)) / 2), FIELD_H / 2 - TILE / 2);
  }
}

/**
 * Draw one frame of `state` in game coordinates (0..FIELD_W x 0..FIELD_H). The
 * caller owns the canvas transform and image smoothing. Never mutates `state`.
 */
export function render(
  ctx: CanvasRenderingContext2D,
  sheet: SpriteSheet,
  state: GameState,
  levels: LevelData[],
  localPlayer: 0 | 1,
  t: number = 0,
): void {
  void t;
  const level = levels[state.round - 1] ?? levels[0];
  const theme = (((level?.theme ?? 0) % 10) + 10) % 10;
  const walkFrame = (state.roundTicks >> 3) & 1;

  ctx.fillStyle = THEME_BG[theme] ?? "#000";
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);

  if (level) {
    const tile = `tile_${theme}` as SpriteName;
    for (let row = 0; row < GRID_H; row++) {
      const line = level.tiles[row];
      if (!line) continue;
      for (let col = 0; col < GRID_W; col++) {
        if (line[col] === "#") drawEx(ctx, sheet, tile, 0, col * TILE + TILE / 2, row * TILE + TILE / 2);
      }
    }
  }

  for (const it of state.items as LooseItem[]) {
    if (Number.isFinite(it.x) && Number.isFinite(it.y)) drawEx(ctx, sheet, itemSprite(it), 0, it.x!, it.y!);
  }

  for (const e of state.enemies) {
    if (e.state !== "trapped") drawEnemy(ctx, sheet, e, walkFrame);
  }
  for (const b of state.bubbles) drawBubble(ctx, sheet, b, state.enemies, state.roundTicks);

  for (const p of state.players) {
    if (!playerVisible(p)) continue;
    drawEx(ctx, sheet, p.id === 0 ? "hero_pip" : "hero_pop", heroFrame(p, state.roundTicks), p.x, p.y, {
      flipX: p.facing === -1,
    });
  }

  drawHud(ctx, sheet, state, localPlayer);
}
