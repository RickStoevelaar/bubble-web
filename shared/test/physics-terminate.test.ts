import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildSync } from "esbuild";
import { describe, expect, it } from "vitest";

/**
 * A runaway loop cannot be interrupted inside vitest (a sync hang ignores test timeouts), so the probe runs in a
 * child node process with a hard kill timeout. The shared sources are bundled with esbuild (already a dev dependency).
 */
function runProbe(body: string): { status: number | null; stdout: string; timedOut: boolean } {
  const dir = mkdtempSync(join(tmpdir(), "phys-term-"));
  const out = join(dir, "probe.mjs");
  buildSync({
    stdin: { contents: `import * as S from "./index";\n${body}`, resolveDir: resolve(__dirname, "../src"), loader: "ts" },
    bundle: true,
    format: "esm",
    platform: "node",
    outfile: out,
    logLevel: "silent",
  });
  writeFileSync(join(dir, "package.json"), '{"type":"module"}');
  const r = spawnSync(process.execPath, [out], { timeout: 8000, encoding: "utf8" });
  return { status: r.status, stdout: r.stdout, timedOut: r.error !== undefined && (r.error as NodeJS.ErrnoException).code === "ETIMEDOUT" };
}

const LEVELS = `
const mk = (rects, border) => {
  const rows = Array.from({ length: S.GRID_H }, () => Array(S.GRID_W).fill("."));
  if (border) {
    for (let y = 0; y < S.GRID_H; y++) for (const x of [0, 1, 30, 31]) rows[y][x] = "#";
    for (const y of [26, 27]) for (let x = 0; x < S.GRID_W; x++) rows[y][x] = "#";
  }
  for (const r of rects) for (let y = r.r0; y <= r.r1; y++) for (let x = r.c0; x <= r.c1; x++) rows[y][x] = "#";
  return { round: 1, theme: 0, tiles: rows.map((r) => r.join("")), enemies: [], drift: [] };
};
const levels = [
  mk([{ r0: 20, r1: 21, c0: 10, c1: 15 }, { r0: 4, r1: 25, c0: 16, c1: 16 }], true),
  mk([{ r0: 20, r1: 21, c0: 2, c1: 9 }], true),
  mk([], false),
];
`;

describe("moveBody terminates for any body position and speed", () => {
  it("every x, y, vx combination on the bar+pillar, bordered and empty levels finishes with finite output", () => {
    const r = runProbe(`${LEVELS}
let n = 0;
for (const lv of levels)
  for (const x of [-20, -1, 0, 255, 256, 300, 1e4, -1e4])
    for (const y of [-50, 168, 300])
      for (const vx of [100, -100, 1e4, -1e4, 1.6, -1.6, 0])
        for (const size of [12, 14, 16]) {
          const b = { x, y, vx, vy: 0, onGround: false };
          S.moveBody(lv, b, size);
          if (!Number.isFinite(b.x) || !Number.isFinite(b.y)) throw new Error("not finite " + JSON.stringify(b));
          n++;
        }
console.log("ok " + n);`);
    expect(r.timedOut, "moveBody hung").toBe(false);
    expect(r.stdout.trim()).toMatch(/^ok \d+$/);
  }, 30000);

  it("a damaged save's fire effect (ageTicks 0, airborne, x=-20, vx=100) steps through the sim and terminates", () => {
    const r = runProbe(`${LEVELS}
const sim = new S.Sim([levels[0]], 1, 1);
sim.state.effects = S.repairEffects([
  { id: 1, kind: "fire", owner: 0, x: -20, y: 168, vx: 100, vy: 0, ageTicks: 0, onGround: false },
  { id: 2, kind: "fire", owner: 0, x: 300, y: 168, vx: -1e4, vy: 0, ageTicks: 0, onGround: false },
]);
if (sim.state.effects.length !== 2) throw new Error("effects not restored");
for (let i = 0; i < 20; i++) sim.step([0, 0]);
console.log("ok");`);
    expect(r.timedOut, "sim hung").toBe(false);
    expect(r.stdout.trim()).toBe("ok");
  }, 30000);
});
