import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildSync } from "esbuild";
import { describe, expect, it } from "vitest";

interface Probe {
  stdout: string;
  timedOut: boolean;
  /** status, signal and stderr of the child, for assertion messages when it fails without timing out. */
  why: string;
}

/**
 * A runaway loop cannot be interrupted inside vitest (a sync hang ignores test timeouts), so the probe runs in a
 * child node process with a hard kill timeout. The shared sources are bundled with esbuild (already a dev dependency).
 */
function runProbe(body: string): Probe {
  const dir = mkdtempSync(join(tmpdir(), "phys-term-"));
  const out = join(dir, "probe.mjs");
  try {
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
    return {
      stdout: r.stdout ?? "",
      timedOut: r.error !== undefined && (r.error as NodeJS.ErrnoException).code === "ETIMEDOUT",
      why: `status=${r.status} signal=${r.signal} stderr=${(r.stderr ?? "").slice(0, 600)}`,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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
    expect(r.stdout.trim(), r.why).toMatch(/^ok \d+$/);
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
    expect(r.stdout.trim(), r.why).toBe("ok");
  }, 30000);

  it("extreme values (1e9 .. MAX_VALUE, NaN, +-Infinity) in x, y, vx and vy never hang moveBody and are deterministic", () => {
    const r = runProbe(`${LEVELS}
const vals = [1e9, 1e16, 7.2e16, 1e17, 1e18, 1e300, Number.MAX_VALUE, -1e17, NaN, Infinity, -Infinity];
let n = 0;
for (const lv of levels)
  for (const field of ["x", "y", "vx", "vy"])
    for (const v of vals)
      for (const size of [12, 14, 16]) {
        const mkb = () => ({ x: 100, y: 168, vx: 1, vy: 0, onGround: false, [field]: v });
        const b = mkb();
        S.moveBody(lv, b, size);
        const c = mkb();
        S.moveBody(lv, c, size);
        if (!Object.is(b.x, c.x) || !Object.is(b.y, c.y)) throw new Error("not deterministic " + field + "=" + v);
        n++;
      }
console.log("ok " + n);`);
    expect(r.timedOut, "moveBody hung").toBe(false);
    expect(r.stdout.trim(), r.why).toMatch(/^ok \d+$/);
  }, 30000);

  it("a damaged save with absurd finite coordinates and speeds in every entity type restores and steps 100 ticks", () => {
    const r = runProbe(`${LEVELS}
const vals = [1e17, 1e18, -1e17, 1e300, Number.MAX_VALUE, -Number.MAX_VALUE];
const keys = ["players", "enemies", "bubbles", "projectiles", "items", "effects"];
let n = 0;
for (const lv of [S.TEST_LEVEL, S.BOSS_ARENA]) {
  for (const field of ["x", "y", "vx", "vy"]) {
    for (const v of vals) {
      const sim = new S.Sim([lv], 7, 2);
      for (let i = 0; i < 40; i++) sim.step([S.BTN.F | S.BTN.R, S.BTN.F]);
      sim.state.projectiles.push({ id: 900, x: 100, y: 100, vx: 1, vy: 0, kind: "rock", ageTicks: 0 });
      sim.state.items.push({ id: 901, x: 100, y: 100, vx: 0, vy: 0, onGround: false, kind: "food", sprite: 0, value: 100, despawnTicks: 500 });
      sim.state.effects = S.repairEffects([{ id: 902, kind: "fire", owner: 0, x: 100, y: 100, vx: 0, vy: 0, ageTicks: 0, onGround: false }]);
      const state = JSON.parse(JSON.stringify(sim.state));
      for (const k of keys) for (const o of state[k]) if (field in o) o[field] = v;
      const rs = S.Sim.restore([lv], state);
      for (const k of keys) for (const o of rs.state[k]) for (const f of ["x", "y"]) if (Math.abs(o[f]) > S.MAX_COORD) throw new Error("unsanitized " + k + "." + f);
      for (let i = 0; i < 100; i++) rs.step([S.BTN.R, 0]);
      n++;
    }
  }
}
console.log("ok " + n);`);
    expect(r.timedOut, "restored sim hung").toBe(false);
    expect(r.stdout.trim(), r.why).toMatch(/^ok \d+$/);
  }, 60000);
});
