// Bundles src/main.ts to dist/main.js and copies index.html.
// Usage: node client/build.mjs [--watch] [--serve]
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, "dist");
const watch = process.argv.includes("--watch");
const serve = process.argv.includes("--serve");

mkdirSync(dist, { recursive: true });
copyFileSync(join(root, "index.html"), join(dist, "index.html"));

const options = {
  entryPoints: [join(root, "src", "main.ts")],
  outfile: join(dist, "main.js"),
  bundle: true,
  format: "iife",
  target: "es2022",
  sourcemap: true,
  logLevel: "info",
};

const ctx = await esbuild.context(options);
if (watch || serve) {
  if (watch) await ctx.watch();
  if (serve) {
    const { host, port } = await ctx.serve({ servedir: dist, port: 8080 });
    console.log(`serving http://${host === "0.0.0.0" ? "localhost" : host}:${port}/`);
  }
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
