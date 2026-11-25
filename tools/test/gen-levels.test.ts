import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GRID_H, GRID_W, Rng } from "@bubble/shared";
import { generateJson, generateLevels } from "../gen-levels/generate";
import { ROUNDS } from "../gen-levels/rounds/index";
import { TEMPLATES } from "../gen-levels/templates/index";

const LEVELS_JSON = new URL("../../shared/src/levels/levels.json", import.meta.url);
const FIRST_SEEN = { walker: 1, chaser: 5, thrower: 9, breather: 13, bouncer: 17, flyer: 21 } as const;

describe("generator", () => {
  it("is deterministic: two runs give byte-identical JSON", () => {
    expect(generateJson()).toBe(generateJson());
    expect(generateLevels()).toEqual(generateLevels());
  });

  it("the committed levels.json is byte-identical to a fresh generator run", () => {
    expect(readFileSync(LEVELS_JSON, "utf8")).toBe(generateJson());
  });

  it("writes normalized key order, 2-space JSON and a trailing newline", () => {
    const text = generateJson();
    expect(text.endsWith("]\n")).toBe(true);
    expect(text.startsWith('[\n  {\n    "round": 1,\n    "theme": 0,\n    "tiles": [')).toBe(true);
    for (const lv of JSON.parse(text) as Record<string, unknown>[]) {
      const keys = Object.keys(lv);
      expect(keys.slice(0, 5)).toEqual(["round", "theme", "tiles", "enemies", "drift"]);
      expect(keys.length === 5 || (keys.length === 6 && keys[5] === "flags")).toBe(true);
    }
  });
});

describe("template library", () => {
  const names = Object.keys(TEMPLATES);
  it("has at least 12 templates", () => expect(names.length).toBeGreaterThanOrEqual(12));

  for (const name of names) {
    describe(name, () => {
      const tpl = TEMPLATES[name]!;
      it("builds a 32x28 grid of # and . with 2-wide solid borders and a legal wrap", () => {
        for (const seed of [1, 2, 3]) {
          const rows = tpl.build({}, new Rng(seed));
          expect(rows).toHaveLength(GRID_H);
          for (const r of rows) {
            expect(r).toHaveLength(GRID_W);
            expect(r).toMatch(/^[#.]+$/);
            expect(r.slice(0, 2)).toBe("##");
            expect(r.slice(-2)).toBe("##");
          }
          for (let x = 0; x < GRID_W; x++) {
            if (rows[GRID_H - 1]![x] === ".") expect(rows[0]![x], `column ${x} open at the bottom must be open at the top`).toBe(".");
          }
        }
      });
      it("is a pure function of params and seed", () => {
        expect(tpl.build({}, new Rng(9))).toEqual(tpl.build({}, new Rng(9)));
      });
    });
  }

  it("templates differ pairwise on their default parameters", () => {
    const seen = new Map<string, string>();
    for (const name of names) {
      const key = TEMPLATES[name]!.build({}, new Rng(1)).join("\n");
      expect(seen.get(key), `${name} duplicates ${seen.get(key)}`).toBeUndefined();
      seen.set(key, name);
    }
  });
});

describe("round data (batch 1)", () => {
  it("has contiguous rounds from 1 and themes floor((round - 1) / 10)", () => {
    expect(ROUNDS.length).toBeGreaterThanOrEqual(25);
    ROUNDS.forEach((r, i) => {
      expect(r.round).toBe(i + 1);
      expect(r.theme).toBe(Math.floor((r.round - 1) / 10));
    });
  });

  it("every round names a known template or is hand-drawn", () => {
    for (const r of ROUNDS) {
      if (r.tiles) expect(r.template).toBe("hand");
      else expect(Object.keys(TEMPLATES), `round ${r.round}`).toContain(r.template);
    }
  });

  it("no two consecutive rounds share a template; at least 10 distinct templates; some hand-drawn", () => {
    for (let i = 1; i < ROUNDS.length; i++) expect(ROUNDS[i]!.template, `round ${i + 1}`).not.toBe(ROUNDS[i - 1]!.template);
    expect(new Set(ROUNDS.map((r) => r.template)).size).toBeGreaterThanOrEqual(10);
    expect(ROUNDS.filter((r) => r.template === "hand").length).toBeGreaterThanOrEqual(3);
  });

  const levels = generateLevels();
  it("enemy types first appear in the briefed order and keep appearing afterwards", () => {
    const first = new Map<string, number>();
    for (const lv of levels) for (const e of lv.enemies) if (!first.has(e.type)) first.set(e.type, lv.round);
    for (const [type, round] of Object.entries(FIRST_SEEN)) {
      if (round <= levels.length) expect(first.get(type), type).toBe(round);
    }
    for (const lv of levels) {
      for (const e of lv.enemies) expect(["boss", "hurry"]).not.toContain(e.type);
    }
    // After its introduction a type appears again within 6 rounds (a mix, not a one-off).
    for (const [type, round] of Object.entries(FIRST_SEEN)) {
      for (let r = round; r + 6 <= levels.length; r++) {
        const win = levels.slice(r - 1 + 1, r + 6);
        expect(win.some((l) => l.enemies.some((e) => e.type === type)), `${type} after round ${r}`).toBe(true);
      }
    }
  });

  it("enemy counts ramp from about 3 to about 8 and never pass 10", () => {
    const counts = levels.map((l) => l.enemies.length);
    expect(counts[0]).toBeGreaterThanOrEqual(2);
    expect(counts[0]).toBeLessThanOrEqual(3);
    expect(Math.max(...counts)).toBeLessThanOrEqual(10);
    const avg = (a: number[]): number => a.reduce((s, v) => s + v, 0) / a.length;
    expect(avg(counts.slice(0, 5))).toBeLessThan(avg(counts.slice(10, 15)));
    expect(avg(counts.slice(10, 15))).toBeLessThan(avg(counts.slice(20, 25)));
    expect(avg(counts.slice(20, 25))).toBeGreaterThanOrEqual(7.5);
  });

  it("staggers spawns: first two at 0, the rest multiples of 30", () => {
    for (const lv of levels) {
      lv.enemies.forEach((e, i) => {
        if (i < 2) expect(e.delayTicks).toBe(0);
        else {
          expect(e.delayTicks % 30).toBe(0);
          expect(e.delayTicks).toBeGreaterThan(0);
        }
      });
    }
  });

  it("follows the flag schedule (water from 4, fire from 8, lightning from 12; two flags later)", () => {
    const has = (r: number, k: "waterBubbles" | "fireBubbles" | "lightningBubbles"): boolean => levels[r - 1]!.flags?.[k] === true;
    const rounds = (k: "waterBubbles" | "fireBubbles" | "lightningBubbles"): number[] => levels.filter((l) => l.flags?.[k]).map((l) => l.round);
    expect(rounds("waterBubbles")[0]).toBe(4);
    expect(rounds("fireBubbles")[0]).toBe(8);
    expect(rounds("lightningBubbles")[0]).toBe(12);
    expect(has(4, "fireBubbles") || has(4, "lightningBubbles")).toBe(false);
    for (const k of ["waterBubbles", "fireBubbles", "lightningBubbles"] as const) {
      expect(rounds(k).length).toBeGreaterThanOrEqual(2);
      expect(rounds(k).length).toBeLessThanOrEqual(5);
    }
    expect(levels.some((l) => Object.values(l.flags ?? {}).filter(Boolean).length === 2)).toBe(true);
    expect(levels.filter((l) => l.flags === undefined).length).toBeGreaterThanOrEqual(12);
  });

  it("has a few rounds with gentle drift currents", () => {
    const drifty = levels.filter((l) => l.drift.length > 0);
    expect(drifty.length).toBeGreaterThanOrEqual(2);
    for (const lv of drifty) for (const d of lv.drift) expect(Math.abs(d.dx) <= 1 && Math.abs(d.dy) <= 1).toBe(true);
  });
});
