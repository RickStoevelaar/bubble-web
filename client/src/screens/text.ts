import { FIELD_W } from "@bubble/shared";
import { TEXT_ADVANCE, drawText, textWidth } from "../render/renderer";
import { FONT_CHARS } from "../render/sprites/names";
import type { SpriteSheet } from "../render/sprites";

const SUPPORTED = new Set<string>(FONT_CHARS.filter((c) => c !== "x")); // lowercase "x" is the multiply sign, not a letter

/** What the HUD font cannot draw is shown as this (the font has no "?"). */
export const FALLBACK_CHAR = ".";

/**
 * Makes arbitrary text (player names from the network!) safe for the bitmap font: upper-cased, one glyph per
 * code point, anything the font lacks becomes FALLBACK_CHAR, spaces are kept, control characters are dropped.
 * Output is only ever drawn on a canvas, never put into HTML.
 */
export function fontSafe(s: string): string {
  let out = "";
  for (const ch of String(s)) {
    if (ch === " ") out += " ";
    else if (/[\u0000-\u001f\u007f-\u009f]/.test(ch)) continue;
    else {
      const up = ch.toUpperCase();
      out += SUPPORTED.has(up) ? up : FALLBACK_CHAR;
    }
  }
  return out;
}

/** Shortens `s` (already font-safe) to at most `max` glyphs. */
export function clip(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max);
}

/** Draws font-safe text centred on the 256-wide field. */
export function drawCentered(ctx: CanvasRenderingContext2D, sheet: SpriteSheet, s: string, y: number): void {
  drawText(ctx, sheet, s, Math.round((FIELD_W - textWidth(s)) / 2), y);
}

export { TEXT_ADVANCE };
