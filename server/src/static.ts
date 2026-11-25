import { createReadStream, realpathSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, resolve, sep } from "node:path";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".wasm": "application/wasm",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

/**
 * Maps a request URL path to an absolute file path inside `root`, or null when
 * the path is malformed or tries to leave it (dot segments, backslashes,
 * encoded traversal, NUL bytes, hidden files).
 */
export function resolveStaticPath(root: string, rawUrl: string): string | null {
  const q = rawUrl.search(/[?#]/);
  const rawPath = q < 0 ? rawUrl : rawUrl.slice(0, q);
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    return null;
  }
  if (!decoded.startsWith("/") || decoded.includes("\0") || decoded.includes("\\")) return null;
  const parts = decoded.split("/").slice(1);
  // "//x" would make an empty first segment; only a trailing slash may leave one.
  if (parts.some((p, i) => p.startsWith(".") || (p === "" && i !== parts.length - 1))) return null;
  const rootAbs = resolve(root);
  const full = resolve(join(rootAbs, ...parts));
  if (full !== rootAbs && !full.startsWith(rootAbs + sep)) return null;
  return full;
}

function respond(res: ServerResponse, status: number, body: string, type = "text/plain; charset=utf-8"): void {
  res.writeHead(status, { "content-type": type, "x-content-type-options": "nosniff" });
  res.end(body);
}

/** Serves `req` from `root`. Never throws; a missing root simply yields 404. */
export function serveStatic(root: string, req: IncomingMessage, res: ServerResponse): void {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("allow", "GET, HEAD");
    return respond(res, 405, "method not allowed");
  }
  const target = resolveStaticPath(root, req.url ?? "/");
  if (!target) return respond(res, 400, "bad request");
  try {
    let file = target;
    if (statSync(file).isDirectory()) file = join(file, "index.html");
    const real = realpathSync(file);
    const realRoot = realpathSync(root);
    if (real !== realRoot && !real.startsWith(realRoot + sep)) return respond(res, 404, "not found");
    const st = statSync(real);
    if (!st.isFile()) return respond(res, 404, "not found");
    res.writeHead(200, {
      "content-type": TYPES[extname(real).toLowerCase()] ?? "application/octet-stream",
      "content-length": st.size,
      "x-content-type-options": "nosniff",
    });
    if (req.method === "HEAD") return void res.end();
    const stream = createReadStream(real);
    stream.on("error", () => res.destroy());
    stream.pipe(res);
  } catch {
    respond(res, 404, "not found");
  }
}
