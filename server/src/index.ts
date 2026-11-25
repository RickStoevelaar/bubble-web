import { createServer as createHttpServer } from "node:http";
import type { IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { TEST_LEVEL } from "@bubble/shared";
import type { LevelData } from "@bubble/shared";
import { WebSocketServer } from "ws";
import type { WebSocket } from "ws";
import { createFilePersist, dataDir } from "./persist";
import type { SocketLike } from "./room";
import { RoomManager } from "./rooms";
import { serveStatic } from "./static";
import { MAX_MSG_BYTES } from "./validate";

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
}

export interface RunningServer {
  port: number;
  close(): Promise<void>;
}

const DEFAULT_STATIC_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../client/dist");
const MAX_BUFFERED_BYTES = 1 << 20;

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

function wrapSocket(ws: WebSocket, ip: string): SocketLike {
  return {
    ip,
    send: (s) => {
      if (ws.readyState !== ws.OPEN) return;
      if (ws.bufferedAmount > MAX_BUFFERED_BYTES) return void ws.terminate(); // client is not reading
      ws.send(s);
    },
    close: () => ws.close(),
    onMessage: (cb) => ws.on("message", (data) => cb(data.toString())),
    onClose: (cb) => ws.on("close", cb),
  };
}

export async function createServer(config: ServerConfig): Promise<RunningServer> {
  if (!config.pin) throw new Error("PIN is required");
  const manager = new RoomManager(config.levels ?? loadLevels(), createFilePersist(config.dataDir ?? dataDir()), {
    pin: config.pin,
  });
  const staticRoot = config.staticRoot ?? DEFAULT_STATIC_ROOT;

  const http = createHttpServer((req, res) => {
    try {
      if (req.url === "/healthz") {
        res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
        return void res.end("ok");
      }
      serveStatic(staticRoot, req, res);
    } catch {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MSG_BYTES });
  http.on("upgrade", (req, socket, head) => {
    socket.on("error", () => {});
    if (new URL(req.url ?? "/", "http://x").pathname !== "/ws") return void socket.destroy();
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.on("error", () => {}); // oversized frames etc.; the close event follows
      manager.attach(wrapSocket(ws, clientIp(req, config.trustProxy ?? false)));
    });
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
