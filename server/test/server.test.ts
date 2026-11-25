import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ServerMsg } from "@bubble/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { createServer, loadConfig } from "../src/index";
import type { RunningServer } from "../src/index";
import { PIN } from "./helpers";

let base: string;
let root: string;
let srv: RunningServer;

function raw(path: string, method = "GET"): Promise<{ status: number; body: string; type?: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: srv.port, path, method }, (res) => {
      let body = "";
      res.on("data", (d) => (body += d));
      res.on("end", () => resolve({ status: res.statusCode!, body, type: res.headers["content-type"] }));
    });
    req.on("error", reject);
    req.end();
  });
}

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), "bubble-srv-"));
  root = join(base, "dist");
  mkdirSync(join(root, "assets"), { recursive: true });
  writeFileSync(join(root, "index.html"), "<h1>hi</h1>");
  writeFileSync(join(root, "assets", "a.js"), "console.log(1)");
  writeFileSync(join(root, ".hidden"), "dot");
  writeFileSync(join(base, "secret.txt"), "TOPSECRET");
  srv = await createServer({ pin: PIN, port: 0, dataDir: join(base, "data"), staticRoot: root });
});
afterAll(async () => {
  await srv.close();
  rmSync(base, { recursive: true, force: true });
});

describe("config", () => {
  it("refuses to start without a PIN", async () => {
    expect(() => loadConfig({})).toThrow(/PIN/);
    expect(() => loadConfig({ PIN: "" })).toThrow(/PIN/);
    expect(loadConfig({ PIN: "1", PORT: "9000" })).toMatchObject({ pin: "1", port: 9000 });
    expect(loadConfig({ PIN: "1" }).port).toBe(8080);
    await expect(createServer({ pin: "", port: 0 })).rejects.toThrow(/PIN/);
  });
});

describe("http", () => {
  it("serves /healthz, index.html at / and assets with content types", async () => {
    expect(await raw("/healthz")).toMatchObject({ status: 200, body: "ok" });
    const idx = await raw("/");
    expect(idx.status).toBe(200);
    expect(idx.body).toBe("<h1>hi</h1>");
    expect(idx.type).toContain("text/html");
    const js = await raw("/assets/a.js?v=1");
    expect(js.status).toBe(200);
    expect(js.type).toContain("javascript");
    expect((await raw("/missing.png")).status).toBe(404);
  });

  it.each([
    "/../secret.txt",
    "/%2e%2e/secret.txt",
    "/%2E%2E%2fsecret.txt",
    "/assets/../../secret.txt",
    "/assets/%2e%2e/%2e%2e/secret.txt",
    "/..%5csecret.txt",
    "/%00",
    "/index.html%00.png",
    "//etc/passwd",
    "/.hidden",
    "/%zz",
  ])("rejects traversal-ish path %s", async (p) => {
    const r = await raw(p);
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
    expect(r.body).not.toContain("TOPSECRET");
    expect(r.body).not.toContain("dot");
  });

  it("rejects non-GET methods", async () => {
    expect((await raw("/", "POST")).status).toBe(405);
  });

  it("404s gracefully when the static root does not exist", async () => {
    const s2 = await createServer({ pin: PIN, port: 0, dataDir: join(base, "d2"), staticRoot: join(base, "nope") });
    try {
      const r = await new Promise<number>((resolve) => {
        http.get({ host: "127.0.0.1", port: s2.port, path: "/" }, (res) => {
          res.resume();
          resolve(res.statusCode!);
        });
      });
      expect(r).toBe(404);
    } finally {
      await s2.close();
    }
  });
});

describe("websocket integration", () => {
  const open = (path = "/ws") =>
    new Promise<{ ws: WebSocket; msgs: ServerMsg[] }>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${srv.port}${path}`);
      const msgs: ServerMsg[] = [];
      ws.on("message", (d) => msgs.push(JSON.parse(d.toString()) as ServerMsg));
      ws.on("open", () => resolve({ ws, msgs }));
      ws.on("error", reject);
    });
  const until = async (fn: () => boolean, ms = 3000) => {
    const end = Date.now() + ms;
    while (!fn()) {
      if (Date.now() > end) throw new Error("timeout");
      await new Promise((r) => setTimeout(r, 10));
    }
  };

  it("joins through the real server and receives joined then snap", async () => {
    const { ws, msgs } = await open();
    ws.send(JSON.stringify({ t: "join", room: "itest", pin: PIN, name: "Zed" }));
    await until(() => msgs.some((m) => m.t === "snap"));
    expect(msgs[0]).toMatchObject({ t: "joined", playerId: 0 });
    expect(msgs.find((m) => m.t === "snap")).toMatchObject({ t: "snap", ackSeq: 0 });
    ws.send(JSON.stringify({ t: "input", seq: 1, buttons: 2 }));
    ws.close();
    await until(() => ws.readyState === WebSocket.CLOSED);
  });

  it("rejects a wrong PIN with badpin", async () => {
    const { ws, msgs } = await open();
    ws.send(JSON.stringify({ t: "join", room: "itest2", pin: "wrong", name: "Zed" }));
    await until(() => msgs.length > 0);
    expect(msgs[0]).toEqual({ t: "err", code: "badpin" });
    await until(() => ws.readyState === WebSocket.CLOSED);
  });

  it("refuses upgrades on other paths", async () => {
    await expect(open("/other")).rejects.toBeDefined();
  });
});
