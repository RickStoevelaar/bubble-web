import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Sim, TEST_LEVEL } from "@bubble/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFilePersist, loadJson, saveJson } from "../src/persist";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "bubble-persist-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("persist", () => {
  it("round-trips and leaves no tmp file behind", () => {
    const f = join(dir, "a.json");
    saveJson(f, { x: [1, 2, 3] });
    saveJson(f, { x: [4] });
    expect(loadJson(f, null)).toEqual({ x: [4] });
    expect(readdirSync(dir)).toEqual(["a.json"]);
  });

  it("creates a missing directory", () => {
    const f = join(dir, "nested", "deeper", "a.json");
    saveJson(f, 1);
    expect(loadJson(f, 0)).toBe(1);
  });

  it("returns the fallback for missing or corrupt files, never throwing", () => {
    expect(loadJson(join(dir, "nope.json"), "fb")).toBe("fb");
    const f = join(dir, "bad.json");
    writeFileSync(f, "{not json");
    expect(loadJson(f, "fb")).toBe("fb");
  });

  it("file persist stores GameState per room code and rejects unsafe codes", () => {
    const p = createFilePersist(dir);
    const state = new Sim([TEST_LEVEL], 3, 1).state;
    p.save("ABC123", state);
    expect(readdirSync(dir)).toHaveLength(1);
    expect(JSON.parse(readFileSync(join(dir, readdirSync(dir)[0]!), "utf8"))).toEqual(state);
    expect(p.load("ABC123")).toEqual(state);
    expect(p.load("OTHER")).toBeUndefined();
    p.remove("ABC123");
    expect(readdirSync(dir)).toEqual([]);
    expect(() => p.save("../evil", state)).toThrow();
    expect(() => p.load("a/b")).toThrow();
  });
});
