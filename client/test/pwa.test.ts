import { describe, expect, it } from "vitest";
import { installInstallButton, registerServiceWorker, swAllowed } from "../src/pwa";

type L = (e: unknown) => void;

function fakeWin(opts: { sw?: boolean; protocol?: string; hostname?: string; ready?: string; standalone?: boolean; registerThrows?: boolean }) {
  const listeners: Record<string, L[]> = {};
  const registered: string[] = [];
  const nav: Record<string, unknown> = {};
  if (opts.sw !== false) {
    nav.serviceWorker = {
      register: (url: string) => {
        if (opts.registerThrows) throw new Error("boom");
        registered.push(url);
        return Promise.reject(new Error("nope")); // a rejection must be swallowed
      },
    };
  }
  const win = {
    navigator: nav,
    location: { protocol: opts.protocol ?? "https:", hostname: opts.hostname ?? "bubble.example" },
    document: { readyState: opts.ready ?? "complete" },
    addEventListener: (t: string, l: L) => (listeners[t] ??= []).push(l),
    matchMedia: () => ({ matches: opts.standalone === true }),
  };
  const fire = (t: string, e: unknown = {}) => (listeners[t] ?? []).forEach((l) => l(e));
  return { win: win as never, registered, fire };
}

describe("swAllowed", () => {
  it("allows https and http on localhost only", () => {
    expect(swAllowed({ protocol: "https:", hostname: "x.example" })).toBe(true);
    expect(swAllowed({ protocol: "http:", hostname: "localhost" })).toBe(true);
    expect(swAllowed({ protocol: "http:", hostname: "127.0.0.1" })).toBe(true);
    expect(swAllowed({ protocol: "http:", hostname: "192.168.1.5" })).toBe(false);
    expect(swAllowed({ protocol: "http:", hostname: "bubble.example" })).toBe(false);
  });
});

describe("registerServiceWorker", () => {
  it("registers /sw.js once loaded", () => {
    const f = fakeWin({ ready: "complete" });
    registerServiceWorker(f.win);
    expect(f.registered).toEqual(["/sw.js"]);
  });
  it("waits for load while the page is still loading", () => {
    const f = fakeWin({ ready: "loading" });
    registerServiceWorker(f.win);
    expect(f.registered).toEqual([]);
    f.fire("load");
    expect(f.registered).toEqual(["/sw.js"]);
  });
  it("does nothing without support or on an insecure origin, and never throws", () => {
    registerServiceWorker(fakeWin({ sw: false }).win);
    const b = fakeWin({ protocol: "http:", hostname: "192.168.1.5" });
    registerServiceWorker(b.win);
    expect(b.registered).toEqual([]);
    expect(() => registerServiceWorker(fakeWin({ registerThrows: true }).win)).not.toThrow();
    expect(() => registerServiceWorker({} as never)).not.toThrow();
  });
});

describe("installInstallButton", () => {
  function btn() {
    const clicks: L[] = [];
    return { hidden: true, addEventListener: (_: string, l: L) => clicks.push(l), click: () => clicks.forEach((l) => l({})) };
  }
  it("shows only on the title screen and only after beforeinstallprompt", () => {
    const f = fakeWin({});
    const b = btn();
    const ib = installInstallButton(f.win, b as never);
    ib.setScreenVisible(true);
    expect(b.hidden).toBe(true);
    let prompted = 0;
    let prevented = false;
    f.fire("beforeinstallprompt", { preventDefault: () => (prevented = true), prompt: () => (prompted++, Promise.resolve()) });
    expect(prevented).toBe(true);
    expect(b.hidden).toBe(false);
    ib.setScreenVisible(false);
    expect(b.hidden).toBe(true);
    ib.setScreenVisible(true);
    b.click();
    expect(prompted).toBe(1);
    expect(b.hidden).toBe(true); // the event is single-use
    b.click();
    expect(prompted).toBe(1);
  });
  it("stays hidden when already installed (standalone) and hides after appinstalled", () => {
    const f = fakeWin({ standalone: true });
    const b = btn();
    installInstallButton(f.win, b as never).setScreenVisible(true);
    f.fire("beforeinstallprompt", { preventDefault: () => undefined, prompt: () => Promise.resolve() });
    expect(b.hidden).toBe(true);
    const g = fakeWin({});
    const b2 = btn();
    installInstallButton(g.win, b2 as never).setScreenVisible(true);
    g.fire("beforeinstallprompt", { preventDefault: () => undefined, prompt: () => Promise.resolve() });
    expect(b2.hidden).toBe(false);
    g.fire("appinstalled");
    expect(b2.hidden).toBe(true);
  });
});
