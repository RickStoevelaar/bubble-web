import { TUNING } from "../constants";
import type { LevelData } from "../level";
import type { EnemyState, GameState, ItemState, SimEvent } from "../types";
import { moveBody } from "./physics";
import { PLAYER_SIZE } from "./player";
import { FOOD_BY_ENEMY, addScore } from "./scoring";

/** Drops the food of a popped enemy where its death arc ended (bottoms aligned, since items are smaller). */
export function spawnFood(state: GameState, e: EnemyState): void {
  if (e.type === "hurry") return;
  const food = FOOD_BY_ENEMY[e.type];
  state.items.push({
    id: state.nextId++,
    x: e.x,
    y: e.y + (TUNING.enemySize - TUNING.itemSize) / 2,
    vx: 0,
    vy: 0,
    onGround: false,
    kind: "food",
    sprite: food.sprite,
    value: food.value,
    despawnTicks: TUNING.foodTtlTicks,
  });
}

/** Falls, ages and collects every item in id (array) order; the lower player id wins a shared item. */
export function stepItems(sim: { state: GameState; currentLevel: LevelData }): SimEvent[] {
  const events: SimEvent[] = [];
  const state = sim.state;
  const reach = (TUNING.itemSize + PLAYER_SIZE) / 2;
  const kept: ItemState[] = [];
  for (const it of state.items) {
    if (--it.despawnTicks <= 0) continue;
    moveBody(sim.currentLevel, it, TUNING.itemSize);
    const p = state.players.find(
      (q) => q.state === "alive" && Math.abs(q.x - it.x) < reach && Math.abs(q.y - it.y) < reach,
    );
    if (!p) {
      kept.push(it);
      continue;
    }
    events.push({ kind: "collect", player: p.id, x: it.x, y: it.y }, ...addScore(sim, p.id, it.value));
  }
  state.items = kept;
  return events;
}

const KINDS: readonly string[] = ["food", "power", "treasure"];
const num = (v: unknown, d: number): number => (typeof v === "number" && Number.isFinite(v) ? v : d);

/** Restores items from an older or damaged save: unpositioned ones are dropped, missing fields get food defaults. */
export function repairItems(raw: unknown): ItemState[] {
  if (!Array.isArray(raw)) return [];
  const out: ItemState[] = [];
  for (const r of raw as Partial<ItemState>[]) {
    if (typeof r !== "object" || r === null) continue;
    if (!Number.isFinite(r.id) || !Number.isFinite(r.x) || !Number.isFinite(r.y)) continue;
    out.push({
      id: r.id!,
      x: r.x!,
      y: r.y!,
      vx: num(r.vx, 0),
      vy: num(r.vy, 0),
      onGround: r.onGround === true,
      kind: KINDS.includes(r.kind as string) ? r.kind! : "food",
      sprite: Number.isInteger(r.sprite) && r.sprite! >= 0 && r.sprite! <= 7 ? r.sprite! : 0,
      value: num(r.value, 100),
      despawnTicks: num(r.despawnTicks, TUNING.foodTtlTicks),
    });
  }
  return out;
}
