import { describe, expect, it } from "vitest";
import { SPRITE_DEFS, buildSheet, frameCount, validateTemplates, type SpriteName } from "../src/render/sprites";

const NEW = ["npc_friend", "icon_star", "icon_heart"] as const satisfies readonly SpriteName[];

function recordingDoc() {
  const fills: unknown[][] = [];
  const ctx = { fillStyle: "" as string, fillRect: (...a: unknown[]) => fills.push([ctx.fillStyle, ...a]), clearRect: () => {} };
  const canvas = { width: 0, height: 0, getContext: () => ctx };
  return { doc: { createElement: () => canvas } as unknown as Document, fills, canvas };
}

describe("ending scene sprites", () => {
  it("are registered and the whole template set still validates", () => {
    expect(validateTemplates()).toEqual([]);
    for (const n of NEW) expect(SPRITE_DEFS[n], n).toBeDefined();
  });
  it.each(NEW)("%s: right size, not blank, palette-complete, frames differ when animated", (n) => {
    const def = SPRITE_DEFS[n];
    const size = def.cls === "char" ? 16 : 8;
    expect(def.cls).toBe(n === "npc_friend" ? "char" : "icon");
    for (const f of def.frames) {
      expect(f).toHaveLength(size);
      expect(f.every((r) => r.length === size)).toBe(true);
      const lit = f.join("").replace(/\./g, "").length;
      expect(lit).toBeGreaterThan(8);
      for (const ch of f.join("")) if (ch !== ".") expect(def.palette[ch], ch).toBeDefined();
    }
    if (n !== "icon_heart") {
      expect(frameCount(n)).toBe(2);
      expect(def.frames[0]!.join("|")).not.toBe(def.frames[1]!.join("|"));
    }
  });
  it("draw the same pixels every build", () => {
    const a = recordingDoc();
    const b = recordingDoc();
    buildSheet(a.doc);
    buildSheet(b.doc);
    expect(a.fills).toEqual(b.fills);
    expect(a.fills.length).toBeGreaterThan(100);
  });
  it("the friend is not a recoloured hero (own silhouette)", () => {
    expect(SPRITE_DEFS.npc_friend.frames[0]!.join("")).not.toBe(SPRITE_DEFS.hero_pip.frames[0]!.join(""));
  });
});
