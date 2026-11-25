import { describe, expect, it } from "vitest";
import { TEST_LEVEL } from "@bubble/shared";
import { render } from "../src/render/renderer";
import { goldenState, makeHarness } from "./harness";

const tilesIn = (log: string[]) => log.filter((e) => e.includes(" tile_")).length;
const solid = (lv: { tiles: string[] }) => lv.tiles.join("").split("#").length - 1;
const blits = (log: string[]) => log.filter((e) => e.startsWith("draw layer")).length;

describe("background layer cache", () => {
  it("draws the walls into the cache once, then blits it once per frame with no per-tile draws", () => {
    const h = makeHarness();
    const s = goldenState();
    render(h.ctx, h.sheet, s, [TEST_LEVEL], 0);
    expect(h.state.layersCreated).toBe(1);
    expect(tilesIn(h.layer)).toBe(solid(TEST_LEVEL));
    expect(tilesIn(h.main)).toBe(0);
    expect(blits(h.main)).toBe(1);

    h.main.length = 0;
    h.layer.length = 0;
    render(h.ctx, h.sheet, s, [TEST_LEVEL], 0);
    expect(h.state.layersCreated).toBe(1);
    expect(h.layer.length).toBe(0);
    expect(tilesIn(h.main)).toBe(0);
    expect(blits(h.main)).toBe(1);
  });

  it("rebuilds the layer when the level or theme changes", () => {
    const h = makeHarness();
    const s = goldenState();
    render(h.ctx, h.sheet, s, [TEST_LEVEL], 0);
    // A different level object: the cached layer surface is reused but repainted.
    const other = { ...TEST_LEVEL, tiles: [...TEST_LEVEL.tiles] };
    h.layer.length = 0;
    render(h.ctx, h.sheet, s, [other], 0);
    expect(tilesIn(h.layer)).toBe(solid(other));
    const themed = { ...other, theme: 4 };
    h.layer.length = 0;
    render(h.ctx, h.sheet, s, [themed], 0);
    expect(h.layer.filter((e) => e.includes("tile_4#0")).length).toBe(solid(themed));
    // unchanged afterwards: no repaint
    h.layer.length = 0;
    render(h.ctx, h.sheet, s, [themed], 0);
    expect(h.layer.length).toBe(0);
    expect(h.state.layersCreated).toBe(1);
  });
});
