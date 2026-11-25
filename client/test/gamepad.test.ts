import { describe, expect, it } from "vitest";
import { BTN } from "@bubble/shared";
import { GamepadInput, STICK_DEADZONE } from "../src/input/gamepad";

interface FakePad {
  connected: boolean;
  mapping: string;
  axes: number[];
  buttons: { pressed: boolean; value: number }[];
}
const pad = (over: Partial<FakePad> & { down?: number[] } = {}): Gamepad => {
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
  for (const i of over.down ?? []) buttons[i] = { pressed: true, value: 1 };
  return { connected: true, mapping: "standard", axes: [0, 0, 0, 0], ...over, buttons } as unknown as Gamepad;
};
const input = (pads: (Gamepad | null)[]) => new GamepadInput(() => pads);

describe("GamepadInput", () => {
  it("no pads / null entries (Safari) / disconnected -> 0", () => {
    expect(input([]).sample()).toBe(0);
    expect(input([null, null]).sample()).toBe(0);
    expect(input([pad({ connected: false, down: [0] })]).sample()).toBe(0);
  });

  it("d-pad 14/15 move, 0 and 12 jump, 2 and 1 fire", () => {
    expect(input([pad({ down: [14] })]).sample()).toBe(BTN.L);
    expect(input([pad({ down: [15] })]).sample()).toBe(BTN.R);
    expect(input([pad({ down: [0] })]).sample()).toBe(BTN.J);
    expect(input([pad({ down: [12] })]).sample()).toBe(BTN.J);
    expect(input([pad({ down: [2] })]).sample()).toBe(BTN.F);
    expect(input([pad({ down: [1] })]).sample()).toBe(BTN.F);
    expect(input([pad({ down: [15, 0, 2] })]).sample()).toBe(BTN.R | BTN.J | BTN.F);
  });

  it("left stick x uses a deadzone", () => {
    expect(input([pad({ axes: [-STICK_DEADZONE - 0.01, 0] })]).sample()).toBe(BTN.L);
    expect(input([pad({ axes: [STICK_DEADZONE + 0.01, 0] })]).sample()).toBe(BTN.R);
    expect(input([pad({ axes: [STICK_DEADZONE - 0.05, 0] })]).sample()).toBe(0);
    expect(input([pad({ axes: [-0.2, 0] })]).sample()).toBe(0);
  });

  it("prefers the first standard-mapped pad, falls back to any connected pad", () => {
    const odd = pad({ mapping: "", down: [0] });
    const std = pad({ down: [2] });
    expect(input([null, odd, std]).sample()).toBe(BTN.F);
    expect(input([null, odd]).sample()).toBe(BTN.J);
  });

  it("tolerates pads with missing buttons/axes and reset() is harmless", () => {
    const sparse = { connected: true, mapping: "standard", axes: [], buttons: [] } as unknown as Gamepad;
    const g = input([sparse]);
    expect(g.sample()).toBe(0);
    g.reset();
  });

  it("analog triggers count by value when the pressed flag is absent", () => {
    const p = pad();
    (p.buttons as unknown as { pressed: boolean; value: number }[])[2] = { pressed: false, value: 0.9 };
    expect(input([p]).sample()).toBe(BTN.F);
  });
});
