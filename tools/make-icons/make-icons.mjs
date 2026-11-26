// Generates the PWA icons into client/static/ from the in-game Pip sprite (original art, no external assets).
// Usage: node tools/make-icons/make-icons.mjs        (outputs are committed; rerun only when the art changes)
// Outputs: icon.svg, icon-180.png, icon-192.png, icon-512.png, icon-maskable-512.png
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { deflateSync } from "node:zlib";
import * as esbuild from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "..", "client", "static");
mkdirSync(out, { recursive: true });

// Load Pip's real sprite data (TypeScript) through a throwaway bundle.
const tmp = join(here, "dist");
mkdirSync(tmp, { recursive: true });
const bundle = join(tmp, "heroes.mjs");
await esbuild.build({
  entryPoints: [join(here, "..", "..", "client", "src", "render", "sprites", "heroes.ts")],
  outfile: bundle,
  bundle: true,
  platform: "node",
  format: "esm",
  logLevel: "error",
});
const { HERO_DEFS } = await import(pathToFileURL(bundle).href);
const PIP = HERO_DEFS.hero_pip.frames[0]; // WALK_0, 16 x 16 template rows
const PALETTE = HERO_DEFS.hero_pip.palette;
const N = PIP.length;

const BG = [12, 16, 48]; // #0c1030, the title screen's navy
const hex = (c) => "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
const rgb = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));

/** Layout in fractions of the canvas. The maskable variant keeps everything inside the central circle (r = 0.4). */
function layoutFor(size, maskable) {
  const cell = Math.max(1, Math.floor((size * (maskable ? 0.5 : 0.6)) / N));
  const span = cell * N;
  const ox = Math.round((size - span) / 2);
  const oy = Math.round((size - span) / 2 + size * (maskable ? 0.03 : 0.05));
  const bubbles = maskable
    ? [
        { x: 0.66, y: 0.27, r: 0.095 },
        { x: 0.34, y: 0.27, r: 0.04 },
      ]
    : [
        { x: 0.77, y: 0.2, r: 0.125 },
        { x: 0.25, y: 0.24, r: 0.055 },
      ];
  return { cell, ox, oy, bubbles: bubbles.map((b) => ({ x: b.x * size, y: b.y * size, r: b.r * size })) };
}

function pipAt(l, x, y) {
  const cx = Math.floor((x - l.ox) / l.cell);
  const cy = Math.floor((y - l.oy) / l.cell);
  if (cx < 0 || cy < 0 || cx >= N || cy >= N) return null;
  const ch = PIP[cy][cx];
  return ch === "." ? null : rgb(PALETTE[ch]);
}

const mix = (a, b, t) => a.map((v, i) => v * (1 - t) + b[i] * t);
const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** One bubble over `col`: translucent fill, brighter rim, a soft highlight at the upper left. Anti-aliased by distance. */
function bubbleOver(col, b, px, py) {
  const dx = px - b.x;
  const dy = py - b.y;
  const d = Math.hypot(dx, dy);
  const aa = 0.75;
  const inside = clamp01((b.r - d) / aa + 0.5);
  if (inside <= 0) return col;
  const rim = clamp01(1 - Math.abs(d - (b.r - b.r * 0.06)) / (b.r * 0.07 + aa));
  let out = mix(col, [150, 215, 255], 0.2 * inside);
  out = mix(out, [200, 240, 255], 0.75 * rim * inside);
  const hd = Math.hypot(px - (b.x - b.r * 0.38), py - (b.y - b.r * 0.4));
  const hl = clamp01(1 - hd / (b.r * 0.28));
  out = mix(out, [255, 255, 255], 0.8 * hl * hl * inside);
  return out;
}

function render(size, maskable) {
  const l = layoutFor(size, maskable);
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // soft vignette-free vertical gradient: slightly lighter towards the top
      let col = mix(BG, [26, 34, 92], clamp01(1 - y / size) * 0.55);
      const p = pipAt(l, x + 0.5, y + 0.5);
      if (p) col = p;
      for (const b of l.bubbles) col = bubbleOver(col, b, x + 0.5, y + 0.5);
      const i = (y * size + x) * 4;
      buf[i] = Math.round(col[0]);
      buf[i + 1] = Math.round(col[1]);
      buf[i + 2] = Math.round(col[2]);
      buf[i + 3] = 255;
    }
  }
  return buf;
}

// --- minimal PNG writer (8-bit RGBA, zlib) ---
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b) => {
  let c = 0xffffffff;
  for (const v of b) c = CRC[(c ^ v) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- SVG (same layout at 512) ---
function svg() {
  const size = 512;
  const l = layoutFor(size, false);
  const rects = [];
  for (let y = 0; y < N; y++) {
    let x = 0;
    while (x < N) {
      const ch = PIP[y][x];
      if (ch === ".") {
        x++;
        continue;
      }
      let e = x;
      while (e < N && PIP[y][e] === ch) e++;
      rects.push(`<rect x="${l.ox + x * l.cell}" y="${l.oy + y * l.cell}" width="${(e - x) * l.cell}" height="${l.cell}" fill="${PALETTE[ch]}"/>`);
      x = e;
    }
  }
  const bub = l.bubbles
    .map(
      (b) =>
        `<circle cx="${b.x}" cy="${b.y}" r="${b.r}" fill="#96d7ff" fill-opacity="0.2" stroke="#c8f0ff" stroke-opacity="0.75" stroke-width="${(b.r * 0.07).toFixed(1)}"/>` +
        `<circle cx="${(b.x - b.r * 0.38).toFixed(1)}" cy="${(b.y - b.r * 0.4).toFixed(1)}" r="${(b.r * 0.2).toFixed(1)}" fill="#fff" fill-opacity="0.7"/>`,
    )
    .join("\n  ");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" shape-rendering="crispEdges">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a225c"/><stop offset="1" stop-color="${hex(BG)}"/></linearGradient></defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  ${rects.join("\n  ")}
  <g shape-rendering="geometricPrecision">
  ${bub}
  </g>
</svg>
`;
}

writeFileSync(join(out, "icon.svg"), svg());
for (const [name, size, maskable] of [
  ["icon-180.png", 180, false],
  ["icon-192.png", 192, false],
  ["icon-512.png", 512, false],
  ["icon-maskable-512.png", 512, true],
]) {
  writeFileSync(join(out, name), png(size, render(size, maskable)));
  console.log("wrote", name);
}
console.log("wrote icon.svg");
