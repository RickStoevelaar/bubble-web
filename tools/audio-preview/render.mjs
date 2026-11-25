// Renders every sound effect and music track to 16-bit mono 44.1 kHz WAV files with a pure-JS synthesizer.
// Usage: node tools/audio-preview/render.mjs [--out dir]     (default ./audio-preview, git-ignored)
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as esbuild from "esbuild";

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, "dist");
mkdirSync(dist, { recursive: true });
const outfile = join(dist, "cli.mjs");
await esbuild.build({
  entryPoints: [join(root, "cli.ts")],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  logLevel: "error",
});
const { main } = await import(pathToFileURL(outfile).href);
main(process.argv.slice(2));
