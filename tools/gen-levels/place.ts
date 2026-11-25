import { GRID_H, GRID_W, Rng, playerSpawnTiles } from "@bubble/shared";
import type { DriftCell, EnemySpawn, LevelData } from "@bubble/shared";
import type { DriftSpec, EnemyGroup, EnemySpec, PlacedEnemyType } from "./types";

/** Spawn points keep at least this many tiles (Euclidean) between them and any enemy. */
export const SPAWN_CLEARANCE = 7;
const GROUND: ReadonlySet<PlacedEnemyType> = new Set(["walker", "chaser", "thrower", "breather"]);

type Pt = { col: number; row: number };
const solid = (tiles: readonly string[], c: number, r: number): boolean => c < 0 || c >= GRID_W || (r >= 0 && r < GRID_H && tiles[r]![c] === "#");

/** Tiles a ground-bound enemy may start on: standing room (two empty tiles above) inside a platform run. */
function groundCandidates(tiles: readonly string[], strict: boolean): Pt[] {
  const out: Pt[] = [];
  const stand = (c: number, r: number): boolean => solid(tiles, c, r) && !solid(tiles, c, r - 1) && !solid(tiles, c, r - 2);
  for (let r = 4; r < GRID_H - 1; r++) {
    for (let c = 3; c <= GRID_W - 4; c++) {
      if (!stand(c, r)) continue;
      if (strict && !(stand(c - 1, r) && stand(c + 1, r))) continue;
      out.push({ col: c, row: r - 1 });
    }
  }
  return out;
}

/** Tiles a flyer or bouncer may start on: open interior with a clear 3x3 neighbourhood. */
function airCandidates(tiles: readonly string[], size: number): Pt[] {
  const out: Pt[] = [];
  for (let r = 4; r <= GRID_H - 6; r++) {
    for (let c = 4; c <= GRID_W - 5; c++) {
      let clear = true;
      for (let dy = -size; dy <= size && clear; dy++) for (let dx = -size; dx <= size; dx++) if (solid(tiles, c + dx, r + dy)) clear = false;
      if (clear) out.push({ col: c, row: r });
    }
  }
  return out;
}

const inZone = (p: Pt, g: EnemyGroup): boolean => {
  if (g.zone === "low" && p.row < 17) return false;
  if (g.zone === "mid" && (p.row < 9 || p.row > 16)) return false;
  if (g.zone === "high" && p.row > 8) return false;
  if (g.side === "left" && p.col >= 16) return false;
  if (g.side === "right" && p.col < 16) return false;
  return true;
};

/**
 * Turns enemy specs into spawns. Groups are placed one enemy at a time by a jittered farthest-point rule, so the
 * enemies spread over the tiers; nothing lands within SPAWN_CLEARANCE tiles of a player spawn. Delays: the first
 * two spawn at once, the rest every `stagger` ticks.
 */
export function placeEnemies(tiles: readonly string[], specs: readonly EnemySpec[], rng: Rng, stagger: number): EnemySpawn[] {
  const spawns = playerSpawnTiles({ tiles } as LevelData).filter((s): s is Pt => s !== null);
  const clear = (p: Pt): boolean => spawns.every((s) => Math.hypot(p.col - s.col, p.row - s.row) >= SPAWN_CLEARANCE);
  const chosen: { type: PlacedEnemyType; col: number; row: number; delay?: number }[] = [];
  const dist = (a: Pt, b: Pt): number => Math.hypot(a.col - b.col, (a.row - b.row) * 1.6);

  for (const spec of specs) {
    if ("col" in spec) {
      chosen.push({ type: spec.type, col: spec.col, row: spec.row, ...(spec.delayTicks !== undefined ? { delay: spec.delayTicks } : {}) });
      continue;
    }
    for (let i = 0; i < (spec.n ?? 1); i++) {
      const ground = GROUND.has(spec.type);
      let pool = (ground ? groundCandidates(tiles, true) : airCandidates(tiles, 1)).filter((p) => clear(p) && inZone(p, spec));
      if (pool.length === 0) pool = (ground ? groundCandidates(tiles, false) : airCandidates(tiles, 0)).filter((p) => clear(p) && inZone(p, spec));
      pool = pool.filter((p) => !chosen.some((c) => c.col === p.col && c.row === p.row));
      if (pool.length === 0) throw new Error(`no free spawn tile for ${spec.type} (zone ${spec.zone ?? "any"}, side ${spec.side ?? "any"})`);
      let best = pool[rng.int(pool.length)]!;
      if (chosen.length > 0) {
        let bestScore = -Infinity;
        for (const p of pool) {
          const score = Math.min(...chosen.map((c) => dist(p, c))) + rng.next() * 3;
          if (score > bestScore) {
            bestScore = score;
            best = p;
          }
        }
      }
      chosen.push({ type: spec.type, col: best.col, row: best.row });
    }
  }
  return chosen.map((c, i) => ({
    type: c.type,
    col: c.col,
    row: c.row,
    delayTicks: c.delay ?? (i < 2 ? 0 : (i - 1) * stagger),
  }));
}

/** Expands drift specs into cells (open tiles only), deduplicated, in row-major order. */
export function expandDrift(tiles: readonly string[], specs: readonly DriftSpec[]): DriftCell[] {
  const cells = new Map<string, DriftCell>();
  const put = (col: number, row: number, dx: number, dy: number): void => {
    if (col < 2 || col > GRID_W - 3 || row < 1 || row >= GRID_H || solid(tiles, col, row)) return;
    cells.set(`${row},${col}`, { col, row, dx, dy });
  };
  for (const s of specs) {
    if (s.kind === "area") {
      for (let r = s.row0; r <= s.row1; r++) for (let c = s.col0; c <= s.col1; c++) put(c, r, s.dx, s.dy);
    } else {
      const sign = s.clockwise === false ? -1 : 1;
      const w = s.width ?? 1;
      for (let layer = 0; layer < w; layer++) {
        const [c0, c1, r0, r1] = [s.col0 + layer, s.col1 - layer, s.row0 + layer, s.row1 - layer];
        for (let c = c0; c <= c1; c++) {
          put(c, r0, sign, 0); // top edge flows right when clockwise
          put(c, r1, -sign, 0); // bottom edge flows left
        }
        for (let r = r0 + 1; r < r1; r++) {
          put(c1, r, 0, sign); // right edge flows down
          put(c0, r, 0, -sign); // left edge flows up
        }
      }
    }
  }
  return [...cells.values()].sort((a, b) => a.row - b.row || a.col - b.col);
}
