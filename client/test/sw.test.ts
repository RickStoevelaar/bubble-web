import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(here, "..", "static", "sw.js"), "utf8");

type Listener = (e: unknown) => void;

/** Runs sw.js text in a vm context with a fake worker scope. */
function load(buildId = "abc123", cacheKeys: string[] = []) {
  const listeners: Record<string, Listener> = {};
  const deleted: string[] = [];
  const log: string[] = [];
  const self = {
    location: { origin: "https://bubble.example" },
    addEventListener: (t: string, l: Listener) => (listeners[t] = l),
    skipWaiting: () => (log.push("skipWaiting"), Promise.resolve()),
    clients: { claim: () => (log.push("claim"), Promise.resolve()) },
  };
  const caches = {
    keys: () => Promise.resolve(cacheKeys),
    delete: (k: string) => (deleted.push(k), Promise.resolve(true)),
    open: () => Promise.resolve({ put: () => Promise.resolve(), match: () => Promise.resolve(undefined) }),
  };
  const mod = { exports: {} as Record<string, unknown> };
  const ctx = vm.createContext({ self, caches, module: mod, fetch: () => Promise.resolve({ ok: true }), URL, Promise });
  vm.runInContext(SRC.replace('"__BUILD_ID__"', JSON.stringify(buildId)), ctx);
  const api = mod.exports as {
    cacheName: (id: string) => string;
    shouldHandle: (m: string, u: string, o: string) => boolean;
    SHELL: string[];
    BUILD_ID: string;
  };
  return { api, listeners, deleted, log };
}

describe("sw cache name", () => {
  it("is derived from the build id and differs per build", () => {
    const a = load("aaaa");
    const b = load("bbbb");
    expect(a.api.BUILD_ID).toBe("aaaa");
    expect(a.api.cacheName("aaaa")).toBe("bubble-web-aaaa");
    expect(a.api.cacheName("aaaa")).not.toBe(b.api.cacheName("bbbb"));
  });
  it("source keeps the placeholder that build.mjs replaces exactly once", () => {
    expect(SRC.split('"__BUILD_ID__"').length - 1).toBe(1);
  });
});

describe("sw request filter", () => {
  const { api } = load();
  const O = "https://bubble.example";
  it("handles same-origin GETs", () => {
    for (const p of ["/", "/index.html", "/main.js", "/?round=3", "/icon-192.png", "/manifest.webmanifest"]) {
      expect(api.shouldHandle("GET", O + p, O), p).toBe(true);
    }
  });
  it("never handles /ws, /scores, /healthz (any query or sub-path)", () => {
    for (const p of ["/ws", "/ws?x=1", "/scores", "/scores?limit=3", "/healthz", "/ws/room"]) {
      expect(api.shouldHandle("GET", O + p, O), p).toBe(false);
    }
  });
  it("does not mistake look-alike paths for the never-list", () => {
    expect(api.shouldHandle("GET", O + "/wsx.js", O)).toBe(true);
    expect(api.shouldHandle("GET", O + "/scores.png", O)).toBe(true);
  });
  it("never handles non-GET, cross-origin or malformed requests", () => {
    expect(api.shouldHandle("POST", O + "/", O)).toBe(false);
    expect(api.shouldHandle("HEAD", O + "/", O)).toBe(false);
    expect(api.shouldHandle("GET", "https://evil.example/", O)).toBe(false);
    expect(api.shouldHandle("GET", "wss://bubble.example/ws", O)).toBe(false);
    expect(api.shouldHandle("GET", "not a url", O)).toBe(false);
  });
});

describe("sw lifecycle wiring", () => {
  it("precaches the shell and skips waiting on install", async () => {
    const { listeners, log, api } = load();
    for (const f of ["/", "/index.html", "/main.js", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png"]) {
      expect(api.SHELL).toContain(f);
    }
    let p: Promise<unknown> = Promise.resolve();
    listeners.install!({ waitUntil: (x: Promise<unknown>) => (p = x) });
    await p;
    expect(log).toContain("skipWaiting");
  });
  it("deletes other caches and claims clients on activate", async () => {
    const { listeners, deleted, log } = load("new", ["bubble-web-old", "bubble-web-new", "other"]);
    let p: Promise<unknown> = Promise.resolve();
    listeners.activate!({ waitUntil: (x: Promise<unknown>) => (p = x) });
    await p;
    expect(deleted.sort()).toEqual(["bubble-web-old", "other"]);
    expect(log).toContain("claim");
  });
  it("only calls respondWith for requests it handles", () => {
    const { listeners } = load();
    const run = (method: string, url: string) => {
      let responded = false;
      listeners.fetch!({ request: { method, url, mode: "cors" }, respondWith: () => (responded = true) });
      return responded;
    };
    expect(run("GET", "https://bubble.example/main.js")).toBe(true);
    expect(run("GET", "https://bubble.example/scores")).toBe(false);
    expect(run("GET", "https://bubble.example/ws")).toBe(false);
    expect(run("POST", "https://bubble.example/main.js")).toBe(false);
    expect(run("GET", "https://cdn.example/x.js")).toBe(false);
  });
});
