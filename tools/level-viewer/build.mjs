// Bundles viewer.ts (plus shared and the client's sprite/tile drawing) to dist/viewer.js and copies index.html.
// If shared/src/levels/levels.json exists it is copied next to the page so the viewer can page through it.
// Usage: node tools/level-viewer/build.mjs [--watch] [--serve]   (serves on http://localhost:8081/)
import { copyFileSync, existsSync, mkdirSync, watch as fsWatch } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, "dist");
const levelsJson = join(root, "..", "..", "shared", "src", "levels", "levels.json");
const watch = process.argv.includes("--watch");
const serve = process.argv.includes("--serve");

mkdirSync(dist, { recursive: true });
const copyStatic = () => {
  copyFileSync(join(root, "index.html"), join(dist, "index.html"));
  if (existsSync(levelsJson)) copyFileSync(levelsJson, join(dist, "levels.json"));
};
copyStatic();

const ctx = await esbuild.context({
  entryPoints: [join(root, "viewer.ts")],
  outfile: join(dist, "viewer.js"),
  bundle: true,
  format: "iife",
  target: "es2022",
  sourcemap: true,
  logLevel: "info",
});
if (watch || serve) {
  if (watch) {
    await ctx.watch();
    for (const f of [join(root, "index.html"), levelsJson]) {
      if (!existsSync(f)) continue;
      fsWatch(f, () => {
        try {
          copyStatic();
          console.log("static files copied");
        } catch (err) {
          console.error("copy failed:", err);
        }
      });
    }
  }
  if (serve) {
    const { host, port } = await ctx.serve({ servedir: dist, port: 8081 });
    console.log(`serving http://${host === "0.0.0.0" ? "localhost" : host}:${port}/`);
  }
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
