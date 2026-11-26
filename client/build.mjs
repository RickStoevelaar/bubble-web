// Bundles src/main.ts to dist/main.js, copies index.html and static/ (manifest, icons, sw.js) next to it.
// sw.js gets its BUILD_ID placeholder replaced by a hash of the built files, so each deploy gets a fresh cache name.
// Usage: node client/build.mjs [--watch] [--serve]
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readdirSync, readFileSync, watch as fsWatch, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, "dist");
const staticDir = join(root, "static");
const watch = process.argv.includes("--watch");
const serve = process.argv.includes("--serve");

mkdirSync(dist, { recursive: true });

/**
 * Copies index.html and static/* to dist (sw.js excepted) and writes dist/sw.js stamped with a hash of everything
 * that ships. Returns the build id. Runs after every bundle because the id depends on the fresh main.js.
 */
function copyStatic() {
  copyFileSync(join(root, "index.html"), join(dist, "index.html"));
  const names = [...readdirSync(staticDir)].filter((n) => n !== "sw.js").sort();
  for (const name of names) copyFileSync(join(staticDir, name), join(dist, name));
  const hash = createHash("sha256");
  for (const name of ["main.js", "index.html", ...names]) hash.update(name).update(readFileSync(join(dist, name)));
  const buildId = hash.digest("hex").slice(0, 12);
  const sw = readFileSync(join(staticDir, "sw.js"), "utf8");
  const placeholder = '"__BUILD_ID__"';
  if (!sw.includes(placeholder)) throw new Error("static/sw.js lost its BUILD_ID placeholder");
  writeFileSync(join(dist, "sw.js"), sw.replace(placeholder, JSON.stringify(buildId)));
  return buildId;
}

const options = {
  entryPoints: [join(root, "src", "main.ts")],
  outfile: join(dist, "main.js"),
  bundle: true,
  format: "iife",
  target: "es2022",
  sourcemap: true,
  // Minified for the production build only (the 100 rounds are ~370 KB of JSON); --watch/--serve stay readable.
  minify: !watch && !serve,
  logLevel: "info",
  plugins: [
    {
      name: "static-and-sw",
      setup(build) {
        build.onEnd((r) => {
          if (r.errors.length === 0) console.log("static copied, sw.js build id", copyStatic());
        });
      },
    },
  ],
};

const ctx = await esbuild.context(options);
if (watch || serve) {
  if (watch) {
    await ctx.watch();
    // esbuild only watches the bundle: re-copy index.html and static/ when they change.
    const recopy = (what) => () => {
      try {
        console.log(what, "changed, sw.js build id", copyStatic());
      } catch (err) {
        console.error(what, "copy failed:", err);
      }
    };
    fsWatch(join(root, "index.html"), recopy("index.html"));
    fsWatch(staticDir, recopy("static"));
  }
  if (serve) {
    const { host, port } = await ctx.serve({ servedir: dist, port: 8080 });
    console.log(`serving http://${host === "0.0.0.0" ? "localhost" : host}:${port}/`);
  }
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
