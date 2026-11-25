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
    // Pressing left inside the slab stops at the border's inner face with hitWall.
    let hit = false;
    for (let i = 0; i < 30; i++) {
      b.vx = -1;
      b.vy = -TUNING.gravity;
      b.y = 168;
      hit = moveBody(lv, b, PLAYER_SIZE);
    }
    expect(b.x - HALF).toBe(16);
    expect(hit).toBe(true);
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

/** Bar (rows 20-21) joined to a tall pillar: the head can enter the bar while the feet are still beside the pillar. */
const PILLAR_LEFT = mk([
  { r0: 20, r1: 21, c0: 10, c1: 15 },
  { r0: 4, r1: 25, c0: 16, c1: 16 },
]); // pillar face at px 128, body flush at x = 121
const PILLAR_RIGHT = mk([
  { r0: 20, r1: 21, c0: 17, c1: 22 },
  { r0: 4, r1: 25, c0: 16, c1: 16 },
]); // pillar face at px 136, body flush at x = 143

describe("tall wall joined to a thick slab (no tunnelling)", () => {
  it("right of the bar: flush under the bar, jumping and holding right never passes the pillar", () => {
    const b = body(121, FLOOR_Y, 0, 0, true);
    for (let t = 0; t < 80; t++) {
      b.vx = 1;
      if (b.onGround) b.vy = TUNING.jumpVel;
      const hit = moveBody(PILLAR_LEFT, b, PLAYER_SIZE);
      expect(b.x, `t${t}`).toBeLessThanOrEqual(121);
      expect(hit, `hitWall t${t}`).toBe(true);
    }
  });
  it("left mirror: bar to the right of the pillar, holding left never passes the pillar", () => {
    const b = body(143, FLOOR_Y, 0, 0, true);
    for (let t = 0; t < 80; t++) {
      b.vx = -1;
      if (b.onGround) b.vy = TUNING.jumpVel;
      const hit = moveBody(PILLAR_RIGHT, b, PLAYER_SIZE);
      expect(b.x, `t${t}`).toBeGreaterThanOrEqual(143);
      expect(hit, `hitWall t${t}`).toBe(true);
    }
  });
  it("a body fully inside the bar rows still stops at the pillar face", () => {
    const b = body(121, 168);
    for (let t = 0; t < 20; t++) {
      b.vx = 1;
      b.vy = -TUNING.gravity;
      b.y = 168;
      const hit = moveBody(PILLAR_LEFT, b, PLAYER_SIZE);
      expect(b.x).toBeLessThanOrEqual(121);
      expect(hit).toBe(true);
    }
  });
  it("a hopping walker beside the join flips at the pillar and never passes", () => {
    const rng = new Rng(5);
    for (const [lv, start, faceDir] of [
      [PILLAR_LEFT, 100, 1],
      [PILLAR_RIGHT, 170, -1],
    ] as const) {
      const e = body(start, 26 * TILE - ENEMY_SIZE / 2, 0, 0, true);
      let dir: number = faceDir;
      let flips = 0;
      for (let t = 0; t < 4000; t++) {
        if (e.onGround && rng.int(20) === 0) {
          e.vy = TUNING.jumpVel;
          e.onGround = false;
        }
        e.vx = dir * TUNING.enemyWalkSpeed;
        if (moveBody(lv, e, ENEMY_SIZE)) {
          dir = -dir;
          flips++;
        }
        if (faceDir === 1) expect(e.x + ENEMY_SIZE / 2, `t${t}`).toBeLessThanOrEqual(128);
        else expect(e.x - ENEMY_SIZE / 2, `t${t}`).toBeGreaterThanOrEqual(136);
      }
      expect(flips).toBeGreaterThan(3);
    }
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

/** The pre-change algorithm, verbatim; also reports the start x so classes derive from OLD outputs only. */
function oldMove(lv: LevelData, b: Body, size: number): { hit: boolean; startX: number; clamp: boolean } {
  const isSolid = (tx: number, ty: number) => (tx < 0 || tx >= GRID_W ? true : ty < 0 || ty >= GRID_H ? false : lv.tiles[ty]![tx] === "#");
  const isWall = (tx: number, ty: number) => isSolid(tx, ty) && (isSolid(tx, ty - 1) || isSolid(tx, ty + 1));
  const wic = (tx: number, top: number, bottom: number) => {
    const r0 = Math.floor(top / TILE);
    const r1 = Math.floor((bottom - EPS) / TILE);
    for (let ty = r0; ty <= r1; ty++) if (isWall(tx, ty)) return true;
    return false;
  };
  const H = size / 2;
  const startX = b.x;
  let hit = false;
  let nx = b.x + b.vx;
  const top = b.y - H;
  const bottom = b.y + H;
  if (b.vx > 0) {
    const tx = Math.floor((nx + H - EPS) / TILE);
    if (wic(tx, top, bottom)) {
      nx = tx * TILE - H;
      hit = true;
    }
  } else if (b.vx < 0) {
    const tx = Math.floor((nx - H) / TILE);
    if (wic(tx, top, bottom)) {
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
  return { hit, startX, clamp };
}

/**
 * Independent oracle, written from the geometric definition and sharing nothing with physics.ts.
 * Returns "none" (no wall in the target column in the body's rows), "block" (flush stop with hitWall) or
 * "pass" (the body is embedded in the same slab: it moves on by vx, no hit).
 *   - a wall tile is a solid tile with a solid tile directly above or below (out-of-grid columns are solid);
 *   - the border columns 0-1 and 30-31 always block;
 *   - otherwise, in EVERY body row where the target column is wall, the body's leading-edge column must also be
 *     wall in that row, and the whole vertical wall run of the target column must lie inside the wall run of the
 *     edge column.
 */
function shouldPassWall(lv: LevelData, s: Body, size: number): { verdict: "none" | "block" | "pass"; flush: number } {
  const H = size / 2;
  const solid = (c: number, r: number) => c < 0 || c >= GRID_W || (r >= 0 && r < GRID_H && lv.tiles[r]![c] === "#");
  const wall = (c: number, r: number) => solid(c, r) && (solid(c, r - 1) || solid(c, r + 1));
  const runOf = (c: number, r: number): [number, number] => {
    const rows: boolean[] = Array.from({ length: GRID_H }, (_, i) => wall(c, i));
    let a = r;
    let z = r;
    while (a > 0 && rows[a - 1]) a--;
    while (z < GRID_H - 1 && rows[z + 1]) z++;
    return [a, z];
  };
  const right = s.vx > 0;
  if (s.vx === 0) return { verdict: "none", flush: s.x };
  const nx = s.x + s.vx;
  const tx = right ? Math.floor((nx + H - 0.001) / TILE) : Math.floor((nx - H) / TILE);
  const edge = right ? Math.floor((s.x + H - 0.001) / TILE) : Math.floor((s.x - H + 0.001) / TILE);
  const flush = right ? tx * TILE - H : (tx + 1) * TILE + H;
  const rows: number[] = [];
  for (let r = Math.floor((s.y - H) / TILE); r <= Math.floor((s.y + H - 0.001) / TILE); r++) rows.push(r);
  const wallRows = rows.filter((r) => wall(tx, r));
  if (wallRows.length === 0) return { verdict: "none", flush };
  if (tx < 2 || tx >= GRID_W - 2) return { verdict: "block", flush };
  for (const r of wallRows) {
    if (!wall(edge, r)) return { verdict: "block", flush };
    const [a, z] = runOf(tx, r);
    const [ea, ez] = runOf(edge, r);
    if (a < ea || z > ez) return { verdict: "block", flush };
  }
  return { verdict: "pass", flush };
}

/** Horizontal half of the criterion from commit 7afd035 (the pillar-tunnelling bug), kept as a mutation check. */
function buggyMoveX(lv: LevelData, b: Body, size: number): { x: number; hit: boolean } {
  const H = size / 2;
  const isSolid = (tx: number, ty: number) => (tx < 0 || tx >= GRID_W ? true : ty < 0 || ty >= GRID_H ? false : lv.tiles[ty]![tx] === "#");
  const isWall = (tx: number, ty: number) => isSolid(tx, ty) && (isSolid(tx, ty - 1) || isSolid(tx, ty + 1));
  const wic = (tx: number, top: number, bottom: number) => {
    for (let ty = Math.floor(top / TILE); ty <= Math.floor((bottom - EPS) / TILE); ty++) if (isWall(tx, ty)) return true;
    return false;
  };
  const nx = b.x + b.vx;
  const top = b.y - H;
  const bottom = b.y + H;
  if (b.vx > 0) {
    const tx = Math.floor((nx + H - EPS) / TILE);
    if (wic(tx, top, bottom) && (tx < 2 || tx >= GRID_W - 2 || !wic(Math.floor((b.x + H - EPS) / TILE), top, bottom))) return { x: tx * TILE - H, hit: true };
  } else if (b.vx < 0) {
    const tx = Math.floor((nx - H) / TILE);
    if (wic(tx, top, bottom) && (tx < 2 || tx >= GRID_W - 2 || !wic(Math.floor((b.x - H + EPS) / TILE), top, bottom))) return { x: (tx + 1) * TILE + H, hit: true };
  }
  return { x: nx, hit: false };
}

describe("differential: new moveBody vs the old algorithm and an independent oracle", () => {
  const rng = new Rng(20260);
  const tiles = Array.from({ length: GRID_H }, (_, y) =>
    Array.from({ length: GRID_W }, (_, x) => (x < 2 || x > 29 || y > 25 || rng.next() < 0.12 ? "#" : ".")).join(""),
  );
  const levels: LevelData[] = [
    TEST_LEVEL,
    PILLAR_LEFT,
    PILLAR_RIGHT,
    mk([
      { r0: 20, r1: 21, c0: 2, c1: 9 },
      { r0: 20, r1: 21, c0: 22, c1: 29 },
    ]),
    mk([
      { r0: 12, r1: 13, c0: 12, c1: 20 },
      { r0: 6, r1: 6, c0: 4, c1: 9 },
    ]),
    { round: 1, theme: 0, tiles, enemies: [], drift: [] },
  ];
  type Sample = { lv: LevelData; size: number; s: Body; pillarFocus: boolean };
  const samples: Sample[] = [];
  for (let i = 0; i < 60000; i++) {
    const lv = levels[i % levels.length]!;
    const size = [12, PLAYER_SIZE, 16][rng.int(3)]!;
    const H = size / 2;
    const q = [0.001, 0.25, 2][rng.int(3)]!; // coarse grids hit flush states often
    samples.push({
      lv,
      size,
      pillarFocus: false,
      s: {
        x: Math.round((16 + H + rng.next() * (224 - size)) / q) * q,
        y: Math.round((-10 + rng.next() * 240) / q) * q,
        vx: (rng.int(33) - 16) / 10,
        vy: (rng.next() - 0.6) * 8,
        onGround: false,
      },
    });
  }
  // States concentrated beside the pillar joins so bodies with the head in the bar and the feet at a pillar-only row are common.
  for (let i = 0; i < 6000; i++) {
    const left = i % 2 === 0;
    const size = [12, PLAYER_SIZE, 16][rng.int(3)]!;
    samples.push({
      lv: left ? PILLAR_LEFT : PILLAR_RIGHT,
      size,
      pillarFocus: true,
      s: { x: (left ? 128 - size / 2 : 136 + size / 2) + (rng.int(9) - 4) * (left ? -1 : 1) * (rng.int(2) ? 1 : 0.5), y: 140 + rng.next() * 70, vx: left ? 1 : -1, vy: (rng.next() - 0.6) * 8, onGround: false },
    });
  }

  /** Number of samples where `fn` disagrees with the oracle on hitWall or x. */
  const oracleMismatches = (fn: (lv: LevelData, b: Body, size: number) => { x: number; hit: boolean }): number => {
    let bad = 0;
    for (const { lv, size, s } of samples) {
      const o = shouldPassWall(lv, s, size);
      const r = fn(lv, { ...s }, size);
      const wantX = o.verdict === "block" ? o.flush : s.x + s.vx;
      if (r.hit !== (o.verdict === "block") || r.x !== wantX) bad++;
    }
    return bad;
  };

  it("matches the oracle on every sample (hitWall, flush x on block, x + vx on pass/none) and the old code elsewhere", () => {
    const cls = { none: 0, blockOldFlush: 0, blockOldRewound: 0, pass: 0, passOldRewound: 0, clamp: 0, pillarOnlyRow: 0 };
    for (const { lv, size, s, pillarFocus } of samples) {
      const a = { ...s };
      const n = { ...s };
      const o = oldMove(lv, a, size);
      const hit = moveBody(lv, n, size);
      const v = shouldPassWall(lv, s, size);
      expect(n.vx).toBe(s.vx);
      if (v.verdict === "block") {
        expect(hit).toBe(true);
        expect(n.x).toBe(v.flush);
        if (s.vx > 0 ? o.startX - a.x > EPS : a.x - o.startX > EPS) cls.blockOldRewound++;
        else {
          // not a rewind: the old code reached exactly the same flush stop and reported the same hit
          expect(a.x).toBe(v.flush);
          expect(o.hit).toBe(true);
          cls.blockOldFlush++;
        }
      } else if (v.verdict === "pass") {
        expect(hit).toBe(false);
        expect(n.x).toBe(s.x + s.vx);
        expect(o.hit).toBe(true); // only ever differs from the old code where it reported a wall
        cls.pass++;
        if (s.vx > 0 ? o.startX - a.x > EPS : a.x - o.startX > EPS) cls.passOldRewound++;
      } else {
        expect(hit).toBe(false);
        expect(n.x).toBe(s.x + s.vx);
        expect(o.hit).toBe(false);
        expect(a.x).toBe(n.x);
        cls.none++;
      }
      if (o.clamp) {
        cls.clamp++; // the head stop legitimately changes y and vy
      } else if (n.x === a.x) {
        expect([n.y, n.vy, n.onGround]).toEqual([a.y, a.vy, a.onGround]);
      }
      if (pillarFocus) {
        // A body row where the target column is wall but the edge column is not (pillar-only row): must block.
        const H = size / 2;
        const right = s.vx > 0;
        const tx = right ? Math.floor((s.x + s.vx + H - EPS) / TILE) : Math.floor((s.x + s.vx - H) / TILE);
        const ec = right ? Math.floor((s.x + H - EPS) / TILE) : Math.floor((s.x - H + EPS) / TILE);
        const wl = (c: number, r: number) => c >= 0 && c < GRID_W && lv.tiles[r]?.[c] === "#" && (lv.tiles[r - 1]?.[c] === "#" || lv.tiles[r + 1]?.[c] === "#");
        let pillarOnly = false;
        for (let r = Math.floor((s.y - H) / TILE); r <= Math.floor((s.y + H - EPS) / TILE); r++) if (wl(tx, r) && !wl(ec, r)) pillarOnly = true;
        if (pillarOnly) {
          expect(v.verdict).toBe("block");
          expect(hit).toBe(true);
          cls.pillarOnlyRow++;
        }
      }
    }
    console.log("differential classes", JSON.stringify(cls));
    expect(cls.none).toBeGreaterThan(20000);
    expect(cls.blockOldFlush).toBeGreaterThan(500);
    expect(cls.blockOldRewound).toBe(0); // every old backward snap happened to an embedded body, which now passes
    expect(cls.passOldRewound).toBeGreaterThan(50);
    expect(cls.pass).toBeGreaterThan(100);
    expect(cls.clamp).toBeGreaterThan(0);
    expect(cls.pillarOnlyRow).toBeGreaterThan(300);
    expect(oracleMismatches((lv, b, size) => ({ hit: moveBody(lv, b, size), x: b.x }))).toBe(0);
  });

  it("mutation check: the buggy 7afd035 criterion is rejected by the same oracle comparison", () => {
    const bad = oracleMismatches(buggyMoveX);
    console.log("mutation (7afd035 criterion) oracle mismatches", bad);
    expect(bad).toBeGreaterThan(100);
  });

  it("dense far-out samples (|x|,|y| up to 1e4, above and below the field, off the grid sideways): vertical physics equals the old unbounded scans, walls equal the oracle", () => {
    const r2 = new Rng(99);
    const lvs = [TEST_LEVEL, PILLAR_LEFT, levels[5]!];
    let n = 0;
    let landed = 0;
    for (let i = 0; i < 40000; i++) {
      const lv = lvs[i % lvs.length]!;
      const size = [12, PLAYER_SIZE, 16][r2.int(3)]!;
      const wide = r2.int(2) === 0;
      const s: Body = {
        x: wide ? (r2.next() - 0.5) * 2e4 : (r2.next() - 0.2) * 320,
        y: r2.int(2) === 0 ? (r2.next() - 0.5) * 2e4 : -40 + r2.next() * 320,
        vx: i % 3 === 0 ? 0 : (r2.int(33) - 16) / 10,
        vy: (r2.next() - 0.6) * 8,
        onGround: false,
      };
      const a = { ...s };
      const nw = { ...s };
      const o = oldMove(lv, a, size);
      const hit = moveBody(lv, nw, size);
      const v = shouldPassWall(lv, s, size);
      expect(hit).toBe(v.verdict === "block");
      expect(nw.x).toBe(v.verdict === "block" ? v.flush : s.x + s.vx);
      if (!o.clamp && nw.x === a.x) {
        expect([nw.y, nw.vy, nw.onGround]).toEqual([a.y, a.vy, a.onGround]);
        if (a.onGround) landed++;
      }
      n++;
    }
    console.log("dense far-out samples", n, "landings", landed);
    expect(landed).toBeGreaterThan(1000);
  });
});
