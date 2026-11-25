import { FIELD_H, TILE, TUNING } from "../constants";
import { isSolid } from "../level";
import type { LevelData } from "../level";
import { BTN } from "../types";
import type { PlayerState, SimEvent } from "../types";

/** Player body is a square of this many pixels, centered on (x, y). */
export const PLAYER_SIZE = 14;
const HALF = PLAYER_SIZE / 2;
const EPS = 0.001;

/**
 * A tile blocks sideways movement only if it is part of a wall: a solid tile
 * with another solid tile directly above or below (the grid border always
 * qualifies). Thin one-tile platforms are one-way and never block from the
 * side, so a player jumping up through one can still steer.
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
 * Advances one player by one tick. Depends only on its arguments and
 * `sim.currentLevel`, so client-side prediction can reuse it.
 */
export function stepPlayer(
  sim: { currentLevel: LevelData },
  p: PlayerState,
  buttons: number,
): SimEvent[] {
  const events: SimEvent[] = [];
  if (p.state !== "alive") return events;
  const lv = sim.currentLevel;

  const dir = ((buttons & BTN.R) !== 0 ? 1 : 0) - ((buttons & BTN.L) !== 0 ? 1 : 0);
  const speed = TUNING.walkSpeed * (p.powers.speed ? TUNING.speedPowerMult : 1);
  p.vx = dir * speed;
  if (dir !== 0) p.facing = dir > 0 ? 1 : -1;

  if ((buttons & BTN.J) !== 0 && p.onGround) {
    p.vy = TUNING.jumpVel;
    p.onGround = false;
    events.push({ kind: "jump", player: p.id, x: p.x, y: p.y });
  }

  // Horizontal move; side walls always block.
  let nx = p.x + p.vx;
  const top = p.y - HALF;
  const bottom = p.y + HALF;
  if (p.vx > 0) {
    const tx = Math.floor((nx + HALF - EPS) / TILE);
    if (wallInColumn(lv, tx, top, bottom)) nx = tx * TILE - HALF;
  } else if (p.vx < 0) {
    const tx = Math.floor((nx - HALF) / TILE);
    if (wallInColumn(lv, tx, top, bottom)) nx = (tx + 1) * TILE + HALF;
  }
  p.x = nx;

  // Gravity.
  p.vy = Math.min(p.vy + TUNING.gravity, TUNING.maxFall);
  const prevBottom = p.y + HALF;
  let ny = p.y + p.vy;
  p.onGround = false;

  // One-way platforms: land only while falling, from above the tile top.
  if (p.vy >= 0) {
    const c0 = Math.floor((p.x - HALF) / TILE);
    const c1 = Math.floor((p.x + HALF - EPS) / TILE);
    const r0 = Math.ceil((prevBottom - EPS) / TILE);
    const r1 = Math.floor((ny + HALF) / TILE);
    landing: for (let ty = r0; ty <= r1; ty++) {
      const tileTop = ty * TILE;
      for (let tx = c0; tx <= c1; tx++) {
        if (isSolid(lv, tx, ty)) {
          ny = tileTop - HALF;
          p.vy = 0;
          p.onGround = true;
          break landing;
        }
      }
    }
  }
  p.y = ny;

  // Bottom wrap: once fully below the field, re-enter above the top.
  if (p.y - HALF >= FIELD_H) p.y -= FIELD_H + PLAYER_SIZE;

  return events;
}
