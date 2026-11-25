import { enemyDefs } from "./sprites/enemies";
import { fontDefs } from "./sprites/font";
import { HERO_DEFS, ICON_DEFS } from "./sprites/heroes";
import { CLASS_SIZE, type SpriteDef, type SpriteName } from "./sprites/names";
import { PROJECTILE_DEFS } from "./sprites/projectiles";
import { bubbleDefs, itemDefs, tileDefs } from "./sprites/world";

export * from "./sprites/names";
export { THEME_BG } from "./sprites/world";

/** Every sprite template, keyed by name. Data lives in ./sprites/*; this file is the API. */
export const SPRITE_DEFS: Record<SpriteName, SpriteDef> = {
  ...HERO_DEFS,
  ...ICON_DEFS,
  ...PROJECTILE_DEFS,
  ...enemyDefs(),
  ...bubbleDefs(),
  ...itemDefs(),
  ...tileDefs(),
  ...fontDefs(),
};

/** Checked lookup (index access on the template-literal-keyed record may be undefined). */
function defOf(name: SpriteName): SpriteDef {
  const d = SPRITE_DEFS[name];
  if (!d) throw new Error(`unknown sprite ${name}`);
  return d;
}

/** Non-throwing lookup: true only if `name` is a known template with a frame `frame`. */
export function hasSprite(name: string, frame: number): boolean {
  if (!Object.prototype.hasOwnProperty.call(SPRITE_DEFS, name)) return false;
  const def = SPRITE_DEFS[name as SpriteName];
  return def !== undefined && Number.isInteger(frame) && frame >= 0 && frame < def.frames.length;
}

export const ALL_SPRITE_NAMES = Object.keys(SPRITE_DEFS) as SpriteName[];

export function frameCount(name: SpriteName): number {
  return defOf(name).frames.length;
}

/** Pure check of every template; returns human-readable problems (empty when valid). */
export function validateTemplates(): string[] {
  const problems: string[] = [];
  for (const name of Object.keys(SPRITE_DEFS) as SpriteName[]) {
    const def = defOf(name);
    const size = CLASS_SIZE[def.cls];
    if (def.frames.length === 0) problems.push(`${name}: no frames`);
    def.frames.forEach((frame, fi) => {
      if (frame.length !== size) problems.push(`${name}#${fi}: ${frame.length} rows, expected ${size}`);
      frame.forEach((row, y) => {
        if (row.length !== size) problems.push(`${name}#${fi} row ${y}: width ${row.length}, expected ${size}`);
        for (const ch of row) {
          if (ch !== "." && def.palette[ch] === undefined) {
            problems.push(`${name}#${fi} row ${y}: char '${ch}' not in palette`);
            break;
          }
        }
      });
    });
  }
  return problems;
}

export interface SheetRect {
  sx: number;
  sy: number;
  w: number;
  h: number;
}

/** Offscreen drawing surface used for cached layers. */
export interface Layer {
  canvas: CanvasImageSource;
  ctx: CanvasRenderingContext2D;
}

export interface SpriteSheet {
  canvas: CanvasImageSource;
  /** Creates an offscreen layer: the injectable seam for the renderer's background cache. */
  createLayer(w: number, h: number): Layer;
  rectOf(name: SpriteName, frame: number): SheetRect;
}

const SHEET_W = 256;

/** Render every template onto one offscreen canvas and remember each frame's source rect. */
export function buildSheet(doc: Document): SpriteSheet {
  const rects = new Map<string, SheetRect>();
  const placements: { name: SpriteName; frame: number; rect: SheetRect }[] = [];
  let cx = 0;
  let cy = 0;
  let rowH = 0;
  // Big cells first, then small, each packed left to right.
  const names = [...ALL_SPRITE_NAMES].sort((a, b) => CLASS_SIZE[defOf(b).cls] - CLASS_SIZE[defOf(a).cls]);
  for (const name of names) {
    const size = CLASS_SIZE[defOf(name).cls];
    defOf(name).frames.forEach((_, frame) => {
      if (cx + size > SHEET_W || (rowH !== 0 && rowH !== size)) {
        cy += rowH;
        cx = 0;
      }
      const rect = { sx: cx, sy: cy, w: size, h: size };
      rowH = size;
      cx += size;
      rects.set(`${name}#${frame}`, rect);
      placements.push({ name, frame, rect });
    });
  }
  const height = cy + rowH;

  const canvas = doc.createElement("canvas");
  canvas.width = SHEET_W;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d canvas context unavailable");

  for (const { name, frame, rect } of placements) {
    const def = defOf(name);
    const grid = def.frames[frame]!;
    grid.forEach((row, y) => {
      let x = 0;
      while (x < row.length) {
        const ch = row[x]!;
        if (ch === ".") {
          x++;
          continue;
        }
        let end = x + 1;
        while (end < row.length && row[end] === ch) end++;
        ctx.fillStyle = def.palette[ch]!;
        ctx.fillRect(rect.sx + x, rect.sy + y, end - x, 1);
        x = end;
      }
    });
  }

  return {
    canvas,
    createLayer(w, h) {
      const layer = doc.createElement("canvas");
      layer.width = w;
      layer.height = h;
      const lctx = layer.getContext("2d");
      if (!lctx) throw new Error("2d canvas context unavailable");
      return { canvas: layer, ctx: lctx };
    },
    rectOf(name, frame) {
      const r = rects.get(`${name}#${frame}`);
      if (!r) throw new Error(`unknown sprite frame ${name}#${frame}`);
      return r;
    },
  };
}

export interface DrawOptions {
  flipX?: boolean;
  /** Rotation in radians about the sprite centre. */
  rotate?: number;
  /** Destination size (square) in game pixels; default is the native size. */
  size?: number;
  alpha?: number;
}

/** Shared option objects so option-less draws allocate nothing. */
const EMPTY: DrawOptions = Object.freeze({});
const FLIP: DrawOptions = Object.freeze({ flipX: true });

/** Blit one frame centred on (x, y). */
export function drawEx(
  ctx: CanvasRenderingContext2D,
  sheet: SpriteSheet,
  name: SpriteName,
  frame: number,
  x: number,
  y: number,
  o: DrawOptions = EMPTY,
): void {
  const r = sheet.rectOf(name, frame);
  const dw = o.size ?? r.w;
  const dh = o.size ?? r.h;
  if (!o.flipX && !o.rotate && o.alpha === undefined) {
    ctx.drawImage(sheet.canvas, r.sx, r.sy, r.w, r.h, Math.round(x - dw / 2), Math.round(y - dh / 2), dw, dh);
    return;
  }
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (o.rotate) ctx.rotate(o.rotate);
  if (o.flipX) ctx.scale(-1, 1);
  if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
  ctx.drawImage(sheet.canvas, r.sx, r.sy, r.w, r.h, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
}

export function draw(
  ctx: CanvasRenderingContext2D,
  sheet: SpriteSheet,
  name: SpriteName,
  frame: number,
  x: number,
  y: number,
  flipX = false,
): void {
  drawEx(ctx, sheet, name, frame, x, y, flipX ? FLIP : EMPTY);
}
