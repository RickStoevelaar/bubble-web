import { readSuperCode } from "./super-code";

/** Minimal shapes of the DOM pieces the form touches, so tests can use plain fakes. */
export interface InputLike {
  value: string;
  addEventListener(type: "input", h: () => void): void;
  focus(): void;
  blur?(): void;
}
export interface CheckLike {
  checked: boolean;
  addEventListener(type: "change", h: () => void): void;
}
export interface ClickLike {
  disabled?: boolean;
  addEventListener(type: "click", h: () => void): void;
}
export interface TextLike {
  textContent: string | null;
  hidden: boolean;
}
export interface FormLike {
  addEventListener(type: "submit", h: (e: { preventDefault(): void }) => void): void;
}
export interface KvStore {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

export interface JoinFormEls {
  root: { hidden: boolean };
  form: FormLike;
  room: InputLike;
  pin: InputLike;
  name: InputLike;
  rememberPin: CheckLike;
  go: ClickLike;
  back: ClickLike;
  error: TextLike;
  hint: TextLike;
}

export interface JoinValues {
  room: string;
  pin: string;
  name: string;
}

export const FORM_KEY = "bubble.form";
/** The one-line note about the Super room, shown only when its code is typed. */
export const SUPER_HINT = "special room: opens after you beat the game together";

interface Saved {
  room?: string;
  name?: string;
  pin?: string;
  rememberPin?: boolean;
}

/**
 * The join form (a DOM overlay). It remembers room and name; the PIN only when the user ticked "remember PIN on
 * this device" (stored in this browser's localStorage, nowhere else); unticking removes it again. An old save that
 * holds a PIN without that explicit consent is cleaned on load.
 */
export class JoinForm {
  private connecting = false;

  constructor(
    private readonly els: JoinFormEls,
    private readonly store: KvStore | null,
    private readonly superCode: string,
    private readonly onSubmit: (v: JoinValues) => void,
    private readonly onBack: () => void,
  ) {
    const saved = this.load();
    els.room.value = saved.room ?? "";
    els.name.value = saved.name ?? "";
    els.rememberPin.checked = saved.rememberPin === true;
    els.pin.value = saved.rememberPin === true ? (saved.pin ?? "") : "";
    this.updateHint();

    els.room.addEventListener("input", () => {
      els.room.value = els.room.value.toUpperCase().trim();
      this.updateHint();
    });
    els.rememberPin.addEventListener("change", () => {
      if (!els.rememberPin.checked) this.write({ pin: undefined, rememberPin: false });
    });
    els.back.addEventListener("click", () => this.onBack());
    els.form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (this.connecting) return;
      const room = els.room.value.trim().toUpperCase();
      els.room.value = room;
      if (room === "" || els.pin.value === "") return;
      this.onSubmit({ room, pin: els.pin.value, name: els.name.value.trim() });
    });
  }

  /** Shows the form (optionally with an error line) and focuses the first empty field. */
  show(errorText: string | null = null): void {
    this.els.root.hidden = false;
    this.updateHint(); // the code may have been remembered since the form was built
    this.setError(errorText);
    const e = this.els;
    (e.room.value === "" ? e.room : e.pin.value === "" ? e.pin : e.name.value === "" ? e.name : e.room).focus();
  }

  /** Hides the form and drops focus so no key can land in a hidden field. */
  hide(): void {
    this.els.root.hidden = true;
    this.els.room.blur?.();
    this.els.pin.blur?.();
    this.els.name.blur?.();
  }

  setConnecting(on: boolean): void {
    this.connecting = on;
    this.els.go.disabled = on;
  }

  setError(text: string | null): void {
    this.els.error.textContent = text ?? "";
  }

  /** After a successful join: remember room and name, and the PIN only if ticked. */
  remember(v: JoinValues): void {
    const tick = this.els.rememberPin.checked;
    this.write({ room: v.room, name: v.name, pin: tick ? v.pin : undefined, rememberPin: tick });
  }

  /** Clears the typed PIN (a session ended: ask again) unless the user chose to remember it. */
  resetPin(): void {
    if (!this.els.rememberPin.checked) this.els.pin.value = "";
  }

  private updateHint(): void {
    const on = this.superCode !== "" && this.els.room.value.trim().toUpperCase() === this.superCode;
    const room = this.els.room.value.trim();
    const mine = room === "" || on ? readSuperCode(this.store, this.superCode) : null; // remembered from the true ending (only ever the real code)
    const text = [on ? SUPER_HINT : "", mine ? `your code: ${mine}` : ""].filter((t) => t !== "").join(" - ");
    this.els.hint.hidden = text === "";
    this.els.hint.textContent = text;
  }

  private load(): Saved {
    try {
      const raw = this.store?.getItem(FORM_KEY);
      const o: unknown = raw ? JSON.parse(raw) : {};
      const s: Saved = typeof o === "object" && o !== null ? (o as Saved) : {};
      if (s.pin !== undefined && s.rememberPin !== true) {
        delete s.pin; // an older version saved the PIN without asking: drop it
        this.store?.setItem(FORM_KEY, JSON.stringify(s));
      }
      return s;
    } catch {
      return {};
    }
  }

  private write(patch: Saved): void {
    try {
      const next: Saved = { ...this.load(), ...patch };
      if (next.pin === undefined) delete next.pin;
      this.store?.setItem(FORM_KEY, JSON.stringify(next));
    } catch {
      /* not remembered (private mode, blocked storage) */
    }
  }
}
