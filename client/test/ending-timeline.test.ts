import { describe, expect, it } from "vitest";
import { SUPER_CODE } from "@bubble/shared";
import {
  BEATS,
  CODE_BEAT,
  CODE_READ_TICKS,
  CODE_SHOW_TICKS,
  CODE_START_TICKS,
  CREDITS,
  ENDING_TOTAL_TICKS_BAD,
  ENDING_TOTAL_TICKS_TRUE,
  EndingClock,
  SKIP_GRACE_TICKS,
  TYPE_TICKS_PER_CHAR,
  beatChars,
  beatEnd,
  canSkip,
  codeVisible,
  endingDone,
  totalTicks,
  typedLines,
  typedPrefix,
} from "../src/screens/ending-timeline";
import { SUPER_CODE_KEY, readSuperCode, rememberSuperCode } from "../src/screens/super-code";
import { fontSafe } from "../src/screens/text";

const KINDS = ["bad", "true"] as const;

describe("beats are data", () => {
  it.each(KINDS)("%s: ordered, non-overlapping, font-safe, fit the 256 px field", (kind) => {
    const beats = BEATS[kind];
    expect(beats.length).toBeGreaterThanOrEqual(3);
    let prevEnd = 0;
    for (const b of beats) {
      expect(b.start).toBeGreaterThanOrEqual(prevEnd);
      prevEnd = beatEnd(b);
      expect(b.hold).toBeGreaterThan(0);
      for (const l of b.lines) {
        expect(fontSafe(l)).toBe(l);
        expect(l.length).toBeLessThanOrEqual(42);
      }
    }
    expect(totalTicks(kind)).toBeGreaterThan(prevEnd - 1);
  });

  it("the bad ending has 3-4 captions and ends on the required line, no code anywhere", () => {
    const b = BEATS.bad;
    expect(b.length).toBeGreaterThanOrEqual(3);
    expect(b.length).toBeLessThanOrEqual(4);
    expect(b[b.length - 1]!.lines.join(" ")).toBe("BUT THE ROUNDS ARE ENDLESS. TRY AGAIN WITH A FRIEND.");
    expect(JSON.stringify(b)).not.toContain(SUPER_CODE);
  });

  it("the true ending: captions, then the code beat, then credits with original names only", () => {
    const last = BEATS.true[BEATS.true.length - 1]!;
    expect(CODE_START_TICKS).toBeGreaterThanOrEqual(beatEnd(last));
    expect(CODE_BEAT.lines.join(" ")).toBe("TYPE THIS AS THE ROOM CODE TO OPEN THE SUPER ROOM");
    expect(CODE_BEAT.start).toBeGreaterThanOrEqual(CODE_START_TICKS);
    expect(beatEnd(CODE_BEAT)).toBeLessThanOrEqual(CODE_START_TICKS + CODE_SHOW_TICKS);
    expect(CREDITS.lines).toEqual(["BUBBLE WEB", "A HOUSEHOLD PROJECT", "THANKS FOR PLAYING"]);
    expect(CREDITS.start).toBeGreaterThanOrEqual(CODE_START_TICKS + CODE_SHOW_TICKS);
    for (const l of CREDITS.lines) expect(fontSafe(l)).toBe(l);
  });
});

describe("totals and done", () => {
  it("totals cover the last thing shown and are what endingDone waits for", () => {
    expect(ENDING_TOTAL_TICKS_BAD).toBe(totalTicks("bad"));
    expect(ENDING_TOTAL_TICKS_TRUE).toBe(totalTicks("true"));
    const lastBad = BEATS.bad[BEATS.bad.length - 1]!;
    expect(ENDING_TOTAL_TICKS_BAD).toBeGreaterThan(beatEnd(lastBad));
    expect(ENDING_TOTAL_TICKS_TRUE).toBeGreaterThan(CREDITS.start + (CREDITS.lines.length - 1) * CREDITS.stagger);
    for (const k of KINDS) {
      expect(endingDone(totalTicks(k) - 1, k)).toBe(false);
      expect(endingDone(totalTicks(k), k)).toBe(true);
      expect(endingDone(totalTicks(k) + 5000, k)).toBe(true);
      expect(endingDone(0, k)).toBe(false);
      expect(endingDone(-3, k)).toBe(false);
      expect(endingDone(Number.NaN, k)).toBe(false);
    }
  });
});

describe("typewriter", () => {
  it("is monotonic, one more glyph every TYPE_TICKS_PER_CHAR, clamped to the caption length", () => {
    for (const kind of KINDS) {
      for (const b of BEATS[kind]) {
        const n = beatChars(b);
        expect(n).toBe(b.lines.join("").length);
        let prev = 0;
        for (let t = b.start - 5; t <= beatEnd(b) + 5; t++) {
          const c = typedPrefix(b, t);
          expect(c).toBeGreaterThanOrEqual(prev);
          expect(c).toBeLessThanOrEqual(n);
          prev = c;
        }
        expect(typedPrefix(b, b.start)).toBe(0);
        expect(typedPrefix(b, b.start + TYPE_TICKS_PER_CHAR)).toBe(1);
        expect(typedPrefix(b, b.start + TYPE_TICKS_PER_CHAR * n)).toBe(n);
        expect(typedPrefix(b, b.start - 100)).toBe(0);
      }
    }
  });
  it("typedLines splits the typed glyphs over the lines in order", () => {
    const b = { start: 0, lines: ["ABC", "DE"], hold: 10 };
    expect(typedLines(b, 0)).toEqual(["", ""]);
    expect(typedLines(b, 3 * TYPE_TICKS_PER_CHAR)).toEqual(["ABC", ""]);
    expect(typedLines(b, 4 * TYPE_TICKS_PER_CHAR)).toEqual(["ABC", "D"]);
    expect(typedLines(b, 999)).toEqual(["ABC", "DE"]);
  });
});

describe("code window and skip gating", () => {
  it("the code is visible for at least 8 seconds, only in the window", () => {
    expect(CODE_SHOW_TICKS).toBeGreaterThanOrEqual(8 * 60);
    expect(codeVisible(CODE_START_TICKS - 1)).toBe(false);
    expect(codeVisible(CODE_START_TICKS)).toBe(true);
    expect(codeVisible(CODE_START_TICKS + CODE_SHOW_TICKS - 1)).toBe(true);
    expect(codeVisible(CODE_START_TICKS + CODE_SHOW_TICKS)).toBe(false);
    expect(codeVisible(Number.NaN)).toBe(false);
  });

  it("bad ending: skipping only after the 60 tick grace", () => {
    expect(SKIP_GRACE_TICKS).toBe(60);
    expect(canSkip(0, "bad")).toBe(false);
    expect(canSkip(59, "bad")).toBe(false);
    expect(canSkip(60, "bad")).toBe(true);
    expect(canSkip(ENDING_TOTAL_TICKS_BAD + 10, "bad")).toBe(true);
    expect(canSkip(Number.NaN, "bad")).toBe(false);
  });

  it("true ending: not before the code has been shown for 3 s, then always", () => {
    expect(CODE_READ_TICKS).toBe(180);
    expect(canSkip(60, "true")).toBe(false);
    expect(canSkip(CODE_START_TICKS - 1, "true")).toBe(false);
    expect(canSkip(CODE_START_TICKS, "true")).toBe(false);
    expect(canSkip(CODE_START_TICKS + CODE_READ_TICKS - 1, "true")).toBe(false);
    expect(canSkip(CODE_START_TICKS + CODE_READ_TICKS, "true")).toBe(true);
    expect(canSkip(CODE_START_TICKS + CODE_SHOW_TICKS + 1, "true")).toBe(true);
    expect(canSkip(ENDING_TOTAL_TICKS_TRUE + 1, "true")).toBe(true);
  });
});

describe("EndingClock (robust to a server clock that does not advance)", () => {
  it("passes a live server counter through", () => {
    const c = new EndingClock();
    expect(c.at(0, 0)).toBe(0);
    expect(c.at(10, 100)).toBe(10);
    expect(c.at(20, 200)).toBe(20);
  });
  it("falls back to elapsed client time when endingTicks stops advancing, and never goes backwards", () => {
    const c = new EndingClock();
    c.at(0, 1000);
    expect(c.at(0, 1100)).toBeLessThan(10); // a snapshot gap is not yet a stall
    const v = c.at(0, 3000); // 2 s of nothing: about 120 ticks of client time
    expect(v).toBeGreaterThan(100);
    expect(v).toBeLessThan(140);
    expect(c.at(5, 3100)).toBeGreaterThanOrEqual(v); // the server wakes up behind: monotonic anyway
  });
  it("copes with junk input", () => {
    const c = new EndingClock();
    expect(c.at(Number.NaN, 0)).toBe(0);
    expect(c.at(-5, 10)).toBe(0);
    expect(Number.isFinite(c.at(Infinity, 20))).toBe(true);
  });
});

describe("remembered code", () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };
  it("stores under bubbleweb.superCode and reads it back only when it is the real code", () => {
    expect(SUPER_CODE_KEY).toBe("bubbleweb.superCode");
    const s = mem();
    expect(readSuperCode(s, SUPER_CODE)).toBeNull();
    rememberSuperCode(s, SUPER_CODE);
    expect(s.m.get("bubbleweb.superCode")).toBe(SUPER_CODE);
    expect(readSuperCode(s, SUPER_CODE)).toBe(SUPER_CODE);
    s.m.set(SUPER_CODE_KEY, "<b>x</b>");
    expect(readSuperCode(s, SUPER_CODE)).toBeNull();
  });
  it("never throws: null store, throwing getItem/setItem", () => {
    const bad = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(() => rememberSuperCode(bad, SUPER_CODE)).not.toThrow();
    expect(() => rememberSuperCode(null, SUPER_CODE)).not.toThrow();
    expect(readSuperCode(bad, SUPER_CODE)).toBeNull();
    expect(readSuperCode(null, SUPER_CODE)).toBeNull();
  });
});
