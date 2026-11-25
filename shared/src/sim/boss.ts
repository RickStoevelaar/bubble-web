import { FIELD_H, GRID_H, GRID_W, TILE, TUNING } from "../constants";
import { isSolid } from "../level";
import type { EnemySpawn, LevelData } from "../level";
import type { EnemyState, GameState, PlayerState } from "../types";
import type { Behavior, EnemySim } from "./enemy-common";
import { spawnProjectile } from "./projectiles";

/*
 * The final boss: creation, behavior, volleys and the ending rule.
 *
 * RNG RULE. The boss is fully determined by its state. The ONLY random draw in all boss logic is one
 * two-way draw in `pickTarget`, made once per volley and only when two players are alive at exactly the same
 * distance from the boss (it picks which of the two to aim at). With one player, or any other geometry, a
 * volley draws nothing. Thunder shots and boss damage (thunder.ts) draw nothing at all.
 *
 * Fight rules: it flies diagonally forever (reflecting off the arena's side walls, the ceiling of the field and
 * the floor, passing through ledges), cannot be trapped, popped or killed by anything but thunder shots, never
 * becomes angry, and enrages at hp * 3 <= maxHp (integer comparison).
 */

const HALF = TUNING.bossSize / 2;

/** Boss fields in their one fixed key order (same for new, restored and repaired bosses). */
interface BossFields {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  dir: 1 | -1;
  state: EnemyState["state"];
  angry: boolean;
  spawnDelay: number;
  onGround: boolean;
  hp: number;
  maxHp: number;
  stun: number;
  volley: number;
  volleyIndex: number;
}

/** The one place a boss object is built. */
function buildBoss(f: BossFields): EnemyState {
  return {
    id: f.id,
    type: "boss",
    x: f.x,
    y: f.y,
    vx: f.vx,
    vy: f.vy,
    dir: f.dir,
    state: f.state,
    angry: f.angry,
    spawnDelay: f.spawnDelay,
    onGround: f.onGround,
    hp: f.hp,
    maxHp: f.maxHp,
    stun: f.stun,
    volley: f.volley,
    volleyIndex: f.volleyIndex,
  };
}

/** Players still in the run (anything but "gone"). */
export function presentPlayers(state: Pick<GameState, "players">): number {
  return state.players.filter((p) => p.state !== "gone").length;
}

/** Starting hit points for `present` players. */
export function bossMaxHp(present: number, superMode: boolean): number {
  return (TUNING.bossHpBase + TUNING.bossHpPerPlayer * present) * (superMode ? TUNING.bossSuperHpMult : 1);
}

/** A fresh boss for a level spawn (takes the next shared id). Never angry, even in Super mode. */
export function newBoss(state: GameState, s: EnemySpawn): EnemyState {
  const maxHp = bossMaxHp(presentPlayers(state), state.superMode);
  return buildBoss({
    id: state.nextId++,
    x: s.col * TILE + TILE / 2,
    y: (s.row + 1) * TILE - HALF,
    vx: 0,
    vy: 0,
    dir: 1,
    state: "spawning",
    angry: false,
    spawnDelay: s.delayTicks,
    onGround: false,
    hp: maxHp,
    maxHp,
    stun: 0,
    volley: TUNING.bossVolleyTicks,
    volleyIndex: 0,
  });
}

const num = (v: unknown, d: number): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
const nat = (v: unknown, d: number): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : d);

/** Restores a boss from a save: missing or damaged boss fields get their defaults; the object is rebuilt in the fixed key order. */
export function repairBoss(e: EnemyState, state: Pick<GameState, "players" | "superMode">): EnemyState {
  const fallback = bossMaxHp(presentPlayers(state), state.superMode);
  const maxHp = Math.max(1, nat(e.maxHp, fallback));
  return buildBoss({
    id: e.id,
    x: e.x,
    y: e.y,
    vx: num(e.vx, 0),
    vy: num(e.vy, 0),
    dir: e.dir === -1 ? -1 : 1,
    state: e.state,
    angry: false,
    spawnDelay: nat(e.spawnDelay, 0),
    onGround: false,
    hp: Math.min(maxHp, Math.max(1, nat(e.hp, maxHp))),
    maxHp,
    stun: nat(e.stun, 0),
    volley: nat(e.volley, TUNING.bossVolleyTicks),
    volleyIndex: nat(e.volleyIndex, 0),
  });
}

/** True once the boss is at a third of its hit points or less. */
export function isEnraged(e: EnemyState): boolean {
  return (e.hp ?? 0) * 3 <= (e.maxHp ?? 0);
}

const speedOf = (e: EnemyState): number => (isEnraged(e) ? TUNING.bossSpeed * TUNING.bossEnrageSpeedMult : TUNING.bossSpeed);
const intervalOf = (e: EnemyState): number =>
  isEnraged(e) ? Math.floor(TUNING.bossVolleyTicks * TUNING.bossEnrageVolleyMult) : TUNING.bossVolleyTicks;

// --- the arena it bounces in ---------------------------------------------------------------------------------

function isSideWall(lv: LevelData, tx: number): boolean {
  for (let ty = 0; ty < GRID_H; ty++) if (!isSolid(lv, tx, ty)) return false;
  return true;
}

function isFullRow(lv: LevelData, ty: number): boolean {
  for (let tx = 0; tx < GRID_W; tx++) if (!isSolid(lv, tx, ty)) return false;
  return true;
}

/** Inner edges (px) of the arena: solid border columns on both sides, the top of the full-width floor slab at the bottom. */
function arenaBounds(lv: LevelData): { left: number; right: number; floor: number } {
  let l = 0;
  while (l < GRID_W && isSideWall(lv, l)) l++;
  let r = GRID_W - 1;
  while (r >= 0 && isSideWall(lv, r)) r--;
  let f = GRID_H;
  while (f > 0 && isFullRow(lv, f - 1)) f--;
  return { left: l * TILE, right: (r + 1) * TILE, floor: f === GRID_H ? FIELD_H : f * TILE };
}

function move(lv: LevelData, e: EnemyState): void {
  const { left, right, floor } = arenaBounds(lv);
  const speed = speedOf(e);
  let dirY = e.vy < 0 ? -1 : 1;
  let x = e.x + e.dir * speed;
  // A bounce mirrors the overshoot about the wall, so the boss moves on the bounce tick too.
  if (x - HALF < left) {
    x = 2 * (left + HALF) - x;
    e.dir = 1;
  } else if (x + HALF > right) {
    x = 2 * (right - HALF) - x;
    e.dir = -1;
  }
  let y = e.y + dirY * speed;
  if (y - HALF < 0) {
    y = 2 * HALF - y;
    dirY = 1;
  } else if (y + HALF > floor) {
    y = 2 * (floor - HALF) - y;
    dirY = -1;
  }
  e.x = x;
  e.y = y;
  e.vx = e.dir * speed;
  e.vy = dirY * speed;
  e.onGround = false;
}

// --- volleys -------------------------------------------------------------------------------------------------

/** Nearest alive player (Manhattan distance, as everywhere); the one documented rng draw breaks an exact two-way tie. */
function pickTarget(sim: EnemySim, e: EnemyState): PlayerState | undefined {
  let best: PlayerState | undefined;
  let tie: PlayerState | undefined;
  let bestD = Infinity;
  for (const p of sim.state.players) {
    if (p.state !== "alive") continue;
    const d = Math.abs(p.x - e.x) + Math.abs(p.y - e.y);
    if (d < bestD) {
      best = p;
      bestD = d;
      tie = undefined;
    } else if (d === bestD) tie = p;
  }
  if (best && tie) return sim.rng.int(2) === 0 ? best : tie;
  return best;
}

/** Throws the fan of rocks toward the target's side, plus a flame along the boss' lower edge on odd volleys. Does nothing if nobody is alive. */
function volley(sim: EnemySim, e: EnemyState): void {
  const t = pickTarget(sim, e);
  if (!t) return;
  const toward = t.x > e.x ? 1 : t.x < e.x ? -1 : e.dir;
  const offsets = TUNING.bossFanOffsets;
  for (let i = 0; i < TUNING.bossVolleySize; i++) {
    spawnProjectile(sim.state, "rock", e.x, e.y, toward * TUNING.rockSpeedX + offsets[i % offsets.length]!, TUNING.rockLaunchVy);
  }
  if ((e.volleyIndex ?? 0) % 2 === 1) {
    spawnProjectile(sim.state, "flame", e.x + toward * (HALF + TILE / 4), e.y + HALF - TILE / 2, toward * TUNING.flameSpeed, 0);
  }
  e.volleyIndex = (e.volleyIndex ?? 0) + 1;
  e.volley = intervalOf(e);
}

/** One tick of an active boss: frozen while staggered, otherwise the volley countdown, then the flight. */
export const bossBehavior: Behavior = (sim, e) => {
  if ((e.stun ?? 0) > 0) {
    e.stun!--;
    return;
  }
  if ((e.volley ?? 0) > 0) e.volley!--;
  if (e.volley === 0) volley(sim, e);
  move(sim.currentLevel, e);
};

// --- endings -------------------------------------------------------------------------------------------------

/** The true ending needs two seats, neither of them gone. */
export function resolveEnding(state: Pick<GameState, "players">): "bad" | "true" {
  return state.players.length === 2 && state.players.every((p) => p.state !== "gone") ? "true" : "bad";
}

/** The one way a run reaches the ending phase (boss kill, last round cleared, last treasure room left). */
export function beginEnding(state: GameState): void {
  state.phase = "ending";
  state.runOver = true;
  state.endingTicks = 0;
  state.ending = resolveEnding(state);
}
