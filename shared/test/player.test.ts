import { describe, expect, it } from "vitest";
import { BTN, FIELD_H, Sim, TEST_LEVEL, TILE, TUNING } from "../src";
import type { SimEvent } from "../src";

const newSim = (n: 1 | 2 = 1) => {
  const sim = new Sim([TEST_LEVEL], 1, n);
  sim.state.enemies = []; // TEST_LEVEL has a walker; these tests are about players
  return sim;
};
const run = (sim: Sim, ticks: number, b0 = 0, b1 = 0): SimEvent[] => {
  const ev: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) ev.push(...sim.step([b0, b1]));
  return ev;
};
/** Puts player 0 standing on the platform top at the given tile column/row. */
const stand = (sim: Sim, col: number, row: number) => {
  const p = sim.state.players[0]!;
  p.x = col * TILE + TILE / 2;
  p.y = row * TILE - 7;
  p.vy = 0;
  p.onGround = true;
  return p;
};

describe("spawning", () => {
  it("spawns P1 left and P2 right, standing on the floor", () => {
    const sim = newSim(2);
    const a = sim.state.players[0]!;
    const b = sim.state.players[1]!;
    expect(a.x).toBeLessThan(b.x);
    expect(a.y + 7).toBe(26 * TILE);
    expect(b.y + 7).toBe(26 * TILE);
    run(sim, 5);
    expect(a.onGround && b.onGround).toBe(true);
    expect(a.y + 7).toBe(26 * TILE);
  });
});

describe("walking", () => {
  it("walks right at walkSpeed and faces right", () => {
    const sim = newSim();
    const p = sim.state.players[0]!;
    const x0 = p.x;
    run(sim, 10, BTN.R);
    expect(p.x - x0).toBeCloseTo(10 * TUNING.walkSpeed, 5);
    expect(p.facing).toBe(1);
  });
  it("walks left and faces left", () => {
    const sim = newSim();
    const p = sim.state.players[0]!;
    const x0 = p.x;
    run(sim, 5, BTN.L);
    expect(p.x).toBeLessThan(x0);
    expect(p.facing).toBe(-1);
  });
  it("speed power multiplies walk speed by 1.5", () => {
    const sim = newSim();
    const p = sim.state.players[0]!;
    p.powers.speed = true;
    const x0 = p.x;
    run(sim, 10, BTN.R);
    expect(p.x - x0).toBeCloseTo(15 * TUNING.walkSpeed, 5);
  });
  it("is stopped by the left wall edge", () => {
    const sim = newSim();
    const p = sim.state.players[0]!;
    run(sim, 100, BTN.L);
    expect(p.x - 7).toBeCloseTo(2 * TILE, 5); // wall occupies cols 0-1
    expect(p.onGround).toBe(true);
  });
  it("is stopped by the right wall edge", () => {
    const sim = newSim();
    const p = stand(sim, 22, 26);
    run(sim, 100, BTN.R);
    expect(p.x + 7).toBeCloseTo(30 * TILE, 5);
  });
  it("does not move when not alive", () => {
    const sim = newSim();
    const p = sim.state.players[0]!;
    p.state = "gone";
    const x0 = p.x;
    run(sim, 10, BTN.R);
    expect(p.x).toBe(x0);
  });
});

describe("jumping", () => {
  it("jumps, rises, and lands back on the floor", () => {
    const sim = newSim();
    const p = sim.state.players[0]!;
    const y0 = p.y;
    const ev = run(sim, 1, BTN.J);
    expect(ev).toEqual([expect.objectContaining({ kind: "jump", player: 0 })]);
    expect(p.onGround).toBe(false);
    let minY = p.y;
    let airborne = 1;
    for (let i = 0; i < 300 && !p.onGround; i++) {
      run(sim, 1);
      minY = Math.min(minY, p.y);
      airborne++;
    }
    expect(p.onGround).toBe(true);
    expect(p.y).toBe(y0);
    expect(y0 - minY).toBeGreaterThan(40);
    expect(airborne).toBeGreaterThan(20);
  });
  it("cannot jump while airborne", () => {
    const sim = newSim();
    const p = sim.state.players[0]!;
    run(sim, 1, BTN.J);
    run(sim, 10); // rising, in the air
    const vy = p.vy;
    const ev = run(sim, 1, BTN.J);
    expect(ev).toEqual([]);
    expect(p.vy).toBeCloseTo(vy + TUNING.gravity, 5);
  });
  it("jumps up through a platform from below and lands on top of it", () => {
    const sim = newSim();
    const p = stand(sim, 21, 18); // row-18 platform, cols 20-25
    const platformTop = 13 * TILE; // row-13 platform, cols 18-23
    run(sim, 1, BTN.J);
    let minY = p.y;
    for (let i = 0; i < 200 && !p.onGround; i++) {
      run(sim, 1);
      minY = Math.min(minY, p.y);
    }
    expect(minY + 7).toBeLessThan(platformTop); // feet rose above it
    expect(p.onGround).toBe(true);
    expect(p.y + 7).toBe(platformTop);
  });
  it("can steer sideways while rising through a platform", () => {
    const sim = newSim();
    const p = stand(sim, 21, 18);
    const x0 = p.x;
    run(sim, 1, BTN.J);
    run(sim, 20, BTN.R);
    expect(p.x - x0).toBeCloseTo(20 * TUNING.walkSpeed, 5);
  });
});

describe("falling and wrap", () => {
  it("walking off a ledge makes the player fall with capped speed", () => {
    const sim = newSim();
    const p = stand(sim, 24, 18);
    run(sim, 20, BTN.R); // past the platform's right edge at x = 26 * 8
    expect(p.onGround).toBe(false);
    expect(p.vy).toBeGreaterThan(0);
    run(sim, 100);
    expect(p.vy).toBeLessThanOrEqual(TUNING.maxFall);
  });
  it("falls through the floor gap and re-enters at the top with the same x", () => {
    const sim = newSim();
    const p = stand(sim, 15, 26);
    p.y = 24 * TILE; // above the gap in the floor (cols 14-17)
    p.onGround = false;
    const x0 = p.x;
    let wrapped = false;
    for (let i = 0; i < 300 && !wrapped; i++) {
      const before = p.y;
      run(sim, 1);
      if (p.y < before) wrapped = true;
    }
    expect(wrapped).toBe(true);
    expect(p.y).toBeLessThan(10);
    expect(p.y).toBeGreaterThan(-FIELD_H / 4);
    expect(p.x).toBe(x0);
  });
});

describe("sim lifecycle", () => {
  it("addPlayer spawns P2 mid-run and throws when already two", () => {
    const sim = newSim(1);
    expect(sim.state.players).toHaveLength(1);
    expect(sim.addPlayer()).toBe(1);
    expect(sim.state.players).toHaveLength(2);
    expect(sim.state.players[1]!.x).toBeGreaterThan(sim.state.players[0]!.x);
    expect(() => sim.addPlayer()).toThrow();
  });
  it("restore rebuilds an equivalent sim that steps identically", () => {
    const a = newSim(2);
    run(a, 30, BTN.R, BTN.L);
    const b = Sim.restore([TEST_LEVEL], a.state);
    expect(b.state).toEqual(a.state);
    expect(b.state).not.toBe(a.state);
    run(a, 40, BTN.J | BTN.R, BTN.L);
    run(b, 40, BTN.J | BTN.R, BTN.L);
    expect(b.state).toEqual(a.state);
  });
  it("loadRound resets players to spawn and sets currentLevel", () => {
    const sim = newSim(2);
    const spawn = { ...sim.state.players[0]! };
    run(sim, 20, BTN.R);
    sim.loadRound(1);
    expect(sim.state.players[0]!.x).toBe(spawn.x);
    expect(sim.state.players[0]!.y).toBe(spawn.y);
    expect(sim.currentLevel).toBe(TEST_LEVEL);
    expect(() => sim.loadRound(2)).toThrow();
  });
  it("is deterministic", () => {
    const a = newSim(2);
    const b = newSim(2);
    for (let i = 0; i < 200; i++) {
      const btn: [number, number] = [(i * 7) % 16, (i * 5) % 16];
      a.step(btn);
      b.step(btn);
    }
    expect(a.state).toEqual(b.state);
  });
});
