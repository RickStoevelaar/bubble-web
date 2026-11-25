import { FIELD_H, FIELD_W, LEVELS } from "@bubble/shared";
import { ClientGame } from "./game";
import { GamepadInput } from "./input/gamepad";
import { CombinedInput, KeyboardInput } from "./input/input";
import { TouchDeck, TouchTracker, computeTouchZones } from "./input/touch";
import { TouchInput } from "./input/touch-dom";
import { DeckView } from "./input/touch-view";
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

  const overlay = el<HTMLElement>("join");

  // Touch: the tracker/deck exist from boot so every layout recompute can re-zone them, but touches
  // are only handled once the join overlay is gone (the form must keep working).
  const deckModel = new TouchDeck(null);
  const tracker = new TouchTracker(deckModel);
  const deckView = new DeckView(deck, deckModel);
  let seenTouch = false;
  const coarse = window.matchMedia("(pointer: coarse)");
  const touch = new TouchInput(window, tracker, {
    isEnabled: () => overlay.hidden,
    onTouch: () => {
      seenTouch = true;
      layout();
    },
  });
  /** Bottom inset (iOS home indicator) via the #safe probe, whose padding is env(safe-area-inset-bottom). */
  const safeBottom = (): number => parseFloat(getComputedStyle(el("safe")).paddingBottom) || 0;

  const layout = () => {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const l = computeLayout(w, h, dpr);
    canvas.width = FIELD_W * l.scale;
    canvas.height = FIELD_H * l.scale;
    canvas.style.left = `${l.gameX}px`;
    canvas.style.top = `${l.gameY}px`;
    canvas.style.width = `${l.fieldW}px`;
    canvas.style.height = `${l.fieldH}px`;
    ctx.setTransform(l.scale, 0, 0, l.scale, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const zones = computeTouchZones(l, w, h, coarse.matches || seenTouch, safeBottom());
    touch.setZones(zones); // releases held touches if the zones moved under them (rotation)
    const box = zones ? (l.mode === "portrait" ? l.deckRect : { x: 0, y: 0, width: w, height: h }) : null;
    deckView.setLayout(box, dpr, l.mode !== "portrait");
  };
  /** Zoom or a move to another monitor changes devicePixelRatio without a resize event. */
  const watchDpr = (): void => {
    const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    mq.addEventListener("change", () => {
      layout();
      watchDpr();
    }, { once: true });
  };
  window.addEventListener("resize", layout);
  window.addEventListener("orientationchange", layout);
  watchDpr();
  layout();

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
    const input = new CombinedInput([new KeyboardInput(window), new GamepadInput(), touch]);
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
      deckView.render(touch.pressed);
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
