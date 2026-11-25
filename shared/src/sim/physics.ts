import { FIELD_H, TILE, TUNING } from "../constants";
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
    if (wallInColumn(lv, tx, top, bottom)) {
      nx = tx * TILE - HALF;
      hitWall = true;
    }
  } else if (b.vx < 0) {
    const tx = Math.floor((nx - HALF) / TILE);
    if (wallInColumn(lv, tx, top, bottom)) {
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

  // Bottom wrap: once fully below the field, re-enter above the top.
  if (b.y - HALF >= FIELD_H) b.y -= FIELD_H + size;

  return hitWall;
}
