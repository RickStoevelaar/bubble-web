import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../src/index";
import type { RunningServer } from "../src/index";
import { PIN } from "./helpers";

let base: string;
let srv: RunningServer;

function get(path: string, method = "GET"): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: srv.port, path, method }, (res) => {
      let body = "";
      res.on("data", (d) => (body += d));
      res.on("end", () => resolve({ status: res.statusCode!, headers: res.headers, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), "bubble-pwa-"));
  const root = join(base, "dist");
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "index.html"), "<h1>hi</h1>");
  writeFileSync(join(root, "main.js"), "1");
  writeFileSync(join(root, "sw.js"), "self.x=1");
  writeFileSync(join(root, "manifest.webmanifest"), '{"scope":"/"}');
  writeFileSync(join(root, "icon.svg"), "<svg/>");
  writeFileSync(join(root, "icon-192.png"), "png");
  srv = await createServer({ pin: PIN, port: 0, dataDir: join(base, "data"), staticRoot: root });
});
afterAll(async () => {
  await srv.close();
  rmSync(base, { recursive: true, force: true });
});

describe("PWA static files", () => {
  it("serves sw.js at the site root (scope /), public, as javascript, never cached", async () => {
    const r = await get("/sw.js");
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toContain("text/javascript");
    expect(r.headers["cache-control"]).toBe("no-cache");
    // a worker at /sw.js may control "/" without a Service-Worker-Allowed header
    expect(r.headers["service-worker-allowed"]).toBeUndefined();
    expect(r.body).toBe("self.x=1");
  });

  it("serves the manifest with the manifest media type, no cache, no PIN", async () => {
    const r = await get("/manifest.webmanifest");
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toBe("application/manifest+json");
    expect(r.headers["cache-control"]).toBe("no-cache");
    expect(JSON.parse(r.body).scope).toBe("/");
  });

  it("serves icons with image types and leaves other files without a cache-control header", async () => {
    const svg = await get("/icon.svg");
    expect(svg.headers["content-type"]).toBe("image/svg+xml");
    expect(svg.headers["cache-control"]).toBeUndefined();
    expect((await get("/icon-192.png")).headers["content-type"]).toBe("image/png");
    expect((await get("/main.js")).headers["cache-control"]).toBeUndefined();
  });

  it("HEAD /sw.js also carries no-cache", async () => {
    const r = await get("/sw.js", "HEAD");
    expect(r.status).toBe(200);
    expect(r.headers["cache-control"]).toBe("no-cache");
  });

  it("a query string does not defeat the no-cache header", async () => {
    const r = await get("/sw.js?v=2");
    expect(r.headers["cache-control"]).toBe("no-cache");
  });

  it("does not shadow /scores or /healthz", async () => {
    expect((await get("/healthz")).body).toBe("ok");
    expect((await get("/scores")).headers["content-type"]).toContain("application/json");
  });
});
