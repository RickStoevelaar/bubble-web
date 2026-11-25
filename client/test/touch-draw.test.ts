import { describe, expect, it } from "vitest";
import { BTN } from "@bubble/shared";
import { computeLayout } from "../src/render/layout";
import { TouchDeck, computeTouchZones } from "../src/input/touch";

function recordingCtx() {
  const radii: number[] = [];
  const alphas: number[] = [];
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get: (t, k: string) => (k === "arc" ? (...a: number[]) => void radii.push(a[2]!) : k in t ? t[k] : () => {}),
    set: (t, k: string, v) => {
      if (k === "globalAlpha") alphas.push(v as number);
      t[k] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, radii, alphas };
}

describe("TouchDeck.draw", () => {
  const z = computeTouchZones(computeLayout(390, 844, 3), 390, 844, true)!;

  it("pressed buttons draw larger than idle ones; overlay draws more translucent", () => {
    const idle = recordingCtx();
    new TouchDeck(z).draw(idle.ctx, 0);
    const down = recordingCtx();
    new TouchDeck(z).draw(down.ctx, BTN.J);
    expect(Math.max(...down.radii)).toBeGreaterThan(Math.max(...idle.radii));
    const ov = recordingCtx();
    new TouchDeck({ ...z, overlay: true }).draw(ov.ctx, 0);
    expect(Math.max(...ov.alphas)).toBeLessThan(Math.max(...idle.alphas));
  });

  it("null zones draw nothing", () => {
    const r = recordingCtx();
    new TouchDeck(null).draw(r.ctx, 0);
    expect(r.radii.length).toBe(0);
  });
});
