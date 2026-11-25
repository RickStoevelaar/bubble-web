import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateJson } from "./generate";
import { ROUNDS } from "./rounds/index";

// Bundled to tools/gen-levels/dist/cli.js, so the repo root is three levels up from this file.
const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "..", "..", "..", "shared", "src", "levels", "levels.json");

if (process.argv.includes("--templates")) {
  // Used by sheet.mjs to label contact sheets: the template of every round, as a JSON array.
  console.log(JSON.stringify(ROUNDS.map((r) => r.template)));
} else {
  writeFileSync(out, generateJson(), "utf8");
  console.log(`gen-levels: wrote ${ROUNDS.length} levels to ${out}`);
}
