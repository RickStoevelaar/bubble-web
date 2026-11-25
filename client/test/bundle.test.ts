import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { describe, expect, it } from "vitest";
import { GAME_LEVELS, TEST_LEVEL } from "@bubble/shared";

const here = dirname(fileURLToPath(import.meta.url));

/** A tile row of `round` that occurs in no other level (and not in the test fixture). */
function distinctiveRow(round: number): string {
  const rows = GAME_LEVELS[round - 1]!.tiles;
  const others = new Set([...GAME_LEVELS.filter((_, i) => i !== round - 1), TEST_LEVEL].flatMap((l) => l.tiles));
  const row = rows.find((r) => r.includes("#") && r.includes(".") && !others.has(r));
  if (!row) throw new Error(`round ${round} has no distinctive row`);
  return row;
}

describe("client bundle", () => {
  it("bundles the real 100-round set (a distinctive row of round 1 and of round 100 is in the output)", async () => {
    const out = await esbuild.build({
      entryPoints: [join(here, "../src/main.ts")],
      bundle: true,
      write: false,
      format: "iife",
      target: "es2022",
      minify: true,
      logLevel: "silent",
    });
    const js = out.outputFiles[0]!.text;
    expect(js).toContain(distinctiveRow(1));
    expect(js).toContain(distinctiveRow(100));
    expect(js).toContain(distinctiveRow(57));
    expect(js.length).toBeLessThan(700 * 1024);
  }, 60_000);
});
