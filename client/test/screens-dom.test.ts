import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SUPER_CODE } from "@bubble/shared";
import { computeLayout } from "../src/render/layout";
import { ContinuePrompt, GameOverPanel, MIN_BUTTON_H, buttonPlacement } from "../src/screens/gameover";
import { installEndingSkip, installScoresInput, installTitleStart, isStartKey, parseDevRound, toGame } from "../src/screens/input";
import { FORM_KEY, JoinForm, SUPER_HINT, type JoinFormEls } from "../src/screens/join-form";
import { planScreenLayout } from "../src/screens/plan";
import type { Screen } from "../src/screens/machine";

// ---- fakes -------------------------------------------------------------------------------------------------------

type H = (e: never) => void;
function target() {
  const hs = new Map<string, Set<H>>();
  return {
    addEventListener: (t: string, h: H) => void (hs.get(t) ?? hs.set(t, new Set()).get(t)!).add(h),
    removeEventListener: (t: string, h: H) => void hs.get(t)?.delete(h),
    fire: (t: string, e: object = {}) => hs.get(t)?.forEach((h) => (h as (x: object) => void)(e)),
    count: () => [...hs.values()].reduce((n, s) => n + s.size, 0),
  };
}
const key = (k: string, extra: object = {}) => {
  const e = { key: k, prevented: false, preventDefault() { e.prevented = true; }, ...extra };
  return e;
};

function formEls(initial: Record<string, string> = {}) {
  const log: string[] = [];
  const mkInput = (name: string, value = "") => {
    const t = target();
    return { value, t, focused: 0, blurred: 0, addEventListener: t.addEventListener, focus() { this.focused++; log.push(`focus ${name}`); }, blur() { this.blurred++; } };
  };
  const room = mkInput("room", initial.room);
  const pin = mkInput("pin", initial.pin);
  const name = mkInput("name", initial.name);
  void initial;
  const check = { checked: false, t: target(), addEventListener: (_: "change", h: () => void) => check.t.addEventListener("change", h as H) };
  const form = { t: target(), addEventListener: (_: "submit", h: (e: { preventDefault(): void }) => void) => form.t.addEventListener("submit", h as unknown as H) };
  const click = () => {
    const t = target();
    return { disabled: false, t, addEventListener: (_: "click", h: () => void) => t.addEventListener("click", h as H) };
  };
  const go = click();
  const back = click();
  const error = { textContent: "", hidden: false };
  const hint = { textContent: "", hidden: true };
  const root = { hidden: true };
  const els = { root, form, room, pin, name, rememberPin: check, go, back, error, hint } as unknown as JoinFormEls;
  return { els, room, pin, name, check, form, go, back, error, hint, root, log };
}
function store(init?: object) {
  const m = new Map<string, string>();
  if (init) m.set(FORM_KEY, JSON.stringify(init));
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), saved: () => JSON.parse(m.get(FORM_KEY) ?? "null") as Record<string, unknown> | null };
}
const submits = () => {
  const out: object[] = [];
  return { out, fn: (v: object) => void out.push(v) };
};

// ---- join form ---------------------------------------------------------------------------------------------------

describe("index.html join form attributes", () => {
  const html = readFileSync(join(__dirname, "../index.html"), "utf8");
  const tag = (id: string) => new RegExp(`<input[^>]*id="${id}"[^>]*>`).exec(html)![0];

  it("the PIN is a password field that allows letters and resists autofill/correction", () => {
    const pin = tag("pin");
    for (const a of ['type="password"', 'inputmode="text"', 'autocomplete="off"', 'autocapitalize="off"', 'autocorrect="off"', 'spellcheck="false"']) expect(pin).toContain(a);
    expect(pin).not.toContain("numeric");
  });
  it("room and name resist auto-correction", () => {
    for (const id of ["room", "name"]) {
      expect(tag(id)).toContain('autocorrect="off"');
      expect(tag(id)).toContain('spellcheck="false"');
    }
  });
  it("has the remember checkbox (unticked by default) with the honest note, a Back button and the game-over buttons", () => {
    expect(tag("remember-pin")).toContain('type="checkbox"');
    expect(tag("remember-pin")).not.toContain("checked");
    expect(html).toContain("stored on this device only");
    expect(html).toMatch(/<button id="join-back"[^>]*>Back<\/button>/);
    expect(html).toMatch(/id="go-continue"[^>]*>CONTINUE</);
    expect(html).toMatch(/id="go-quit"[^>]*>QUIT</);
    expect(html).toMatch(/<div id="join" hidden>/); // nothing but the canvas until the title says so
    expect(html).toMatch(/min-height: 44px/);
  });
});

describe("JoinForm", () => {
  it("remembers room and name, never the PIN unless ticked, and removes it when unticked", () => {
    const f = formEls();
    const st = store();
    const s = submits();
    const form = new JoinForm(f.els, st, SUPER_CODE, s.fn, () => {});
    form.remember({ room: "ABC", pin: "secret", name: "Amy" });
    expect(st.saved()).toEqual({ room: "ABC", name: "Amy", rememberPin: false });
    expect(JSON.stringify(st.saved())).not.toContain("secret");

    f.check.checked = true;
    form.remember({ room: "ABC", pin: "secret", name: "Amy" });
    expect(st.saved()).toMatchObject({ pin: "secret", rememberPin: true });

    // a new page load restores room, name and (ticked) PIN
    const f2 = formEls();
    new JoinForm(f2.els, st, SUPER_CODE, s.fn, () => {});
    expect(f2.room.value).toBe("ABC");
    expect(f2.name.value).toBe("Amy");
    expect(f2.pin.value).toBe("secret");
    expect(f2.check.checked).toBe(true);

    // unticking removes the stored PIN at once
    f2.check.checked = false;
    f2.check.t.fire("change");
    expect(st.saved()).toEqual({ room: "ABC", name: "Amy", rememberPin: false });
  });

  it("drops a PIN saved by an older version that never asked", () => {
    const st = store({ room: "OLD", pin: "oldpin", name: "N" });
    const f = formEls();
    new JoinForm(f.els, st, SUPER_CODE, () => {}, () => {});
    expect(f.pin.value).toBe("");
    expect(f.check.checked).toBe(false);
    expect(JSON.stringify(st.saved())).not.toContain("oldpin");
  });

  it("survives broken or missing storage", () => {
    const boom = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    const f = formEls();
    const form = new JoinForm(f.els, boom, SUPER_CODE, () => {}, () => {});
    expect(() => form.remember({ room: "A", pin: "p", name: "n" })).not.toThrow();
    const f2 = formEls();
    expect(() => new JoinForm(f2.els, null, SUPER_CODE, () => {}, () => {})).not.toThrow();
  });

  it("Enter/submit sends the trimmed, upper-cased room; an empty room or PIN is not sent", () => {
    const f = formEls();
    const s = submits();
    new JoinForm(f.els, null, SUPER_CODE, s.fn, () => {});
    Object.assign(f.room, { value: "  ab1 " });
    f.pin.value = "pw";
    f.name.value = "  Bo  ";
    f.form.t.fire("submit", { preventDefault() {} });
    expect(s.out).toEqual([{ room: "AB1", pin: "pw", name: "Bo" }]);
    f.pin.value = "";
    f.form.t.fire("submit", { preventDefault() {} });
    expect(s.out).toHaveLength(1);
  });

  it("calls preventDefault on submit (no page navigation)", () => {
    const f = formEls();
    new JoinForm(f.els, null, SUPER_CODE, () => {}, () => {});
    f.room.value = "A";
    f.pin.value = "p";
    let prevented = false;
    f.form.t.fire("submit", { preventDefault: () => (prevented = true) });
    expect(prevented).toBe(true);
  });

  it("disables Go while connecting and ignores a submit then", () => {
    const f = formEls();
    const s = submits();
    const form = new JoinForm(f.els, null, SUPER_CODE, s.fn, () => {});
    f.room.value = "A";
    f.pin.value = "p";
    form.setConnecting(true);
    expect(f.go.disabled).toBe(true);
    f.form.t.fire("submit", { preventDefault() {} });
    expect(s.out).toHaveLength(0);
    form.setConnecting(false);
    expect(f.go.disabled).toBe(false);
  });

  it("Back calls its handler; error text is shown inline and cleared", () => {
    const f = formEls();
    let backs = 0;
    const form = new JoinForm(f.els, null, SUPER_CODE, () => {}, () => backs++);
    f.back.t.fire("click");
    expect(backs).toBe(1);
    form.setError("That PIN is not right.");
    expect(f.error.textContent).toBe("That PIN is not right.");
    form.setError(null);
    expect(f.error.textContent).toBe("");
  });

  it("shows the Super-room note only while the typed room equals SUPER_CODE", () => {
    const f = formEls();
    new JoinForm(f.els, null, SUPER_CODE, () => {}, () => {});
    expect(f.hint.hidden).toBe(true);
    f.room.value = SUPER_CODE.toLowerCase();
    f.room.t.fire("input");
    expect(f.room.value).toBe(SUPER_CODE);
    expect(f.hint.hidden).toBe(false);
    expect(f.hint.textContent).toBe(SUPER_HINT);
    expect(SUPER_HINT).toBe("special room: opens after you beat the game together");
    f.room.value = "FAMILY";
    f.room.t.fire("input");
    expect(f.hint.hidden).toBe(true);
    expect(f.hint.textContent).toBe("");
  });

  it("show() reveals the form and focuses the first empty field; hide() hides and blurs (no keys captured while hidden)", () => {
    const f = formEls();
    const form = new JoinForm(f.els, null, SUPER_CODE, () => {}, () => {});
    form.show("oops");
    expect(f.root.hidden).toBe(false);
    expect(f.error.textContent).toBe("oops");
    expect(f.log).toEqual(["focus room"]);
    form.hide();
    expect(f.root.hidden).toBe(true);
    expect(f.room.blurred + f.pin.blurred + f.name.blurred).toBe(3);
    const g = formEls();
    const form2 = new JoinForm(g.els, null, SUPER_CODE, () => {}, () => {});
    g.room.value = "R";
    form2.show();
    expect(g.log).toEqual(["focus pin"]);
  });

  it("resetPin clears the typed PIN unless the user chose to remember it", () => {
    const f = formEls();
    const form = new JoinForm(f.els, null, SUPER_CODE, () => {}, () => {});
    f.pin.value = "typed";
    form.resetPin();
    expect(f.pin.value).toBe("");
    const g = formEls();
    const form2 = new JoinForm(g.els, null, SUPER_CODE, () => {}, () => {});
    g.pin.value = "typed";
    g.check.checked = true;
    form2.resetPin();
    expect(g.pin.value).toBe("typed");
  });
});

// ---- title / scores input ------------------------------------------------------------------------------------------

describe("title start input", () => {
  it("any pointer press or key starts, once, and a disposer leaves no listener behind", () => {
    const t = target();
    let starts = 0;
    const dispose = installTitleStart(t, () => starts++);
    expect(t.count()).toBe(2);
    t.fire("pointerdown", {});
    t.fire("keydown", key("a"));
    expect(starts).toBe(1);
    dispose();
    expect(t.count()).toBe(0);
    t.fire("pointerdown", {});
    expect(starts).toBe(1);
  });

  it("a key press is consumed (it must not be typed into the form); modifiers, shortcuts and F-keys do not start", () => {
    const t = target();
    let starts = 0;
    installTitleStart(t, () => starts++);
    for (const e of [key("Shift"), key("Control"), key("c", { ctrlKey: true }), key("r", { metaKey: true }), key("F5"), key("Tab", { altKey: true })]) t.fire("keydown", e);
    expect(starts).toBe(0);
    const k = key("Enter");
    t.fire("keydown", k);
    expect(starts).toBe(1);
    expect(k.prevented).toBe(true);
    expect(isStartKey({ key: " " })).toBe(true);
    expect(isStartKey({ key: "F12" })).toBe(false);
  });

  it("a press on a button (the mute button) does not start", () => {
    const t = target();
    let starts = 0;
    installTitleStart(t, () => starts++);
    t.fire("pointerdown", { target: { closest: (s: string) => (s.includes("button") ? {} : null) } });
    expect(starts).toBe(0);
    t.fire("pointerdown", { target: { closest: () => null } });
    expect(starts).toBe(1);
  });
});

describe("scores input", () => {
  const canvas = { getBoundingClientRect: () => ({ left: 100, top: 50, width: 512, height: 448 }) };
  it("maps client coordinates to the 256x224 field", () => {
    expect(toGame({ left: 100, top: 50, width: 512, height: 448 }, 100 + 256, 50 + 224)).toEqual({ x: 128, y: 112 });
    expect(toGame({ left: 0, top: 0, width: 0, height: 0 }, 5, 5).x).toBeGreaterThan(0); // never NaN
  });

  it("a tap on BACK goes back; a tap elsewhere pages; keys work; dispose removes everything", () => {
    const t = target();
    const acts: string[] = [];
    const dispose = installScoresInput(t, canvas, (a) => acts.push(a));
    t.fire("pointerdown", { clientX: 100 + 2 * 20, clientY: 50 + 2 * 208 }); // game (20, 208): inside BACK
    t.fire("pointerdown", { clientX: 300, clientY: 150 });
    const arrow = key("ArrowLeft");
    t.fire("keydown", arrow);
    t.fire("keydown", key("q"));
    t.fire("keydown", key("Escape", { ctrlKey: true }));
    expect(acts).toEqual(["back", "next", "prev"]);
    expect(arrow.prevented).toBe(true);
    dispose();
    expect(t.count()).toBe(0);
  });
});

describe("dev round parsing", () => {
  it("accepts ?round=N for whole numbers 1-999 and nothing else", () => {
    expect(parseDevRound("?round=7")).toBe(7);
    expect(parseDevRound("?x=1&round=100")).toBe(100);
    for (const bad of ["", "?round=0", "?round=-1", "?round=1.5", "?round=abc", "?round=", "?round=1000", "?round=7x", "?rounds=7"]) expect(parseDevRound(bad)).toBeNull();
  });
});

// ---- game over: countdown, buttons, keys -----------------------------------------------------------------------

function clock() {
  const c = { t: 0, timers: new Map<number, { at: number; fn: () => void }>(), n: 0 };
  return {
    c,
    now: () => c.t,
    setTimer: (fn: () => void, ms: number) => {
      c.timers.set(++c.n, { at: c.t + ms, fn });
      return c.n;
    },
    clearTimer: (h: unknown) => void c.timers.delete(h as number),
    advance(ms: number) {
      c.t += ms;
      for (const [id, t] of [...c.timers]) {
        if (t.at <= c.t) {
          c.timers.delete(id);
          t.fn();
        }
      }
    },
  };
}

function panelSetup() {
  const k = clock();
  const answers: boolean[] = [];
  const win = target();
  const mkBtn = () => {
    const t = target();
    return { disabled: false, t, addEventListener: (_: "click", h: () => void) => t.addEventListener("click", h as H) };
  };
  const cont = mkBtn();
  const quit = mkBtn();
  const box = { hidden: true };
  const prompt = new ContinuePrompt({ now: k.now, setTimer: k.setTimer, clearTimer: k.clearTimer, onAnswer: (a) => answers.push(a) });
  const panel = new GameOverPanel(box, cont, quit, win as never, prompt);
  return { k, answers, win, cont, quit, box, prompt, panel };
}

describe("game-over countdown", () => {
  it("counts 10 down to 0 and auto-declines exactly once", () => {
    const s = panelSetup();
    s.panel.show();
    expect(s.prompt.remainingSeconds()).toBe(10);
    s.k.advance(1);
    expect(s.prompt.remainingSeconds()).toBe(10);
    s.k.advance(1999);
    expect(s.prompt.remainingSeconds()).toBe(8);
    s.k.advance(7999);
    expect(s.answers).toEqual([]);
    expect(s.prompt.remainingSeconds()).toBe(1);
    s.k.advance(1);
    expect(s.answers).toEqual([false]);
    expect(s.prompt.remainingSeconds()).toBe(0);
    s.k.advance(60_000);
    s.panel.answer(false);
    s.win.fire("keydown", key("Escape"));
    expect(s.answers).toEqual([false]); // never twice
    expect(s.cont.disabled && s.quit.disabled).toBe(true);
  });

  it("does not fire after the screen was left (the phase returned to round)", () => {
    const s = panelSetup();
    s.panel.show();
    s.k.advance(5000);
    s.panel.hide();
    expect(s.k.c.timers.size).toBe(0);
    s.k.advance(60_000);
    expect(s.answers).toEqual([]);
    expect(s.box.hidden).toBe(true);
  });

  it("restarts the full countdown when shown again", () => {
    const s = panelSetup();
    s.panel.show();
    s.k.advance(9000);
    s.panel.hide();
    s.panel.show();
    expect(s.prompt.remainingSeconds()).toBe(10);
    expect(s.cont.disabled).toBe(false);
    s.k.advance(9999);
    expect(s.answers).toEqual([]);
  });
});

describe("game-over buttons and keys", () => {
  it("CONTINUE sends true, QUIT sends false; afterwards both are disabled and later answers are ignored", () => {
    const s = panelSetup();
    s.panel.show();
    expect(s.box.hidden).toBe(false);
    expect(s.cont.disabled || s.quit.disabled).toBe(false);
    s.cont.t.fire("click");
    expect(s.answers).toEqual([true]);
    expect(s.cont.disabled && s.quit.disabled).toBe(true);
    s.quit.t.fire("click");
    s.win.fire("keydown", key("Enter"));
    s.k.advance(20_000);
    expect(s.answers).toEqual([true]);

    const q = panelSetup();
    q.panel.show();
    q.quit.t.fire("click");
    expect(q.answers).toEqual([false]);
  });

  it("Enter and Space continue, Escape quits; shortcuts with Ctrl/Alt/Meta and other keys do nothing", () => {
    for (const [k, want] of [["Enter", true], [" ", true], ["Escape", false]] as const) {
      const s = panelSetup();
      s.panel.show();
      s.win.fire("keydown", key("x", {}));
      s.win.fire("keydown", key("Enter", { ctrlKey: true }));
      expect(s.answers).toEqual([]);
      const e = key(k);
      s.win.fire("keydown", e);
      expect(s.answers).toEqual([want]);
      expect(e.prevented).toBe(true);
    }
  });

  it("registers its key listener only while shown (no leak across screens, no capture while hidden)", () => {
    const s = panelSetup();
    expect(s.win.count()).toBe(0);
    s.panel.show();
    s.panel.show();
    expect(s.win.count()).toBe(1);
    s.panel.hide();
    expect(s.win.count()).toBe(0);
    s.win.fire("keydown", key("Enter"));
    expect(s.answers).toEqual([]);
    s.panel.answer(true); // a click that arrives after leaving
    expect(s.answers).toEqual([]);
  });
});

// ---- layout: buttons, deck and rotation ------------------------------------------------------------------------

describe("screen layout plans", () => {
  const SCREENS: Screen[] = ["title", "join", "game", "gameover", "ending", "scores"];

  it("only the game screen gets touch zones and a deck; nothing else shows a stale deck", () => {
    for (const [w, h] of [[390, 844], [844, 390]] as const) {
      const l = computeLayout(w, h, 3);
      for (const sc of SCREENS) {
        const p = planScreenLayout(sc, l, w, h, true, 34);
        if (sc === "game") {
          expect(p.zones).not.toBeNull();
          expect(p.deckBox).not.toBeNull();
        } else {
          expect(p.zones).toBeNull();
          expect(p.deckBox).toBeNull();
        }
        expect(p.actions !== null).toBe(sc === "gameover");
      }
    }
  });

  it("the CONTINUE/QUIT row is at least 44 px tall and inside the window in portrait, landscape and tiny windows", () => {
    for (const [w, h, dpr] of [[390, 844, 3], [844, 390, 3], [320, 480, 2], [480, 320, 2], [1280, 720, 1], [200, 200, 1], [360, 640, 2]] as const) {
      const l = computeLayout(w, h, dpr);
      const b = buttonPlacement(l, w, h, 34);
      expect(b.height).toBeGreaterThanOrEqual(MIN_BUTTON_H);
      expect(b.left).toBeGreaterThanOrEqual(0);
      expect(b.left + b.width).toBeLessThanOrEqual(w);
      if (h >= 320) expect(b.top + b.height).toBeLessThanOrEqual(h - 34 + 1);
    }
  });

  it("portrait: the row sits in the deck area below the canvas; landscape: over the bottom of the canvas", () => {
    const lp = computeLayout(390, 844, 3);
    const bp = buttonPlacement(lp, 390, 844, 34);
    expect(bp.top).toBeGreaterThanOrEqual(lp.gameY + lp.fieldH);
    const ll = computeLayout(844, 390, 3);
    const bl = buttonPlacement(ll, 844, 390, 0);
    expect(bl.top).toBeGreaterThanOrEqual(ll.gameY + ll.fieldH * 0.7);
    expect(bl.left).toBeGreaterThanOrEqual(ll.gameX);
    expect(bl.left + bl.width).toBeLessThanOrEqual(ll.gameX + ll.fieldW);
  });

  it("a rotation re-plans: the same screen gets different placements, and the actions follow the new canvas", () => {
    const a = planScreenLayout("gameover", computeLayout(390, 844, 3), 390, 844, true, 34);
    const b = planScreenLayout("gameover", computeLayout(844, 390, 3), 844, 390, true, 0);
    expect(a.actions).not.toEqual(b.actions);
    expect(a.deckPassThrough).toBe(false);
    expect(b.deckPassThrough).toBe(true);
    const g1 = planScreenLayout("game", computeLayout(390, 844, 3), 390, 844, true, 34);
    const g2 = planScreenLayout("game", computeLayout(844, 390, 3), 844, 390, true, 0);
    expect(g1.deckBox).not.toEqual(g2.deckBox);
    expect(g2.deckBox).toEqual({ x: 0, y: 0, width: 844, height: 390 });
  });
});

// ---- 23b: ending skip input and the remembered-code hint ---------------------------------------------------------
describe("ending skip input", () => {
  it("fires on a tap or Enter/Escape/Space only while allowed, once, and is fully removed by its disposer", () => {
    const t = target();
    let allowed = false;
    let n = 0;
    const off = installEndingSkip(t, () => allowed, () => n++);
    expect(t.count()).toBe(2);
    t.fire("pointerdown", { target: null });
    t.fire("keydown", key("Enter"));
    expect(n).toBe(0);
    allowed = true;
    t.fire("keydown", key("a"));
    t.fire("keydown", key("Enter", { ctrlKey: true }));
    expect(n).toBe(0);
    const k = key("Escape");
    t.fire("keydown", k);
    expect(n).toBe(1);
    expect(k.prevented).toBe(true);
    t.fire("pointerdown", { target: null });
    t.fire("keydown", key(" "));
    expect(n).toBe(1);
    off();
    expect(t.count()).toBe(0);
  });
  it("ignores key repeat and presses on controls, and a tap works", () => {
    const t = target();
    let n = 0;
    const off = installEndingSkip(t, () => true, () => n++);
    t.fire("keydown", key("Enter", { repeat: true }));
    t.fire("pointerdown", { target: { closest: () => ({}) } });
    expect(n).toBe(0);
    t.fire("pointerdown", { target: { closest: () => null } });
    expect(n).toBe(1);
    off();
  });
  it("a disposed listener never fires, even if an event is delivered late", () => {
    const t = target();
    let n = 0;
    let handler: ((e: object) => void) | undefined;
    const spy = {
      addEventListener: (ty: string, h: never) => {
        if (ty === "keydown") handler = h as never;
        t.addEventListener(ty, h);
      },
      removeEventListener: t.removeEventListener,
    };
    const off = installEndingSkip(spy, () => true, () => n++);
    off();
    handler?.(key("Enter"));
    expect(n).toBe(0);
  });
});

describe("join hint shows the remembered Super code", () => {
  const CODE_KEY = "bubbleweb.superCode";
  it("shows 'your code: X' when remembered, without typing the room; hidden when absent", () => {
    const f = formEls();
    const s = store();
    const form = new JoinForm(f.els, s, SUPER_CODE, () => {}, () => {});
    expect(f.hint.hidden).toBe(true);
    s.setItem(CODE_KEY, SUPER_CODE);
    form.show();
    expect(f.hint.hidden).toBe(false);
    expect(f.hint.textContent).toBe(`your code: ${SUPER_CODE}`);
    f.room.value = SUPER_CODE;
    f.room.t.fire("input");
    expect(f.hint.textContent).toBe(`${SUPER_HINT} - your code: ${SUPER_CODE}`);
    f.room.value = "";
    f.room.t.fire("input");
    expect(f.hint.textContent).toBe(`your code: ${SUPER_CODE}`);
  });
  it("ignores junk in storage and survives a throwing store", () => {
    const f = formEls();
    const s = store();
    s.setItem(CODE_KEY, "<img onerror=x>");
    const form = new JoinForm(f.els, s, SUPER_CODE, () => {}, () => {});
    form.show();
    expect(f.hint.hidden).toBe(true);
    const g = formEls();
    const boom = {
      getItem: (k: string) => {
        if (k === CODE_KEY) throw new Error("blocked");
        return null;
      },
      setItem: () => {},
    };
    const form2 = new JoinForm(g.els, boom, SUPER_CODE, () => {}, () => {});
    expect(() => form2.show()).not.toThrow();
    expect(g.hint.hidden).toBe(true);
  });
});
