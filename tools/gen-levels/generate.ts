import { BOSS_ARENA, Rng } from "@bubble/shared";
import type { LevelData } from "@bubble/shared";
import { assertGrid } from "./invariants";
import { expandDrift, placeEnemies } from "./place";
import { ROUNDS } from "./rounds/index";
import { TEMPLATES } from "./templates/index";
import type { RoundDef } from "./types";

const FLAG_ORDER = ["waterBubbles", "fireBubbles", "lightningBubbles"] as const;

/** Expands one round definition into a level: tiles (template or hand-drawn), enemies, drift and flags. */
export function buildLevel(def: RoundDef): LevelData {
  if (def.boss) {
    assertGrid(BOSS_ARENA.tiles, `round ${def.round}`);
    return structuredClone({ ...BOSS_ARENA, round: def.round });
  }
  const seed = def.seed ?? def.round * 1009 + 17;
  let tiles: string[];
  if (def.tiles) tiles = [...def.tiles];
  else {
    const tpl = TEMPLATES[def.template];
    if (!tpl) throw new Error(`round ${def.round}: unknown template "${def.template}"`);
    tiles = tpl.build(def.params, new Rng(seed));
  }
  assertGrid(tiles, `round ${def.round}`);
  const enemies = placeEnemies(tiles, def.enemies, new Rng((seed ^ 0x9e3779b9) >>> 0), def.stagger ?? 60);
  const level: LevelData = { round: def.round, theme: def.theme, tiles, enemies, drift: expandDrift(tiles, def.drift ?? []) };
  const flags: NonNullable<LevelData["flags"]> = {};
  for (const k of FLAG_ORDER) if (def.flags?.[k]) flags[k] = true;
  if (Object.keys(flags).length > 0) level.flags = flags;
  return level;
}

/** All levels for `defs` (default: every round file), in round order. */
export function generateLevels(defs: readonly RoundDef[] = ROUNDS): LevelData[] {
  return defs.map(buildLevel);
}

/** The committed file's exact text: normalized key order, 2-space indent, trailing newline. */
export function serializeLevels(levels: readonly LevelData[]): string {
  const norm = levels.map((l) => ({
    round: l.round,
    theme: l.theme,
    tiles: l.tiles,
    enemies: l.enemies.map((e) => ({ type: e.type, col: e.col, row: e.row, delayTicks: e.delayTicks })),
    drift: l.drift.map((d) => ({ col: d.col, row: d.row, dx: d.dx, dy: d.dy })),
    ...(l.flags ? { flags: l.flags } : {}),
  }));
  return `${JSON.stringify(norm, null, 2)}\n`;
}

export function generateJson(defs: readonly RoundDef[] = ROUNDS): string {
  return serializeLevels(generateLevels(defs));
}

/** Line endings folded to LF, so a CRLF checkout (git autocrlf) still compares equal to a fresh run. */
export function normalizeNewlines(text: string): string {
  return text.split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
}
