import { describe, expect, it } from "vitest";
import {
  ALL_SPRITE_NAMES,
  FONT_CHARS,
  SPRITE_DEFS,
  buildSheet,
  draw,
  frameCount,
  validateTemplates,
  type SpriteName,
} from "../src/render/sprites";

function fakeDoc() {
  const fills: unknown[][] = [];
  const ctx = {
    fillStyle: "" as string,
    fillRect: (...a: unknown[]) => fills.push(a),
    clearRect: () => {},
  };
  const canvas = { width: 0, height: 0, getContext: () => ctx };
  return { doc: { createElement: () => canvas } as unknown as Document, canvas, fills };
}

describe("templates", () => {
  it("validateTemplates reports no problems", () => {
    expect(validateTemplates()).toEqual([]);
  });

  it("every sprite is rectangular with palette-only chars and the right size", () => {
    for (const [name, def] of Object.entries(SPRITE_DEFS)) {
      const size = def.cls === "char" ? 16 : 8;
      expect(def.frames.length, name).toBeGreaterThan(0);
      for (const f of def.frames) {
        expect(f.length, name).toBe(size);
        for (const row of f) {
          expect(row.length, name).toBe(size);
          for (const ch of row) if (ch !== ".") expect(def.palette[ch], `${name} '${ch}'`).toBeDefined();
        }
      }
    }
  });

  it("flags a broken template", () => {
    const def = SPRITE_DEFS["hero_pip"]!;
    const saved = def.frames[0]!;
    def.frames[0] = [...saved.slice(1), "ZZ"];
    const problems = validateTemplates();
    def.frames[0] = saved;
    expect(problems.length).toBeGreaterThan(0);
    expect(validateTemplates()).toEqual([]);
  });

  it("font covers A-Z, 0-9 and symbols", () => {
    const need = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:-x.!";
    for (const ch of need) expect(FONT_CHARS as readonly string[], ch).toContain(ch);
    for (const ch of FONT_CHARS) expect(SPRITE_DEFS[`font_${ch}` as SpriteName]!, ch).toBeDefined();
  });

  it("has ten distinct tile themes", () => {
    for (let i = 0; i < 10; i++) {
      const def = SPRITE_DEFS[`tile_${i}` as SpriteName]!;
      expect(def).toBeDefined();
      for (let j = 0; j < i; j++) {
        const other = SPRITE_DEFS[`tile_${j}` as SpriteName]!;
        expect(def.frames, `${i} vs ${j}`).not.toEqual(other.frames);
        expect(def.palette, `${i} vs ${j}`).not.toEqual(other.palette);
      }
    }
  });

  it("Pip and Pop share the silhouette but differ in palette", () => {
    const pip = SPRITE_DEFS["hero_pip"]!;
    const pop = SPRITE_DEFS["hero_pop"]!;
    expect(pip.frames.length).toBe(pop.frames.length);
    const mask = (g: string[]) => g.map((r) => r.replace(/[^.]/g, "#"));
    pip.frames.forEach((f, i) => expect(mask(f)).toEqual(mask(pop.frames[i]!)));
    expect(pip.palette["B"]).not.toBe(pop.palette["B"]);
    expect(pip.palette["C"]).not.toBe(pop.palette["C"]);
    expect(pip.frames).not.toEqual(pop.frames); // belly pattern differs
  });

  it("each enemy has a normal and an angry variant with different colours", () => {
    for (const t of ["walker", "chaser", "thrower", "breather", "bouncer", "flyer", "boss", "hurry"]) {
      const n = SPRITE_DEFS[`enemy_${t}` as SpriteName]!;
      const a = SPRITE_DEFS[`enemy_${t}_angry` as SpriteName]!;
      expect(n.frames.length).toBe(2);
      expect(a.frames).toEqual(n.frames);
      expect(a.palette).not.toEqual(n.palette);
    }
  });

  it("the seven enemy silhouettes are all different", () => {
    const types = ["walker", "chaser", "thrower", "breather", "bouncer", "flyer", "boss"];
    const masks = types.map((t) =>
      SPRITE_DEFS[`enemy_${t}` as SpriteName]!.frames[0]!.map((r) => r.replace(/[^.]/g, "#")).join("|"),
    );
    expect(new Set(masks).size).toBe(types.length);
  });
});

describe("buildSheet", () => {
  it("gives every sprite frame a non-empty, in-bounds, non-overlapping rect", () => {
    const { doc, canvas, fills } = fakeDoc();
    const sheet = buildSheet(doc);
    expect(canvas.width).toBeGreaterThan(0);
    expect(canvas.height).toBeGreaterThan(0);
    expect(fills.length).toBeGreaterThan(1000);
    const taken = new Set<string>();
    for (const name of ALL_SPRITE_NAMES) {
      expect(frameCount(name)).toBeGreaterThan(0);
      for (let f = 0; f < frameCount(name); f++) {
        const r = sheet.rectOf(name, f);
        expect(r.w, `${name}#${f}`).toBeGreaterThan(0);
        expect(r.h).toBeGreaterThan(0);
        expect(r.sx).toBeGreaterThanOrEqual(0);
        expect(r.sy).toBeGreaterThanOrEqual(0);
        expect(r.sx + r.w).toBeLessThanOrEqual(canvas.width);
        expect(r.sy + r.h).toBeLessThanOrEqual(canvas.height);
        const key = `${r.sx},${r.sy}`;
        expect(taken.has(key), key).toBe(false);
        taken.add(key);
      }
    }
  });

  it("draw blits one frame, mirrored via transform when flipped", () => {
    const { doc } = fakeDoc();
    const sheet = buildSheet(doc);
    const calls: string[] = [];
    const ctx = {
      drawImage: (...a: unknown[]) => calls.push(`draw:${a.length}`),
      save: () => calls.push("save"),
      restore: () => calls.push("restore"),
      translate: () => calls.push("translate"),
      scale: () => calls.push("scale"),
      rotate: () => calls.push("rotate"),
      globalAlpha: 1,
    } as unknown as CanvasRenderingContext2D;
    draw(ctx, sheet, "hero_pip", 0, 50, 50);
    expect(calls).toEqual(["draw:9"]);
    calls.length = 0;
    draw(ctx, sheet, "hero_pip", 0, 50, 50, true);
    expect(calls).toContain("scale");
    expect(calls.filter((c) => c.startsWith("draw")).length).toBe(1);
  });
});
