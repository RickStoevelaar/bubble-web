// Renders contact sheets of the generated levels with the client's tile renderer in headless Edge.
// Usage: node tools/gen-levels/sheet.mjs <from> <to> <cols> <scale> <out.png> [--overview]
// --overview: small thumbnails labelled with the round number and template (e.g. 1 100 10 0.6 overview.png --overview).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as esbuild from "esbuild";

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, "dist-sheet");
mkdirSync(dist, { recursive: true });
await esbuild.build({ entryPoints: [join(root, "sheet.ts")], outfile: join(dist, "sheet.js"), bundle: true, format: "iife", target: "es2022", logLevel: "error" });
const html = `<!doctype html><meta charset="utf-8"><body><script src="sheet.js"></script></body>`;
writeFileSync(join(dist, "index.html"), html);

const overview = process.argv.includes("--overview");
const [from = "1", to = "25", cols = "4", scale = "2", out = "sheet.png"] = process.argv.slice(2).filter((a) => a !== "--overview");
const levels = JSON.parse(readFileSync(join(root, "..", "..", "shared", "src", "levels", "levels.json"), "utf8"));
const templates = JSON.parse(process.env.SHEET_NAMES ?? "[]");
const rows = Math.ceil((Number(to) - Number(from) + 1) / Number(cols));
const pad = overview ? 4 : 10;
const head = overview ? 14 : 22;
const w = Number(cols) * (Math.round(256 * Number(scale)) + pad) + pad;
const h = rows * (Math.round(224 * Number(scale)) + head + pad) + pad + 10;
const url = `${pathToFileURL(join(dist, "index.html")).href}?from=${from}&to=${to}&cols=${cols}&s=${scale}&names=${encodeURIComponent(templates.join(","))}${overview ? "&overview=1" : ""}`;
const candidates = [process.env.EDGE, "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].filter(Boolean);
const edge = candidates.find((p) => existsSync(p));
if (!edge) throw new Error("msedge.exe not found; set EDGE");
execFileSync(edge, ["--headless", "--disable-gpu", "--hide-scrollbars", `--window-size=${w},${h}`, `--screenshot=${resolve(out)}`, "--virtual-time-budget=4000", url], { stdio: "inherit" });
console.log(`wrote ${resolve(out)} (${levels.length} levels in file, ${w}x${h})`);
