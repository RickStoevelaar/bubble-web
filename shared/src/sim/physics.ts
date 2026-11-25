import { FIELD_H, GRID_H, GRID_W, TILE, TUNING } from "../constants";
import { isSolid } from "../level";
import type { LevelData } from "../level";

const EPS = 0.001;

/** Anything with a square body centered on (x, y) that obeys platformer gravity. */
export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  onGround: boolean;
}

/**
 * A tile blocks sideways movement only if it is part of a wall: a solid tile
 * with another solid tile directly above or below (the grid border always
 * qualifies). Thin one-tile platforms are one-way and never block from the
 * side, so a body jumping up through one can still steer.
 */
function isWall(lv: LevelData, tx: number, ty: number): boolean {
  return isSolid(lv, tx, ty) && (isSolid(lv, tx, ty - 1) || isSolid(lv, tx, ty + 1));
}

function wallInColumn(lv: LevelData, tx: number, top: number, bottom: number): boolean {
  const r0 = Math.floor(top / TILE);
  const r1 = Math.floor((bottom - EPS) / TILE);
  for (let ty = r0; ty <= r1; ty++) if (isWall(lv, tx, ty)) return true;
  return false;
}

/** Side-border width in tiles (the lint enforces it). The border always blocks and always pushes a body back out. */
const BORDER_COLS = 2;

/**
 * Extent [top, bottom] of the contiguous wall tiles in column `tx` through row `ty`, within rows 0..GRID_H-1 only:
 * an out-of-grid column is solid in every row, so an unbounded scan would never end for an off-field body.
 */
function wallRun(lv: LevelData, tx: number, ty: number): [number, number] {
  let t = ty;
  let u = ty;
  while (t > 0 && isWall(lv, tx, t - 1)) t--;
  while (u < GRID_H - 1 && isWall(lv, tx, u + 1)) u++;
  return [t, u];
}

/**
 * True if wall column `tx` stops a body whose leading edge currently lies in column `edgeCol`. Decided per row,
 * because a body whose head is in a thick slab and whose feet are beside a tall wall joined to it must still stop:
 * a wall tile is only passable when the edge column holds a wall in that same row AND the tx wall there is no taller
 * than the edge column's (the same slab, so the body is embedded in it, never rewound; this also covers the tile
 * boundaries inside the slab). A taller wall is a real face (a pillar joined to the slab) and blocks.
 * Run containment: the whole vertical wall run of `tx` must lie inside the wall run of `edgeCol`, else it blocks.
 */
function blocks(lv: LevelData, tx: number, edgeCol: number, top: number, bottom: number): boolean {
  if (tx < BORDER_COLS || tx >= GRID_W - BORDER_COLS) return wallInColumn(lv, tx, top, bottom);
  const r1 = Math.floor((bottom - EPS) / TILE);
  for (let ty = Math.floor(top / TILE); ty <= r1; ty++) {
    if (!isWall(lv, tx, ty)) continue;
    if (!isWall(lv, edgeCol, ty)) return true;
    const [t, u] = wallRun(lv, tx, ty);
    const [et, eu] = wallRun(lv, edgeCol, ty);
    if (t < et || u > eu) return true;
  }
  return false;
}

/**
 * Shared platformer physics for players and enemies: horizontal move by `vx`
 * (side walls block), gravity, one-way platform landing and bottom wrap.
 * `size` is the body's side length in pixels. Returns true if a side wall
 * stopped the horizontal move.
 */
export function moveBody(lv: LevelData, b: Body, size: number): boolean {
  const HALF = size / 2;
  let hitWall = false;

  let nx = b.x + b.vx;
  const top = b.y - HALF;
  const bottom = b.y + HALF;
  if (b.vx > 0) {
    const tx = Math.floor((nx + HALF - EPS) / TILE);
    if (blocks(lv, tx, Math.floor((b.x + HALF - EPS) / TILE), top, bottom)) {
      nx = tx * TILE - HALF;
      hitWall = true;
    }
  } else if (b.vx < 0) {
    const tx = Math.floor((nx - HALF) / TILE);
    if (blocks(lv, tx, Math.floor((b.x - HALF + EPS) / TILE), top, bottom)) {
      nx = (tx + 1) * TILE + HALF;
      hitWall = true;
    }
  }
  b.x = nx;

  // Gravity.
  b.vy = Math.min(b.vy + TUNING.gravity, TUNING.maxFall);
  const prevBottom = b.y + HALF;
  let ny = b.y + b.vy;
  b.onGround = false;

  // One-way platforms: land only while falling, from above the tile top.
  if (b.vy >= 0) {
    const c0 = Math.floor((b.x - HALF) / TILE);
    const c1 = Math.floor((b.x + HALF - EPS) / TILE);
    const r0 = Math.ceil((prevBottom - EPS) / TILE);
    const r1 = Math.floor((ny + HALF) / TILE);
    landing: for (let ty = r0; ty <= r1; ty++) {
      const tileTop = ty * TILE;
      for (let tx = c0; tx <= c1; tx++) {
        if (isSolid(lv, tx, ty)) {
          ny = tileTop - HALF;
          b.vy = 0;
          b.onGround = true;
          break landing;
        }
      }
    }
  }
  b.y = ny;

  // Head stop at the top of the field. Falling bodies are exempt: the bottom wrap below re-enters slightly
  // above the field and must be allowed to fall in.
  if (b.vy < 0 && b.y - HALF < 0) {
    b.y = HALF;
    b.vy = 0;
  }

  // Bottom wrap: once fully below the field, re-enter above the top.
  if (b.y - HALF >= FIELD_H) b.y -= FIELD_H + size;

  return hitWall;
}
