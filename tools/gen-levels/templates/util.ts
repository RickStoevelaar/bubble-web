import type { Rng } from "@bubble/shared";
import { frame } from "../grid";
import { assertGrid } from "../invariants";
import type { Gap, Grid } from "../grid";
import type { Params, Template } from "../types";

/** Reads a parameter list of `[from, to]` pairs as floor gaps. */
export const asGaps = (v: unknown): Gap[] => (v as number[][]).map(([a, b]) => [a!, b!] as Gap);

/**
 * Declares a template. `defaults` lists every parameter; round data may override any subset, and an unknown
 * name throws (a typo in a round file must not silently do nothing). `draw` receives the merged parameters and
 * a fresh frame built from `p.gaps`, and fills in the layout.
 */
export function defineTemplate<D extends Params & { gaps: number[][] }>(
  name: string,
  description: string,
  defaults: D,
  draw: (p: D, g: Grid, rng: Rng) => void,
): Template {
  return {
    name,
    description,
    defaults,
    build(params, rng) {
      for (const k of Object.keys(params)) if (!(k in defaults)) throw new Error(`template ${name}: unknown parameter "${k}"`);
      const p = { ...defaults, ...params } as D;
      const g = frame(asGaps(p.gaps));
      draw(p, g, rng);
      const rows = g.rows();
      assertGrid(rows, `template ${name}`);
      return rows;
    },
  };
}

/** Clamp to the interior columns 2..29. */
export const clampCol = (c: number): number => Math.max(2, Math.min(29, c));

/**
 * Cuts holes in the platform at `row` (`thick` rows). Each entry of `holes` is `[level, col, width]`; only entries
 * whose level equals `level` apply. Every deck that spans the whole field needs a hole over each floor half,
 * or players could climb but never come back down.
 */
export function punch(g: Grid, holes: number[][], level: number, row: number, thick = 1): void {
  for (const [lv, col, w] of holes) if (lv === level) g.rect(col!, row, col! + w! - 1, row + thick - 1, false);
}
