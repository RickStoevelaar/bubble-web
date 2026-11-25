import { FIELD_H, GRID_H, GRID_W, TILE, TUNING } from "../constants";
import { isSolid } from "../level";
import type { LevelData } from "../level";
import { moveBody } from "../sim/physics";
import { PLAYER_SIZE } from "../sim/player";
import { TEST_LEVEL } from "./test-level";

/**
 * Reachability analysis for level authoring: which spots a player can stand on, and whether they can always get
 * back. It drives the sim's own `moveBody`, so walking, jumping, dropping, falling and the vertical wrap all
 * behave exactly as in play. Pure and deterministic (no clocks, no randomness).
 */

/** The jump the layouts must be solvable with: at least 4 px weaker than the real one (`TUNING.jumpVel` is upward-negative). */
export const MARGIN_JUMP = TUNING.jumpVel + 0.15;

/** Standing-position graph produced by `analyseStands`. Node keys are `"x,y"` (body centre in pixels). */
export interface StandGraph {
  nodes: Map<string, { x: number; y: number }>;
  /** Reachable from a spawn. */
  forward: Set<string>;
  /** Of those, the ones that can get back to a spawn: the spawn's strongly connected component. */
  component: Set<string>;
  /** Reachable but unable to return (one-way traps). */
  trapped: string[];
  /** Largest height (px) a jump gained between a standing spot and the next one, wrap falls excluded. */
  maxRise: number;
}

/**
 * Standing-position graph by real physics. Nodes are positions where a body rests (integer x, y on a tile top);
 * edges are what one input policy (walk, or jump then a direction for t1 ticks and another after) reaches
 * through the sim's own `moveBody`, so walking, jumping, dropping and falling are all covered. `jumpVel` lets
 * the caller use a weaker jump to demand a safety margin.
 *
 * `starts` are body-centre positions already resting on a floor (see `startsOfTiles`).
 */
export function analyseStands(lv: LevelData, starts: { x: number; y: number }[], jumpVel: number = TUNING.jumpVel): StandGraph {
  const nodes = new Map<string, { x: number; y: number }>();
  const out = new Map<string, Set<string>>();
  const queue: string[] = [];
  const key = (x: number, y: number): string => `${x},${y}`;
  const add = (x: number, y: number, from?: string): void => {
    const k = key(x, y);
    if (!nodes.has(k)) {
      nodes.set(k, { x, y });
      queue.push(k);
    }
    if (from !== undefined && from !== k) {
      let set = out.get(from);
      if (!set) out.set(from, (set = new Set()));
      set.add(k);
    }
  };
  const startKeys = starts.map((s) => key(s.x, s.y));
  for (const s of starts) add(s.x, s.y);
  const dirs = [-1, 0, 1];
  const t1s = [0, 2, 4, 6, 8, 10, 12, 14, 16, 20, 30, 40, 50];
  const body = { x: 0, y: 0, vx: 0, vy: 0, onGround: true };
  let maxRise = 0;
  const simulate = (from: string, x: number, y: number, jump: boolean, d1: number, t1: number, d2: number, total: number): void => {
    body.x = x;
    body.y = y;
    body.vx = 0;
    body.vy = 0;
    body.onGround = true;
    let wrapped = false;
    let prevY = y;
    for (let t = 0; t < total; t++) {
      body.vx = (t < t1 ? d1 : d2) * TUNING.walkSpeed;
      if (jump && t === 0) {
        body.vy = jumpVel;
        body.onGround = false;
      }
      moveBody(lv, body, PLAYER_SIZE);
      // Falling out of the bottom reappears at the top: that is a drop, not a rise.
      if (body.y < prevY - FIELD_H / 2) wrapped = true;
      prevY = body.y;
      if (body.onGround) {
        if (!wrapped) maxRise = Math.max(maxRise, y - body.y);
        add(Math.round(body.x), body.y, from);
        if (jump) return;
      }
    }
  };
  for (let i = 0; i < queue.length; i++) {
    const k = queue[i]!;
    const s = nodes.get(k)!;
    for (const d of dirs) simulate(k, s.x, s.y, false, d, 200, d, 200);
    for (const d1 of dirs) for (const d2 of dirs) for (const t1 of t1s) simulate(k, s.x, s.y, true, d1, t1, d2, 160);
  }
  const forward = new Set(nodes.keys());
  const back = new Map<string, string[]>();
  for (const [from, tos] of out) {
    for (const to of tos) {
      const list = back.get(to);
      if (list) list.push(from);
      else back.set(to, [from]);
    }
  }
  const component = new Set<string>(startKeys);
  const stack = [...startKeys];
  while (stack.length > 0) {
    for (const prev of back.get(stack.pop()!) ?? []) {
      if (!component.has(prev)) {
        component.add(prev);
        stack.push(prev);
      }
    }
  }
  const trapped = [...forward].filter((k) => !component.has(k));
  return { nodes, forward, component, trapped, maxRise };
}

/** Height a free jump with `vel` gains, measured by simulating it. */
export function jumpApex(vel: number): number {
  const floorY = 26 * TILE - PLAYER_SIZE / 2;
  const body = { x: 60, y: floorY, vx: 0, vy: vel, onGround: false };
  let top = body.y;
  for (let t = 0; t < 120; t++) {
    moveBody(TEST_LEVEL, body, PLAYER_SIZE);
    top = Math.min(top, body.y);
  }
  return floorY - top;
}

/** Body-centre start positions for spawn tiles (the empty tile a player stands in, floor directly below it). */
export function startsOfTiles(tiles: readonly { col: number; row: number }[]): { x: number; y: number }[] {
  return tiles.map((t) => ({ x: t.col * TILE + TILE / 2, y: t.row * TILE + 1 }));
}

/** A horizontal run of platform tiles: row `row`, columns `from`..`to` inclusive. */
export interface PlatformRun {
  row: number;
  from: number;
  to: number;
}

/**
 * Standing runs (2+ adjacent tile tops with two empty rows above) in open space that no node of `reached` stands
 * on. "Open space" = covered by a 2x2 empty block reachable from the spawn blocks through 2x2 blocks, so slits and
 * sealed pockets do not count. Unreached tiles are grouped into runs per row, top to bottom.
 */
export function unreachedRuns(lv: LevelData, reached: Iterable<{ x: number; y: number }>, spawns: readonly { col: number; row: number }[]): PlatformRun[] {
  const fat = (x: number, y: number): boolean =>
    x >= 0 && x + 1 < GRID_W && y >= 0 && y + 1 < GRID_H && !isSolid(lv, x, y) && !isSolid(lv, x + 1, y) && !isSolid(lv, x, y + 1) && !isSolid(lv, x + 1, y + 1);
  const seen = new Set<string>();
  const open = new Set<string>();
  const stack: [number, number][] = [];
  for (const s of spawns) {
    for (let dy = -2; dy <= 0; dy++) for (let dx = -1; dx <= 0; dx++) stack.push([s.col + dx, s.row + dy]);
  }
  while (stack.length > 0) {
    const [x, y] = stack.pop()!;
    if (!fat(x, y) || seen.has(`${x},${y}`)) continue;
    seen.add(`${x},${y}`);
    for (const [cx, cy] of [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]] as const) open.add(`${cx},${cy}`);
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  const standable = (tx: number, ty: number): boolean => isSolid(lv, tx, ty) && open.has(`${tx},${ty - 1}`) && open.has(`${tx},${ty - 2}`);
  const spots = [...reached];
  const runs: PlatformRun[] = [];
  for (let ty = 2; ty < GRID_H; ty++) {
    const standY = ty * TILE - PLAYER_SIZE / 2;
    let run: PlatformRun | null = null;
    for (let tx = 0; tx < GRID_W; tx++) {
      let missed = false;
      if (standable(tx, ty) && (standable(tx + 1, ty) || standable(tx - 1, ty))) {
        missed = !spots.some((s) => s.y === standY && s.x > tx * TILE - PLAYER_SIZE / 2 && s.x < (tx + 1) * TILE + PLAYER_SIZE / 2);
      }
      if (missed) {
        if (run) run.to = tx;
        else runs.push((run = { row: ty, from: tx, to: tx }));
      } else run = null;
    }
  }
  return runs;
}
