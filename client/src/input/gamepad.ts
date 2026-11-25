import { BTN } from "@bubble/shared";
import type { InputSource } from "./input";

export const STICK_DEADZONE = 0.4;

type PadList = ArrayLike<Gamepad | null>;

/** Never throws: the API is missing on insecure origins (plain http LAN) and can be blocked by policy. */
function defaultGetGamepads(): PadList {
  try {
    if (typeof navigator === "undefined") return [];
    return navigator.getGamepads?.() ?? [];
  } catch {
    return [];
  }
}

/** Standard-mapping gamepad: d-pad or left stick moves, bottom face/d-pad up jumps, left face fires. */
export class GamepadInput implements InputSource {
  constructor(private readonly getGamepads: () => PadList = defaultGetGamepads) {}

  private pick(): Gamepad | null {
    const pads = this.getGamepads();
    let fallback: Gamepad | null = null;
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      if (!p || !p.connected) continue; // Safari returns null entries
      if (p.mapping === "standard") return p;
      fallback ??= p;
    }
    return fallback;
  }

  sample(): number {
    const p = this.pick();
    if (!p) return 0;
    const down = (i: number): boolean => {
      const b = p.buttons[i];
      return b !== undefined && (b.pressed || b.value > 0.5);
    };
    const x = p.axes[0] ?? 0;
    let m = 0;
    if (down(14) || x < -STICK_DEADZONE) m |= BTN.L;
    if (down(15) || x > STICK_DEADZONE) m |= BTN.R;
    if (down(0) || down(12)) m |= BTN.J;
    if (down(2) || down(1)) m |= BTN.F;
    return m;
  }

  reset(): void {
    /* stateless: the next poll reads the pad again */
  }
}
