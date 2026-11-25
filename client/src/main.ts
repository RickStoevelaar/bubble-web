import { FIELD_H, FIELD_W, LEVELS, TICK_RATE } from "@bubble/shared";
import { ClientGame } from "./game";
import { KeyboardInput, type InputSource } from "./input";
import { Connection, NetError, type ConnState, type ErrCode } from "./net";
import { computeLayout } from "./render/layout";
import { render } from "./render/renderer";
import { buildSheet } from "./render/sprites";

const TICK_MS = 1000 / TICK_RATE;
/** After a stall (hidden tab, GC) run at most this many catch-up ticks instead of a burst. */
const MAX_CATCHUP_TICKS = 4;
const FORM_KEY = "bubble.form";

const ERROR_TEXT: Record<ErrCode | "timeout" | "closed", string> = {
  badpin: "That PIN is not right.",
  full: "That room already has two players.",
  ratelimit: "Too many tries. Wait a minute and try again.",
  badmsg: "The server did not understand the game. Please reload the page.",
  timeout: "Could not reach the server. Check your connection and try again.",
  closed: "The connection was closed.",
};

function wsUrl(): string {
  return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
}

interface SavedForm {
  room: string;
  pin: string;
  name: string;
}

/** localStorage can throw (private mode, blocked): the form just will not be remembered then. */
function loadForm(): Partial<SavedForm> {
  try {
    const raw = localStorage.getItem(FORM_KEY);
    return raw ? (JSON.parse(raw) as Partial<SavedForm>) : {};
  } catch {
    return {};
  }
}

function saveForm(f: SavedForm): void {
  try {
    localStorage.setItem(FORM_KEY, JSON.stringify(f));
  } catch {
    /* not remembered */
  }
}

const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

function boot(): void {
  const canvas = el<HTMLCanvasElement>("game");
  const deck = el<HTMLElement>("deck");
  const maybeCtx = canvas.getContext("2d");
  if (!maybeCtx) throw new Error("2d canvas context unavailable");
  const ctx: CanvasRenderingContext2D = maybeCtx;
  const sheet = buildSheet(document);

  const layout = () => {
    const dpr = window.devicePixelRatio || 1;
    const l = computeLayout(window.innerWidth, window.innerHeight, dpr);
    canvas.width = FIELD_W * l.scale;
    canvas.height = FIELD_H * l.scale;
    canvas.style.left = `${l.gameX}px`;
    canvas.style.top = `${l.gameY}px`;
    canvas.style.width = `${l.fieldW}px`;
    canvas.style.height = `${l.fieldH}px`;
    if (l.deckRect) {
      const r = l.deckRect;
      deck.style.display = "block";
      Object.assign(deck.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.width}px`, height: `${r.height}px` });
    } else {
      deck.style.display = "none";
    }
    ctx.setTransform(l.scale, 0, 0, l.scale, 0, 0);
    ctx.imageSmoothingEnabled = false;
  };
  window.addEventListener("resize", layout);
  window.addEventListener("orientationchange", layout);
  layout();

  const overlay = el<HTMLElement>("join");
  const form = el<HTMLFormElement>("join-form");
  const roomInput = el<HTMLInputElement>("room");
  const pinInput = el<HTMLInputElement>("pin");
  const nameInput = el<HTMLInputElement>("name");
  const goButton = el<HTMLButtonElement>("join-go");
  const errorBox = el<HTMLElement>("join-error");
  const status = el<HTMLElement>("status");

  const saved = loadForm();
  roomInput.value = saved.room ?? "";
  pinInput.value = saved.pin ?? "";
  nameInput.value = saved.name ?? "";
  roomInput.addEventListener("input", () => {
    roomInput.value = roomInput.value.toUpperCase().trim();
  });

  const conn = new Connection(wsUrl());
  let game: ClientGame | null = null;
  let everJoined = false;
  conn.onSnap((m) => game?.onSnapshot(m));
  conn.onState((s: ConnState) => {
    if (s === "joined" && everJoined) game?.resync(); // rejoined: the server may have restored an older tick
    if (s === "joined") everJoined = true;
    status.hidden = s !== "reconnecting";
    if (s === "reconnecting") status.textContent = "reconnecting…";
  });
  conn.onError((code) => {
    status.hidden = false;
    status.textContent = ERROR_TEXT[code];
  });

  let looping = false;
  function startLoop(input: InputSource): void {
    if (looping) return;
    looping = true;
    let last = performance.now();
    let acc = 0;

    const tick = (): void => {
      const g = game;
      if (!g) return;
      const seq = conn.nextInputSeq();
      if (seq === undefined) return; // not joined / waiting for the first snapshot after a (re)join
      const buttons = input.sample();
      if (conn.sendInput(seq, buttons)) g.pushInput(seq, buttons);
    };

    const frame = (now: number): void => {
      acc = Math.min(acc + (now - last), TICK_MS * MAX_CATCHUP_TICKS);
      last = now;
      while (acc >= TICK_MS) {
        tick();
        acc -= TICK_MS;
      }
      const view = game?.viewState(now);
      if (game && view) render(ctx, sheet, view, LEVELS, game.localPlayer);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const room = roomInput.value.trim().toUpperCase();
    roomInput.value = room;
    const name = nameInput.value.trim();
    errorBox.textContent = "";
    goButton.disabled = true;
    conn
      .join(room, pinInput.value, name)
      .then(({ playerId }) => {
        saveForm({ room, pin: pinInput.value, name });
        game = new ClientGame({ levels: LEVELS, playerId });
        overlay.hidden = true;
        startLoop(new KeyboardInput(window));
      })
      .catch((err: unknown) => {
        errorBox.textContent = ERROR_TEXT[err instanceof NetError ? err.code : "closed"];
        goButton.disabled = false;
      });
  });
}

boot();
