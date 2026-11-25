import { PLAYER_SIZE, Sim, TILE, TUNING, analyseStands, maybeSpawnDoor, playerSpawnTiles, startsOfTiles } from "../../src";
import type { ItemState, LevelData } from "../../src";

/**
 * Where the real sim puts the secret door when `round` of `levels` is cleared by deathless players: runs the
 * sim's own `maybeSpawnDoor` (no duplicated placement rule). Returns the door item, or null when none spawns.
 */
export function doorItem(levels: LevelData[], round: number): ItemState | null {
  const sim = new Sim(levels, 1, { playerCount: 2, startRound: round });
  for (const p of sim.state.players) p.deathlessSince = 0;
  maybeSpawnDoor(sim);
  return sim.state.items.find((i) => i.kind === "door") ?? null;
}

/** The door's platform tile and whether a player starting at a spawn can stand on it (a standing node under the door). */
export function doorReachability(levels: LevelData[], round: number): { tile: { tx: number; ty: number }; item: ItemState; reachable: boolean } | null {
  const item = doorItem(levels, round);
  if (!item) return null;
  const level = levels[round - 1]!;
  const tx = Math.floor(item.x / TILE);
  const ty = Math.round((item.y + TUNING.itemSize / 2) / TILE);
  const spawns = playerSpawnTiles(level).filter((s): s is { col: number; row: number } => s !== null);
  const g = analyseStands(level, startsOfTiles(spawns));
  const standY = ty * TILE - PLAYER_SIZE / 2;
  const reachable = [...g.reachFrom[0]!].some((k) => {
    const n = g.nodes.get(k)!;
    return n.y === standY && Math.abs(n.x - item.x) <= TILE;
  });
  return { tile: { tx, ty }, item, reachable };
}
