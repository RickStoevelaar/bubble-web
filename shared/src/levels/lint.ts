import { GRID_H, GRID_W, TILE, TUNING } from "../constants";
import { validateLevel } from "../level";
import type { EnemySpawn, EnemyType, LevelData } from "../level";
import { playerSpawnTiles } from "../sim/spawn";
import { PLAYER_SIZE } from "../sim/player";
import { MARGIN_JUMP, analyseStands, jumpApex, startsOfTiles, unreachedRuns } from "./reach";
import type { PlatformRun, StandGraph } from "./reach";

/**
 * Level quality gate. `lintLevel` checks one level, `lintRamp` a whole ordered list. Every issue has a stable
 * `code`; errors fail the gate, warnings are advice. Pure and deterministic.
 */

export interface LintIssue {
  severity: "error" | "warn";
  code: string;
  message: string;
  col?: number;
  row?: number;
  /** Round the issue belongs to (set by `lintRamp`, and by tools that lint lists). */
  round?: number;
}

/** What the level is for: the rules adapt (secret rooms hold no enemies and need a full floor, the arena holds one boss). */
export type LevelKind = "normal" | "secret" | "boss";

export interface LintOptions {
  kind?: LevelKind;
  /** Largest enemy count (default 12). */
  maxEnemies?: number;
  /** Skip the "at least one enemy" rule. */
  allowNoEnemies?: boolean;
  /** How many unreachable platform runs are tolerated as decoration (default 0). */
  allowUnreachable?: number;
  /** Player spawn tiles; default `playerSpawnTiles(level)`. Secret rooms pass their own. */
  spawns?: readonly { col: number; row: number }[];
  /** Jump used by the reach analysis (default `MARGIN_JUMP`); a stronger value makes the rise check fail. */
  jumpVel?: number;
  /** Set false to skip the (slow) reach analysis. */
  reach?: boolean;
}

export interface LevelStats {
  enemyCount: number;
  enemiesByType: Partial<Record<EnemyType, number>>;
  /** Horizontal runs of 2+ solid tiles with open space above them, not counting the ceiling row or the bottom two floor rows. */
  platformRuns: number;
  /** Solid tiles over all tiles, 0..1. */
  solidRatio: number;
  /** Columns that are open in the bottom row (the wrap gaps). */
  openBottomColumns: number;
  /** Standing positions the reach analysis found (0 when none could be analysed). */
  standingNodes: number;
}

export interface LintReport {
  issues: LintIssue[];
  stats: LevelStats;
  /** Present when the reach analysis ran. */
  graph: StandGraph | null;
  /** Spawn tiles the analysis started from. */
  spawns: { col: number; row: number }[];
  /** Standing positions that cannot return to a spawn. */
  trapped: { x: number; y: number }[];
  unreachableRuns: PlatformRun[];
  /** Columns open at the bottom whose top tile is solid. */
  wrapColumns: number[];
}

const GROUND_BOUND: ReadonlySet<EnemyType> = new Set(["walker", "chaser", "thrower", "breather"]);
const ENEMY_TYPES: ReadonlySet<string> = new Set(["walker", "chaser", "thrower", "breather", "bouncer", "flyer", "boss", "hurry"]);
const BOTTOM = GRID_H - 1;
const err = (code: string, message: string, col?: number, row?: number): LintIssue => ({ severity: "error", code, message, ...(col !== undefined ? { col } : {}), ...(row !== undefined ? { row } : {}) });
const warn = (code: string, message: string, col?: number, row?: number): LintIssue => ({ ...err(code, message, col, row), severity: "warn" });

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

/** Structural problems that would make the other rules crash (not a LevelData at all). */
function shapeProblems(lv: unknown): string[] {
  if (!isObj(lv)) return ["level is not an object"];
  const out: string[] = [];
  if (!Array.isArray(lv.tiles) || lv.tiles.some((r) => typeof r !== "string")) out.push("tiles must be an array of strings");
  if (!Array.isArray(lv.enemies) || lv.enemies.some((e) => !isObj(e))) out.push("enemies must be an array of objects");
  if (!Array.isArray(lv.drift) || lv.drift.some((e) => !isObj(e))) out.push("drift must be an array of objects");
  return out;
}

/** True when tiles is exactly GRID_H rows of GRID_W chars, all '#' or '.'. */
const gridOk = (lv: LevelData): boolean => lv.tiles.length === GRID_H && lv.tiles.every((r) => r.length === GRID_W && /^[#.]*$/.test(r));

const at = (lv: LevelData, col: number, row: number): boolean => lv.tiles[row]![col] === "#";

/** Statistics for the ramp lint and the viewer. `graph` supplies the standing node count; without it the reach analysis runs. */
export function levelStats(level: LevelData, graph?: Pick<StandGraph, "nodes">): LevelStats {
  const enemiesByType: Partial<Record<EnemyType, number>> = {};
  const list = Array.isArray(level?.enemies) ? level.enemies : [];
  for (const e of list) if (isObj(e)) enemiesByType[e.type] = (enemiesByType[e.type] ?? 0) + 1;
  const stats: LevelStats = { enemyCount: list.length, enemiesByType, platformRuns: 0, solidRatio: 0, openBottomColumns: 0, standingNodes: 0 };
  if (shapeProblems(level).length > 0 || !gridOk(level)) return stats;
  let solid = 0;
  for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) if (at(level, x, y)) solid++;
  stats.solidRatio = solid / (GRID_W * GRID_H);
  for (let x = 0; x < GRID_W; x++) if (!at(level, x, BOTTOM)) stats.openBottomColumns++;
  for (let y = 1; y < GRID_H - 2; y++) {
    let run = 0;
    for (let x = 0; x <= GRID_W; x++) {
      if (x < GRID_W && at(level, x, y) && !at(level, x, y - 1)) run++;
      else {
        if (run >= 2) stats.platformRuns++;
        run = 0;
      }
    }
  }
  const g = graph ?? runAnalysis(level, undefined, MARGIN_JUMP)?.graph;
  stats.standingNodes = g ? g.nodes.size : 0;
  return stats;
}

function runAnalysis(level: LevelData, spawns: readonly { col: number; row: number }[] | undefined, jumpVel: number) {
  const tiles = (spawns ?? playerSpawnTiles(level)).filter((s): s is { col: number; row: number } => s !== null);
  if (tiles.length === 0) return null;
  return { tiles, graph: analyseStands(level, startsOfTiles(tiles), jumpVel) };
}

/** Lints one level and returns the issues. See `lintReport` for the data behind them. */
export function lintLevel(level: LevelData, opts: LintOptions = {}): LintIssue[] {
  return lintReport(level, opts).issues;
}

/** Everything `lintLevel` knows: the issues plus the stats and the overlays the viewer draws. */
export function lintReport(level: LevelData, opts: LintOptions = {}): LintReport {
  const kind = opts.kind ?? "normal";
  const issues: LintIssue[] = [];
  const report: LintReport = {
    issues,
    stats: { enemyCount: 0, enemiesByType: {}, platformRuns: 0, solidRatio: 0, openBottomColumns: 0, standingNodes: 0 },
    graph: null,
    spawns: [],
    trapped: [],
    unreachableRuns: [],
    wrapColumns: [],
  };

  // 1. validate (structural problems first: everything below assumes a well-formed grid)
  const shape = shapeProblems(level);
  if (shape.length > 0) {
    for (const p of shape) issues.push(err("validate", p));
    return report;
  }
  const problems = validateLevel(level);
  for (const p of problems) issues.push(err("validate", p));
  if (problems.some((p) => /rows?\b.*(length|expected)|illegal characters|expected \d+ rows/.test(p))) {
    report.stats = levelStats(level);
    return report;
  }

  // 2. border
  for (const [c, outer] of [[0, true], [1, false], [GRID_W - 2, false], [GRID_W - 1, true]] as const) {
    let first: number | null = null;
    for (let y = 0; y < GRID_H; y++) {
      if (!at(level, c, y)) {
        first ??= y;
        if (outer) issues.push(err("border", `border column ${c} is open at row ${y}: players could leave the field sideways`, c, y));
      }
    }
    if (!outer && first !== null) issues.push(warn("border", `inner border column ${c} has a notch at row ${first} (the 2-wide wall should be solid on every row)`, c, first));
  }

  // 3. floor
  let anyStanding = false;
  for (let y = 1; y < GRID_H && !anyStanding; y++) for (let x = 0; x < GRID_W; x++) if (at(level, x, y) && !at(level, x, y - 1)) anyStanding = true;
  if (!anyStanding) issues.push(err("floor", "no solid standing surface at all"));
  if (kind === "secret") {
    for (const y of [GRID_H - 2, GRID_H - 1]) {
      if (!level.tiles[y]!.includes(".")) continue;
      issues.push(err("floor", `secret rooms need a full solid floor: row ${y} has an opening`, level.tiles[y]!.indexOf("."), y));
    }
  }

  // 4. wrap
  let openBottom = 0;
  for (let x = 0; x < GRID_W; x++) {
    if (at(level, x, BOTTOM)) continue;
    openBottom++;
    if (at(level, x, 0)) {
      report.wrapColumns.push(x);
      issues.push(err("wrap", `column ${x} is open at the bottom but solid at the top: wrapping would land inside a ceiling`, x, 0));
    }
  }
  if (openBottom > GRID_W * 0.4) issues.push(warn("wrap-ratio", `${openBottom} of ${GRID_W} columns are open at the bottom (more than 40%)`));

  // 5. spawn (enemies)
  const enemies = level.enemies;
  enemies.forEach((e, i) => {
    const where = `enemy #${i + 1} (${String(e.type)}) at (${String(e.col)}, ${String(e.row)})`;
    if (!isInt(e.col) || !isInt(e.row) || e.col < 0 || e.col >= GRID_W || e.row < 0 || e.row >= GRID_H) {
      issues.push(err("spawn", `${where} is outside the playfield`, isInt(e.col) ? e.col : undefined, isInt(e.row) ? e.row : undefined));
      return;
    }
    if (at(level, e.col, e.row)) {
      issues.push(err("spawn", `${where} is inside a solid tile`, e.col, e.row));
      return;
    }
    if (GROUND_BOUND.has(e.type)) {
      let floor = false;
      for (let y = e.row + 1; y <= e.row + 3 && y < GRID_H; y++) if (at(level, e.col, y)) floor = true;
      if (!floor) issues.push(warn("spawn", `${where} is a ground-bound enemy with no solid tile within 3 rows below it`, e.col, e.row));
    }
  });

  // 7. enemies
  issues.push(...enemyIssues(enemies, kind, opts));

  // 8. flags / drift
  if (level.flags !== undefined) {
    if (!isObj(level.flags)) issues.push(err("flags", "flags must be an object"));
    else {
      for (const [k, v] of Object.entries(level.flags)) {
        if (typeof v !== "boolean") issues.push(err("flags", `flag ${k} must be a boolean`));
      }
    }
  }
  for (const [i, d] of level.drift.entries()) {
    const where = `drift cell #${i + 1}`;
    if (!isInt(d.col) || !isInt(d.row) || d.col < 0 || d.col >= GRID_W || d.row < 0 || d.row >= GRID_H) {
      issues.push(err("drift", `${where} is outside the grid`, isInt(d.col) ? d.col : undefined, isInt(d.row) ? d.row : undefined));
    } else if (!Number.isFinite(d.dx) || !Number.isFinite(d.dy) || Math.abs(d.dx) > 1 || Math.abs(d.dy) > 1) {
      issues.push(err("drift", `${where} needs finite dx and dy of magnitude at most 1`, d.col, d.row));
    }
  }

  // 6. reach
  const jumpVel = opts.jumpVel ?? MARGIN_JUMP;
  const wantSpawns = opts.spawns ?? playerSpawnTiles(level);
  const spawnTiles: { col: number; row: number }[] = [];
  wantSpawns.forEach((s, i) => {
    if (s === null) issues.push(err("spawn", `player ${i + 1} has no floor in its spawn column ${i === 0 ? 3 : 28}`, i === 0 ? 3 : 28));
    else spawnTiles.push(s);
  });
  report.spawns = spawnTiles;
  const analysis = opts.reach === false || spawnTiles.length === 0 ? null : runAnalysis(level, spawnTiles, jumpVel);
  if (analysis) {
    const g = (report.graph = analysis.graph);
    report.trapped = g.trapped.map((k) => g.nodes.get(k)!);
    if (g.trapped.length > 0) {
      const first = report.trapped[0]!;
      issues.push(
        err("reach-trap", `${g.trapped.length} standing position(s) are reachable but cannot return to the spawn (first near col ${Math.floor(first.x / TILE)}, row ${Math.round((first.y + PLAYER_SIZE / 2) / TILE)}): a one-way trap`, Math.floor(first.x / TILE), Math.round((first.y + PLAYER_SIZE / 2) / TILE)),
      );
    }
    report.unreachableRuns = unreachedRuns(level, g.nodes.values(), spawnTiles);
    if (report.unreachableRuns.length > (opts.allowUnreachable ?? 0)) {
      for (const r of report.unreachableRuns) {
        issues.push(err("reach-unreachable", `platform run in row ${r.row}, columns ${r.from}-${r.to} cannot be reached`, r.from, r.row));
      }
    }
    const limit = jumpApex(TUNING.jumpVel) - 4;
    if (g.maxRise > limit) issues.push(err("reach-rise", `largest rise used is ${g.maxRise}px, above the ${limit}px allowed (real apex minus a 4px margin)`));
  }
  report.stats = levelStats(level, report.graph ?? { nodes: new Map() });
  return report;
}

function enemyIssues(enemies: EnemySpawn[], kind: LevelKind, opts: LintOptions): LintIssue[] {
  const out: LintIssue[] = [];
  const real = enemies.filter((e) => e.type !== "hurry");
  const bosses = enemies.filter((e) => e.type === "boss");
  for (const [i, e] of enemies.entries()) {
    if (!ENEMY_TYPES.has(e.type)) out.push(err("enemies", `enemy #${i + 1} has unknown type ${String(e.type)}`));
    if (e.type === "hurry") out.push(err("enemies", `enemy #${i + 1} is a hurry spawn (runtime-only)`, e.col, e.row));
    if (!Number.isInteger(e.delayTicks) || e.delayTicks < 0) out.push(err("enemies", `enemy #${i + 1} delayTicks must be a non-negative integer, got ${String(e.delayTicks)}`, e.col, e.row));
  }
  if (kind === "boss") {
    if (enemies.length !== 1 || bosses.length !== 1) out.push(err("enemies", `the boss arena needs exactly one enemy and it must be a boss (found ${enemies.length} enemies, ${bosses.length} boss)`));
    return out;
  }
  if (bosses.length > 0) out.push(err("enemies", "a boss spawn is only allowed in the boss arena"));
  if (kind === "secret") {
    if (enemies.length > 0) out.push(err("enemies", "secret rooms hold no enemies"));
    return out;
  }
  if (real.length === 0 && opts.allowNoEnemies !== true) out.push(err("enemies", "a round needs at least one enemy"));
  const max = opts.maxEnemies ?? 12;
  if (enemies.length > max) out.push(err("enemies", `${enemies.length} enemies exceeds the maximum of ${max}`));
  return out;
}

const countOf = (lv: LevelData): number => (Array.isArray(lv.enemies) ? lv.enemies.filter((e) => e.type !== "hurry").length : 0);
const hasBoss = (lv: LevelData): boolean => Array.isArray(lv.enemies) && lv.enemies.some((e) => e.type === "boss");
const tilesKey = (lv: LevelData): string => (Array.isArray(lv.tiles) ? lv.tiles.join("\n") : "");
const enemiesKey = (lv: LevelData): string => (Array.isArray(lv.enemies) ? JSON.stringify(lv.enemies.map((e) => [e.type, e.col, e.row, e.delayTicks])) : "");

/** Longest stretch of rounds a type may be missing from before the ramp warns that it vanished. */
const MAX_TYPE_GAP = 20;

/**
 * Checks a whole ordered level list: contiguous rounds from 1, themes 0..9, a sensible enemy ramp, no repeated
 * layouts, and the boss only in round 100.
 */
export function lintRamp(input: LevelData[]): LintIssue[] {
  const out: LintIssue[] = [];
  // Entries that are not levels (garbage in a levels file) become empty levels, which the rules then flag.
  const levels: LevelData[] = input.map((l) =>
    isObj(l) ? { ...l, enemies: Array.isArray(l.enemies) ? l.enemies.filter(isObj) : [] } : { round: Number.NaN, theme: 0, tiles: [], enemies: [], drift: [] },
  );
  const push = (i: LintIssue): void => void out.push(i);
  const at1 = (i: number): number => (isInt(levels[i]?.round) ? levels[i]!.round : i + 1);
  levels.forEach((lv, i) => {
    if (lv.round !== i + 1) push({ ...err("ramp-rounds", `level at position ${i + 1} has round ${String(lv.round)}; rounds must be 1..N in order`), round: at1(i) });
    if (!hasBoss(lv) && (!isInt(lv.theme) || lv.theme < 0 || lv.theme > 9)) push({ ...err("ramp-theme", `theme ${String(lv.theme)} is outside 0..9`), round: at1(i) });
    if (hasBoss(lv) && lv.round !== 100) push({ ...err("ramp-boss", "only round 100 may hold the boss"), round: at1(i) });
    if (hasBoss(lv) && lv.flags && Object.values(lv.flags).some(Boolean)) push({ ...warn("ramp-flags", "the boss round sets bubble flags"), round: at1(i) });
    if (i > 0 && tilesKey(lv) === tilesKey(levels[i - 1]!)) push({ ...err("ramp-consecutive", `round ${at1(i)} has the same tiles as the round before`), round: at1(i) });
  });
  if (levels.length >= 100 && !hasBoss(levels[99]!)) push({ ...err("ramp-boss", "round 100 must be the boss arena"), round: 100 });

  const seen = new Map<string, number>();
  levels.forEach((lv, i) => {
    const k = `${tilesKey(lv)}|${enemiesKey(lv)}`;
    const prev = seen.get(k);
    if (prev !== undefined) push({ ...err("ramp-duplicate", `round ${at1(i)} repeats round ${at1(prev)} (same tiles and same enemies)`), round: at1(i) });
    else seen.set(k, i);
  });

  // Enemy count ramp.
  const counts = levels.map(countOf);
  let sum = 0;
  let n = 0;
  for (let i = 3; i < levels.length; i++) {
    if (hasBoss(levels[i]!) || hasBoss(levels[i - 3]!)) continue;
    const delta = counts[i]! - counts[i - 3]!;
    sum += delta;
    n++;
    if (delta <= -4) push({ ...warn("ramp-enemies", `round ${at1(i)} has ${-delta} fewer enemies than round ${at1(i - 3)}`), round: at1(i) });
  }
  if (n > 0 && sum / n < -1) push(warn("ramp-enemies", `enemy counts fall by ${(-sum / n).toFixed(2)} on average over three rounds; the ramp should rise`));

  // Types should not vanish for long after they appear.
  const last = new Map<string, number>();
  const gaps = new Set<string>();
  const check = (type: string, i: number): void => {
    const l = last.get(type);
    if (l !== undefined && i - l - 1 > MAX_TYPE_GAP && !gaps.has(type)) {
      gaps.add(type);
      push({ ...warn("ramp-types", `${type} disappears for ${i - l - 1} rounds after round ${at1(l)}`), round: at1(l) });
    }
  };
  levels.forEach((lv, i) => {
    for (const e of Array.isArray(lv.enemies) ? lv.enemies : []) {
      if (e.type === "boss" || e.type === "hurry") continue;
      check(e.type, i);
      last.set(e.type, i);
    }
  });
  for (const type of last.keys()) check(type, levels.length);
  return out;
}
