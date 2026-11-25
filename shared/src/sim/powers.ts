import { FIELD_W, GRID_H, GRID_W, TILE, TUNING } from "../constants";
import { isSolid } from "../level";
import type { LevelData } from "../level";
import type { Rng } from "../rng";
import type { CounterKind, EnemyState, GameState, PlayerState, PowerId, SimEvent } from "../types";
import { startDeath } from "./enemy-common";
import { killTrapped } from "./enemies";
import { FOOD_BY_ENEMY, addScore, chainScore } from "./scoring";

/** What a power does when collected; `skip` and `clear` are the one-off effects, the rest are lasting. */
export type PowerEffect =
  | { kind: "flag"; flag: keyof PlayerState["powers"] }
  | { kind: "skip"; rounds: number }
  | { kind: "ring" }
  | { kind: "clear"; flood: boolean };

/**
 * Every power in one place, in rotation order: each player earns them in this order, cycling. A power is
 * earned once the player's `counter` reaches `threshold` x (cycle + 1), where cycle counts completed laps.
 */
export const POWER_TABLE: Record<PowerId, { counter: CounterKind; threshold: number; effect: PowerEffect }> = {
  boots: { counter: "jumps", threshold: TUNING.powerThreshold.boots, effect: { kind: "flag", flag: "speed" } },
  tonicA: { counter: "bubbles", threshold: TUNING.powerThreshold.tonicA, effect: { kind: "flag", flag: "rapidFire" } },
  parasolS: { counter: "distance", threshold: TUNING.powerThreshold.parasolS, effect: { kind: "skip", rounds: 3 } },
  tonicB: { counter: "bubbles", threshold: TUNING.powerThreshold.tonicB, effect: { kind: "flag", flag: "fastBubble" } },
  ring: { counter: "jumps", threshold: TUNING.powerThreshold.ring, effect: { kind: "ring" } },
  spark: { counter: "bubbles", threshold: TUNING.powerThreshold.spark, effect: { kind: "clear", flood: false } },
  tonicC: { counter: "bubbles", threshold: TUNING.powerThreshold.tonicC, effect: { kind: "flag", flag: "longBubble" } },
  parasolM: { counter: "distance", threshold: TUNING.powerThreshold.parasolM, effect: { kind: "skip", rounds: 5 } },
  flask: { counter: "jumps", threshold: TUNING.powerThreshold.flask, effect: { kind: "clear", flood: true } },
  parasolL: { counter: "distance", threshold: TUNING.powerThreshold.parasolL, effect: { kind: "skip", rounds: 7 } },
};

export const POWER_ORDER = Object.keys(POWER_TABLE) as PowerId[];

export function isPowerId(v: unknown): v is PowerId {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(POWER_TABLE, v);
}

/** The highest round a skip may reach. */
const MAX_ROUND = 99;

export interface PowerSim {
  state: GameState;
  currentLevel: LevelData;
  levels: LevelData[];
  rng: Rng;
}

/** Platform tiles: solid, two empty tiles above, outside the two border wall columns on each side. */
function platformSpots(lv: LevelData): { tx: number; ty: number }[] {
  const spots: { tx: number; ty: number }[] = [];
  for (let ty = 2; ty < GRID_H; ty++) {
    for (let tx = 2; tx < GRID_W - 2; tx++) {
      if (isSolid(lv, tx, ty) && !isSolid(lv, tx, ty - 1) && !isSolid(lv, tx, ty - 2)) spots.push({ tx, ty });
    }
  }
  return spots;
}

/**
 * Once per tick in phase "round": the first alive player (id order) whose next rotation counter has crossed
 * its threshold earns a power item, unless one is already on screen. Draws the rng exactly once per spawn.
 */
export function maybeSpawnItem(sim: PowerSim): void {
  const state = sim.state;
  if (state.phase !== "round") return;
  if (state.items.some((i) => i.kind === "power")) return;
  for (const p of state.players) {
    if (p.state !== "alive") continue;
    const id = POWER_ORDER[p.powerStep % POWER_ORDER.length]!;
    const row = POWER_TABLE[id];
    if (p.counters[row.counter] < row.threshold * (Math.floor(p.powerStep / POWER_ORDER.length) + 1)) continue;
    const spots = platformSpots(sim.currentLevel);
    if (spots.length === 0) return;
    const spot = spots[sim.rng.int(spots.length)]!;
    p.powerStep++;
    state.items.push({
      id: state.nextId++,
      x: spot.tx * TILE + TILE / 2,
      y: spot.ty * TILE - TUNING.itemSize / 2,
      vx: 0,
      vy: 0,
      onGround: false,
      kind: "power",
      sprite: 0,
      power: id,
      value: 0,
      despawnTicks: TUNING.powerItemTtlTicks,
    });
    return;
  }
}

/**
 * Every active or trapped enemy (not the hurry wisp or the boss) dies in id order; the n-th scores chainScore(n).
 * A trapped enemy goes through the same `killTrapped` as a normal pop (its arc and the pop event start at the
 * bubble, where the enemy visibly is); an orphan whose bubble is missing dies where it is.
 */
function popAll(sim: PowerSim, collector: 0 | 1, events: SimEvent[]): void {
  const state = sim.state;
  const victims = state.enemies
    .filter((e) => (e.state === "active" || e.state === "trapped") && e.type !== "hurry" && e.type !== "boss")
    .sort((a, b) => a.id - b.id);
  victims.forEach((e: EnemyState, i) => {
    const bubble = e.state === "trapped" ? state.bubbles.find((b) => b.trapped?.enemyId === e.id) : undefined;
    if (bubble) {
      killTrapped(state, bubble);
      state.bubbles = state.bubbles.filter((b) => b !== bubble);
    } else startDeath(e);
    events.push(...addScore(sim, collector, chainScore(i + 1)));
    events.push({ kind: "pop", player: collector, x: bubble ? bubble.x : e.x, y: bubble ? bubble.y : e.y });
  });
}

/** Rains floodFoodCount food items along the top of the field (one rng draw each, kinds cycle by index). */
function rainFood(sim: PowerSim): void {
  const state = sim.state;
  const foods = Object.values(FOOD_BY_ENEMY);
  const span = FIELD_W - 4 * TILE - TUNING.itemSize;
  for (let i = 0; i < TUNING.floodFoodCount; i++) {
    const food = foods[i % foods.length]!;
    state.items.push({
      id: state.nextId++,
      x: 2 * TILE + TUNING.itemSize / 2 + sim.rng.int(span),
      y: TILE + TUNING.itemSize / 2,
      vx: 0,
      vy: 0,
      onGround: false,
      kind: "food",
      sprite: food.sprite,
      value: food.value,
      despawnTicks: TUNING.foodTtlTicks,
    });
  }
}

/** Applies a collected power to its collector. Parasols only record the target; the tick's end loads it. */
export function applyPower(sim: PowerSim, p: PlayerState, power: PowerId, events: SimEvent[]): void {
  const fx = POWER_TABLE[power].effect;
  switch (fx.kind) {
    case "flag":
      p.powers[fx.flag] = true;
      break;
    case "skip": {
      const target = Math.min(sim.state.round + fx.rounds, MAX_ROUND, sim.levels.length);
      if (target > sim.state.round) sim.state.pendingRound = Math.max(sim.state.pendingRound, target);
      break;
    }
    case "ring":
      p.ringTicks = TUNING.ringTicks;
      break;
    case "clear":
      popAll(sim, p.id, events);
      if (fx.flood) rainFood(sim);
      break;
  }
}

/** Last stage of a tick: a parasol's round change, resolved only when play is still going. */
export function resolvePendingRound(sim: PowerSim & { loadRound(n: number): void }, events: SimEvent[]): void {
  const state = sim.state;
  const target = state.pendingRound;
  if (target === 0) return;
  state.pendingRound = 0;
  if (state.runOver || (state.phase !== "round" && state.phase !== "clearing") || target <= state.round) return;
  sim.loadRound(target);
  events.push({ kind: "clear" });
}
