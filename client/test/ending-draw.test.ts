import { describe, expect, it } from "vitest";
import { SUPER_CODE } from "@bubble/shared";
import { makeHarness } from "./harness";
import { drawBig } from "../src/screens/bigtext";
import { CODE_COLOR, CODE_SCALE, CODE_Y, codeX, drawEnding, endingDone, endingKind } from "../src/screens/ending";
import {
  BEATS,
  CODE_BEAT,
  CODE_SHOW_TICKS,
  CODE_START_TICKS,
  CREDITS,
  ENDING_TOTAL_TICKS_BAD,
  ENDING_TOTAL_TICKS_TRUE,
  TYPE_TICKS_PER_CHAR,
  totalTicks,
} from "../src/screens/ending-timeline";
import { fontSafe } from "../src/screens/text";

const names = (log: string[]): string[] =>
  log.filter((l) => l.startsWith("draw ")).map((l) => l.split(" ")[2]!.split("#")[0]!);
const text = (log: string[]): string => names(log).filter((n) => n.startsWith("font_")).map((n) => n.slice(5)).join("");
const count = (log: string[], name: string): number => names(log).filter((n) => n === name).length;

function scene(kind: "bad" | "true", ticks: number) {
  const h = makeHarness();
  drawEnding(h.ctx, h.sheet, { ending: kind }, ticks, kind);
  return h;
}
const codeFills = (log: string[]): string[] => log.filter((l) => l.startsWith(`fill ${CODE_COLOR} `));
function expectedCode(): string[] {
  const e = makeHarness();
  drawBig(e.ctx, SUPER_CODE, codeX(), CODE_Y, CODE_SCALE, CODE_COLOR);
  return e.main;
}
const sample = (kind: "bad" | "true"): number[] => {
  const out: number[] = [];
  for (let t = 0; t <= totalTicks(kind) + 60; t += 37) out.push(t);
  return out;
};

describe("kind selection", () => {
  it("true only for state.ending === 'true'", () => {
    expect(endingKind({ ending: "true" })).toBe("true");
    expect(endingKind({ ending: "bad" })).toBe("bad");
    expect(endingKind({ ending: null })).toBe("bad");
    expect(endingKind({ ending: "weird" as never })).toBe("bad");
  });
});

describe("the bad ending scene", () => {
  it("is a dusk hill: a hero, a faraway friend, stars that appear over time", () => {
    const early = scene("bad", 10);
    const late = scene("bad", ENDING_TOTAL_TICKS_BAD - 5);
    expect(count(early.main, "hero_pip")).toBe(1);
    expect(count(early.main, "hero_pop")).toBe(0);
    expect(count(early.main, "npc_friend")).toBe(1);
    expect(count(late.main, "icon_star")).toBeGreaterThan(count(early.main, "icon_star"));
    expect(count(late.main, "icon_star")).toBeGreaterThan(3);
  });

  it("types the captions letter by letter (prefix grows, never skips ahead)", () => {
    const b = BEATS.bad[0]!;
    const full = b.lines.join("");
    let prevLen = 0;
    for (let n = 0; n <= full.length; n += 3) {
      const t = scene("bad", b.start + n * TYPE_TICKS_PER_CHAR).main;
      const s = text(t).replace("TAPTOSKIP", "");
      expect(s).toBe(full.slice(0, n).replace(/ /g, ""));
      expect(s.length).toBeGreaterThanOrEqual(prevLen);
      prevLen = s.length;
    }
  });

  it("ends on the required line and never shows the code or its instruction", () => {
    const last = BEATS.bad[BEATS.bad.length - 1]!;
    const t = text(scene("bad", ENDING_TOTAL_TICKS_BAD - 2).main);
    expect(t).toContain("BUTTHEROUNDSAREENDLESS.TRYAGAINWITHAFRIEND.");
    expect(last.lines).toHaveLength(2);
    for (const tk of sample("bad")) {
      const h = scene("bad", tk);
      expect(codeFills(h.main), `tick ${tk}`).toEqual([]);
      expect(text(h.main)).not.toContain("ROOMCODE");
      expect(text(h.main)).not.toContain(SUPER_CODE);
    }
  });
});

describe("the true ending scene", () => {
  it("shows both heroes, the freed friend with confetti bubbles after the cage opens, hearts, and no code early", () => {
    const early = scene("true", 20);
    expect(count(early.main, "hero_pip")).toBe(1);
    expect(count(early.main, "hero_pop")).toBe(1);
    const mid = scene("true", BEATS.true[2]!.start + 200);
    expect(count(mid.main, "npc_friend")).toBe(1);
    expect(count(mid.main, "bubble_normal")).toBeGreaterThan(3);
    expect(count(mid.main, "icon_heart")).toBeGreaterThan(0);
    expect(codeFills(early.main)).toEqual([]);
    expect(codeFills(mid.main)).toEqual([]);
  });

  it("draws SUPER_CODE exactly (the same dots drawBig makes) during the whole window, and not before or after", () => {
    const want = expectedCode();
    expect(want.length).toBeGreaterThan(30);
    for (const t of [CODE_START_TICKS, CODE_START_TICKS + 1, CODE_START_TICKS + 200, CODE_START_TICKS + CODE_SHOW_TICKS - 1]) {
      expect(codeFills(scene("true", t).main), `tick ${t}`).toEqual(want);
    }
    expect(codeFills(scene("true", CODE_START_TICKS - 1).main)).toEqual([]);
    expect(codeFills(scene("true", CODE_START_TICKS + CODE_SHOW_TICKS).main)).toEqual([]);
    expect(codeFills(scene("true", ENDING_TOTAL_TICKS_TRUE - 1).main)).toEqual([]);
  });

  it("the code is wide and tall enough to read and fits the field", () => {
    expect(SUPER_CODE).toMatch(/^[A-Z0-9]{4,8}$/);
    expect(CODE_SCALE).toBeGreaterThanOrEqual(5);
    expect(codeX()).toBeGreaterThanOrEqual(8);
    expect(codeX() + SUPER_CODE.length * 6 * CODE_SCALE).toBeLessThanOrEqual(256 - 8);
  });

  it("types the instruction under the code, in full by the end of its beat", () => {
    const t = text(scene("true", CODE_BEAT.start + CODE_BEAT.lines.join("").length * TYPE_TICKS_PER_CHAR + 1).main);
    expect(t).toContain("TYPETHISASTHEROOMCODE");
    expect(t).toContain("TOOPENTHESUPERROOM");
    expect(text(scene("true", CODE_START_TICKS + 2).main)).not.toContain("ROOMCODE");
  });

  it("closes with the credits: original names only", () => {
    const end = text(scene("true", ENDING_TOTAL_TICKS_TRUE - 1).main);
    for (const l of CREDITS.lines.slice(1)) expect(end).toContain(l.replace(/ /g, ""));
    // the first credit line is the big logo lettering (dots, not font glyphs)
    expect(scene("true", ENDING_TOTAL_TICKS_TRUE - 1).main.filter((l) => l.startsWith("fill #ffe34a ")).length).toBeGreaterThan(30);
    expect(CREDITS.lines[0]).toBe("BUBBLE WEB");
  });
});

describe("drawing is safe", () => {
  it.each(["bad", "true"] as const)("%s: only font-safe strings, only known sprites, deterministic, no NaN, inside the field", (kind) => {
    for (const tk of [...sample(kind), -5, Number.NaN, 1e9]) {
      const a = scene(kind, tk);
      const b = scene(kind, tk);
      expect(a.main, `tick ${tk}`).toEqual(b.main);
      const glyphs = names(a.main).filter((n) => n.startsWith("font_")).map((n) => n.slice(5));
      for (const g of glyphs) expect(fontSafe(g)).toBe(g);
      for (const n of names(a.main)) expect(n).not.toBe("?");
      for (const l of a.main) {
        expect(l, `tick ${tk}`).not.toMatch(/NaN|undefined|Infinity/);
        if (l.startsWith("fill ")) {
          const parts = l.split(" ");
          const [x, y, w, hh] = parts.slice(-4).map(Number) as [number, number, number, number];
          expect(x + w).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(256);
          expect(y).toBeLessThanOrEqual(224);
          expect(hh).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it("shows a skip hint only once skipping is allowed", () => {
    expect(text(scene("bad", 30).main)).not.toContain("SKIP");
    expect(text(scene("bad", 100).main)).toContain("SKIP");
    expect(text(scene("true", CODE_START_TICKS + 10).main)).not.toContain("SKIP");
    expect(text(scene("true", CODE_START_TICKS + 200).main)).toContain("SKIP");
  });

  it("endingDone is per kind", () => {
    expect(endingDone(ENDING_TOTAL_TICKS_BAD, "bad")).toBe(true);
    expect(endingDone(ENDING_TOTAL_TICKS_BAD, "true")).toBe(false);
  });
});
