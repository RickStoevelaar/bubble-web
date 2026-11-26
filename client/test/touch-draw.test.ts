import { describe, expect, it } from "vitest";
import { BTN } from "@bubble/shared";
import { computeLayout } from "../src/render/layout";
import { TouchDeck, computeTouchZones } from "../src/input/touch";

interface Arc {
  x: number;
  y: number;
  r: number;
}
interface Stroke {
  style: string;
  /** Where the path being stroked started (the last moveTo). */
  x: number;
  y: number;
}

function recordingCtx() {
  const arcs: Arc[] = [];
  const strokes: Stroke[] = [];
  const alphas: number[] = [];
  const target: Record<string, unknown> = { globalAlpha: 1, strokeStyle: "" };
  let mx = 0;
  let my = 0;
  const ctx = new Proxy(target, {
    get: (t, k: string) => {
      if (k === "arc") return (x: number, y: number, r: number) => void arcs.push({ x, y, r });
      if (k === "moveTo")
        return (x: number, y: number) => {
          mx = x;
          my = y;
        };
      if (k === "stroke") return () => void strokes.push({ style: String(t.strokeStyle), x: mx, y: my });
      return k in t ? t[k] : () => {};
    },
    set: (t, k: string, v) => {
      if (k === "globalAlpha") alphas.push(v as number);
      t[k] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, arcs, strokes, alphas };
}

describe("TouchDeck.draw", () => {
  const z = computeTouchZones(computeLayout(390, 844, 3), 390, 844, true)!;
  const near = (a: Arc, c: { cx: number; cy: number }) => Math.hypot(a.x - c.cx, a.y - c.cy) < 0.5;

  it("draws the pad base ring at the pad circle and exactly one button at the button circle", () => {
    const r = recordingCtx();
    new TouchDeck(z).draw(r.ctx, 0);
    expect(r.arcs.some((a) => near(a, z.pad) && Math.abs(a.r - z.pad.r) < 0.5)).toBe(true);
    expect(r.arcs.filter((a) => near(a, z.bubble) && a.r >= z.bubble.r - 0.5).length).toBe(1);
    // nothing else is button-sized: no second (JUMP) circle anywhere
    const big = r.arcs.filter((a) => a.r >= z.bubble.r * 0.9 && !near(a, z.pad) && !near(a, z.bubble));
    expect(big.length).toBe(0);
  });

  it("the knob rests at the pad centre and follows the knob vector, clamped inside the ring", () => {
    const idle = recordingCtx();
    new TouchDeck(z).draw(idle.ctx, 0, null);
    expect(idle.arcs.filter((a) => near(a, z.pad) && a.r < z.pad.r * 0.6).length).toBeGreaterThan(0);
    const moved = recordingCtx();
    new TouchDeck(z).draw(moved.ctx, BTN.R, { x: 1, y: 0 });
    const knob = moved.arcs.find((a) => a.r < z.pad.r * 0.6 && a.r > z.pad.r * 0.1 && a.x > z.pad.cx + z.pad.r * 0.3)!;
    expect(knob).toBeDefined();
    expect(Math.hypot(knob.x - z.pad.cx, knob.y - z.pad.cy) + knob.r).toBeLessThanOrEqual(z.pad.r + 0.5);
    const up = recordingCtx();
    new TouchDeck(z).draw(up.ctx, BTN.J, { x: 0, y: -1 });
    expect(up.arcs.some((a) => a.r < z.pad.r * 0.6 && a.y < z.pad.cy - z.pad.r * 0.3)).toBe(true);
  });

  it("the up arrow lights (white) when jump triggers, not otherwise; left/right light on L/R", () => {
    const above = (mask: number) => {
      const r = recordingCtx();
      new TouchDeck(z).draw(r.ctx, mask);
      return r.strokes.filter((s) => s.y < z.pad.cy - z.pad.r * 0.3 && Math.abs(s.x - z.pad.cx) < z.pad.r * 0.5);
    };
    expect(above(0).length).toBeGreaterThan(0);
    expect(above(0).every((s) => s.style !== "#ffffff")).toBe(true);
    expect(above(BTN.J).some((s) => s.style === "#ffffff")).toBe(true);
    const side = (mask: number, sign: number) => {
      const r = recordingCtx();
      new TouchDeck(z).draw(r.ctx, mask);
      return r.strokes.filter(
        (s) =>
          Math.sign(s.x - z.pad.cx) === sign &&
          Math.abs(s.y - z.pad.cy) < z.pad.r * 0.45 &&
          Math.abs(s.x - z.pad.cx) > z.pad.r * 0.3,
      );
    };
    expect(side(0, -1).length).toBeGreaterThan(0);
    expect(side(BTN.L, -1).some((s) => s.style === "#ffffff")).toBe(true);
    expect(side(BTN.L, 1).every((s) => s.style !== "#ffffff")).toBe(true);
    expect(side(BTN.R, 1).some((s) => s.style === "#ffffff")).toBe(true);
  });

  it("a pressed fire button draws larger than idle; overlay draws more translucent", () => {
    const idle = recordingCtx();
    new TouchDeck(z).draw(idle.ctx, 0);
    const down = recordingCtx();
    new TouchDeck(z).draw(down.ctx, BTN.F);
    const btnR = (r: ReturnType<typeof recordingCtx>) => Math.max(...r.arcs.filter((a) => near(a, z.bubble)).map((a) => a.r));
    expect(btnR(down)).toBeGreaterThan(btnR(idle));
    const ov = recordingCtx();
    new TouchDeck({ ...z, overlay: true }).draw(ov.ctx, 0);
    expect(Math.max(...ov.alphas)).toBeLessThan(Math.max(...idle.alphas));
  });

  it("null zones draw nothing", () => {
    const r = recordingCtx();
    new TouchDeck(null).draw(r.ctx, 0);
    expect(r.arcs.length).toBe(0);
  });
});
