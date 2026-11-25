import { BTN } from "@bubble/shared";

/** Anything that can report the current button bitmask (BTN.L|R|J|F) once per tick. */
export interface InputSource {
  sample(): number;
  /** Forget any held buttons (page hidden or blurred: key-up events may be lost). */
  reset?(): void;
}

const KEY_BUTTON: Record<string, number> = {
  ArrowLeft: BTN.L,
  KeyA: BTN.L,
  ArrowRight: BTN.R,
  KeyD: BTN.R,
  Space: BTN.J,
  KeyW: BTN.J,
  ArrowUp: BTN.J,
  KeyZ: BTN.F,
  KeyX: BTN.F,
  ControlLeft: BTN.F,
  ControlRight: BTN.F,
};

type KeyTarget = Pick<Window, "addEventListener" | "removeEventListener">;

/** Minimal keyboard source: arrows/A-D move, Space/W/Up jump, Z/X/Ctrl fire. */
export class KeyboardInput implements InputSource {
  private readonly down = new Set<string>();

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (!(e.code in KEY_BUTTON)) return;
    e.preventDefault();
    if (e.repeat) return;
    this.down.add(e.code);
  };
  private readonly onKeyUp = (e: KeyboardEvent): void => {
    if (!(e.code in KEY_BUTTON)) return;
    e.preventDefault();
    this.down.delete(e.code);
  };
  private readonly onBlur = (): void => this.down.clear();

  constructor(private readonly target: KeyTarget) {
    target.addEventListener("keydown", this.onKeyDown as EventListener);
    target.addEventListener("keyup", this.onKeyUp as EventListener);
    target.addEventListener("blur", this.onBlur);
  }

  sample(): number {
    let buttons = 0;
    for (const code of this.down) buttons |= KEY_BUTTON[code]!;
    return buttons;
  }

  reset(): void {
    this.down.clear();
  }

  dispose(): void {
    this.target.removeEventListener("keydown", this.onKeyDown as EventListener);
    this.target.removeEventListener("keyup", this.onKeyUp as EventListener);
    this.target.removeEventListener("blur", this.onBlur);
    this.down.clear();
  }
}

/** ORs several sources (keyboard | gamepad | touch): the game does not care where input comes from. */
export class CombinedInput implements InputSource {
  constructor(private readonly sources: readonly InputSource[]) {}

  sample(): number {
    let m = 0;
    for (const s of this.sources) m |= s.sample();
    return m;
  }

  reset(): void {
    for (const s of this.sources) s.reset?.();
  }
}
