import { FIELD_H, FIELD_W } from "@bubble/shared";
import type { GameState } from "@bubble/shared";
import type { SpriteSheet } from "../render/sprites";
import { bigWidth, drawBig } from "./bigtext";
import { drawCentered } from "./text";

/** How long the placeholder card stays up, in server ticks of `state.endingTicks` (60 per second). */
export const ENDING_CARD_TICKS = 300;

export type EndingKind = "bad" | "true";

/** Which card: the true ending (both players present) or the bad one. An unknown/missing value is "bad". */
export function endingKind(state: Pick<GameState, "ending">): EndingKind {
  return state.ending === "true" ? "true" : "bad";
}

/** True once the card has been shown long enough. */
export function endingDone(endingTicks: number): boolean {
  return endingTicks >= ENDING_CARD_TICKS;
}

/**
 * EXTENSION POINT for task 23b: the ending scenes (bad/true endings, code reveal, credits) replace this body.
 * The screen flow calls it every frame while the "ending" screen is up and moves on to the scores screen once
 * `endingDone(state.endingTicks)` holds (23b may supply its own end condition in main.ts).
 * This placeholder is a minimal text card.
 */
export function drawEnding(
  ctx: CanvasRenderingContext2D,
  sheet: SpriteSheet,
  state: Pick<GameState, "ending">,
  endingTicks: number,
  kind: EndingKind = endingKind(state),
): void {
  void endingTicks;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);
  const text = kind === "true" ? "WELL DONE" : "THE END";
  const scale = 3;
  drawBig(ctx, text, Math.round((FIELD_W - bigWidth(text, scale)) / 2), 90, scale, kind === "true" ? "#ffe34a" : "#bfe9ff");
  drawCentered(ctx, sheet, kind === "true" ? "THANKS FOR PLAYING!" : "TRY AGAIN TOGETHER!", 140);
}
