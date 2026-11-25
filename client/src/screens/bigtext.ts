import { GLYPHS_5X7 } from "../render/sprites/font";
import type { FontChar } from "../render/sprites/names";

/** Big pixel lettering built from the 5x7 glyph set, `scale` game pixels per dot. Width of `s` in game pixels. */
export function bigWidth(s: string, scale: number): number {
  return s.length === 0 ? 0 : s.length * 6 * scale - scale;
}

/** Fills the lit dots of `s` (A-Z, 0-9 and a few symbols) with its top-left at (x, y). */
export function drawBig(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, scale: number, color: string, rowFrom = 0, rowTo = 7): void {
  ctx.fillStyle = color;
  for (let i = 0; i < s.length; i++) {
    const g = GLYPHS_5X7[s[i] as FontChar];
    if (!g) continue;
    for (let r = rowFrom; r < Math.min(rowTo, g.length); r++) {
      const row = g[r]!;
      for (let c = 0; c < row.length; c++) {
        if (row[c] === "#") ctx.fillRect(x + (i * 6 + c) * scale, y + r * scale, scale, scale);
      }
    }
  }
}

/** Two-colour lettering with a drop shadow: shadow first, then the face, plus a lighter top half. */
export function drawLogoLine(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  scale: number,
  face: string,
  shade: string,
  shadow: string,
): void {
  drawBig(ctx, s, x + scale / 2 + 1, y + scale / 2 + 1, scale, shadow);
  drawBig(ctx, s, x, y, scale, shade);
  // the face colour covers only the upper rows of every glyph (a simple two-tone look)
  drawBig(ctx, s, x, y, scale, face, 0, 4);
}
