// Bubble Web service worker: makes the game installable and keeps the app shell loadable offline.
// Hand-written, no dependencies. client/build.mjs copies this file to dist/sw.js and replaces the BUILD_ID
// placeholder with a hash of the built files, so every deploy gets a new cache name and old caches are deleted.
//
// Strategy: NETWORK-FIRST for same-origin GETs (the owner always gets fresh code after a deploy), cache fallback
// only when the network fails. There is no offline play: the game needs the server, so offline you get the cached
// shell, which shows the normal connection error UI. /ws, /scores, /healthz, non-GET and cross-origin requests are
// never touched (the worker does not call respondWith, so the browser handles them as if no worker existed).
"use strict";

const BUILD_ID = "__BUILD_ID__";
const SHELL = [
  "/",
  "/index.html",
  "/main.js",
  "/manifest.webmanifest",
  "/icon.svg",
  "/icon-180.png",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
];
/** Paths (and their sub-paths) that must always go straight to the network. */
const NEVER_PATHS = ["/ws", "/scores", "/healthz"];

/** Cache name for a build id; changes with every build. */
function cacheName(buildId) {
  return "bubble-web-" + buildId;
}

/** True when the worker should answer this request (same-origin GET outside the never-list). Pure. */
function shouldHandle(method, url, origin) {
  if (method !== "GET") return false;
  let u;
  try {
    u = new URL(url);
  } catch (_) {
    return false;
  }
  if (u.origin !== origin) return false;
  for (const p of NEVER_PATHS) {
    if (u.pathname === p || u.pathname.startsWith(p + "/")) return false;
  }
  return true;
}

const CACHE = cacheName(BUILD_ID);

async function precache() {
  const cache = await caches.open(CACHE);
  // One missing file must not stop the worker from installing: add them individually.
  await Promise.all(
    SHELL.map((path) =>
      fetch(path, { cache: "reload" })
        .then((res) => (res.ok ? cache.put(path, res) : undefined))
        .catch(() => undefined),
    ),
  );
}

async function networkFirst(req) {
  try {
    // cache: "reload" skips the browser HTTP cache, so one file is never fresh while another is stale.
    const res = await fetch(req, { cache: "reload" });
    if (res.status === 200 && res.type === "basic") {
      const copy = res.clone();
      caches
        .open(CACHE)
        .then((c) => c.put(req, copy))
        .catch(() => undefined);
    }
    return res;
  } catch (err) {
    const cache = await caches.open(CACHE);
    const hit = (await cache.match(req)) || (req.mode === "navigate" ? await cache.match("/") : undefined);
    if (hit) return hit;
    throw err;
  }
}

if (typeof self !== "undefined" && typeof self.addEventListener === "function") {
  self.addEventListener("install", (e) => {
    e.waitUntil(precache().then(() => self.skipWaiting()));
  });
  self.addEventListener("activate", (e) => {
    e.waitUntil(
      caches
        .keys()
        .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
        .then(() => self.clients.claim()),
    );
  });
  self.addEventListener("fetch", (e) => {
    const req = e.request;
    if (!shouldHandle(req.method, req.url, self.location.origin)) return;
    e.respondWith(networkFirst(req));
  });
}

// Lets the unit tests load this file in a plain Node context; undefined (and skipped) inside a worker.
if (typeof module !== "undefined" && module.exports) module.exports = { cacheName, shouldHandle, SHELL, NEVER_PATHS, BUILD_ID };
