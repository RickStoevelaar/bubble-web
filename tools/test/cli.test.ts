import { describe, expect, it } from "vitest";
import { GRID_H, GRID_W, TEST_LEVEL, type EnemySpawn, type LevelData } from "@bubble/shared";
import { run, type CliIO } from "../check-levels/cli";

const CLOSED: string[] = Array.from({ length: GRID_H }, (_, y) =>
  Array.from({ length: GRID_W }, (_, x) => (x < 2 || x >= GRID_W - 2 || y === 0 || y >= GRID_H - 2 ? "#" : ".")).join(""),
);
const withLedge = (from: number): string[] =>
  CLOSED.map((r, y) => (y === 22 ? r.slice(0, from) + "#####" + r.slice(from + 5) : r));
const walker = (col = 10, row = 25): EnemySpawn => ({ type: "walker", col, row, delayTicks: 0 });
const lv = (round: number, tiles: string[], enemies: EnemySpawn[] = [walker()]): LevelData => ({ round, theme: round % 10, tiles, enemies, drift: [] });
const CLEAN = [lv(1, withLedge(10)), lv(2, withLedge(14))];

interface Harness {
  io: CliIO;
  out: string;
  err: string;
}
function harness(files: Record<string, string>, defaults?: string): Harness {
  const h: Harness = {
    out: "",
    err: "",
    io: {
      readFile: (p) => {
        if (!(p in files)) throw new Error(`ENOENT: no such file ${p}`);
        return files[p]!;
      },
      exists: (p) => p in files,
      stdout: (s) => void (h.out += s),
      stderr: (s) => void (h.err += s),
      defaultLevelsPath: defaults,
    },
  };
  return h;
}
const json = (v: unknown): string => JSON.stringify(v);
const parsed = (h: Harness) =>
  JSON.parse(h.out) as {
    levels: { round: number; enemies: number; nodes: number; status: string; issues: { code: string; severity: string }[] }[];
    ramp: { code: string }[];
    errors: number;
    warnings: number;
  };

describe("check-levels run()", () => {
  it("all-clean levels exit 0 and print one line per level", () => {
    const h = harness({ "clean.json": json(CLEAN) });
    expect(run(["--file", "clean.json"], h.io)).toBe(0);
    expect(h.out).toMatch(/round\s+enemies\s+nodes\s+status/);
    expect(h.out).toMatch(/^\s*1\s+1\s+\d+\s+ok/m);
    expect(h.out).toMatch(/^\s*2\s+1\s+\d+\s+ok/m);
    expect(h.out).not.toMatch(/^ {2}(error|warn) /m);
    expect(h.err).toBe("");
  }, 120000);

  it("one broken level exits 1 and names the code against the right round", () => {
    const broken = lv(2, CLOSED.map((r, y) => (y === 5 ? "." + r.slice(1) : r)));
    const h = harness({ "b.json": json([CLEAN[0], broken]) });
    expect(run(["--file", "b.json", "--json"], h.io)).toBe(1);
    const out = parsed(h);
    expect(out.levels[0]!.issues).toEqual([]);
    expect(out.levels[1]!.issues.map((i) => i.code)).toContain("border");
    expect(out.levels[1]!.status).toMatch(/FAIL/);
    expect(out.errors).toBeGreaterThan(0);

    const text = harness({ "b.json": json([CLEAN[0], broken]) });
    expect(run(["--file", "b.json"], text.io)).toBe(1);
    expect(text.out).toMatch(/round 2[\s\S]*error\s+border/);
  }, 120000);

  it("--range restricts which rounds are linted", () => {
    const broken = lv(1, CLOSED.map((r, y) => (y === 5 ? "." + r.slice(1) : r)));
    const h = harness({ "r.json": json([broken, CLEAN[1]]) });
    expect(run(["--file", "r.json", "--range", "2-2", "--json"], h.io)).toBe(0);
    expect(parsed(h).levels.map((l) => l.round)).toEqual([2]);
    const h2 = harness({ "r.json": json([broken, CLEAN[1]]) });
    expect(run(["--file", "r.json", "--range", "1-1", "--json"], h2.io)).toBe(1);
    expect(parsed(h2).levels.map((l) => l.round)).toEqual([1]);
  }, 120000);

  it("rejects a malformed --range with exit 2", () => {
    const h = harness({ "c.json": json(CLEAN) });
    expect(run(["--file", "c.json", "--range", "abc"], h.io)).toBe(2);
    expect(h.err).toMatch(/range/);
  });

  it("--json output parses and carries the ramp results", () => {
    const h = harness({ "c.json": json(CLEAN) });
    run(["--file", "c.json", "--json"], h.io);
    const out = parsed(h);
    expect(out.levels).toHaveLength(2);
    expect(out.levels[0]).toMatchObject({ round: 1, enemies: 1, status: "ok" });
    expect(out.levels[0]!.nodes).toBeGreaterThan(50);
    expect(out.ramp).toEqual([]);
    expect(out.errors).toBe(0);
  }, 120000);

  it("warnings alone exit 0; --strict makes them fail", () => {
    const floating = lv(1, withLedge(10), [walker(20, 12)]);
    const h = harness({ "w.json": json([floating]) });
    expect(run(["--file", "w.json", "--json"], h.io)).toBe(0);
    expect(parsed(h).levels[0]!.issues.map((i) => i.severity)).toEqual(["warn"]);
    expect(parsed(h).levels[0]!.status).toMatch(/warn/);
    const s = harness({ "w.json": json([floating]) });
    expect(run(["--file", "w.json", "--strict"], s.io)).toBe(1);
  }, 120000);

  it("ramp problems are reported and fail the run", () => {
    const dup = [lv(1, withLedge(10)), lv(2, withLedge(10))];
    const h = harness({ "d.json": json(dup) });
    expect(run(["--file", "d.json", "--json"], h.io)).toBe(1);
    expect(parsed(h).ramp.map((i) => i.code)).toContain("ramp-consecutive");
  }, 120000);

  it("--no-reach skips the standing analysis", () => {
    const h = harness({ "c.json": json(CLEAN) });
    expect(run(["--file", "c.json", "--no-reach", "--json"], h.io)).toBe(0);
    expect(parsed(h).levels[0]!.nodes).toBe(0);
  });

  it("a missing file prints a clear error and exits 2", () => {
    const h = harness({});
    expect(run(["--file", "nope.json"], h.io)).toBe(2);
    expect(h.err).toMatch(/nope\.json/);
    expect(h.out).toBe("");
  });

  it("malformed JSON, a non-array and an empty list exit 2", () => {
    for (const text of ["{not json", json({ round: 1 }), "[]", ""]) {
      const h = harness({ "x.json": text });
      expect(run(["--file", "x.json"], h.io)).toBe(2);
      expect(h.err.length).toBeGreaterThan(0);
    }
  });

  it("garbage entries become error issues, never a crash", () => {
    const h = harness({ "g.json": json([null, 5, { round: 3 }, { round: 4, tiles: ["#"], enemies: [], drift: [] }]) });
    expect(run(["--file", "g.json", "--json"], h.io)).toBe(1);
    const out = parsed(h);
    expect(out.levels).toHaveLength(4);
    for (const l of out.levels) expect(l.issues.some((i) => i.severity === "error")).toBe(true);
  });

  it("refuses a file with far too many levels", () => {
    const h = harness({ "big.json": json(Array.from({ length: 2000 }, () => 0)) });
    expect(run(["--file", "big.json"], h.io)).toBe(2);
    expect(h.err).toMatch(/too many/i);
  });

  it("an unknown option exits 2 with usage", () => {
    const h = harness({});
    expect(run(["--bogus"], h.io)).toBe(2);
    expect(h.err).toMatch(/usage/i);
  });

  it("without --file it uses the default levels file when present, else the shared LEVELS", () => {
    const withDefault = harness({ "/d/levels.json": json(CLEAN) }, "/d/levels.json");
    run(["--json"], withDefault.io);
    expect(parsed(withDefault).levels.map((l) => l.round)).toEqual([1, 2]);

    const fallback = harness({}, "/d/levels.json");
    expect(run(["--json"], fallback.io)).toBe(0);
    const out = parsed(fallback);
    expect(out.levels).toHaveLength(1);
    expect(out.levels[0]!.round).toBe(TEST_LEVEL.round);
  }, 120000);
});
