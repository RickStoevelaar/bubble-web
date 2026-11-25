import { describe, expect, it } from "vitest";
import type { EnemyState, GameState } from "@bubble/shared";
import { AudioSys } from "../src/audio/audio";
import { musicFor } from "../src/audio/select";
import { installUnlock } from "../src/audio/unlock";
import { createMuteButton, installMuteKey, muteButtonPlacement } from "../src/audio/ui";
import { computeLayout } from "../src/render/layout";
import { FakeAudioContext, fakeTimers, memStorage } from "./audio-fake";

const enemy = (type: EnemyState["type"], state: EnemyState["state"] = "active") => ({ type, state }) as EnemyState;
function st(over: Partial<GameState> = {}): GameState {
  return { phase: "round", hurryActive: false, enemies: [enemy("walker")], secret: null, ...over } as GameState;
}

describe("musicFor", () => {
  it("is silent before a state exists and on game over", () => {
    expect(musicFor(null, null)).toBeNull();
    expect(musicFor(null, "main")).toBeNull();
    expect(musicFor(st({ phase: "gameover" }), "main")).toBeNull();
  });
  it("plays main in a normal round, hurry when hurrying", () => {
    expect(musicFor(st(), null)).toBe("main");
    expect(musicFor(st({ hurryActive: true }), "main")).toBe("hurry");
  });
  it("plays boss while a boss is alive, main once it is dead", () => {
    expect(musicFor(st({ enemies: [enemy("boss")] }), "main")).toBe("boss");
    expect(musicFor(st({ enemies: [enemy("boss", "spawning")] }), "main")).toBe("boss");
    expect(musicFor(st({ enemies: [enemy("boss", "dead")] }), "boss")).toBe("main");
    expect(musicFor(st({ enemies: [enemy("walker"), enemy("boss")], hurryActive: true }), "main")).toBe("boss");
  });
  it("plays secret inside a treasure room, above everything else in the round", () => {
    const secret = { index: 0, returnRound: 3, ticksLeft: 100, leaveTicks: 0 } as const;
    expect(musicFor(st({ secret, hurryActive: true }), "hurry")).toBe("secret");
    expect(musicFor(st({ secret }), null)).toBe("secret");
  });
  it("keeps the current track while clearing, so the fanfare plays over it", () => {
    for (const t of ["main", "hurry", "boss", "secret"] as const) expect(musicFor(st({ phase: "clearing" }), t)).toBe(t);
    expect(musicFor(st({ phase: "clearing" }), null)).toBe("main");
  });
  it("plays the ending in the ending phase", () => {
    expect(musicFor(st({ phase: "ending" }), "main")).toBe("ending");
    expect(musicFor(st({ phase: "ending", hurryActive: true, enemies: [] }), "ending")).toBe("ending");
  });
});

type H = (e: unknown) => void;
function fakeWindow() {
  const handlers = new Map<string, Set<H>>();
  return {
    addEventListener: (t: string, h: H) => void (handlers.get(t) ?? handlers.set(t, new Set()).get(t)!).add(h),
    removeEventListener: (t: string, h: H) => void handlers.get(t)?.delete(h),
    fire: (t: string, e: object = {}) => handlers.get(t)?.forEach((h) => h({ type: t, ...e })),
    count: () => [...handlers.values()].reduce((n, s) => n + s.size, 0),
    has: (t: string) => (handlers.get(t)?.size ?? 0) > 0,
  };
}

describe("unlock wiring", () => {
  it("the first of several rapid gestures resumes exactly once; the listeners stay for the page lifetime but do nothing while running", async () => {
    const win = fakeWindow();
    const sys = AudioSys.create({ AudioContextCtor: FakeAudioContext as never, timers: fakeTimers(), storage: memStorage() })!;
    const ctx = FakeAudioContext.last!;
    installUnlock(win as never, sys);
    const listeners = win.count();
    expect(listeners).toBeGreaterThanOrEqual(4);
    win.fire("touchend");
    win.fire("pointerdown", { pointerType: "mouse" });
    win.fire("click");
    win.fire("keydown");
    expect(ctx.resumeCalls).toBe(1);
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(sys.isRunning()).toBe(true);
    expect(win.count()).toBe(listeners);
    win.fire("click");
    win.fire("touchend");
    expect(ctx.resumeCalls).toBe(1);
    // the context is interrupted later: the next gesture resumes it again
    ctx.state = "interrupted";
    await new Promise<void>((r) => setTimeout(r, 300));
    win.fire("touchend");
    expect(ctx.resumeCalls).toBe(2);
  });
  it("a gesture while hidden does not try to resume", () => {
    const win = fakeWindow();
    const sys = AudioSys.create({ AudioContextCtor: FakeAudioContext as never, timers: fakeTimers(), storage: memStorage() })!;
    const ctx = FakeAudioContext.last!;
    installUnlock(win as never, sys);
    sys.suspend();
    win.fire("click");
    expect(ctx.resumeCalls).toBe(0);
  });
  it("a touch pointerdown is not a valid iOS activation: ignored, a later touchend unlocks", async () => {
    const win = fakeWindow();
    const sys = AudioSys.create({ AudioContextCtor: FakeAudioContext as never, timers: fakeTimers(), storage: memStorage() })!;
    const ctx = FakeAudioContext.last!;
    installUnlock(win as never, sys);
    win.fire("pointerdown", { pointerType: "touch" });
    expect(ctx.resumeCalls).toBe(0);
    win.fire("touchend");
    expect(ctx.resumeCalls).toBe(1);
  });
  it("the disposer removes the listeners", () => {
    const win = fakeWindow();
    const sys = AudioSys.create({ AudioContextCtor: FakeAudioContext as never, timers: fakeTimers(), storage: memStorage() })!;
    const off = installUnlock(win as never, sys);
    off();
    expect(win.count()).toBe(0);
  });
});

class FakeEl {
  attrs = new Map<string, string>();
  style: Record<string, string> = {};
  innerHTML = "";
  hidden = false;
  listeners = new Map<string, H[]>();
  constructor(readonly tagName: string) {}
  setAttribute(k: string, v: string) {
    this.attrs.set(k, v);
  }
  blurred = 0;
  blur() {
    this.blurred++;
  }
  getAttribute(k: string) {
    return this.attrs.get(k) ?? null;
  }
  addEventListener(t: string, h: H) {
    this.listeners.set(t, [...(this.listeners.get(t) ?? []), h]);
  }
  removeEventListener(t: string, h: H) {
    this.listeners.set(t, (this.listeners.get(t) ?? []).filter((x) => x !== h));
  }
  /** Dispatches to this element, then bubbles to `parent` unless a handler stops propagation. */
  dispatch(t: string, parent?: ReturnType<typeof fakeWindow>): { stopped: boolean } {
    const ev = { stopped: false, stopPropagation() { this.stopped = true; }, preventDefault() {} };
    for (const h of this.listeners.get(t) ?? []) h(ev);
    if (!ev.stopped) parent?.fire(t, ev);
    return ev;
  }
}

function muteSetup(storage = memStorage()) {
  const sys = AudioSys.create({ AudioContextCtor: FakeAudioContext as never, timers: fakeTimers(), storage })!;
  const doc = { createElement: (tag: string) => new FakeEl(tag), body: { appendChild: (_: unknown) => {} }, activeElement: null as { tagName: string } | null };
  const btn = createMuteButton(doc as never, sys);
  return { sys, doc, btn, el: btn.el as unknown as FakeEl, storage };
}

describe("mute button", () => {
  it("is a 40x40 labelled toggle that starts unpressed", () => {
    const { el } = muteSetup();
    expect(el.tagName).toBe("button");
    expect(el.getAttribute("aria-label")).toBeTruthy();
    expect(el.getAttribute("aria-pressed")).toBe("false");
    expect(el.style.width).toBe("40px");
    expect(el.style.height).toBe("40px");
    expect(el.innerHTML).toContain("<svg");
  });
  it("toggles mute and aria-pressed on click and persists", () => {
    const { sys, el, storage } = muteSetup();
    el.dispatch("click");
    expect(sys.isMuted()).toBe(true);
    expect(el.getAttribute("aria-pressed")).toBe("true");
    expect(JSON.parse(storage.map.get("bubble.audio")!).muted).toBe(true);
    el.dispatch("click");
    expect(sys.isMuted()).toBe(false);
    expect(el.getAttribute("aria-pressed")).toBe("false");
  });
  it("shows the persisted state on creation", () => {
    const storage = memStorage();
    storage.map.set("bubble.audio", JSON.stringify({ muted: true, volume: 0.5 }));
    const { el } = muteSetup(storage);
    expect(el.getAttribute("aria-pressed")).toBe("true");
  });
  it("stops propagation of its own touches only: they never reach the touch deck", () => {
    const { el } = muteSetup();
    const win = fakeWindow();
    let deck = 0;
    for (const t of ["touchstart", "touchmove", "touchend", "touchcancel"]) win.addEventListener(t, () => deck++);
    for (const t of ["touchstart", "touchmove", "touchend", "touchcancel"]) expect(el.dispatch(t, win).stopped).toBe(true);
    expect(deck).toBe(0);
    win.fire("touchstart", {}); // a touch elsewhere still reaches the deck
    expect(deck).toBe(1);
  });
  it("is out of the tab order and blurs after a click so Space or Enter can never activate it", () => {
    const { el } = muteSetup();
    expect(el.getAttribute("tabindex")).toBe("-1");
    el.dispatch("click");
    expect(el.blurred).toBe(1);
  });
  it("a held M key does not auto-repeat the toggle", () => {
    const { sys, doc } = muteSetup();
    const win = fakeWindow();
    installMuteKey(win as never, doc as never, sys);
    win.fire("keydown", { key: "m" });
    win.fire("keydown", { key: "m", repeat: true });
    expect(sys.isMuted()).toBe(true);
  });
  it("keyboard M toggles unless a text input has focus", () => {
    const { sys, doc } = muteSetup();
    const win = fakeWindow();
    installMuteKey(win as never, doc as never, sys);
    win.fire("keydown", { key: "m" });
    expect(sys.isMuted()).toBe(true);
    win.fire("keydown", { key: "M" });
    expect(sys.isMuted()).toBe(false);
    doc.activeElement = { tagName: "INPUT" };
    win.fire("keydown", { key: "m" });
    expect(sys.isMuted()).toBe(false);
    doc.activeElement = null;
    win.fire("keydown", { key: "m", ctrlKey: true });
    expect(sys.isMuted()).toBe(false);
    win.fire("keydown", { key: "x" });
    expect(sys.isMuted()).toBe(false);
  });
  it("sits in the margin when the layout leaves one, else over the corner at 0.6 alpha", () => {
    const wide = computeLayout(1400, 700, 1);
    const p1 = muteButtonPlacement(wide, 1400);
    expect(p1.opacity).toBe(1);
    expect(p1.left).toBeGreaterThanOrEqual(wide.gameX + wide.fieldW);
    expect(p1.left + 40).toBeLessThanOrEqual(1400);
    const phone = computeLayout(390, 844, 3);
    const p2 = muteButtonPlacement(phone, 390);
    expect(p2.opacity).toBe(0.6);
    expect(p2.left + 40).toBeLessThanOrEqual(390);
    expect(p2.top).toBeGreaterThanOrEqual(0);
  });
});
