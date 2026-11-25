import { describe, expect, it } from "vitest";
import { FIELD_H, GRID_H, GRID_W, PLAYER_SIZE, Rng, TEST_LEVEL, TILE, TUNING, moveBody } from "../src";
import { ENEMY_SIZE } from "../src/sim/enemy-common";
import type { Body, LevelData } from "../src";

const HALF = PLAYER_SIZE / 2;
const EPS = 0.001;

/** Builds a level from solid rectangles on top of the standard border (columns 0-1, 30-31) and floor (rows 26-27). */
function mk(
  rects: { r0: number; r1: number; c0: number; c1: number }[],
  opts: { lid?: boolean; lidGap?: [number, number] } = {},
): LevelData {
  const rows: string[][] = Array.from({ length: GRID_H }, () => Array<string>(GRID_W).fill("."));
  for (let y = 0; y < GRID_H; y++) for (const x of [0, 1, 30, 31]) rows[y]![x] = "#";
  for (const y of [26, 27]) for (let x = 0; x < GRID_W; x++) rows[y]![x] = "#";
  if (opts.lid) {
    for (let x = 0; x < GRID_W; x++) rows[0]![x] = "#";
    if (opts.lidGap) for (let x = opts.lidGap[0]; x <= opts.lidGap[1]; x++) rows[0]![x] = ".";
  }
  for (const r of rects) for (let y = r.r0; y <= r.r1; y++) for (let x = r.c0; x <= r.c1; x++) rows[y]![x] = "#";
  return { round: 1, theme: 0, tiles: rows.map((r) => r.join("")), enemies: [], drift: [] };
}
const body = (x: number, y: number, vx = 0, vy = 0, onGround = false): Body => ({ x, y, vx, vy, onGround });
const FLOOR_Y = 26 * TILE - HALF; // standing on the floor top

describe("squeeze under a thick slab touching the border", () => {
  it("left border: the body's left edge never enters the 2-wide border (px < 16)", () => {
    const lv = mk([{ r0: 20, r1: 21, c0: 2, c1: 9 }]);
    const b = body(23, FLOOR_Y, 0, 0, true);
    let minLeft = Infinity;
    let squeezed = 0;
    for (let t = 0; t < 400; t++) {
      const inSlab = b.y - HALF < 22 * TILE && b.y + HALF > 20 * TILE;
      if (inSlab) squeezed++;
      b.vx = inSlab ? 1 : 0;
      if (b.onGround) b.vy = TUNING.jumpVel;
      moveBody(lv, b, PLAYER_SIZE);
      minLeft = Math.min(minLeft, b.x - HALF);
    }
    expect(squeezed).toBeGreaterThan(5); // the scenario really overlapped the slab rows
    expect(minLeft).toBeGreaterThanOrEqual(16);
  });

  it("right border: the body's right edge never exceeds 240", () => {
    const lv = mk([{ r0: 20, r1: 21, c0: 22, c1: 29 }]);
    const b = body(233, FLOOR_Y, 0, 0, true);
    let maxRight = -Infinity;
    let squeezed = 0;
    for (let t = 0; t < 400; t++) {
      const inSlab = b.y - HALF < 22 * TILE && b.y + HALF > 20 * TILE;
      if (inSlab) squeezed++;
      b.vx = inSlab ? -1 : 0;
      if (b.onGround) b.vy = TUNING.jumpVel;
      moveBody(lv, b, PLAYER_SIZE);
      maxRight = Math.max(maxRight, b.x + HALF);
    }
    expect(squeezed).toBeGreaterThan(5);
    expect(maxRight).toBeLessThanOrEqual(240);
  });
});

describe("thick slab in open space", () => {
  const lv = mk([{ r0: 20, r1: 21, c0: 10, c1: 15 }]); // px 80..128, rows 160..176
  const Y = 168;
  const hold = (b: Body, vx: number): boolean => {
    b.vx = vx;
    b.vy = -TUNING.gravity; // cancels gravity so y stays put
    b.y = Y;
    return moveBody(lv, b, PLAYER_SIZE);
  };

  it("a body already inside is not rewound and reports no hitWall", () => {
    const b = body(100, Y);
    for (let i = 0; i < 10; i++) {
      const x0 = b.x;
      expect(hold(b, 1)).toBe(false);
      expect(b.x).toBe(x0 + 1);
    }
    const c = body(100, Y);
    for (let i = 0; i < 10; i++) {
      const x0 = c.x;
      expect(hold(c, -1)).toBe(false);
      expect(c.x).toBe(x0 - 1);
    }
  });

  it("approaching from the left stops flush at the face and reports hitWall", () => {
    const b = body(60, Y);
    let hits = 0;
    for (let i = 0; i < 40; i++) {
      const hit = hold(b, 1);
      if (hit) hits++;
      expect(b.x).toBe(Math.min(60 + i + 1, 73));
      expect(hit).toBe(60 + i + 1 > 73);
    }
    expect(hits).toBeGreaterThan(20);
    expect(b.x + HALF).toBe(10 * TILE);
  });

  it("approaching from the right stops flush at the face and reports hitWall", () => {
    const b = body(200, Y);
    for (let i = 0; i < 100; i++) {
      const hit = hold(b, -1);
      expect(b.x).toBe(Math.max(200 - i - 1, 135));
      expect(hit).toBe(200 - i - 1 < 135);
    }
    expect(b.x - HALF).toBe(16 * TILE);
  });
});

describe("slab touching the border", () => {
  it("a body inside the slab pressing toward the border stops flush at its inner face and reports hitWall", () => {
    const lv = mk([{ r0: 20, r1: 21, c0: 22, c1: 29 }]);
    const b = body(200, 168);
    let hits = 0;
    for (let i = 0; i < 80; i++) {
      b.vx = 1;
      b.vy = -TUNING.gravity;
      b.y = 168;
      if (moveBody(lv, b, PLAYER_SIZE)) hits++;
    }
    expect(b.x + HALF).toBe(240);
    expect(hits).toBeGreaterThan(10);
  });
});

describe("enemies beside a thick slab", () => {
  it("a walker body inside a slab never reports hitWall (so its AI does not flip every tick)", () => {
    const lv = mk([{ r0: 20, r1: 21, c0: 10, c1: 15 }]);
    const e = body(100, 168);
    for (let i = 0; i < 20; i++) {
      e.vx = 0.5;
      e.vy = -TUNING.gravity;
      e.y = 168;
      expect(moveBody(lv, e, ENEMY_SIZE)).toBe(false);
    }
    expect(e.x).toBe(110);
  });
});

describe("top of the field", () => {
  it("a jump whose apex would leave the field stops at y == HALF with vy == 0, then falls normally", () => {
    const lv = mk([{ r0: 6, r1: 6, c0: 10, c1: 15 }], { lid: true, lidGap: [14, 17] });
    const b = body(100, 6 * TILE - HALF, 0, 0, true);
    b.vy = TUNING.jumpVel;
    let clamped = -1;
    let landed = false;
    for (let t = 0; t < 200; t++) {
      moveBody(lv, b, PLAYER_SIZE);
      expect(b.y - HALF).toBeGreaterThanOrEqual(0);
      if (clamped < 0 && b.y === HALF) {
        clamped = t;
        expect(b.vy).toBe(0);
      }
      if (clamped >= 0 && b.onGround) {
        landed = true;
        break;
      }
    }
    expect(clamped).toBeGreaterThan(0);
    expect(landed).toBe(true);
    expect(b.y).toBe(6 * TILE - HALF);
  });

  it("jump spam under a gapless lid never puts the body above the field or on the lid", () => {
    const lv = mk([{ r0: 6, r1: 6, c0: 10, c1: 15 }], { lid: true });
    const rng = new Rng(7);
    const b = body(100, 6 * TILE - HALF, 0, 0, true);
    let dir = 0;
    for (let t = 0; t < 3000; t++) {
      if (t % 17 === 0) dir = rng.int(3) - 1;
      b.vx = dir;
      if (b.onGround) b.vy = TUNING.jumpVel;
      moveBody(lv, b, PLAYER_SIZE);
      expect(b.y - HALF).toBeGreaterThanOrEqual(0);
      if (b.onGround) expect(b.y).toBeGreaterThanOrEqual(HALF);
    }
  });

  it("wrap re-entry: falls out of the bottom gap, re-enters at about -7 and falls in (not clamped)", () => {
    const b = body(15 * TILE, 26 * TILE - HALF, 0, 0, true);
    let wrapped = -1;
    let prevY = b.y;
    for (let t = 0; t < 400; t++) {
      moveBody(TEST_LEVEL, b, PLAYER_SIZE);
      if (b.y < prevY - FIELD_H / 2) {
        wrapped = t;
        expect(b.y).toBeLessThan(0);
        expect(b.y).toBeGreaterThan(-PLAYER_SIZE - 1);
        expect(b.vy).toBeGreaterThan(0);
        break;
      }
      prevY = b.y;
    }
    expect(wrapped).toBeGreaterThan(0);
    const yIn = b.y;
    for (let i = 0; i < 5; i++) moveBody(TEST_LEVEL, b, PLAYER_SIZE);
    expect(b.y).toBeGreaterThan(yIn); // fell in
  });

  it("wrapping into a lid-gap column never leaves the body standing on the lid", () => {
    const b = body(15 * TILE, 26 * TILE - HALF, 0, 0, true);
    for (let t = 0; t < 3000; t++) {
      moveBody(TEST_LEVEL, b, PLAYER_SIZE);
      if (b.onGround) expect(b.y).toBeGreaterThanOrEqual(HALF);
    }
  });
});

describe("one-way platforms", () => {
  it("passes upward through a thin platform and lands on its top at an exact y", () => {
    const lv = mk([{ r0: 20, r1: 20, c0: 10, c1: 15 }]);
    const b = body(100, FLOOR_Y, 0, 0, true);
    b.vy = TUNING.jumpVel;
    let rose = false;
    let landed = false;
    for (let t = 0; t < 200; t++) {
      moveBody(lv, b, PLAYER_SIZE);
      if (b.y < 20 * TILE - HALF - 4) rose = true;
      if (rose && b.onGround) {
        landed = true;
        break;
      }
    }
    expect(rose).toBe(true);
    expect(landed).toBe(true);
    expect(b.y).toBe(20 * TILE - HALF);
    expect(b.vy).toBe(0);
  });

  it("walking on the floor keeps onGround and the exact floor y", () => {
    const b = body(100, FLOOR_Y - 5);
    for (let i = 0; i < 60; i++) moveBody(TEST_LEVEL, b, PLAYER_SIZE);
    expect(b.onGround).toBe(true);
    expect(b.y).toBe(FLOOR_Y);
  });
});

/** The pre-change algorithm, verbatim, with flags saying when the new rules legitimately differ. */
function oldMove(lv: LevelData, b: Body, size: number): { hit: boolean; rewind: boolean; clamp: boolean } {
  const isSolid = (tx: number, ty: number) => (tx < 0 || tx >= GRID_W ? true : ty < 0 || ty >= GRID_H ? false : lv.tiles[ty]![tx] === "#");
  const isWall = (tx: number, ty: number) => isSolid(tx, ty) && (isSolid(tx, ty - 1) || isSolid(tx, ty + 1));
  const wic = (tx: number, top: number, bottom: number) => {
    const r0 = Math.floor(top / TILE);
    const r1 = Math.floor((bottom - EPS) / TILE);
    for (let ty = r0; ty <= r1; ty++) if (isWall(tx, ty)) return true;
    return false;
  };
  const H = size / 2;
  let hit = false;
  let rewind = false;
  let nx = b.x + b.vx;
  const top = b.y - H;
  const bottom = b.y + H;
  if (b.vx > 0) {
    const tx = Math.floor((nx + H - EPS) / TILE);
    if (wic(tx, top, bottom)) {
      if (tx >= 2 && tx < GRID_W - 2 && wic(Math.floor((b.x + H - EPS) / TILE), top, bottom)) rewind = true;
      nx = tx * TILE - H;
      hit = true;
    }
  } else if (b.vx < 0) {
    const tx = Math.floor((nx - H) / TILE);
    if (wic(tx, top, bottom)) {
      if (tx >= 2 && tx < GRID_W - 2 && wic(Math.floor((b.x - H + EPS) / TILE), top, bottom)) rewind = true;
      nx = (tx + 1) * TILE + H;
      hit = true;
    }
  }
  b.x = nx;
  b.vy = Math.min(b.vy + TUNING.gravity, TUNING.maxFall);
  const prevBottom = b.y + H;
  let ny = b.y + b.vy;
  b.onGround = false;
  if (b.vy >= 0) {
    const c0 = Math.floor((b.x - H) / TILE);
    const c1 = Math.floor((b.x + H - EPS) / TILE);
    const r0 = Math.ceil((prevBottom - EPS) / TILE);
    const r1 = Math.floor((ny + H) / TILE);
    landing: for (let ty = r0; ty <= r1; ty++)
      for (let tx = c0; tx <= c1; tx++)
        if (isSolid(tx, ty)) {
          ny = ty * TILE - H;
          b.vy = 0;
          b.onGround = true;
          break landing;
        }
  }
  b.y = ny;
  const clamp = b.vy < 0 && b.y - H < 0;
  if (b.y - H >= FIELD_H) b.y -= FIELD_H + size;
  return { hit, rewind, clamp };
}

describe("differential: new moveBody equals the old algorithm wherever the new rules do not apply", () => {
  it("matches on tens of thousands of random states and differs only in the flagged cases", () => {
    const rng = new Rng(20260);
    const levels: LevelData[] = [
      TEST_LEVEL,
      mk([
        { r0: 20, r1: 21, c0: 2, c1: 9 },
        { r0: 12, r1: 13, c0: 12, c1: 20 },
        { r0: 6, r1: 6, c0: 4, c1: 9 },
      ]),
    ];
    const tiles = Array.from({ length: GRID_H }, (_, y) =>
      Array.from({ length: GRID_W }, (_, x) => (x < 2 || x > 29 || y > 25 || rng.next() < 0.12 ? "#" : ".")).join(""),
    );
    levels.push({ round: 1, theme: 0, tiles, enemies: [], drift: [] });
    let compared = 0;
    let flagged = 0;
    let flushWall = 0;
    for (let i = 0; i < 40000; i++) {
      const lv = levels[i % levels.length]!;
      const size = [PLAYER_SIZE, ENEMY_SIZE, TUNING.itemSize][rng.int(3)]!;
      const q = rng.int(4) === 0 ? 2 : 0.25; // sometimes quantised so flush states occur
      const s: Body = {
        x: Math.round((16 + rng.next() * 224) / q) * q,
        y: Math.round((-10 + rng.next() * 240) / q) * q,
        vx: [-1.5, -1, 0, 1, 1.5][rng.int(5)]!,
        vy: (rng.next() - 0.6) * 8,
        onGround: false,
      };
      const a = { ...s };
      const n = { ...s };
      const o = oldMove(lv, a, size);
      const hit = moveBody(lv, n, size);
      if (o.rewind || o.clamp) {
        flagged++;
        continue;
      }
      compared++;
      expect(n).toEqual(a);
      expect(hit).toBe(o.hit);
      if (o.hit) flushWall++;
    }
    expect(compared).toBeGreaterThan(20000);
    expect(flushWall).toBeGreaterThan(100);
    expect(flagged).toBeGreaterThan(0);
  });
});
