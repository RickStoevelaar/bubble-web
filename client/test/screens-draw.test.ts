import { describe, expect, it } from "vitest";
import { FIELD_H, FIELD_W } from "@bubble/shared";
import { makeHarness } from "./harness";
import { bigWidth, drawBig } from "../src/screens/bigtext";
import { ENDING_CARD_TICKS, drawEnding, endingDone, endingKind } from "../src/screens/ending";
import { drawGameOver } from "../src/screens/gameover";
import {
  PER_PAGE,
  drawScores,
  fetchScores,
  matchOwn,
  namesText,
  pageCount,
  parseScores,
  scoresKey,
  scoresTap,
  turnPage,
  type ScoreRow,
} from "../src/screens/scores";
import { FALLBACK_CHAR, fontSafe } from "../src/screens/text";
import { TICKER_MS, bubblePos, drawTitle, tickerIndex } from "../src/screens/title";

/** The glyph/sprite names drawn, in order. */
const names = (log: string[]): string[] =>
  log.filter((l) => l.startsWith("draw ")).map((l) => l.split(" ")[2]!.split("#")[0]!);
/** Text drawn through the HUD font (spaces are not drawn). */
const text = (log: string[]): string => names(log).filter((n) => n.startsWith("font_")).map((n) => n.slice(5)).join("");
const sprites = (log: string[], prefix: string): number => names(log).filter((n) => n.startsWith(prefix)).length;

const row = (score: number, n = ["AMY", "BOB"], round = 3): ScoreRow => ({ names: n, score, round, date: "2026-01-01T00:00:00.000Z" });

describe("font fallback", () => {
  it("upper-cases, keeps spaces and maps what the font lacks to '.'", () => {
    expect(FALLBACK_CHAR).toBe(".");
    expect(fontSafe("Amy b-2")).toBe("AMY B-2");
    expect(fontSafe("a?b")).toBe("A.B");
    expect(fontSafe("é<script>")).toBe("..SCRIPT.");
    expect(fontSafe("x")).toBe("X"); // a typed x is a letter, never the multiply sign
  });
  it("draws one fallback per code point (an emoji is one '.', not two) and drops control characters", () => {
    expect(fontSafe("a\u{1F600}b")).toBe("A.B");
    expect(fontSafe("a\u0000\n\u009fb")).toBe("AB");
  });
  it("never produces markup that could matter: it is canvas text, and every output char is font-drawable", () => {
    const evil = "<img src=x onerror=alert(1)>&\"'`";
    expect(fontSafe(evil)).toMatch(/^[A-Z0-9:.!+\- ]*$/);
  });
  it("is what the scores table draws for hostile names", () => {
    const h = makeHarness();
    drawScores(h.ctx, h.sheet, { data: { status: "ready", rows: [row(10, ["<b>hi</b>"])] }, page: 0 });
    expect(text(h.main)).toContain(".B.HI..B."); // "<b>hi</b>": markup characters are plain fallback dots
  });
});

describe("big lettering", () => {
  it("fills dots for lit pixels only, at the given scale", () => {
    const h = makeHarness();
    drawBig(h.ctx, "I", 0, 0, 4, "#fff");
    const fills = h.main.filter((l) => l.startsWith("fill #fff"));
    expect(fills.length).toBe(5 + 5 + 5); // the I glyph: a 5-dot top bar, a 5-row stem, a 5-dot bottom bar
    expect(fills.every((f) => f.endsWith(" 4 4"))).toBe(true);
    expect(bigWidth("AB", 4)).toBe(2 * 6 * 4 - 4);
  });
});

describe("title screen", () => {
  const base = { t: 0, scores: null, touch: true, devRound: null };

  it("draws the logo (many dots in two colours with a shadow), bubbles and both heroes", () => {
    const h = makeHarness();
    drawTitle(h.ctx, h.sheet, base);
    const fills = h.main.filter((l) => l.startsWith("fill "));
    for (const c of ["#ffe34a", "#ff8a3a", "#3a1a5a", "#bfe9ff", "#4aa8ff", "#10306a"]) expect(fills.some((f) => f.startsWith(`fill ${c} `))).toBe(true);
    expect(sprites(h.main, "bubble_normal")).toBeGreaterThanOrEqual(5);
    expect(names(h.main)).toContain("hero_pip");
    expect(names(h.main)).toContain("hero_pop");
    // the logo is lettering, not HUD text
    expect(text(h.main)).not.toContain("BUBBLEWEB");
  });

  it("blinks the start line and picks the wording from the device", () => {
    const on = makeHarness();
    drawTitle(on.ctx, on.sheet, { ...base, t: 0 });
    expect(text(on.main)).toBe("TOUCHTOSTART");
    const off = makeHarness();
    drawTitle(off.ctx, off.sheet, { ...base, t: 500 });
    expect(text(off.main)).toBe("");
    const key = makeHarness();
    drawTitle(key.ctx, key.sheet, { ...base, touch: false });
    expect(text(key.main)).toBe("PRESSANYKEY");
  });

  it("shows the round shortcut hint only with a dev round", () => {
    const a = makeHarness();
    drawTitle(a.ctx, a.sheet, base);
    expect(text(a.main)).not.toContain("DEV");
    const b = makeHarness();
    drawTitle(b.ctx, b.sheet, { ...base, devRound: 7 });
    expect(text(b.main)).toContain("DEV:STARTROUND7");
  });

  it("rotates a ticker over the top 3 scores only", () => {
    const rows = [row(900, ["A"]), row(800, ["B"]), row(700, ["C"]), row(600, ["D"])];
    const shown: string[] = [];
    for (let k = 0; k < 6; k++) {
      const h = makeHarness();
      drawTitle(h.ctx, h.sheet, { ...base, t: k * TICKER_MS, scores: rows });
      const t = text(h.main);
      shown.push(["1A", "2B", "3C", "4D"].filter((e) => t.includes(e)).join(""));
    }
    expect(shown).toEqual(["1A", "2B", "3C", "1A", "2B", "3C"]); // the 4th place is never shown
    expect(tickerIndex(0, 3)).toBe(0);
    expect(tickerIndex(TICKER_MS, 3)).toBe(1);
    expect(tickerIndex(3 * TICKER_MS, 3)).toBe(0);
    expect(tickerIndex(5, 0)).toBe(0);
  });

  it("no scores, no ticker", () => {
    const h = makeHarness();
    drawTitle(h.ctx, h.sheet, { ...base, scores: [] });
    expect(text(h.main)).not.toContain("BEST");
  });

  it("bubbles drift upward over time, stay inside the field horizontally and wrap", () => {
    for (let i = 0; i < 9; i++) {
      let wraps = 0;
      let prev = bubblePos(i, 0).y;
      for (let t = 100; t < 60000; t += 100) {
        const p = bubblePos(i, t);
        if (p.y > prev) wraps++; // only a wrap from the top back to the bottom may move down
        else expect(p.y).toBeLessThanOrEqual(prev);
        prev = p.y;
        expect(p.x).toBeGreaterThan(0);
        expect(p.x).toBeLessThan(FIELD_W);
        expect(p.y).toBeLessThanOrEqual(FIELD_H + 12);
        expect(p.y).toBeGreaterThan(-20);
      }
      expect(wraps).toBeGreaterThan(0);
      expect(wraps).toBeLessThan(10);
    }
  });
});

describe("scores screen", () => {
  const many = Array.from({ length: 20 }, (_, i) => row(2000 - i * 10, ["P" + i]));

  it("says LOADING while loading and NO SCORES YET on failure or an empty table", () => {
    const a = makeHarness();
    drawScores(a.ctx, a.sheet, { data: { status: "loading" }, page: 0 });
    expect(text(a.main)).toContain("LOADING");
    for (const data of [{ status: "failed" as const }, { status: "ready" as const, rows: [] }]) {
      const b = makeHarness();
      drawScores(b.ctx, b.sheet, { data, page: 0 });
      expect(text(b.main)).toContain("NOSCORESYET");
      expect(text(b.main)).toContain("BACK");
    }
  });

  it("draws rank, names joined with + (the font has no &), score and round, and the BACK button", () => {
    const h = makeHarness();
    drawScores(h.ctx, h.sheet, { data: { status: "ready", rows: [row(1234, ["Amy", "Bob"], 7)] }, page: 0 });
    const t = text(h.main);
    expect(t).toContain("1AMY");
    expect(t).toContain("1234");
    expect(t).toContain("BACK");
    expect(namesText(["Amy", "Bob"])).toBe("AMY+BOB");
    expect(namesText([])).toBe("PLAYER");
    expect(namesText(["", "  "])).toBe("PLAYER");
  });

  it("pages 10 rows at a time", () => {
    expect(PER_PAGE).toBe(10);
    expect(pageCount(0)).toBe(1);
    expect(pageCount(10)).toBe(1);
    expect(pageCount(11)).toBe(2);
    expect(pageCount(20)).toBe(2);
    const p0 = makeHarness();
    drawScores(p0.ctx, p0.sheet, { data: { status: "ready", rows: many }, page: 0 });
    const p1 = makeHarness();
    drawScores(p1.ctx, p1.sheet, { data: { status: "ready", rows: many }, page: 1 });
    expect(text(p0.main)).toContain("P0");
    expect(text(p0.main)).not.toContain("P10");
    expect(text(p1.main)).toContain("P10");
    expect(text(p1.main)).not.toContain("P0" + "1990");
    expect(text(p1.main)).toContain("PAGE2-2");
    expect(text(p0.main)).toContain("PAGE1-2");
    // an out-of-range page is clamped, not blank
    const p9 = makeHarness();
    drawScores(p9.ctx, p9.sheet, { data: { status: "ready", rows: many }, page: 9 });
    expect(text(p9.main)).toContain("P10");
  });

  it("turns pages with wrap-around and a single page stays put", () => {
    expect(turnPage(0, "next", 20)).toBe(1);
    expect(turnPage(1, "next", 20)).toBe(0);
    expect(turnPage(0, "prev", 20)).toBe(1);
    expect(turnPage(0, "next", 5)).toBe(0);
    expect(turnPage(1, "back", 20)).toBe(1);
  });

  it("taps: BACK box goes back, anywhere else pages; keys map to actions", () => {
    expect(scoresTap(20, 205)).toBe("back");
    expect(scoresTap(128, 100)).toBe("next");
    expect(scoresTap(100, 205)).toBe("next");
    expect(scoresKey("Escape")).toBe("back");
    expect(scoresKey("ArrowRight")).toBe("next");
    expect(scoresKey("ArrowLeft")).toBe("prev");
    expect(scoresKey("q")).toBeNull();
  });

  it("highlights the player's own run (score + round + names) and no other row", () => {
    const rows = [row(900, ["Zed"]), row(500, ["Amy", "Bob"], 4), row(500, ["Cy"], 4)];
    expect(matchOwn(rows, { score: 500, round: 4, names: ["amy", "BOB"] })).toBe(1);
    expect(matchOwn(rows, { score: 500, round: 4, names: ["Cy"] })).toBe(2);
    expect(matchOwn(rows, { score: 500, round: 5, names: ["Cy"] })).toBe(-1);
    expect(matchOwn(rows, { score: 900, round: 3 })).toBe(0);
    expect(matchOwn(rows, null)).toBe(-1);
    const plain = makeHarness();
    drawScores(plain.ctx, plain.sheet, { data: { status: "ready", rows }, page: 0 });
    const own = makeHarness();
    drawScores(own.ctx, own.sheet, { data: { status: "ready", rows }, page: 0, own: { score: 500, round: 4, names: ["Cy"] } });
    const hi = (l: string[]) => l.filter((e) => e.startsWith("fill #3b5bdb 4 "));
    expect(hi(plain.main).length).toBe(0);
    expect(hi(own.main).length).toBe(1);
    expect(text(own.main)).toContain("YOU");
  });

  it("parses the endpoint body defensively and fetchScores never throws", async () => {
    expect(parseScores(null)).toEqual([]);
    expect(parseScores({ scores: "x" })).toEqual([]);
    expect(parseScores({ scores: [row(5), { names: 1, score: 5, round: 1 }, null, 7, { names: ["a"], score: "5", round: 1 }] })).toHaveLength(1);
    expect(parseScores({ scores: Array.from({ length: 50 }, (_, i) => row(i)) })).toHaveLength(20);
    const ok = (async () => ({ ok: true, json: async () => ({ scores: [row(5)] }) })) as unknown as typeof fetch;
    expect(await fetchScores(ok)).toEqual({ status: "ready", rows: [row(5)] });
    const bad = (async () => ({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch;
    expect(await fetchScores(bad)).toEqual({ status: "failed" });
    const boom = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await fetchScores(boom)).toEqual({ status: "failed" });
    const notJson = (async () => ({ ok: true, json: async () => Promise.reject(new Error("x")) })) as unknown as typeof fetch;
    expect(await fetchScores(notJson)).toEqual({ status: "failed" });
  });
});

describe("ending placeholder (extension point for 23b)", () => {
  it("picks the card kind from state.ending", () => {
    expect(endingKind({ ending: "true" })).toBe("true");
    expect(endingKind({ ending: "bad" })).toBe("bad");
    expect(endingKind({ ending: null })).toBe("bad");
  });

  it("draws WELL DONE for the true ending and THE END for the bad one (big lettering plus a line of text)", () => {
    const t = makeHarness();
    drawEnding(t.ctx, t.sheet, { ending: "true" }, 0);
    const b = makeHarness();
    drawEnding(b.ctx, b.sheet, { ending: "bad" }, 0);
    expect(text(t.main)).toBe("THANKSFORPLAYING!");
    expect(text(b.main)).toBe("TRYAGAINTOGETHER!");
    // the headline is drawn from dots: different colour per kind, and different dot counts
    const dots = (l: string[], c: string) => l.filter((e) => e.startsWith(`fill ${c} `)).length;
    expect(dots(t.main, "#ffe34a")).toBeGreaterThan(20);
    expect(dots(b.main, "#bfe9ff")).toBeGreaterThan(20);
    expect(dots(t.main, "#bfe9ff")).toBe(0);
    // an explicit kind overrides the state (the seam 23b can use)
    const o = makeHarness();
    drawEnding(o.ctx, o.sheet, { ending: "bad" }, 0, "true");
    expect(text(o.main)).toBe("THANKSFORPLAYING!");
  });

  it("is done after ENDING_CARD_TICKS", () => {
    expect(endingDone(ENDING_CARD_TICKS - 1)).toBe(false);
    expect(endingDone(ENDING_CARD_TICKS)).toBe(true);
  });
});

describe("game-over canvas overlay", () => {
  const players = [
    { id: 0, score: 1200 },
    { id: 1, score: 340 },
  ] as never;

  it("shows GAME OVER dots, both scores, CONTINUE? and the countdown number", () => {
    const h = makeHarness();
    drawGameOver(h.ctx, h.sheet, { players }, 7, false);
    const t = text(h.main);
    expect(t).toContain("1UP1200");
    expect(t).toContain("2UP340");
    expect(t).toContain("CONTINUE");
    expect(h.main.filter((l) => l.startsWith("fill #ff6b6b ")).length).toBeGreaterThan(20);
    expect(h.main.filter((l) => l.startsWith("fill #ffe34a ")).length).toBeGreaterThan(5);
  });

  it("a one-player run shows one score; after an answer it waits instead of counting", () => {
    const h = makeHarness();
    drawGameOver(h.ctx, h.sheet, { players: [{ id: 0, score: 5 }] as never }, 3, true);
    const t = text(h.main);
    expect(t).toContain("1UP5");
    expect(t).not.toContain("2UP");
    expect(t).toContain("WAITING.");
    expect(t).not.toContain("CONTINUE");
    expect(h.main.filter((l) => l.startsWith("fill #ffe34a ")).length).toBe(0);
  });
});
