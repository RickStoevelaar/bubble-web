import { describe, expect, it } from "vitest";
import { BTN, FIELD_H, FIELD_W, Sim, TEST_LEVEL, TILE, TUNING } from "../src";
import type { BubbleState, LevelData, SimEvent } from "../src";

const newSim = (level: LevelData = TEST_LEVEL) => new Sim([level], 1, 1);
const run = (sim: Sim, ticks: number, b0 = 0): SimEvent[] => {
  const ev: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) ev.push(...sim.step([b0, 0]));
  return ev;
};
const bubble = (over: Partial<BubbleState> = {}): BubbleState => ({
  id: 0,
  x: 128,
  y: 100,
  vx: 0,
  vy: -TUNING.bubbleRise,
  kind: "normal",
  phase: "float",
  ageTicks: 0,
  owner: 0,
  ...over,
});
const addBubble = (sim: Sim, over: Partial<BubbleState> = {}): BubbleState => {
  const b = bubble({ id: sim.state.nextId++, ...over });
  sim.state.bubbles.push(b);
  return b;
};

describe("firing", () => {
  it("spawns a launch bubble in the facing direction", () => {
    const sim = newSim();
    const p = sim.state.players[0]!;
    const ev = run(sim, 1, BTN.F);
    expect(ev.some((e) => e.kind === "fire" && e.player === 0)).toBe(true);
    expect(sim.state.bubbles).toHaveLength(1);
    const b = sim.state.bubbles[0]!;
    expect(b.phase).toBe("launch");
    expect(b.owner).toBe(0);
    expect(b.x).toBeGreaterThan(p.x + TUNING.bubbleSpawnOffset - 1);
    expect(b.vx).toBe(TUNING.bubbleLaunchSpeed);
    const x0 = b.x;
    run(sim, 1);
    expect(sim.state.bubbles[0]!.x - x0).toBeCloseTo(TUNING.bubbleLaunchSpeed, 5);
  });

  it("fires left when facing left", () => {
    const sim = newSim();
    sim.state.players[0]!.x = 128;
    run(sim, 1, BTN.L);
    run(sim, 1, BTN.F | BTN.L);
    expect(sim.state.bubbles[0]!.vx).toBe(-TUNING.bubbleLaunchSpeed);
  });

  it("cooldown prevents a second bubble next tick, then allows one", () => {
    const sim = newSim();
    run(sim, 2, BTN.F);
    expect(sim.state.bubbles).toHaveLength(1);
    run(sim, TUNING.fireCooldownTicks, BTN.F);
    expect(sim.state.bubbles.length).toBeGreaterThanOrEqual(2);
  });

  it("gives unique ids", () => {
    const sim = newSim();
    run(sim, TUNING.fireCooldownTicks * 2 + 2, BTN.F);
    const ids = sim.state.bubbles.map((b) => b.id);
    expect(ids.length).toBeGreaterThanOrEqual(2);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("rapidFire halves the cooldown", () => {
    const sim = newSim();
    sim.state.players[0]!.powers.rapidFire = true;
    run(sim, 1, BTN.F);
    expect(sim.state.players[0]!.fireCooldown).toBe(TUNING.fireCooldownTicks / 2);
  });

  it("fastBubble scales launch speed", () => {
    const sim = newSim();
    sim.state.players[0]!.powers.fastBubble = true;
    run(sim, 1, BTN.F);
    expect(sim.state.bubbles[0]!.vx).toBeCloseTo(
      TUNING.bubbleLaunchSpeed * TUNING.fastBubbleMult,
      5,
    );
  });

  it("longBubble extends the launch phase", () => {
    const base = newSim();
    const long = newSim();
    long.state.players[0]!.powers.longBubble = true;
    run(base, 1, BTN.F);
    run(long, 1, BTN.F);
    run(base, TUNING.bubbleLaunchTicks);
    run(long, TUNING.bubbleLaunchTicks);
    expect(base.state.bubbles[0]!.phase).toBe("float");
    expect(long.state.bubbles[0]!.phase).toBe("launch");
  });
});

describe("bubble lifecycle", () => {
  it("transitions launch to float after launch ticks, then rises", () => {
    const sim = newSim();
    run(sim, 1, BTN.F);
    run(sim, TUNING.bubbleLaunchTicks);
    const b = sim.state.bubbles[0]!;
    expect(b.phase).toBe("float");
    const y0 = b.y;
    run(sim, 20);
    expect(b.y).toBeLessThan(y0 - 20 * TUNING.bubbleRise * 0.9);
    expect(b.y).toBeCloseTo(y0 - 20 * TUNING.bubbleRise, 3);
  });

  it("a launch bubble stops at a wall and floats", () => {
    const sim = newSim();
    const p = sim.state.players[0]!;
    p.x = 25 * TILE; // right wall is solid from col 30
    p.facing = 1;
    run(sim, 1, BTN.F);
    run(sim, TUNING.bubbleLaunchTicks - 1);
    const b = sim.state.bubbles[0]!;
    expect(b.phase).toBe("float");
    expect(b.x + TUNING.bubbleRadius).toBeLessThanOrEqual(30 * TILE);
    const x = b.x;
    run(sim, 5);
    expect(b.x).toBeCloseTo(x, 5);
  });

  it("applies drift cell dx to a floating bubble", () => {
    const lv: LevelData = {
      ...TEST_LEVEL,
      drift: [{ col: 16, row: 12, dx: 1, dy: 0 }],
    };
    const sim = newSim(lv);
    const b = addBubble(sim, { x: 16 * TILE + 4, y: 12 * TILE + 4 });
    const x0 = b.x;
    run(sim, 1);
    expect(b.vx).toBeCloseTo(TUNING.bubbleDriftStrength, 5);
    expect(b.x).toBeCloseTo(x0 + TUNING.bubbleDriftStrength, 5);
  });

  it("separates two overlapping bubbles", () => {
    const sim = newSim();
    const a = addBubble(sim, { x: 120, y: 100 });
    const c = addBubble(sim, { x: 124, y: 100 });
    const d0 = c.x - a.x;
    run(sim, 1);
    expect(c.x - a.x).toBeGreaterThan(d0);
    run(sim, 30);
    expect(Math.hypot(c.x - a.x, c.y - a.y)).toBeGreaterThanOrEqual(2 * TUNING.bubbleRadius - 0.5);
  });

  it("collects along the ceiling without leaving the field", () => {
    const sim = newSim();
    for (let i = 0; i < 4; i++) addBubble(sim, { x: 80 + i, y: 20 });
    run(sim, 120);
    for (const b of sim.state.bubbles) {
      expect(b.y - TUNING.bubbleRadius).toBeGreaterThanOrEqual(TILE - 0.001);
      expect(b.y).toBeLessThan(FIELD_H);
      expect(b.x).toBeGreaterThan(0);
      expect(b.x).toBeLessThan(FIELD_W);
    }
    const xs = sim.state.bubbles.map((b) => b.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(2 * TUNING.bubbleRadius);
  });

  it("pops itself at end of life with a position", () => {
    const sim = newSim();
    const b = addBubble(sim, { ageTicks: TUNING.bubbleLifeTicks - 2 });
    const ev = run(sim, 2);
    const pop = ev.find((e) => e.kind === "pop");
    expect(pop).toBeDefined();
    expect(pop!.x).toBeCloseTo(b.x, 0);
    expect(pop!.y).toBeDefined();
    expect(sim.state.bubbles).toHaveLength(0);
  });
});

describe("player contact", () => {
  it("jump-bounce sets vy negative and keeps the bubble", () => {
    const sim = newSim();
    const p = sim.state.players[0]!;
    p.x = 128;
    p.y = 100;
    p.vy = 1;
    p.onGround = false;
    addBubble(sim, { x: 128, y: 110 });
    const ev = run(sim, 1, BTN.J);
    expect(ev.some((e) => e.kind === "bounce")).toBe(true);
    expect(p.vy).toBe(TUNING.bubbleBounceVel);
    expect(sim.state.bubbles).toHaveLength(1);
  });

  it("touching a bubble without jump pops it", () => {
    const sim = newSim();
    const p = sim.state.players[0]!;
    p.x = 128;
    p.y = 100;
    p.onGround = false;
    addBubble(sim, { x: 128, y: 104 });
    const ev = run(sim, 1);
    const pop = ev.find((e) => e.kind === "pop");
    expect(pop?.player).toBe(0);
    expect(pop?.x).toBeDefined();
    expect(sim.state.bubbles).toHaveLength(0);
  });
});

describe("floor and field bounds", () => {
  it("a bubble pushed down by a drift cell stays above the floor and in the field", () => {
    const drift = [];
    for (let row = 0; row < 28; row++) for (let col = 2; col < 30; col++) drift.push({ col, row, dx: 0, dy: 1 });
    const sim = newSim({ ...TEST_LEVEL, drift });
    addBubble(sim, { x: 100, y: 200 }); // above the solid floor (row 26)
    addBubble(sim, { x: 128, y: 200 }); // above the floor gap (cols 14-17)
    for (let i = 0; i < 200; i++) {
      sim.state.bubbles.forEach((b) => (b.ageTicks = 0));
      run(sim, 1);
      for (const b of sim.state.bubbles) {
        expect(b.y + TUNING.bubbleRadius).toBeLessThanOrEqual(FIELD_H + 1e-9);
        expect(b.y).toBeGreaterThan(0);
      }
    }
    const solid = sim.state.bubbles[0]!;
    expect(solid.y + TUNING.bubbleRadius).toBeLessThanOrEqual(26 * TILE + 1e-9);
    expect(solid.y).toBeGreaterThan(24 * TILE);
  });
});

describe("restore", () => {
  it("does not reuse bubble ids after a JSON round trip", () => {
    const sim = newSim();
    run(sim, TUNING.fireCooldownTicks * 2 + 2, BTN.F);
    const before = sim.state.bubbles.map((b) => b.id);
    const restored = Sim.restore([TEST_LEVEL], JSON.parse(JSON.stringify(sim.state)));
    restored.state.players[0]!.fireCooldown = 0;
    restored.step([BTN.F, 0]);
    const fresh = restored.state.bubbles[restored.state.bubbles.length - 1]!;
    expect(Number.isNaN(fresh.id)).toBe(false);
    for (const id of before) expect(fresh.id).toBeGreaterThan(id);
  });

  it("derives nextId when missing from the saved state", () => {
    const sim = newSim();
    run(sim, TUNING.fireCooldownTicks + 2, BTN.F);
    const saved = JSON.parse(JSON.stringify(sim.state));
    delete saved.nextId;
    const restored = Sim.restore([TEST_LEVEL], saved);
    restored.state.players[0]!.fireCooldown = 0;
    restored.step([BTN.F, 0]);
    const ids = restored.state.bubbles.map((b) => b.id);
    expect(ids.some(Number.isNaN)).toBe(false);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
