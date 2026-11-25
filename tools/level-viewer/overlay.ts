import { PLAYER_SIZE, TILE, lintReport } from "@bubble/shared";
import type { DriftCell, EnemyType, LevelData, LevelStats, LintIssue, LintOptions, PlatformRun } from "@bubble/shared";

/** A standing position as the viewer draws it: body-centre pixels plus the tile it rests on. */
export interface OverlayNode {
  x: number;
  y: number;
  /** Column of the body centre. */
  col: number;
  /** Row of the tile under the feet. */
  row: number;
}

export interface Overlay {
  /** Standing positions (green). */
  nodes: OverlayNode[];
  /** Positions a player can reach but not return from (red). */
  trapped: OverlayNode[];
  /** Platform runs nobody can reach (red). */
  unreachableRuns: PlatformRun[];
  /** Wrap-hazard columns (orange). */
  wrapColumns: number[];
  spawns: { player: 1 | 2; col: number; row: number }[];
  enemies: { type: EnemyType; letter: string; col: number; row: number }[];
  drift: DriftCell[];
  stats: LevelStats;
  issues: LintIssue[];
}

const LETTERS: Record<EnemyType, string> = { walker: "W", chaser: "C", thrower: "T", breather: "B", bouncer: "O", flyer: "F", boss: "X", hurry: "?" };

/** One-letter marker for an enemy type (W walker, C chaser, T thrower, B breather, O bouncer, F flyer, X boss). */
export function enemyLetter(type: EnemyType): string {
  return LETTERS[type] ?? "?";
}

const asNode = (p: { x: number; y: number }): OverlayNode => ({ x: p.x, y: p.y, col: Math.floor(p.x / TILE), row: Math.round((p.y + PLAYER_SIZE / 2) / TILE) });

/** Everything the viewer paints on top of the tiles, from the lint library. Never throws on a malformed level. */
export function computeOverlay(level: LevelData, opts: LintOptions = {}): Overlay {
  const report = lintReport(level, opts);
  const enemies = Array.isArray(level?.enemies) ? level.enemies : [];
  const drift = Array.isArray(level?.drift) ? level.drift : [];
  return {
    nodes: report.graph ? [...report.graph.nodes.values()].map(asNode) : [],
    trapped: report.trapped.map(asNode),
    unreachableRuns: report.unreachableRuns,
    wrapColumns: report.wrapColumns,
    spawns: report.spawns.map((s, i) => ({ player: (i === 0 ? 1 : 2) as 1 | 2, col: s.col, row: s.row })),
    enemies: enemies
      .filter((e) => e && typeof e === "object")
      .map((e) => ({ type: e.type, letter: enemyLetter(e.type), col: e.col, row: e.row })),
    drift: drift.filter((d) => d && typeof d === "object").map((d) => ({ col: d.col, row: d.row, dx: d.dx, dy: d.dy })),
    stats: report.stats,
    issues: report.issues,
  };
}

/** Parses the textarea contents. Returns the level or a message; never throws. */
export function parseLevelText(text: string): { level?: LevelData; error?: string } {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch (e) {
    return { error: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (typeof v !== "object" || v === null || Array.isArray(v)) return { error: "A level must be a JSON object" };
  return { level: v as LevelData };
}

const one = (v: unknown): string => JSON.stringify(v);

/**
 * Normalised level JSON: keys in LevelData order, tiles as an array of strings (one per line), one spawn or drift
 * cell per line, a trailing newline. Unknown keys are dropped; parsing the result gives back the same level.
 */
export function normalizeLevelJson(level: LevelData): string {
  const list = (items: string[], indent: string): string => (items.length === 0 ? "[]" : `[\n${items.map((i) => `${indent}  ${i}`).join(",\n")}\n${indent}]`);
  const parts = [
    `  "round": ${one(level.round)}`,
    `  "theme": ${one(level.theme)}`,
    `  "tiles": ${list(level.tiles.map(one), "  ")}`,
    `  "enemies": ${list(level.enemies.map((e) => `{ "type": ${one(e.type)}, "col": ${one(e.col)}, "row": ${one(e.row)}, "delayTicks": ${one(e.delayTicks)} }`), "  ")}`,
    `  "drift": ${list(level.drift.map((d) => `{ "col": ${one(d.col)}, "row": ${one(d.row)}, "dx": ${one(d.dx)}, "dy": ${one(d.dy)} }`), "  ")}`,
  ];
  if (level.flags !== undefined) {
    const f = level.flags;
    const keys = (["waterBubbles", "fireBubbles", "lightningBubbles"] as const).filter((k) => f[k] !== undefined);
    parts.push(`  "flags": { ${keys.map((k) => `"${k}": ${one(f[k])}`).join(", ")} }`);
  }
  return `{\n${parts.join(",\n")}\n}\n`;
}
