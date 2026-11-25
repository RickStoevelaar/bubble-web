// Bundles src/index.ts (and ws) to dist/index.js for a plain `node dist/index.js` run.
// Usage: node server/build.mjs
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const root = dirname(fileURLToPath(import.meta.url));

await esbuild.build({
  entryPoints: [join(root, "src", "index.ts")],
  outfile: join(root, "dist", "index.js"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  // ws (CommonJS) calls require() on node builtins; give the ESM bundle a real require.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  sourcemap: true,
  logLevel: "info",
});
