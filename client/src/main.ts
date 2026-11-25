import { FIELD_H, FIELD_W, LEVELS } from "@bubble/shared";
import { ClientGame } from "./game";
import { KeyboardInput } from "./input";
import { Connection, NetError, type ConnState } from "./net";
import { Sampler, watchLifecycle } from "./sampler";
import { viewOf, type ShownError } from "./status";
import { computeLayout } from "./render/layout";
import { render } from "./render/renderer";
import { buildSheet } from "./render/sprites";

const FORM_KEY = "bubble.form";

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
  let lastError: ShownError | null = null;

  /** The one place that decides what is visible: join form, banner text, or neither. */
  const applyView = (): void => {
    const v = viewOf({ state: conn.connectionState, everJoined, error: lastError });
    const wasHidden = overlay.hidden;
    overlay.hidden = !v.showJoin;
    errorBox.textContent = v.errorText ?? "";
    goButton.disabled = conn.connectionState === "connecting";
    status.hidden = v.statusText === null;
    status.textContent = v.statusText ?? "";
    if (wasHidden && v.showJoin) {
      pinInput.value = ""; // the session ended: ask for the PIN again
      pinInput.focus();
    }
  };

  conn.onSnap((m) => game?.onSnapshot(m));
  conn.onState((s: ConnState) => {
    if (s === "joined") {
      lastError = null;
      if (everJoined) game?.resync(); // rejoined: undelivered inputs are gone, and the tick may have gone back
      everJoined = true;
    }
    applyView();
  });
  conn.onError((code) => {
    lastError = code;
    applyView();
  });

  let looping = false;
  function startLoop(): void {
    if (looping) return;
    looping = true;
    const input = new KeyboardInput(window);
    const sampler = new Sampler({
      input,
      nextSeq: () => conn.nextInputSeq(),
      send: (seq, buttons) => conn.sendInput(seq, buttons),
      push: (seq, buttons) => game?.pushInput(seq, buttons),
    });
    sampler.setActive(!document.hidden);
    watchLifecycle(window, document, (active) => sampler.setActive(active));

    const frame = (now: number): void => {
      sampler.frame(now);
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
    lastError = null;
    const p = conn.join(room, pinInput.value, name);
    applyView(); // "connecting": disables the button
    p.then(({ playerId }) => {
      saveForm({ room, pin: pinInput.value, name });
      game = new ClientGame({ levels: LEVELS, playerId });
      startLoop();
    }).catch((err: unknown) => {
      lastError = err instanceof NetError ? err.code : "closed";
      applyView();
    });
  });
  applyView();
}

boot();
