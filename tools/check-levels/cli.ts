import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LEVELS, lintRamp, lintReport } from "@bubble/shared";
import type { LevelData, LintIssue } from "@bubble/shared";

/** Everything `run` touches outside itself, so tests can feed fixtures and capture output. */
export interface CliIO {
  readFile(path: string): string;
  exists(path: string): boolean;
  stdout(text: string): void;
  stderr(text: string): void;
  /** Where the real level list lives; used when --file is not given and the file exists. */
  defaultLevelsPath?: string;
}

const USAGE = `usage: check-levels [--file <levels.json>] [--range A-B] [--json] [--strict] [--no-reach] [--max-nodes N]
  --file     levels JSON (array of LevelData); default shared/src/levels/levels.json, else the built-in LEVELS
  --range    only lint rounds A..B (the ramp checks still see every level)
  --json     machine-readable output
  --strict   warnings fail the run too
  --no-reach skip the (slow) standing/trap analysis (the real gate runs it)
  --max-nodes N  cap on standing positions per level (default 20000); past it the level fails with reach-limit
exit codes: 0 clean, 1 lint errors (or warnings with --strict), 2 usage or file problems`;

const MAX_BYTES = 64 * 1024 * 1024;
const MAX_LEVELS = 500;

interface LevelResult {
  round: number;
  enemies: number;
  nodes: number;
  status: string;
  issues: LintIssue[];
}

const roundOf = (lv: unknown, index: number): number =>
  typeof lv === "object" && lv !== null && Number.isInteger((lv as LevelData).round) ? (lv as LevelData).round : index + 1;

const count = (issues: LintIssue[], sev: LintIssue["severity"]): number => issues.filter((i) => i.severity === sev).length;

function statusOf(issues: LintIssue[]): string {
  const e = count(issues, "error");
  const w = count(issues, "warn");
  if (e > 0) return `FAIL (${e} error${e === 1 ? "" : "s"}${w > 0 ? `, ${w} warning${w === 1 ? "" : "s"}` : ""})`;
  return w > 0 ? `warn (${w})` : "ok";
}

const where = (i: LintIssue): string => (i.col !== undefined || i.row !== undefined ? `  (col ${i.col ?? "?"}, row ${i.row ?? "?"})` : "");
const line = (i: LintIssue): string => `  ${i.severity.padEnd(5)}  ${i.code}  ${i.message}${where(i)}`;

/** The CLI as a pure function: returns the exit code (0 clean, 1 lint failures, 2 usage or file problems). */
export function run(argv: string[], io: CliIO): number {
  let file: string | undefined;
  let range: [number, number] | undefined;
  let json = false;
  let strict = false;
  let reach = true;
  let maxNodes: number | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--json") json = true;
    else if (a === "--strict") strict = true;
    else if (a === "--no-reach") reach = false;
    else if (a === "--file") {
      file = argv[++i];
      if (file === undefined) {
        io.stderr(`--file needs a path\n${USAGE}\n`);
        return 2;
      }
    } else if (a === "--range") {
      const m = /^(\d+)-(\d+)$/.exec(argv[++i] ?? "");
      if (!m || Number(m[1]) > Number(m[2])) {
        io.stderr(`--range needs A-B with A <= B, like 1-25\n${USAGE}\n`);
        return 2;
      }
      range = [Number(m[1]), Number(m[2])];
    } else if (a === "--max-nodes") {
      const n = /^\d+$/.test(argv[i + 1] ?? "") ? Number(argv[++i]) : 0;
      if (n < 1) {
        io.stderr(`--max-nodes needs a positive integer\n${USAGE}\n`);
        return 2;
      }
      maxNodes = n;
    } else if (a === "--help" || a === "-h") {
      io.stdout(`${USAGE}\n`);
      return 0;
    } else {
      io.stderr(`unknown option ${a}\n${USAGE}\n`);
      return 2;
    }
  }

  let levels: unknown[];
  const path = file ?? (io.defaultLevelsPath !== undefined && io.exists(io.defaultLevelsPath) ? io.defaultLevelsPath : undefined);
  if (path === undefined) levels = LEVELS;
  else {
    let text: string;
    try {
      text = io.readFile(path);
    } catch (e) {
      io.stderr(`cannot read levels file ${path}: ${e instanceof Error ? e.message : String(e)}\n`);
      return 2;
    }
    if (text.length > MAX_BYTES) {
      io.stderr(`levels file ${path} is too large (${text.length} bytes, limit ${MAX_BYTES})\n`);
      return 2;
    }
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch (e) {
      io.stderr(`levels file ${path} is not valid JSON: ${e instanceof Error ? e.message : String(e)}\n`);
      return 2;
    }
    if (!Array.isArray(data)) {
      io.stderr(`levels file ${path} must hold a JSON array of levels\n`);
      return 2;
    }
    if (data.length === 0) {
      io.stderr(`levels file ${path} holds no levels\n`);
      return 2;
    }
    if (data.length > MAX_LEVELS) {
      io.stderr(`levels file ${path} has too many levels (${data.length}, limit ${MAX_LEVELS})\n`);
      return 2;
    }
    levels = data;
  }

  const inRange = (r: number): boolean => range === undefined || (r >= range[0] && r <= range[1]);
  const results: LevelResult[] = [];
  levels.forEach((lv, i) => {
    const round = roundOf(lv, i);
    if (!inRange(round)) return;
    try {
      const rep = lintReport(lv as LevelData, { kind: round === 100 ? "boss" : "normal", reach, ...(maxNodes !== undefined ? { maxNodes } : {}) });
      results.push({ round, enemies: rep.stats.enemyCount, nodes: rep.stats.standingNodes, status: statusOf(rep.issues), issues: rep.issues });
    } catch (e) {
      const issues: LintIssue[] = [{ severity: "error", code: "internal", message: `lint crashed: ${e instanceof Error ? e.message : String(e)}` }];
      results.push({ round, enemies: 0, nodes: 0, status: statusOf(issues), issues });
    }
  });
  let ramp: LintIssue[];
  try {
    ramp = lintRamp(levels as LevelData[]).filter((i) => i.round === undefined || inRange(i.round));
  } catch (e) {
    ramp = [{ severity: "error", code: "internal", message: `ramp lint crashed: ${e instanceof Error ? e.message : String(e)}` }];
  }

  const all = [...results.flatMap((r) => r.issues), ...ramp];
  const errors = count(all, "error");
  const warnings = count(all, "warn");
  if (json) io.stdout(`${JSON.stringify({ levels: results, ramp, errors, warnings }, null, 2)}\n`);
  else {
    const out: string[] = ["round  enemies  nodes  status"];
    for (const r of results) out.push(`${String(r.round).padStart(5)}  ${String(r.enemies).padStart(7)}  ${String(r.nodes).padStart(5)}  ${r.status}`);
    for (const r of results) {
      if (r.issues.length === 0) continue;
      out.push("", `round ${r.round}:`, ...r.issues.map(line));
    }
    if (ramp.length > 0) out.push("", "ramp:", ...ramp.map((i) => `${line(i)}${i.round !== undefined ? ` [round ${i.round}]` : ""}`));
    out.push("", `${results.length} level${results.length === 1 ? "" : "s"} checked: ${errors} error${errors === 1 ? "" : "s"}, ${warnings} warning${warnings === 1 ? "" : "s"}`);
    io.stdout(`${out.join("\n")}\n`);
  }
  return errors > 0 || (strict && warnings > 0) ? 1 : 0;
}

function main(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  process.exitCode = run(process.argv.slice(2), {
    readFile: (p) => readFileSync(p, "utf8"),
    exists: existsSync,
    stdout: (s) => void process.stdout.write(s),
    stderr: (s) => void process.stderr.write(s),
    // dist/cli.js lives in tools/check-levels/dist: three levels below the repo root.
    defaultLevelsPath: resolve(here, "../../../shared/src/levels/levels.json"),
  });
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
