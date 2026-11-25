import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { GameState } from "@bubble/shared";
import type { Persist } from "./room";

/** Reads JSON from `file`; returns `fallback` when it is missing or corrupt. Never throws. */
export function loadJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

/** Atomic write: serialize to a tmp file in the same directory, then rename over the target. */
export function saveJson(file: string, data: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(data));
    renameSync(tmp, file);
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {
      /* tmp may not exist */
    }
    throw err;
  }
}

export function dataDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.DATA_DIR || "./data";
}

const SAFE_CODE = /^[A-Z0-9]{1,12}$/;

function roomFile(dir: string, code: string): string {
  if (!SAFE_CODE.test(code)) throw new Error(`unsafe room code: ${code}`);
  return join(dir, `room-${code}.json`);
}

/** Room persistence as one JSON file per room code under `dir`. */
export function createFilePersist(dir: string): Persist {
  return {
    load: (code) => loadJson<GameState | undefined>(roomFile(dir, code), undefined),
    save: (code, state) => saveJson(roomFile(dir, code), state),
    remove: (code) => {
      try {
        unlinkSync(roomFile(dir, code));
      } catch (err) {
        if (!(err instanceof Error) || (err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      }
    },
  };
}
