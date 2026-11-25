import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../src/index";
import type { RunningServer } from "../src/index";
import { PIN } from "./helpers";

interface Res {
  status: number;
  body: string;
  headers: http.IncomingHttpHeaders;
}
let srv: RunningServer;
let base: string;
let dir: string;
const file = () => join(dir, "highscores.json");

function req(path: string, method = "GET"): Promise<Res> {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: "127.0.0.1", port: srv.port, path, method }, (res) => {
      let body = "";
      res.on("data", (d) => (body += d));
      res.on("end", () => resolve({ status: res.statusCode!, body, headers: res.headers }));
    });
    r.on("error", reject);
    r.end();
  });
}
const entry = (score: number, extra: object = {}) => ({ names: ["A", "B"], score, round: 3, date: "2026-01-01T00:00:00.000Z", ...extra });

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), "bubble-scores-"));
  dir = join(base, "data");
  mkdirSync(dir, { recursive: true });
  const root = join(base, "dist");
  mkdirSync(root);
  writeFileSync(join(root, "index.html"), "x");
  srv = await createServer({ pin: PIN, port: 0, dataDir: dir, staticRoot: root });
});
afterAll(async () => {
  await srv.close();
  rmSync(base, { recursive: true, force: true });
});

describe("GET /scores", () => {
  it("answers an empty table before any room exists and with the file missing", async () => {
    const r = await req("/scores");
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body)).toEqual({ scores: [] });
    expect(r.headers["content-type"]).toBe("application/json; charset=utf-8");
    expect(r.headers["cache-control"]).toBe("no-store");
  });

  it("tolerates a malformed file and a non-array file", async () => {
    writeFileSync(file(), "{not json");
    expect(JSON.parse((await req("/scores")).body)).toEqual({ scores: [] });
    writeFileSync(file(), JSON.stringify({ scores: 5 }));
    const r = await req("/scores");
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body)).toEqual({ scores: [] });
  });

  it("returns a populated table ordered by score descending, dropping bad entries", async () => {
    writeFileSync(file(), JSON.stringify([entry(100), entry(900), { names: "x", score: 1, round: 1, date: "d" }, entry(500)]));
    const body = JSON.parse((await req("/scores")).body) as { scores: { score: number }[] };
    expect(body.scores.map((s) => s.score)).toEqual([900, 500, 100]);
  });

  it("caps at 20", async () => {
    writeFileSync(file(), JSON.stringify(Array.from({ length: 35 }, (_, i) => entry(1000 + i))));
    const body = JSON.parse((await req("/scores")).body) as { scores: { score: number }[] };
    expect(body.scores).toHaveLength(20);
    expect(body.scores[0]!.score).toBe(1034);
  });

  it("exposes only names, score, round and date (unknown fields are stripped)", async () => {
    writeFileSync(file(), JSON.stringify([entry(7, { token: "SECRET", pin: "1234", ip: "1.2.3.4", extra: { a: 1 } })]));
    const r = await req("/scores");
    expect(r.body).not.toMatch(/SECRET|1234|1\.2\.3\.4/);
    expect(Object.keys((JSON.parse(r.body) as { scores: object[] }).scores[0]!).sort()).toEqual(["date", "names", "round", "score"]);
  });

  it("supports HEAD (no body), ignores a query string, and refuses other methods with 405", async () => {
    writeFileSync(file(), JSON.stringify([entry(7)]));
    const h = await req("/scores", "HEAD");
    expect(h.status).toBe(200);
    expect(h.body).toBe("");
    expect(h.headers["content-type"]).toBe("application/json; charset=utf-8");
    const q = await req("/scores?limit=1&x=%zz");
    expect(q.status).toBe(200);
    for (const m of ["POST", "PUT", "DELETE", "PATCH"]) {
      const r = await req("/scores", m);
      expect(r.status).toBe(405);
      expect(r.headers.allow).toBe("GET, HEAD");
    }
  });

  it("does not serve /scores/ sub-paths as the endpoint", async () => {
    expect((await req("/scores/x")).status).toBe(404);
  });
});
