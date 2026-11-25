// Bundles cli.ts (with the shared package) to dist/cli.js for Node.
// Usage: node tools/check-levels/build.mjs
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const root = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(root, "dist"), { recursive: true });
await esbuild.build({
  entryPoints: [join(root, "cli.ts")],
  outfile: join(root, "dist", "cli.js"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  logLevel: "info",
});
