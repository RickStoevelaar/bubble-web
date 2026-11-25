import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TEST_LEVEL } from "@bubble/shared";
import { render } from "../src/render/renderer";
import { entityEvents, goldenState, makeHarness } from "./harness";

const GOLDEN = new URL("./golden-frame.json", import.meta.url);

describe("frame output is unchanged by the background cache", () => {
  it("entity and HUD draw calls match the recorded pre-cache frame (names, positions, order)", () => {
    const h = makeHarness();
    render(h.ctx, h.sheet, goldenState(), [TEST_LEVEL], 1, 0);
    const got = entityEvents(h.main);
    if (process.env["UPDATE_GOLDEN"] && !existsSync(GOLDEN)) writeFileSync(GOLDEN, JSON.stringify(got, null, 1));
    const want = JSON.parse(readFileSync(GOLDEN, "utf8")) as string[];
    expect(got.length).toBeGreaterThan(50);
    expect(got).toEqual(want);
  });
});
