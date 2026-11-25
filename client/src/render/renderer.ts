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
  type ItemState,
  type LevelData,
  type PlayerState,
  type ProjectileState,
} from "@bubble/shared";
import {
  FONT_CHARS,
  HERO_FRAME,
  ENEMY_TYPES,
  ITEM_NAMES,
  THEME_BG,
  drawEx,
  hasSprite,
  type DrawOptions,
  type Layer,
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

/** char -> glyph sprite name, built once (lowercase maps to uppercase except the symbol "x"). */
const GLYPH_NAME = new Map<string, FontName>();
for (const ch of FONT_CHARS) {
  const name = `font_${ch}` as FontName;
  GLYPH_NAME.set(ch, name);
  if (ch !== "x" && ch.toLowerCase() !== ch) GLYPH_NAME.set(ch.toLowerCase(), name);
}

export function textWidth(s: string): number {
  return s.length * TEXT_ADVANCE;
}

/** Draw `s` with its top-left at (x, y). Lowercase maps to uppercase except the symbol "x". */
export function drawText(ctx: CanvasRenderingContext2D, sheet: SpriteSheet, s: string, x: number, y: number): void {
  for (let i = 0; i < s.length; i++) {
    const name = GLYPH_NAME.get(s[i]!);
    if (name === undefined) continue;
    drawEx(ctx, sheet, name, 0, x + i * TEXT_ADVANCE + TILE / 2, y + TILE / 2);
  }
}

/** Food and treasure pick their sprite by index; an index outside 0..7 (older server) falls back to the id. */
function itemSprite(it: ItemState): ItemName | null {
  switch (it.kind) {
    case "power":
      return "item_potion";
    case "treasure":
    case "food":
      return ITEM_NAMES[Number.isInteger(it.sprite) && it.sprite >= 0 && it.sprite < ITEM_NAMES.length ? it.sprite : Math.abs(it.id) % ITEM_NAMES.length]!;
    default:
      return null; // a kind this client does not know (version skew): skipped
  }
}

const ENEMY_NORMAL = new Map<string, SpriteName>();
const ENEMY_ANGRY = new Map<string, SpriteName>();
for (const type of ENEMY_TYPES) {
  ENEMY_NORMAL.set(type, `enemy_${type}` as SpriteName);
  ENEMY_ANGRY.set(type, `enemy_${type}_angry` as SpriteName);
}

/** Undefined for an enemy type this client does not know. */
function enemySprite(type: EnemyState["type"], angry: boolean): SpriteName | undefined {
  return (angry ? ENEMY_ANGRY : ENEMY_NORMAL).get(type);
}

const BUBBLE_NAMES: Partial<Record<BubbleState["kind"], SpriteName>> = {
  normal: "bubble_normal",
  water: "bubble_water",
  fire: "bubble_fire",
  lightning: "bubble_lightning",
  letter: "bubble_letter",
};
const TRAPPED_OPTS: DrawOptions = Object.freeze({ size: TRAPPED_SIZE });

function enemyById(enemies: EnemyState[], id: number): EnemyState | undefined {
  for (let i = 0; i < enemies.length; i++) if (enemies[i]!.id === id) return enemies[i];
  return undefined;
}

function playerById(players: PlayerState[], id: number): PlayerState | undefined {
  for (let i = 0; i < players.length; i++) if (players[i]!.id === id) return players[i];
  return undefined;
}

function drawEnemy(ctx: CanvasRenderingContext2D, sheet: SpriteSheet, e: EnemyState, walkFrame: number): void {
  const name = enemySprite(e.type, e.angry);
  if (name === undefined || !hasSprite(name, walkFrame)) return;
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
    const letter = b.letter ?? 0;
    if (hasSprite("bubble_letter", letter)) drawEx(ctx, sheet, "bubble_letter", letter, b.x, b.y);
    return;
  }
  const frame = (b.ageTicks >> 4) & 1;
  const name = BUBBLE_NAMES[b.kind];
  if (name === undefined || !hasSprite(name, frame)) return;
  drawEx(ctx, sheet, name, frame, b.x, b.y);
  const trapped = b.trapped;
  if (trapped) {
    const owner = enemyById(enemies, trapped.enemyId);
    const flashing = trapped.escapeIn < 60 && (roundTicks >> 2) % 2 === 0;
    const inner = enemySprite(trapped.type, flashing || (owner?.angry ?? false));
    if (inner !== undefined && hasSprite(inner, frame)) drawEx(ctx, sheet, inner, frame, b.x, b.y, TRAPPED_OPTS);
  }
}

const PROJECTILE_NAMES: Record<ProjectileState["kind"], SpriteName> = {
  rock: "icon_rock",
  flame: "icon_flame",
};

/** Skips kinds this client does not know (version skew). Rocks tumble; flames flicker and face their travel. */
function drawProjectile(ctx: CanvasRenderingContext2D, sheet: SpriteSheet, p: ProjectileState): void {
  const name = Object.prototype.hasOwnProperty.call(PROJECTILE_NAMES, p.kind) ? PROJECTILE_NAMES[p.kind] : undefined;
  const frame = (p.ageTicks >> 2) & 1;
  if (name === undefined || !hasSprite(name, frame)) return;
  drawEx(ctx, sheet, name, frame, p.x, p.y, p.kind === "flame" ? { flipX: p.vx < 0 } : undefined);
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

function scoreText(p: PlayerState): string {
  return String(Math.max(0, Math.floor(p.score))).padStart(6, "0");
}

function drawLives(ctx: CanvasRenderingContext2D, sheet: SpriteSheet, p: PlayerState, x: number): void {
  const icon = p.id === 0 ? "icon_pip" : "icon_pop";
  if (p.lives > 4) {
    drawEx(ctx, sheet, icon, 0, x + TILE / 2, TILE + TILE / 2);
    drawText(ctx, sheet, `x${p.lives}`, x + TILE + 1, TILE);
  } else {
    for (let i = 0; i < p.lives; i++) drawEx(ctx, sheet, icon, 0, x + i * (TILE + 1) + TILE / 2, TILE + TILE / 2);
  }
}

function drawHud(
  ctx: CanvasRenderingContext2D,
  sheet: SpriteSheet,
  state: GameState,
  localPlayer: 0 | 1,
): void {
  ctx.fillStyle = "rgba(0,0,0,0.78)";
  ctx.fillRect(0, 0, FIELD_W, TILE);

  const p1 = playerById(state.players, 0);
  const p2 = playerById(state.players, 1);
  const left = 12;
  if (p1) {
    drawText(ctx, sheet, `1UP ${scoreText(p1)}`, left, 0);
    drawLives(ctx, sheet, p1, left);
  }
  if (p2) {
    const text = `2UP ${scoreText(p2)}`;
    const x = FIELD_W - left - textWidth(text);
    drawText(ctx, sheet, text, x, 0);
    drawLives(ctx, sheet, p2, x);
  }
  const round = `ROUND ${state.round}`;
  drawText(ctx, sheet, round, Math.round((FIELD_W - textWidth(round)) / 2), 0);

  const me = playerById(state.players, localPlayer);
  if (me && me.state !== "gone" && state.roundTicks < MARKER_TICKS) {
    const bob = (state.roundTicks >> 3) & 1 ? 2 : 0;
    drawEx(ctx, sheet, "icon_arrow", 0, me.x, me.y - 16 - bob);
  }

  if (state.hurryActive && ((state.roundTicks >> 4) & 1) === 0) {
    const t = "HURRY!";
    drawText(ctx, sheet, t, Math.round((FIELD_W - textWidth(t)) / 2), FIELD_H / 2 - TILE / 2);
  }
}

/** Static theme fill plus wall tiles, rendered once per (level, theme) into an offscreen layer. */
interface BackgroundCache {
  level: LevelData | undefined;
  theme: number;
  layer: Layer;
}
const backgroundCaches = new WeakMap<SpriteSheet, BackgroundCache>();

function backgroundLayer(sheet: SpriteSheet, level: LevelData | undefined, theme: number): Layer {
  const cached = backgroundCaches.get(sheet);
  if (cached && cached.level === level && cached.theme === theme) return cached.layer;
  const layer = cached?.layer ?? sheet.createLayer(FIELD_W, FIELD_H);
  const lctx = layer.ctx;
  lctx.fillStyle = THEME_BG[theme] ?? "#000";
  lctx.fillRect(0, 0, FIELD_W, FIELD_H);
  if (level) {
    const tile = `tile_${theme}` as SpriteName;
    for (let row = 0; row < GRID_H; row++) {
      const line = level.tiles[row];
      if (!line) continue;
      for (let col = 0; col < GRID_W; col++) {
        if (line[col] === "#") drawEx(lctx, sheet, tile, 0, col * TILE + TILE / 2, row * TILE + TILE / 2);
      }
    }
  }
  backgroundCaches.set(sheet, { level, theme, layer });
  return layer;
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

  const bg = backgroundLayer(sheet, level, theme);
  ctx.drawImage(bg.canvas, 0, 0, FIELD_W, FIELD_H, 0, 0, FIELD_W, FIELD_H);

  for (const it of state.items) {
    if (!Number.isFinite(it.x) || !Number.isFinite(it.y)) continue; // older servers sent no positions
    const name = itemSprite(it);
    if (name !== null) drawEx(ctx, sheet, name, 0, it.x, it.y);
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

  // Older servers send no projectiles.
  const projectiles = state.projectiles;
  if (projectiles) for (const p of projectiles) drawProjectile(ctx, sheet, p);

  drawHud(ctx, sheet, state, localPlayer);
}
