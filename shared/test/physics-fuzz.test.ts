import { describe, expect, it } from "vitest";
import { BOSS_ARENA, BTN, GAME_LEVELS, GRID_H, GRID_W, PLAYER_SIZE, Rng, SECRET_ROOMS, Sim, TEST_LEVEL, TILE, stepPlayer } from "../src";
import type { LevelData } from "../src";

const HALF = PLAYER_SIZE / 2;
/** Purpose-built stress levels: thick slabs touching both borders (the review's squeeze), a high ledge under a gapless lid. */
function slabLevel(lid: boolean): LevelData {
  const rows: string[][] = Array.from({ length: GRID_H }, () => Array<string>(GRID_W).fill("."));
  for (let y = 0; y < GRID_H; y++) for (const x of [0, 1, 30, 31]) rows[y]![x] = "#";
  for (const y of [26, 27]) for (let x = 0; x < GRID_W; x++) rows[y]![x] = "#";
  for (const y of [20, 21]) for (let x = 2; x <= 9; x++) rows[y]![x] = "#";
  for (const y of [20, 21]) for (let x = 22; x <= 29; x++) rows[y]![x] = "#";
  for (let x = 12; x <= 19; x++) rows[14]![x] = "#"; // thin platform
  for (const y of [8, 9]) for (let x = 12; x <= 19; x++) rows[y]![x] = "#"; // thick slab in open space
  for (let x = 10; x <= 21; x++) rows[6]![x] = "#"; // ledge whose jump apex leaves the field
  if (lid) for (let x = 0; x < GRID_W; x++) rows[0]![x] = "#";
  return { round: 1, theme: 0, tiles: rows.map((r) => r.join("")), enemies: [], drift: [] };
}

/** A full-height pillar at column 16 (px 128..136) joined to bars on each side: nothing can go around it. */
function pillarLevel(): LevelData {
  const rows: string[][] = Array.from({ length: GRID_H }, () => Array<string>(GRID_W).fill("."));
  for (let y = 0; y < GRID_H; y++) for (const x of [0, 1, 16, 30, 31]) rows[y]![x] = "#";
  for (const y of [26, 27]) for (let x = 0; x < GRID_W; x++) rows[y]![x] = "#";
  for (const y of [20, 21]) for (let x = 10; x <= 15; x++) rows[y]![x] = "#";
  for (const y of [12, 13]) for (let x = 17; x <= 22; x++) rows[y]![x] = "#";
  for (const y of [8, 9]) for (let x = 5; x <= 15; x++) rows[y]![x] = "#";
  for (const y of [8, 9]) for (let x = 17; x <= 26; x++) rows[y]![x] = "#";
  return { round: 1, theme: 0, tiles: rows.map((r) => r.join("")), enemies: [], drift: [] };
}
const PILLAR_STARTS = [{ x: 121, y: 26 * TILE - HALF }, { x: 143, y: 26 * TILE - HALF }, { x: 100, y: 26 * TILE - HALF }, { x: 170, y: 26 * TILE - HALF }];

const SETS: { name: string; level: LevelData; starts?: { x: number; y: number }[] }[] = [
  { name: "squeeze slabs, gapless lid", level: slabLevel(true), starts: [{ x: 23, y: 26 * TILE - HALF }, { x: 233, y: 26 * TILE - HALF }, { x: 100, y: 6 * TILE - HALF }, { x: 128, y: 26 * TILE - HALF }] },
  { name: "squeeze slabs, open top", level: slabLevel(false), starts: [{ x: 23, y: 26 * TILE - HALF }, { x: 233, y: 26 * TILE - HALF }, { x: 100, y: 6 * TILE - HALF }, { x: 128, y: 26 * TILE - HALF }] },
  { name: "pillar joined to bars", level: pillarLevel(), starts: PILLAR_STARTS },
  ...GAME_LEVELS.slice(0, 25).map((level, i) => ({ name: `round ${i + 1}`, level })),
  { name: "TEST_LEVEL", level: TEST_LEVEL },
  ...SECRET_ROOMS.map((r) => ({ name: `secret ${r.word}`, level: r.level })),
  { name: "BOSS_ARENA", level: BOSS_ARENA },
];

const SEEDS = [11, 222, 3333, 44444];
const TICKS = 2000;
/** A falling-in body needs at most ~PLAYER_SIZE px at speed >= 0; allow generous slack before calling it stuck on the lid. */
const MAX_ABOVE_TICKS = 24;

function fuzz(level: LevelData, seed: number, start?: { x: number; y: number }): void {
  const sim = new Sim([level], seed, 1);
  sim.currentLevel = level;
  sim.state.enemies = [];
  const p = sim.state.players[0]!;
  if (start) {
    p.x = start.x;
    p.y = start.y;
    p.vy = 0;
    p.onGround = true;
  }
  // Full-height pillar at px 128..136: the body must stay on the side it started on.
  const pillar = level.tiles[5]![16] === "#" && level.tiles[1]![16] === "#" && level.tiles[22]![16] === "#" && level.tiles[3]![17] === "." && level.tiles[3]![15] === ".";
  const leftSide = p.x < 128;
  const rng = new Rng(seed * 7919 + 1);
  let buttons = 0;
  let hold = 0;
  let above = 0;
  for (let t = 0; t < TICKS; t++) {
    if (hold === 0) {
      buttons = 0;
      const r = rng.int(8);
      if (r < 3) buttons |= BTN.L;
      else if (r < 6) buttons |= BTN.R;
      if (rng.int(4) !== 0) buttons |= BTN.J; // jump spam
      if (rng.int(4) === 0) buttons |= BTN.F;
      hold = 5 + rng.int(36);
    }
    hold--;
    sim.state.bubbles.length = 0;
    stepPlayer(sim, p, buttons);
    const at = `${level.round}/${seed}/t${t} x=${p.x} y=${p.y} vy=${p.vy}`;
    // Finite numbers.
    expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.vx) && Number.isFinite(p.vy), at).toBe(true);
    if (pillar) {
      if (leftSide) expect(p.x + HALF, `crossed the pillar: ${at}`).toBeLessThanOrEqual(128);
      else expect(p.x - HALF, `crossed the pillar: ${at}`).toBeGreaterThanOrEqual(136);
    }
    // Never inside the 2-wide side borders (inner faces at px 16 and 240).
    expect(p.x - HALF, at).toBeGreaterThanOrEqual(16);
    expect(p.x + HALF, at).toBeLessThanOrEqual(240);
    // Never above the field, except the bottom-wrap re-entry: the wrap puts the center at >= -HALF (a body fully
    // below the field, y - HALF >= 224, drops by 224 + 14) and the body is falling (vy >= 0) when it does.
    if (p.y - HALF < 0) {
      expect(p.vy >= 0 && p.y >= -HALF, `above the field and not falling in: ${at}`).toBe(true);
      above++;
      expect(above, `stuck above the field: ${at}`).toBeLessThanOrEqual(MAX_ABOVE_TICKS);
    } else above = 0;
  }
}

describe("moveBody fuzz (player body vs every level, border and field top)", () => {
  for (const s of SETS) {
    it(s.name, () => {
      SEEDS.forEach((seed, i) => fuzz(s.level, seed, s.starts?.[i % s.starts.length]));
    });
  }
});
