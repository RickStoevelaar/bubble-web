import type { LevelData } from "../../src";

/**
 * Per-worker memo for the slow reach analyses. Vitest runs each test file in its own worker with a fresh module
 * graph, so this Map belongs to one test file only: nothing is shared across files (the lint helper and the door
 * helper each run in their own file and keep their own entries; the door helper uses its own label, "door-stands"). The key is the round, the
 * tiles and a label for what was computed, so a changed level can never hit a stale entry.
 */
const cache = new Map<string, unknown>();

export function memoised<T>(level: LevelData, label: string, compute: () => T): T {
  const key = `${level.round}|${label}|${level.tiles.join("")}|${JSON.stringify(level.enemies)}`;
  if (!cache.has(key)) cache.set(key, compute());
  return cache.get(key) as T;
}
