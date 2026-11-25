/**
 * The ending scenes as data. Everything is a pure function of `endingTicks` (60 per second), so the same tick
 * always draws the same frame and the skip rules can be tested without a canvas.
 */

export type EndingKind = "bad" | "true";

/** One caption: starts at `start`, types one glyph per TYPE_TICKS_PER_CHAR over all its lines, then holds. */
export interface Beat {
  start: number;
  lines: readonly string[];
  hold: number;
}

export const TYPE_TICKS_PER_CHAR = 3;
/** Fade-out / breathing room after the last thing on screen. */
export const TAIL_TICKS = 90;
/** Skipping is never possible in the first second. */
export const SKIP_GRACE_TICKS = 60;
/** The code must have been on screen this long before the true ending can be skipped. */
export const CODE_READ_TICKS = 180;

export const beatChars = (b: Beat): number => b.lines.reduce((n, l) => n + l.length, 0);
export const beatTypedEnd = (b: Beat): number => b.start + beatChars(b) * TYPE_TICKS_PER_CHAR;
export const beatEnd = (b: Beat): number => beatTypedEnd(b) + b.hold;

/** Glyphs typed so far (0 before the start, all of them once typing is over). */
export function typedPrefix(b: Beat, ticks: number): number {
  if (!(ticks > b.start)) return 0;
  return Math.min(beatChars(b), Math.floor((ticks - b.start) / TYPE_TICKS_PER_CHAR));
}

/** The caption lines with only the typed glyphs of each (a not-yet-reached line is ""). */
export function typedLines(b: Beat, ticks: number): string[] {
  let left = typedPrefix(b, ticks);
  return b.lines.map((l) => {
    const take = Math.min(left, l.length);
    left -= take;
    return l.slice(0, take);
  });
}

/** The caption that is on screen at `ticks` (typing or holding), if any. */
export function activeBeat(beats: readonly Beat[], ticks: number): Beat | null {
  for (const b of beats) if (ticks >= b.start && ticks < beatEnd(b)) return b;
  return null;
}

export const BEATS: Record<EndingKind, readonly Beat[]> = {
  bad: [
    { start: 60, lines: ["THE LAST BUBBLE HAS POPPED.", "THE SKY TURNS TO DUSK."], hold: 100 },
    { start: 330, lines: ["A FRIEND IS OUT THERE", "FAR AWAY ON THE NEXT HILL."], hold: 100 },
    { start: 620, lines: ["THE FIRST STARS COME OUT."], hold: 90 },
    { start: 860, lines: ["BUT THE ROUNDS ARE ENDLESS.", "TRY AGAIN WITH A FRIEND."], hold: 330 },
  ],
  true: [
    { start: 60, lines: ["THE BIG BAD BOSS IS BEATEN!", "THE CAGE SWINGS OPEN."], hold: 90 },
    { start: 330, lines: ["A TINY FRIEND TUMBLES OUT.", "SAFE AT LAST!"], hold: 90 },
    { start: 560, lines: ["PIP AND POP CHEER TOGETHER.", "THE SUN RISES ON A NEW DAY."], hold: 70 },
  ],
};

/** Index of the true-ending beat at which the cage opens and the friend hops out (the second caption). */
export const FRIEND_FREED_TICKS = BEATS.true[1]!.start;
/** The sun starts to climb with the first caption and is up by the end of the third. */
export const SUNRISE_TICKS = BEATS.true[2]!.start + 240;

/** The code card: from here the code is on screen for CODE_SHOW_TICKS. */
export const CODE_START_TICKS = 820;
export const CODE_SHOW_TICKS = 600; // 10 s; the brief asks for at least 8 s
export const CODE_BEAT: Beat = { start: CODE_START_TICKS + 60, lines: ["TYPE THIS AS THE ROOM CODE", "TO OPEN THE SUPER ROOM"], hold: 260 };

export interface Credits {
  start: number;
  lines: readonly string[];
  /** Ticks between one line appearing and the next. */
  stagger: number;
  hold: number;
}
export const CREDITS: Credits = {
  start: CODE_START_TICKS + CODE_SHOW_TICKS,
  lines: ["BUBBLE WEB", "A HOUSEHOLD PROJECT", "THANKS FOR PLAYING"],
  stagger: 120,
  hold: 300,
};

export function totalTicks(kind: EndingKind): number {
  if (kind === "true") return CREDITS.start + (CREDITS.lines.length - 1) * CREDITS.stagger + CREDITS.hold;
  const last = BEATS.bad[BEATS.bad.length - 1]!;
  return beatEnd(last) + TAIL_TICKS;
}
export const ENDING_TOTAL_TICKS_BAD = totalTicks("bad");
export const ENDING_TOTAL_TICKS_TRUE = totalTicks("true");

/** True after the timeline (a non-finite or negative tick count is never done). */
export function endingDone(endingTicks: number, kind: EndingKind): boolean {
  return Number.isFinite(endingTicks) && endingTicks >= totalTicks(kind);
}

/** True while the code card is up. */
export function codeVisible(ticks: number): boolean {
  return ticks >= CODE_START_TICKS && ticks < CODE_START_TICKS + CODE_SHOW_TICKS;
}

/**
 * May a tap/key leave the scene now? Never in the first second; in the true ending also not before the code has
 * been on screen for CODE_READ_TICKS (after that, anytime, including the credits).
 */
export function canSkip(ticks: number, kind: EndingKind): boolean {
  if (!(ticks >= SKIP_GRACE_TICKS)) return false;
  return kind === "bad" || ticks >= CODE_START_TICKS + CODE_READ_TICKS;
}

/** A snapshot gap shorter than this is normal; longer means the server clock is not advancing. */
export const STALL_MS = 500;

/**
 * The scene clock. Normally it is the server's `endingTicks`; if that counter stops advancing (a stalled or
 * frozen room) the elapsed client time takes over, so the scene can never hang. Output never goes backwards.
 */
export class EndingClock {
  private seen = -1;
  private seenAtMs = 0;
  private out = 0;

  at(endingTicks: number, nowMs: number): number {
    const t = Number.isFinite(endingTicks) && endingTicks > 0 ? Math.floor(endingTicks) : 0;
    if (this.seen < 0 || t > this.seen) {
      this.seen = t;
      this.seenAtMs = nowMs;
    }
    const stalled = nowMs - this.seenAtMs;
    const v = this.seen + (stalled > STALL_MS ? Math.floor(stalled * 0.06) : 0);
    if (v > this.out) this.out = v;
    return this.out;
  }
}
