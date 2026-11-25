import { createServer as createHttpServer } from "node:http";
import type { IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { TEST_LEVEL } from "@bubble/shared";
import type { LevelData } from "@bubble/shared";
import { WebSocketServer } from "ws";
import { createFilePersist, dataDir } from "./persist";
import { realTimers } from "./room";
import type { Timers } from "./room";
import { RoomManager } from "./rooms";
import { serveStatic } from "./static";
import { MAX_MSG_BYTES } from "./validate";
import { HEARTBEAT_INTERVAL_MS, startHeartbeat, wrapSocket } from "./wsadapter";

/** Single place that supplies the level set. Task 18 swaps this for the real level files. */
export function loadLevels(): LevelData[] {
  return [TEST_LEVEL];
}

export interface ServerConfig {
  pin: string;
  port?: number;
  dataDir?: string;
  staticRoot?: string;
  levels?: LevelData[];
  /** Behind a reverse proxy: take the client IP from the last X-Forwarded-For entry. */
  trustProxy?: boolean;
  /** Heartbeat timers/interval, injectable for tests. */
  timers?: Timers;
  heartbeatMs?: number;
}

export interface RunningServer {
  port: number;
  close(): Promise<void>;
}

const DEFAULT_STATIC_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../client/dist");

export function loadConfig(env: NodeJS.ProcessEnv): ServerConfig & { port: number } {
  if (!env.PIN) throw new Error("PIN environment variable is required (the shared room PIN) and must not be empty");
  const port = env.PORT ? Number(env.PORT) : 8080;
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`invalid PORT: ${env.PORT}`);
  return { pin: env.PIN, port, dataDir: dataDir(env), trustProxy: env.TRUST_PROXY === "1" };
}

function clientIp(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const xff = req.headers["x-forwarded-for"];
    const last = (Array.isArray(xff) ? xff.join(",") : xff)?.split(",").pop()?.trim();
    if (last) return last;
  }
  return req.socket.remoteAddress ?? "unknown";
}

export async function createServer(config: ServerConfig): Promise<RunningServer> {
  if (!config.pin) throw new Error("PIN is required");
  const manager = new RoomManager(config.levels ?? loadLevels(), createFilePersist(config.dataDir ?? dataDir()), {
    pin: config.pin,
  });
  const staticRoot = config.staticRoot ?? DEFAULT_STATIC_ROOT;

  const http = createHttpServer((req, res) => {
    req.on("error", () => {});
    res.on("error", () => {});
    try {
      if (req.url === "/healthz") {
        res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
        return void res.end("ok");
      }
      serveStatic(staticRoot, req, res);
    } catch {
      try {
        if (!res.headersSent) res.writeHead(500);
        res.end();
      } catch {
        res.destroy();
      }
    }
  });
  // Malformed HTTP from a client: answer 400 if we still can, never crash.
  http.on("clientError", (_err, socket) => {
    try {
      if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
      else socket.destroy();
    } catch {
      socket.destroy();
    }
  });
  http.on("error", (err) => console.error("http server error", err));

  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MSG_BYTES });
  wss.on("error", (err) => console.error("ws server error", err));
  const timers = config.timers ?? realTimers;
  http.on("upgrade", (req, socket, head) => {
    try {
      socket.on("error", () => {});
      // Plain string match: req.url may be an absolute-form target that `new URL` rejects.
      if (req.url?.split("?")[0] !== "/ws") return void socket.destroy();
      wss.handleUpgrade(req, socket, head, (ws) => {
        try {
          const sock = wrapSocket(ws, clientIp(req, config.trustProxy ?? false));
          startHeartbeat(ws, timers, config.heartbeatMs ?? HEARTBEAT_INTERVAL_MS);
          manager.attach(sock);
        } catch (err) {
          console.error("ws connection setup failed", err);
          ws.terminate();
        }
      });
    } catch (err) {
      console.error("upgrade failed", err);
      socket.destroy();
    }
  });

  await new Promise<void>((ok, fail) => {
    http.once("error", fail);
    http.listen(config.port ?? 8080, ok);
  });

  return {
    port: (http.address() as AddressInfo).port,
    close: async () => {
      manager.closeAll();
      for (const ws of wss.clients) ws.terminate();
      await new Promise<void>((ok) => {
        http.close(() => ok());
        http.closeAllConnections();
      });
    },
  };
}

// --- main -----------------------------------------------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const config = loadConfig(process.env);
    const server = await createServer(config);
    console.log(`bubble server listening on :${server.port}`);
    const stop = () => void server.close().then(() => process.exit(0));
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
