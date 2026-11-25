/** Small helpers for building pixel-grid templates. */

const rev = (s: string) => [...s].reverse().join("");

/** Mirror a left half (any width) into a full-width row. */
export function sym(halves: string[]): string[] {
  return halves.map((h) => h + rev(h));
}

/** Copy of `base` with some rows replaced (by row index). */
export function withRows(base: string[], rows: Record<number, string>): string[] {
  return base.map((r, i) => rows[i] ?? r);
}

/** Rotate a square grid 90 degrees clockwise. */
export function rotate90(g: string[]): string[] {
  const n = g.length;
  const out: string[] = [];
  for (let y = 0; y < n; y++) {
    let row = "";
    for (let x = 0; x < n; x++) row += g[n - 1 - x]![y]!;
    out.push(row);
  }
  return out;
}

/** Replace characters with a lookup (unmapped chars are kept). */
export function mapChars(g: string[], fn: (ch: string, x: number, y: number) => string): string[] {
  return g.map((row, y) => [...row].map((ch, x) => fn(ch, x, y)).join(""));
}

/** Darken/shift a #rrggbb colour toward angry red. Non-hex colours are returned unchanged. */
export function redShift(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * 0.75 + 90));
  const g = Math.round(((n >> 8) & 255) * 0.45);
  const b = Math.round((n & 255) * 0.4);
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}
