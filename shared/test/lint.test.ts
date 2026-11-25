import { describe, expect, it } from "vitest";
import {
  BOSS_ARENA,
  GRID_H,
  GRID_W,
  SECRET_ROOMS,
  TEST_LEVEL,
  TUNING,
  levelStats,
  lintLevel,
  lintRamp,
  type EnemySpawn,
  type LevelData,
  type LintIssue,
  type LintOptions,
} from "../src";

/** Border columns 0-1 / 30-31, ceiling row 0, floor rows 26-27, otherwise empty. */
const CLOSED_ROWS: string[] = Array.from({ length: GRID_H }, (_, y) =>
  Array.from({ length: GRID_W }, (_, x) => (x < 2 || x >= GRID_W - 2 || y === 0 || y >= GRID_H - 2 ? "#" : ".")).join(""),
);
const walker = (col = 10, row = 25): EnemySpawn => ({ type: "walker", col, row, delayTicks: 0 });
const mk = (over: Partial<LevelData> = {}): LevelData => ({ round: 1, theme: 0, tiles: [...CLOSED_ROWS], enemies: [walker()], drift: [], ...over });
/** Copy of `rows` with `fn` applied to the char grid. */
const edit = (rows: string[], fn: (g: string[][]) => void): string[] => {
  const g = rows.map((r) => r.split(""));
  fn(g);
  return g.map((r) => r.join(""));
};
const put = (rows: string[], row: number, from: number, to: number, ch: "#" | "."): string[] =>
  edit(rows, (g) => {
    for (let x = from; x <= to; x++) g[row]![x] = ch;
  });
const FAST: LintOptions = { reach: false };
const find = (issues: LintIssue[], code: string, severity?: "error" | "warn") =>
  issues.filter((i) => i.code === code && (severity === undefined || i.severity === severity));

describe("lintLevel: clean fixtures", () => {
  it("a closed room with one walker and a reachable ledge is clean", () => {
    const lv = mk({ tiles: put(CLOSED_ROWS, 22, 10, 14, "#") });
    expect(lintLevel(lv)).toEqual([]);
  }, 120000);

  it("TEST_LEVEL is clean as a normal round", () => {
    expect(lintLevel(TEST_LEVEL)).toEqual([]);
  }, 120000);

  it("BOSS_ARENA is clean as a boss round", () => {
    expect(lintLevel(BOSS_ARENA, { kind: "boss" })).toEqual([]);
  }, 120000);

  for (const room of SECRET_ROOMS) {
    it(`secret room ${room.word} is clean as a secret room`, () => {
      expect(lintLevel(room.level, { kind: "secret", spawns: room.spawn })).toEqual([]);
    }, 120000);
  }
});

describe("rule validate", () => {
  it("turns every validateLevel problem into an error", () => {
    const issues = lintLevel(mk({ tiles: CLOSED_ROWS.slice(0, 20) }), FAST);
    expect(find(issues, "validate", "error").length).toBeGreaterThan(0);
  });
  it("never throws on garbage input", () => {
    for (const bad of [null, 5, "x", {}, { tiles: 3 }, { tiles: [1], enemies: [], drift: [] }]) {
      const issues = lintLevel(bad as unknown as LevelData);
      expect(find(issues, "validate", "error").length).toBeGreaterThan(0);
    }
  });
});

describe("rule border", () => {
  it("errors on an opening in the outermost columns, with its location", () => {
    const left = lintLevel(mk({ tiles: put(CLOSED_ROWS, 5, 0, 0, ".") }), FAST);
    expect(find(left, "border", "error")).toEqual([expect.objectContaining({ col: 0, row: 5 })]);
    const right = lintLevel(mk({ tiles: put(CLOSED_ROWS, 9, 31, 31, ".") }), FAST);
    expect(find(right, "border", "error")).toEqual([expect.objectContaining({ col: 31, row: 9 })]);
  });
  it("warns on a notch in the inner border column only", () => {
    const issues = lintLevel(mk({ tiles: put(CLOSED_ROWS, 5, 1, 1, ".") }), FAST);
    expect(find(issues, "border", "error")).toEqual([]);
    expect(find(issues, "border", "warn").length).toBe(1);
  });
  it("a solid border has no border issue", () => {
    expect(find(lintLevel(mk(), FAST), "border")).toEqual([]);
  });
});

describe("rule floor", () => {
  it("errors when there is no solid standing surface at all", () => {
    const empty = edit(CLOSED_ROWS, (g) => {
      for (let y = 0; y < GRID_H; y++) for (let x = 2; x < GRID_W - 2; x++) g[y]![x] = ".";
    });
    const issues = lintLevel(mk({ tiles: empty }), FAST);
    expect(find(issues, "floor", "error").length).toBe(1);
  });
  it("secret rooms need a full two-row floor", () => {
    const issues = lintLevel(mk({ tiles: put(CLOSED_ROWS, 27, 10, 12, "."), enemies: [] }), { ...FAST, kind: "secret" });
    expect(find(issues, "floor", "error").length).toBeGreaterThan(0);
  });
  it("a normal level with a floor has no floor issue", () => {
    expect(find(lintLevel(mk(), FAST), "floor")).toEqual([]);
  });
});

describe("rule wrap", () => {
  it("errors for a bottom gap whose top is solid (wrapping lands in a ceiling)", () => {
    const tiles = put(put(CLOSED_ROWS, 26, 14, 17, "."), 27, 14, 17, ".");
    const issues = lintLevel(mk({ tiles }), FAST);
    expect(find(issues, "wrap", "error").map((i) => i.col)).toEqual([14, 15, 16, 17]);
  });
  it("a bottom gap with a matching top gap is fine", () => {
    let tiles = put(put(CLOSED_ROWS, 26, 14, 17, "."), 27, 14, 17, ".");
    tiles = put(tiles, 0, 14, 17, ".");
    const issues = lintLevel(mk({ tiles }), FAST);
    expect(find(issues, "wrap")).toEqual([]);
    expect(find(issues, "wrap-ratio")).toEqual([]);
  });
  it("warns when more than 40% of the columns are open at the bottom", () => {
    let tiles = put(put(CLOSED_ROWS, 26, 6, 26, "."), 27, 6, 26, ".");
    tiles = put(tiles, 0, 6, 26, ".");
    const issues = lintLevel(mk({ tiles }), FAST);
    expect(find(issues, "wrap-ratio", "warn").length).toBe(1);
    expect(find(issues, "wrap", "error")).toEqual([]);
  });
});

describe("rule spawn", () => {
  it("errors for a spawn inside a solid tile and for one outside the field", () => {
    const solid = lintLevel(mk({ enemies: [walker(5, 26)] }), FAST);
    expect(find(solid, "spawn", "error")).toEqual([expect.objectContaining({ col: 5, row: 26 })]);
    const outside = lintLevel(mk({ enemies: [walker(40, 5)] }), FAST);
    expect(find(outside, "spawn", "error").length).toBe(1);
    const fractional = lintLevel(mk({ enemies: [walker(5.5, 5)] }), FAST);
    expect(find(fractional, "spawn", "error").length).toBe(1);
  });
  it("warns for a ground-bound enemy floating far above any floor, but not for a flyer", () => {
    const floating = lintLevel(mk({ enemies: [walker(10, 12)] }), FAST);
    expect(find(floating, "spawn", "warn")).toEqual([expect.objectContaining({ col: 10, row: 12 })]);
    for (const type of ["chaser", "thrower", "breather"] as const) {
      expect(find(lintLevel(mk({ enemies: [{ type, col: 10, row: 12, delayTicks: 0 }] }), FAST), "spawn", "warn").length).toBe(1);
    }
    for (const type of ["flyer", "bouncer"] as const) {
      expect(find(lintLevel(mk({ enemies: [{ type, col: 10, row: 12, delayTicks: 0 }] }), FAST), "spawn")).toEqual([]);
    }
  });
  it("a walker with a floor within 3 rows is fine", () => {
    expect(find(lintLevel(mk({ enemies: [walker(10, 23)] }), FAST), "spawn")).toEqual([]);
  });
});

const errorCodes = (issues: LintIssue[]): string[] => [...new Set(issues.filter((i) => i.severity === "error").map((i) => i.code))];
const fill = (rows: string[], r0: number, r1: number, c0: number, c1: number, ch: "#" | "."): string[] =>
  edit(rows, (g) => {
    for (let y = r0; y <= r1; y++) for (let x = c0; x <= c1; x++) g[y]![x] = ch;
  });

describe("player spawn rules", () => {
  it("clean: a closed room trips none of the spawn rules", () => {
    const issues = lintLevel(mk());
    expect(issues.filter((i) => i.code.startsWith("spawn-") || i.code === "enemy-space")).toEqual([]);
  }, 120000);

  it("spawn-headroom: no floor under a spawn column", () => {
    const tiles = CLOSED_ROWS.map((r) => r.slice(0, 3) + "." + r.slice(4));
    const issues = lintLevel(mk({ tiles }));
    expect(errorCodes(issues)).toEqual(["spawn-headroom"]);
    expect(find(issues, "spawn-headroom")[0]!.col).toBe(3);
  }, 120000);

  it("spawn-headroom: a 1-wide shaft cannot hold the 14 px body (P1 sealed in a shaft)", () => {
    const issues = lintLevel(mk({ tiles: fill(CLOSED_ROWS, 12, 25, 4, 4, "#") }));
    expect(errorCodes(issues)).toEqual(["spawn-headroom"]);
  }, 120000);

  it("spawn-headroom: a low ceiling leaves only 1 empty row above the spawn", () => {
    const issues = lintLevel(mk({ tiles: put(CLOSED_ROWS, 24, 2, 6, "#") }));
    expect(errorCodes(issues)).toEqual(["spawn-headroom"]);
    expect(find(issues, "spawn-headroom")[0]).toMatchObject({ col: 3, row: 25 });
  }, 120000);

  it("spawn-headroom: an explicit spawn tile with no solid tile below it", () => {
    const issues = lintLevel(mk(), { spawns: [{ col: 3, row: 20 }, { col: 28, row: 25 }] });
    expect(errorCodes(issues)).toEqual(["spawn-headroom"]);
  }, 120000);

  it("spawn-sealed: a pocket with fewer than 12 standing positions", () => {
    const lv = mk({ tiles: fill(CLOSED_ROWS, 0, 27, 5, 5, "#") });
    const both = [{ col: 3, row: 25 }, { col: 3, row: 25 }];
    const issues = lintLevel(lv, { spawns: both });
    expect(errorCodes(issues)).toEqual(["spawn-sealed"]);
    expect(errorCodes(lintLevel(lv, { spawns: both, minSpawnNodes: 5 }))).toEqual([]);
  }, 120000);

  it("spawn-disconnected: P1 and P2 in two separate sealed rooms with plenty of nodes", () => {
    const lv = mk({ tiles: fill(CLOSED_ROWS, 0, 27, 15, 16, "#"), enemies: [walker(10, 25), walker(22, 25)] });
    const issues = lintLevel(lv);
    expect(errorCodes(issues)).toEqual(["spawn-disconnected"]);
    expect(find(issues, "spawn-disconnected").length).toBe(2);
    expect(find(issues, "spawn-sealed")).toEqual([]);
    expect(find(issues, "reach-trap")).toEqual([]);
  }, 120000);

  it("spawn-disconnected also fires one way: a ledge P2 can drop from but P1 cannot climb to", () => {
    const lv = mk({ tiles: put(CLOSED_ROWS, 18, 26, 29, "#") });
    const issues = lintLevel(lv, { spawns: [{ col: 3, row: 25 }, { col: 27, row: 17 }] });
    expect(find(issues, "spawn-disconnected").length).toBe(1);
  }, 120000);
});

describe("rule enemy-space", () => {
  const box = (): string[] => fill(fill(CLOSED_ROWS, 22, 25, 20, 25, "#"), 23, 24, 21, 24, ".");
  it("warns for a ground-bound enemy in a sealed-off area; errors with strictEnemies", () => {
    const lv = mk({ tiles: box(), enemies: [walker(10, 25), walker(22, 24)] });
    const issues = lintLevel(lv);
    expect(errorCodes(issues)).toEqual([]);
    expect(find(issues, "enemy-space", "warn")).toEqual([expect.objectContaining({ col: 22, row: 24 })]);
    expect(find(lintLevel(lv, { strictEnemies: true }), "enemy-space", "error").length).toBe(1);
  }, 120000);
  it("warns for a flyer sealed into the box", () => {
    const lv = mk({ tiles: box(), enemies: [walker(10, 25), { type: "flyer", col: 22, row: 23, delayTicks: 0 }] });
    expect(find(lintLevel(lv, { reach: false }), "enemy-space", "warn").length).toBe(1);
  });
  it("clean: a walker on the floor and a flyer in the open air", () => {
    const lv = mk({ enemies: [walker(10, 25), { type: "flyer", col: 22, row: 10, delayTicks: 0 }] });
    expect(find(lintLevel(lv), "enemy-space")).toEqual([]);
  }, 120000);
});

describe("reach cost cap", () => {
  const arena = (): string[] => {
    let t = CLOSED_ROWS;
    for (const r of [22, 18, 14, 10, 6]) t = put(t, r, 4, 27, "#");
    return t;
  };
  it("raises reach-limit instead of grinding on a layout past maxNodes", () => {
    const issues = lintLevel(mk({ tiles: arena() }), { maxNodes: 200 });
    expect(errorCodes(issues)).toEqual(["reach-limit"]);
    expect(find(issues, "reach-limit")[0]!.message).toMatch(/200 standing positions/);
  }, 120000);
  it("the default cap does not trigger on the known levels", () => {
    expect(find(lintLevel(TEST_LEVEL), "reach-limit")).toEqual([]);
    expect(find(lintLevel(BOSS_ARENA, { kind: "boss" }), "reach-limit")).toEqual([]);
  }, 120000);
});

describe("malformed grids", () => {
  it("a secret-kind level with a short or ragged grid yields errors and does not throw", () => {
    const issues = lintLevel(mk({ tiles: CLOSED_ROWS.slice(0, 20), enemies: [] }), { kind: "secret" });
    expect(errorCodes(issues)).toContain("validate");
    const ragged = mk({ tiles: CLOSED_ROWS.map((r, i) => (i === 27 ? r.slice(1) : r)), enemies: [] });
    expect(errorCodes(lintLevel(ragged, { kind: "secret" }))).toContain("validate");
  });
});

describe("rule reach", () => {
  it("errors on a one-way trap (a deep well that cannot be left)", () => {
    const rows: string[] = [];
    for (let y = 0; y < GRID_H; y++) {
      const r = Array.from({ length: GRID_W }, (_, x) => (y === 0 || y >= GRID_H - 2 || x < 2 || x >= GRID_W - 2 ? "#" : "."));
      if (y >= 17 && y <= 25) for (const x of [8, 9, 10, 11, 12, 13, 16, 17, 18, 19, 20, 21]) r[x] = "#";
      if (y === 22 || y === 18) for (const x of [2, 3, 4]) r[x] = "#";
      rows.push(r.join(""));
    }
    const issues = lintLevel(mk({ tiles: rows }));
    expect(find(issues, "reach-trap", "error").length).toBeGreaterThan(0);
  }, 120000);

  it("errors on a platform nobody can reach, and allowUnreachable lets a decorative one pass", () => {
    const lv = mk({ tiles: put(CLOSED_ROWS, 10, 10, 14, "#") });
    const issues = lintLevel(lv);
    expect(find(issues, "reach-unreachable", "error")).toEqual([expect.objectContaining({ row: 10 })]);
    expect(find(lintLevel(lv, { allowUnreachable: 1 }), "reach-unreachable")).toEqual([]);
  }, 120000);

  it("errors when the level needs a bigger jump than the margin jump allows", () => {
    // 7 rows above the floor top: out of reach of the margin jump, so only a stronger test jump gets there.
    const lv = mk({ tiles: put(CLOSED_ROWS, 19, 10, 14, "#") });
    expect(find(lintLevel(lv), "reach-unreachable", "error").length).toBe(1);
    const issues = lintLevel(lv, { jumpVel: TUNING.jumpVel - 0.6 });
    expect(find(issues, "reach-rise", "error").length).toBe(1);
  }, 120000);

  it("reach: false skips the analysis", () => {
    const lv = mk({ tiles: put(CLOSED_ROWS, 10, 10, 14, "#") });
    expect(find(lintLevel(lv, FAST), "reach-unreachable")).toEqual([]);
  });
});

describe("rule enemies", () => {
  it("needs at least one enemy unless allowNoEnemies", () => {
    expect(find(lintLevel(mk({ enemies: [] }), FAST), "enemies", "error").length).toBe(1);
    expect(find(lintLevel(mk({ enemies: [] }), { ...FAST, allowNoEnemies: true }), "enemies")).toEqual([]);
  });
  it("caps the count at maxEnemies (default 12)", () => {
    const many = Array.from({ length: 13 }, (_, i) => walker(3 + i, 25));
    expect(find(lintLevel(mk({ enemies: many }), FAST), "enemies", "error").length).toBe(1);
    expect(find(lintLevel(mk({ enemies: many }), { ...FAST, maxEnemies: 13 }), "enemies")).toEqual([]);
    expect(find(lintLevel(mk({ enemies: many.slice(0, 12) }), FAST), "enemies")).toEqual([]);
  });
  it("delayTicks must be a non-negative integer", () => {
    for (const d of [-1, 1.5, Number.NaN]) {
      expect(find(lintLevel(mk({ enemies: [{ ...walker(), delayTicks: d }] }), FAST), "enemies", "error").length).toBe(1);
    }
    expect(find(lintLevel(mk({ enemies: [{ ...walker(), delayTicks: 90 }] }), FAST), "enemies")).toEqual([]);
  });
  it("a hurry spawn is an error", () => {
    const issues = lintLevel(mk({ enemies: [walker(), { type: "hurry", col: 12, row: 25, delayTicks: 0 }] }), FAST);
    expect(find(issues, "enemies", "error").some((i) => /hurry/.test(i.message))).toBe(true);
  });
  it("an unknown type is an error", () => {
    const bad = { type: "dragon", col: 5, row: 5, delayTicks: 0 } as unknown as EnemySpawn;
    expect(find(lintLevel(mk({ enemies: [bad] }), FAST), "enemies", "error").length).toBeGreaterThan(0);
  });
  it("a boss round has exactly one enemy and it is a boss", () => {
    const boss = { type: "boss", col: 15, row: 8, delayTicks: 0 } as const;
    const bossOpts: LintOptions = { ...FAST, kind: "boss" };
    expect(find(lintLevel(mk({ enemies: [boss] }), bossOpts), "enemies")).toEqual([]);
    expect(find(lintLevel(mk({ enemies: [boss, walker()] }), bossOpts), "enemies", "error").length).toBe(1);
    expect(find(lintLevel(mk({ enemies: [walker()] }), bossOpts), "enemies", "error").length).toBeGreaterThan(0);
    expect(find(lintLevel(mk({ enemies: [] }), bossOpts), "enemies", "error").length).toBeGreaterThan(0);
  });
  it("a normal round may not hold the boss; a secret room holds nothing", () => {
    const boss = { type: "boss", col: 15, row: 8, delayTicks: 0 } as const;
    expect(find(lintLevel(mk({ enemies: [boss] }), FAST), "enemies", "error").length).toBeGreaterThan(0);
    expect(find(lintLevel(mk({ enemies: [walker()] }), { ...FAST, kind: "secret" }), "enemies", "error").length).toBe(1);
  });
});

describe("rules flags and drift", () => {
  it("accepts small finite drift in the grid", () => {
    const drift = [{ col: 5, row: 5, dx: 0.5, dy: -1 }];
    expect(find(lintLevel(mk({ drift }), FAST), "drift")).toEqual([]);
  });
  it("rejects drift outside the grid, non-finite or too strong", () => {
    for (const cell of [
      { col: 40, row: 5, dx: 0, dy: 0 },
      { col: 5, row: -1, dx: 0, dy: 0 },
      { col: 5, row: 5, dx: 2, dy: 0 },
      { col: 5, row: 5, dx: 0, dy: -1.01 },
      { col: 5, row: 5, dx: Number.NaN, dy: 0 },
      { col: 5.5, row: 5, dx: 0, dy: 0 },
    ]) {
      expect(find(lintLevel(mk({ drift: [cell] }), FAST), "drift", "error").length).toBe(1);
    }
  });
  it("flags must be booleans", () => {
    expect(find(lintLevel(mk({ flags: { fireBubbles: true, waterBubbles: false } }), FAST), "flags")).toEqual([]);
    const bad = { waterBubbles: "yes" } as unknown as LevelData["flags"];
    expect(find(lintLevel(mk({ flags: bad }), FAST), "flags", "error").length).toBe(1);
  });
});

describe("levelStats", () => {
  it("summarises TEST_LEVEL", () => {
    const s = levelStats(TEST_LEVEL);
    expect(s.enemyCount).toBe(1);
    expect(s.enemiesByType).toEqual({ walker: 1 });
    expect(s.platformRuns).toBe(3);
    expect(s.openBottomColumns).toBe(4);
    expect(s.standingNodes).toBe(375);
    expect(s.solidRatio).toBeGreaterThan(0.2);
    expect(s.solidRatio).toBeLessThan(0.4);
  }, 120000);
  it("uses a supplied graph's node count instead of recomputing", () => {
    expect(levelStats(mk(), { nodes: new Map([["1,1", { x: 1, y: 1 }]]) }).standingNodes).toBe(1);
  });
});

/** Distinct level n: the bits of n written as solid tiles in row 3. */
const variant = (n: number, count = 2): LevelData =>
  mk({
    round: n,
    tiles: edit(CLOSED_ROWS, (g) => {
      for (let b = 0; b < 20; b++) if ((n >> b) & 1) g[3]![2 + b] = "#";
    }),
    enemies: Array.from({ length: count }, (_, i) => walker(5 + i, 25)),
  });
const ramp = (n: number): LevelData[] => Array.from({ length: n }, (_, i) => variant(i + 1));

describe("lintRamp", () => {
  it("a clean list of 10 rounds has no issues", () => {
    expect(lintRamp(ramp(10))).toEqual([]);
  });
  it("errors on non-contiguous round numbers", () => {
    const lv = ramp(10);
    lv[4] = { ...lv[4]!, round: 9 };
    expect(find(lintRamp(lv), "ramp-rounds", "error").length).toBeGreaterThan(0);
  });
  it("errors on a theme outside 0..9", () => {
    const lv = ramp(10);
    lv[2] = { ...lv[2]!, theme: 10 };
    expect(find(lintRamp(lv), "ramp-theme", "error")).toEqual([expect.objectContaining({ round: 3 })]);
  });
  it("errors on two consecutive rounds with identical tiles", () => {
    const lv = ramp(10);
    lv[3] = { ...lv[3]!, tiles: lv[2]!.tiles };
    expect(find(lintRamp(lv), "ramp-consecutive", "error")).toEqual([expect.objectContaining({ round: 4 })]);
  });
  it("errors on a duplicate tile grid with the same enemies anywhere, but allows same tiles with different enemies", () => {
    const lv = ramp(10);
    lv[7] = { ...lv[7]!, tiles: lv[2]!.tiles, enemies: lv[2]!.enemies };
    expect(find(lintRamp(lv), "ramp-duplicate", "error")).toEqual([expect.objectContaining({ round: 8 })]);
    lv[7] = { ...lv[7]!, enemies: [walker(20, 25), walker(21, 25), walker(22, 25)] };
    expect(find(lintRamp(lv), "ramp-duplicate")).toEqual([]);
  });
  it("round 100 is the only boss round", () => {
    const lv = ramp(10);
    lv[4] = { ...lv[4]!, enemies: [{ type: "boss", col: 15, row: 8, delayTicks: 0 }] };
    expect(find(lintRamp(lv), "ramp-boss", "error")).toEqual([expect.objectContaining({ round: 5 })]);
    const hundred = [...ramp(99), BOSS_ARENA];
    expect(find(lintRamp(hundred), "ramp-boss")).toEqual([]);
    const noBoss = [...ramp(99), variant(100)];
    expect(find(lintRamp(noBoss), "ramp-boss", "error").length).toBe(1);
  });
  it("warns on a big drop in enemy count and on a type that vanishes for 20+ rounds", () => {
    const lv = ramp(10).map((l, i) => ({ ...l, enemies: Array.from({ length: i < 3 ? 8 : 2 }, (_, k) => walker(5 + k, 25)) }));
    expect(find(lintRamp(lv), "ramp-enemies", "warn").length).toBeGreaterThan(0);
    const long = ramp(40).map((l, i) => ({
      ...l,
      enemies: [i < 2 ? { type: "thrower" as const, col: 6, row: 25, delayTicks: 0 } : walker()],
    }));
    expect(find(lintRamp(long), "ramp-types", "warn").length).toBeGreaterThan(0);
    expect(find(lintRamp(long), "ramp-types", "error")).toEqual([]);
  });
});
