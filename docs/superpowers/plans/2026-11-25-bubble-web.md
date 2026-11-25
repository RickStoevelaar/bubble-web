# Bubble Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A faithful web recreation of Bubble Bobble (original art/names/audio, same mechanics and layouts): all 100 rounds, two-player networked co-op, phone touch controls, authoritative Node server, deployed on the owner's Hetzner box.

**Architecture:** A deterministic game simulation lives in a `shared` package and runs authoritatively on the Node server at 60 Hz; browser clients send input bitmasks and render 20 Hz snapshots with interpolation plus local prediction of their own character. The client is TypeScript + Canvas 2D at internal resolution 256×224, integer-scaled. Level data is JSON transcribed from reference maps, verified with a dedicated viewer tool.

**Tech Stack:** TypeScript (strict), esbuild, vitest, Node 22, `ws` (only runtime dependency, server-side), Canvas 2D, WebAudio, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-11-25-bubble-web-design.md` (read it first; this plan argues from it).

## Global Constraints

- All art, character designs, names, music, and SFX are **original**. Never copy Taito sprites, likenesses, names ("Bub", "Bob", "Baron von Blubba", …) or melodies. Reference material is used for mechanics, layouts, and behavior only. Working title "Bubble Web"; heroes are original dragon-like characters named **Pip** (green, P1) and **Pop** (blue, P2).
- Client and `shared` have **zero runtime dependencies**. Server's only runtime dependency is `ws`.
- Internal resolution 256×224 (32×28 tiles of 8 px), integer scaling, `imageSmoothingEnabled=false`.
- Simulation tick 60 Hz (`TICK_RATE=60`), snapshots 20 Hz (`SNAPSHOT_RATE=20`).
- TypeScript `strict: true` everywhere; tests with vitest; build with esbuild. Node ≥ 22.
- Tuning constants live in `shared/src/constants.ts` `TUNING` and are starting values, not spec — tasks must not hard-code them elsewhere.
- Commit after every task (at minimum). Repo is `c:\dev\bubble-web` (git init in Task 1).
- Server must stay cheap: one process, JSON file persistence, no database.

## Review Focus

Failure modes the spec implies but tasks' happy-path tests don't naturally cover. Each has its pinned test noted in the owning task.

1. **Phone rotation / viewport resize mid-game** — canvas rescale and touch zones must recompute; expected: game stays playable, no stretched pixels. (Task 10, `layout.test.ts`.)
2. **WebSocket drop mid-round** (elevator, phone sleep) — client auto-reconnects and reclaims its player slot; the run is not lost. (Task 7, reconnect test.)
3. **Hostile/garbage input to the public endpoint** — wrong PIN, malformed JSON, oversized messages, join race for the last slot: server answers with an error and keeps running. (Task 7, rejection tests.)
4. **iOS WebAudio unlock** — audio contexts start suspended until a user gesture; game must play silently rather than hang, and unlock on first touch. (Task 22, unlock test.)
5. **Both players out of lives** — free continue offered (score→0, round kept, spec rule); declining ends the run, writes the high score, and suspends/cleans the room. (Task 6 continue test; Task 12 high-score test.)

---

### Task 1: Workspace scaffold, constants, deterministic RNG

**Files:**
- Create: `package.json` (npm workspaces: `shared`, `server`, `client`, `tools`), `tsconfig.base.json`, `.gitignore`, `vitest.config.ts`
- Create: `shared/package.json`, `shared/tsconfig.json`
- Create: `shared/src/constants.ts`, `shared/src/rng.ts`
- Test: `shared/test/rng.test.ts`

**Interfaces:**
- Produces: `constants.ts` exporting `TICK_RATE=60`, `SNAPSHOT_RATE=20`, `FIELD_W=256`, `FIELD_H=224`, `TILE=8`, `GRID_W=32`, `GRID_H=28`, and `TUNING` (object with named numbers: `walkSpeed`, `jumpVel`, `gravity`, `maxFall`, `fireCooldownTicks`, `bubbleLaunchSpeed`, `bubbleLaunchTicks`, `bubbleRise`, `bubbleLifeTicks`, `bubbleEscapeTicks`, `angerSpeedMult`, `invulnTicks`, `respawnTicks`, `hurryUpTicks`, `roundAngerTicks` — initial values are the builder's, tuned later per spec).
- Produces: `class Rng { constructor(seed: number); next(): number; int(maxExclusive: number): number }` (mulberry32; deterministic).

- [ ] **Step 1: Scaffold.** `git init`; root `package.json` with workspaces and scripts `test` (vitest), `build`; strict `tsconfig.base.json`; install dev deps `typescript esbuild vitest @types/node`.
- [ ] **Step 2: Write the failing test** `shared/test/rng.test.ts`:

```ts
test("same seed, same sequence", () => {
  const a = new Rng(42), b = new Rng(42);
  expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
});
test("int stays in range", () => {
  const r = new Rng(7);
  for (let i = 0; i < 1000; i++) { const v = r.int(10); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(10); }
});
```

- [ ] **Step 3: Run** `npx vitest run shared` — expect FAIL (module not found).
- [ ] **Step 4: Implement** `rng.ts` (mulberry32) and `constants.ts` as specified above.
- [ ] **Step 5: Run** `npx vitest run shared` — expect PASS.
- [ ] **Step 6: Commit** `feat: workspace scaffold, constants, deterministic RNG`.

---

### Task 2: Level data format and collision queries

**Files:**
- Create: `shared/src/level.ts`, `shared/src/levels/test-level.ts`
- Test: `shared/test/level.test.ts`

**Interfaces:**
- Produces:

```ts
type EnemyType = "walker" | "chaser" | "thrower" | "breather" | "bouncer" | "flyer" | "boss";
interface EnemySpawn { type: EnemyType; col: number; row: number; delayTicks: number }
interface DriftCell { col: number; row: number; dx: number; dy: number } // sparse bubble-current overrides
interface LevelData {
  round: number; theme: number;            // theme indexes a palette+wall style in the renderer
  tiles: string[];                         // GRID_H strings of GRID_W chars: '#'=solid, '.'=empty
  enemies: EnemySpawn[]; drift: DriftCell[];
  flags?: { waterBubbles?: boolean; fireBubbles?: boolean; lightningBubbles?: boolean };
}
function isSolid(lv: LevelData, tx: number, ty: number): boolean;      // out-of-bounds left/right = solid; top/bottom = open (wrap)
function solidAtPixel(lv: LevelData, px: number, py: number): boolean;
function validateLevel(lv: LevelData): string[];                        // [] when valid: row/col counts, chars, spawn positions on empty tiles
```

- Produces: `TEST_LEVEL: LevelData` — a hand-written round (border walls, three floating platforms, one walker spawn) used by all sim tests.

- [ ] **Step 1: Write failing tests**: `isSolid` true on a '#' cell and false on '.', out-of-bounds semantics as above; `validateLevel(TEST_LEVEL)` returns `[]`; `validateLevel` flags a 31-char row and a spawn inside a wall.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** `level.ts` and `TEST_LEVEL`.
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** `feat: level data format and collision queries`.

---

### Task 3: Sim core — player movement

**Files:**
- Create: `shared/src/types.ts`, `shared/src/sim/sim.ts`, `shared/src/sim/player.ts`
- Test: `shared/test/player.test.ts`

**Interfaces:**
- Produces in `types.ts` (later tasks extend these — keep them in this one file):

```ts
const BTN = { L: 1, R: 2, J: 4, F: 8 } as const;
interface PlayerState { id: 0|1; x: number; y: number; vx: number; vy: number; facing: 1|-1;
  state: "alive"|"dying"|"respawning"|"gone"; lives: number; score: number;
  fireCooldown: number; invulnTicks: number; onGround: boolean;
  powers: { speed: boolean; fastBubble: boolean; longBubble: boolean; rapidFire: boolean } }
interface GameState { tick: number; round: number; phase: "round"|"clearing"|"gameover"|"ending";
  players: PlayerState[]; enemies: EnemyState[]; bubbles: BubbleState[]; items: ItemState[];
  roundTicks: number; hurryActive: boolean }
type SimEvent = { kind: "jump"|"fire"|"pop"|"bounce"|"die"|"collect"|"clear"|"hurry"|"continue"; player?: 0|1; x?: number; y?: number };
```

(`EnemyState`, `BubbleState`, `ItemState` get placeholder empty-array usage now; defined fully in Tasks 4–5, 13.)
- Produces: `class Sim { constructor(levels: LevelData[], seed: number, playerCount: 1|2); state: GameState; step(buttons: [number, number]): SimEvent[] }` — one call = one 60 Hz tick. Movement semantics (from the reference guides): walk at `TUNING.walkSpeed` (×1.5 with speed power), gravity to `maxFall`, jump only from ground at `jumpVel`, **one-way platforms** (collide only when falling, so jumping up through floors works), side walls block, and **bottom wrap**: leaving the bottom of the field re-enters at the top same x.

- [ ] **Step 1: Write failing tests** in `player.test.ts` (all on `TEST_LEVEL`, stepping the sim N ticks with given buttons):
  - walks right: x increases, facing=1; blocked by wall: x stops at wall edge
  - jump from ground rises then lands back on the same platform (`onGround` true→false→true)
  - jumps up **through** a platform from below and lands on top of it
  - walking off a ledge falls; falling through the bottom row re-enters at top (y small, same x)
  - cannot jump while airborne
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** `sim.ts` (tick orchestration, players array sized by `playerCount`, spawn P1 bottom-left / P2 bottom-right) and `player.ts` (`stepPlayer(sim, p, buttons): SimEvent[]`). AABB of 14×14 px centered on tile-resolved collisions.
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** `feat: sim core with player movement, one-way platforms, bottom wrap`.

---

### Task 4: Bubbles — blow, float, drift, bounce, pop

**Files:**
- Create: `shared/src/sim/bubbles.ts`; Modify: `shared/src/types.ts`, `shared/src/sim/sim.ts`, `shared/src/sim/player.ts`
- Test: `shared/test/bubbles.test.ts`

**Interfaces:**
- Produces in `types.ts`:

```ts
interface BubbleState { id: number; x: number; y: number; vx: number; vy: number;
  kind: "normal"|"water"|"fire"|"lightning"|"letter"; letter?: 0|1|2|3|4|5; // E X T E N D
  phase: "launch"|"float"; ageTicks: number; trapped?: { type: EnemyType; escapeIn: number };
  owner: 0|1 }
```

- Produces: `stepBubbles(sim): SimEvent[]`; firing wired into `stepPlayer` (`BTN.F`, respects `fireCooldown`; `rapidFire` halves it, `fastBubble`/`longBubble` scale `bubbleLaunchSpeed`/`bubbleLaunchTicks`). Semantics: launch phase moves horizontally `bubbleLaunchTicks` ticks (stops early hitting a wall), then float phase rises at `bubbleRise`, steered by the level's sparse `drift` cells when inside one; bubbles **stack** (push apart when overlapping) and collect along the ceiling; after `bubbleLifeTicks` a bubble pops by itself. A player overlapping a floating bubble while pressing jump **bounces** on it (bubble survives); touching it otherwise (or pressing fire adjacent) pops it. Pop events carry position for chain detection later.

- [ ] **Step 1: Write failing tests**: fire spawns a bubble moving in facing direction; cooldown prevents a second bubble next tick; bubble transitions launch→float and rises; bubble inside a drift cell gets its dx applied; two overlapping bubbles separate; bubble pops at end of life (`pop` event); player jump-bounce on a bubble sets player vy negative and keeps the bubble.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** `feat: bubble lifecycle, drift currents, stacking, bouncing`.

---

### Task 5: Enemies — walker, trapping, popping, anger, player death

**Files:**
- Create: `shared/src/sim/enemies.ts`; Modify: `shared/src/types.ts`, `shared/src/sim/sim.ts`, `shared/src/sim/bubbles.ts`
- Test: `shared/test/enemies.test.ts`

**Interfaces:**
- Produces in `types.ts`:

```ts
interface EnemyState { id: number; type: EnemyType; x: number; y: number; vx: number; vy: number;
  dir: 1|-1; state: "spawning"|"active"|"trapped"|"dead"; angry: boolean; spawnDelay: number }
```

- Produces: `stepEnemies(sim): SimEvent[]` with a per-type behavior function table `ENEMY_BEHAVIORS: Record<EnemyType, (sim, e) => void>` — only `walker` implemented here (walks, turns at walls/ledges won't walk off high ledges toward nothing, hops up to a platform when a player is above and a jump reaches it, drops through nothing — same gravity/platform rules as players). Trapping: a launch-phase bubble overlapping an active enemy traps it (`trapped` set on the bubble, enemy state `trapped`, hidden from enemy stepping); popping a trapped bubble kills the enemy (state `dead`, arcs to a landing point, becomes food — item spawn deferred to Task 13, score event now). If a trapped bubble times out (`bubbleEscapeTicks`), the enemy escapes **angry**: `angerSpeedMult` applied permanently. Enemies also turn angry when they are the last one alive or when `roundTicks > roundAngerTicks`. An active enemy touching a non-invulnerable player kills the player: state `dying`, then `respawning` with `invulnTicks`, `lives--`; at 0 lives state `gone`.

- [ ] **Step 1: Write failing tests**: walker patrols and reverses at a wall; launch bubble traps the walker; popping it yields a `pop` event and a dead enemy; escape after `bubbleEscapeTicks` yields an angry (faster) walker; last-enemy-standing turns angry; enemy contact kills player (lives decrement, invulnerable respawn at spawn point); invulnerable player survives contact.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** `feat: walker enemy, bubble trapping, anger, player death`.

---

### Task 6: Round lifecycle — spawning, clearing, advancing, hurry-up, continue

**Files:**
- Modify: `shared/src/sim/sim.ts`, `shared/src/sim/enemies.ts`; Create: `shared/src/sim/round.ts`
- Test: `shared/test/round.test.ts`

**Interfaces:**
- Produces: round flow inside `Sim`: on round start, enemies materialize per `LevelData.enemies` after their `delayTicks`; when the last enemy dies the phase becomes `clearing` (fixed `CLEAR_TICKS` celebration window for food collection) then round+1 loads, players reset position, bubbles cleared. `hurryActive` turns on at `hurryUpTicks` (`hurry` event — clients flash/speed music) and spawns one invincible **chaser-ghost** per player (`type:"hurry"` internally reuses `bouncer` movement but untrappable, despawns on round clear). Game over: all players `gone` → phase `gameover` with a free-continue window; `Sim.continueRun()` resets scores to 0, restores lives, resumes same round (spec rule); `Sim.endRun()` finalizes. Produces `Sim.loadRound(n)` used by umbrellas/skips later.

- [ ] **Step 1: Write failing tests**: enemy appears only after its delay; killing all enemies advances to round 2 after `CLEAR_TICKS`; hurry-up spawns an untrappable chaser that moves toward the player; game over at 0 lives (both players) sets phase `gameover`; `continueRun()` zeroes score, restores lives, keeps the round (Review Focus 5).
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** `feat: round lifecycle, hurry-up chaser, free continue`.

---

### Task 7: Server — protocol, rooms, PIN, snapshots, resume

**Files:**
- Create: `server/package.json`, `server/tsconfig.json`, `server/src/index.ts`, `server/src/room.ts`, `server/src/persist.ts`, `shared/src/protocol.ts`
- Test: `server/test/room.test.ts` (drive `Room` with fake sockets; plus one ws integration test against a real `index.ts` on an ephemeral port)

**Interfaces:**
- Produces `shared/src/protocol.ts`:

```ts
type ClientMsg = { t: "join"; room: string; pin: string; name: string; rejoinToken?: string }
              | { t: "input"; seq: number; buttons: number }
              | { t: "continue"; accept: boolean };
type ServerMsg = { t: "joined"; playerId: 0|1; rejoinToken: string; round: number }
              | { t: "snap"; tick: number; ackSeq: number; state: GameState; events: SimEvent[] }
              | { t: "peer"; playerId: 0|1; name: string; connected: boolean }
              | { t: "err"; code: "badpin"|"full"|"badmsg"|"ratelimit" };
```

- Produces `server/src/room.ts`: `class Room { code: string; constructor(code, levels, persist); join(sock: SocketLike, msg): void; tick(): void; suspend(): void }`. `SocketLike` = `{ send(s: string): void; close(): void; onMessage, onClose }` so tests need no network. Behavior: sim steps 60 Hz on `setInterval`, latest input bitmask per player applied each tick, snapshot every 3rd tick; join with wrong PIN → `err badpin`; third concurrent join → `err full` (slot race resolved by arrival order); `rejoinToken` (random hex issued at join) reclaims a slot after disconnect **without resetting the sim** (Review Focus 2); when both sockets drop, the room suspends after 10 s: sim serialized via `JSON.stringify(sim.state)` to `persist`, interval stopped; a later join with the room code resumes it (Review Focus 5 persistence). Malformed JSON or >4 KB messages → `err badmsg` + close, server keeps running; >5 failed PIN attempts per IP per minute → `ratelimit` (Review Focus 3).
- Produces `server/src/persist.ts`: `loadJson<T>(file: string, fallback: T): T`, `saveJson(file: string, data: unknown): void` (atomic: write tmp, rename). Data dir from env `DATA_DIR` (default `./data`).
- Produces `server/src/index.ts`: HTTP server serving `client/dist` statically + `ws` upgrade on `/ws`; env `PIN`, `PORT` (default 8080).

- [ ] **Step 1: Write failing tests**: good PIN joins as player 0 and receives snapshots; wrong PIN → `badpin`; three joins → third gets `full`; input changes player x in subsequent snapshot; disconnect + rejoin with token reclaims slot 0 and the sim tick kept advancing; suspend writes a file and a fresh `Room` constructed from persist resumes at the same round/tick; garbage bytes → `badmsg` and the room survives; integration test: real ws client joins through `index.ts`.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** (install `ws` + `@types/ws` in `server` only).
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** `feat: authoritative room server with PIN, reconnect, resume`.

---

### Task 8: Client shell — canvas, sprites, tile themes, HUD

**Files:**
- Create: `client/package.json`, `client/index.html`, `client/src/main.ts`, `client/src/render/renderer.ts`, `client/src/render/sprites.ts`, `client/src/render/layout.ts`, `client/build.mjs` (esbuild)
- Test: `client/test/sprites.test.ts`, `client/test/layout.test.ts`

**Interfaces:**
- Produces `sprites.ts`: original pixel art defined **in code** as string-grid templates, e.g.

```ts
// chars map to palette indices; '.' transparent — ORIGINAL designs, drawn fresh
const PIP_WALK_0 = ["....GGGG....", ...]; // 16×16 original round dragon, big eyes, stubby wings
function buildSheet(doc: Document): SpriteSheet; // renders all templates to one offscreen canvas
function draw(ctx, sheet, name: SpriteName, frame: number, x: number, y: number, flipX?: boolean): void;
```

  Required sprite sets (each an original design): Pip/Pop (walk 2f, jump, fall, blow, death spin), 7 enemy types + angry tint variant (palette swap), bubble (normal/water/fire/lightning/letter with E X T E N D glyphs), 8 food/treasure items, wall tile per theme (10 themes: palette + 8×8 pattern), HUD font (original 8×8 pixel font, chars A–Z 0–9).
- Produces `layout.ts`: `computeLayout(winW: number, winH: number): { scale: number; gameX: number; gameY: number; deckRect: Rect | null }` — integer scale; portrait puts the control deck below the field, landscape/desktop centers with no deck.
- Produces `renderer.ts`: `render(ctx, sheet, state: GameState, levels: LevelData[], localPlayer: 0|1): void` — tiles from `LevelData.tiles` in the round's theme, entities, HUD (score P1/P2, lives as mini-heads, round number).
- `main.ts` for now: boot, build sheet, render `TEST_LEVEL` with a static state (visual smoke page via `npx serve` or esbuild serve).

- [ ] **Step 1: Write failing tests**: `buildSheet` yields non-empty bounds for every `SpriteName`; template validator — every sprite template is rectangular and uses only palette chars; `computeLayout(390, 844)` (portrait phone) returns integer scale with `deckRect` ≥ 200 px tall; `computeLayout(1920, 1080)` returns `deckRect: null` and a centered field; resize recompute is pure (same inputs → same outputs) (Review Focus 1). Run vitest with `environment: 'jsdom'`? No — keep canvas out: template validation and layout are pure; `buildSheet` test runs in a `happy-dom`/`jsdom` env with a 2D-context stub asserting draw calls, or split: validator pure-tested, sheet smoke-tested in Step 6.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement.** Draw every sprite as an original design; no copying reference art — silhouettes and palettes must be yours.
- [ ] **Step 4: Run tests** — expect PASS.
- [ ] **Step 5: Visual smoke:** `node client/build.mjs --serve`, open the page, confirm the test level renders with sprites and HUD at crisp integer scale. Screenshot into `docs/progress/` if running with a browser tool.
- [ ] **Step 6: Commit** `feat: client renderer, original sprite sheet, responsive layout`.

---

### Task 9: Client networking — join, interpolation, prediction

**Files:**
- Create: `client/src/net.ts`, `client/src/game.ts`; Modify: `client/src/main.ts`
- Test: `client/test/net.test.ts`

**Interfaces:**
- Produces `net.ts`: `class Connection { constructor(url: string); join(room, pin, name, rejoinToken?): Promise<{playerId: 0|1; rejoinToken: string}>; sendInput(seq: number, buttons: number): void; onSnap(cb): void; onError(cb): void }` — stores `rejoinToken` in `localStorage`, auto-reconnects with backoff on close and rejoins with the token (Review Focus 2).
- Produces `game.ts`: `class ClientGame` — holds last two snapshots, renders at `renderTime = serverTime - 50ms` interpolating entity positions; **local prediction**: keeps unacked inputs, re-simulates own `PlayerState` from the snapshot's authoritative state through pending inputs using the shared `stepPlayer` (this is why the sim is shared), snaps softly on divergence > 2 px.
- Protocol/time source injected (`SocketLike`, `now()`) so tests are deterministic and offline.

- [ ] **Step 1: Write failing tests**: interpolation midpoint between two snapshots positions an enemy halfway; prediction applies 3 pending inputs after an ack (own player x ahead of snapshot x by exactly 3 ticks of `walkSpeed`); on socket close, `Connection` schedules reconnect and resends join with the stored token.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement**; wire `main.ts`: join form (room code, PIN, name) → `ClientGame` loop (requestAnimationFrame render, 60 Hz input sampler).
- [ ] **Step 4: Run tests** — expect PASS.
- [ ] **Step 5: Manual smoke:** run server locally, open two browser tabs, both join room `FAM`, confirm both dragons move and see each other.
- [ ] **Step 6: Commit** `feat: client netcode with interpolation and prediction`.

---

### Task 10: Input — keyboard, touch deck, gamepad

**Files:**
- Create: `client/src/input/input.ts`, `client/src/input/touch.ts`; Modify: `client/src/main.ts`, `client/src/render/renderer.ts`
- Test: `client/test/touch.test.ts`

**Interfaces:**
- Produces `input.ts`: `class InputSource { sample(): number /* BTN bitmask */ }` merging keyboard (arrows/WASD + Space jump + Z/Ctrl fire), Gamepad API (dpad/left stick, A jump, X fire), and touch.
- Produces `touch.ts`: `class TouchDeck { constructor(deckRect: Rect); handle(touches: {x,y,id}[]): number; draw(ctx): void; setRect(r: Rect): void }` — left 45% of deck = slide zone (left/right half = L/R, slide without lift re-evaluates); right side two round buttons JUMP and BUBBLE (56 px min radius at scale); full multi-touch (movement + both buttons concurrently); `setRect` called on every layout recompute (Review Focus 1).
- Deck drawn semi-transparent at the deck rect in portrait; hidden when `deckRect` null.

- [ ] **Step 1: Write failing tests** (pure `TouchDeck.handle` with synthetic touches): touch in left half of slide zone → `BTN.L`; slide same touch to right half → `BTN.R` without lift; one touch on slide + one on JUMP + one on BUBBLE → all three bits set; after `setRect` with a rotated rect, the same screen touch maps by the new zones (Review Focus 1 pinned test).
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement**; wire into the 60 Hz sampler.
- [ ] **Step 4: Run tests** — expect PASS.
- [ ] **Step 5: Manual smoke on a real phone** (serve over LAN): portrait play of the test level; verify run-jump-shoot with two thumbs feels responsive. Note tuning gripes in `docs/notes/controls.md` rather than blocking.
- [ ] **Step 6: Commit** `feat: keyboard, gamepad and multi-touch deck input`.

---

### Task 11: Remaining enemy types

**Files:**
- Modify: `shared/src/sim/enemies.ts`, `shared/src/types.ts` (projectile state)
- Test: `shared/test/enemy-types.test.ts`

**Interfaces:**
- Consumes the `ENEMY_BEHAVIORS` table (Task 5). Produces behaviors for (original names; classic behaviors documented in the Dawes guide / StrategyWiki — fetch per-type pages for details):
  - `chaser` — walker movement but biased toward nearest player, +20% speed (the original's "Hidegons"-class pursuit without fire here).
  - `thrower` — walker that stops to lob an arcing **rock projectile** at the nearest player on a cooldown; add `interface ProjectileState { id; x; y; vx; vy; kind: "rock"|"flame" }` and `GameState.projectiles`.
  - `breather` — thrower variant: horizontal **flame** projectile, faster cooldown, slower walk.
  - `bouncer` — ignores platforms and gravity: moves in straight diagonals, reflects off walls/floor/ceiling (the ghost/whale class); untrappable only in its `hurry` variant (already built).
  - `flyer` — flies freely toward the player with sinusoidal bob, passes through platforms but not walls.
  - Projectiles kill players on contact (reuse Task 5 death path), pass through walls? No: rocks arc and vanish on solid contact; flames vanish at walls.
- All types trappable/poppable/anger exactly like walker (shared code path, only movement differs).

- [ ] **Step 1: Write failing tests** per type: chaser moves toward the player's side; thrower emits a projectile within cooldown window and the rock's arc descends (vy increases); projectile contact kills player; bouncer reflects at the ceiling (vy sign flips) and never rests on a platform; flyer crosses a platform row; each type can be trapped and popped.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — expect PASS. Also rerun full suite.
- [ ] **Step 5: Commit** `feat: full enemy roster`.

---

### Task 12: Scoring, food, chain pops, extra lives, high scores

**Files:**
- Create: `shared/src/sim/scoring.ts`; Modify: `shared/src/sim/enemies.ts`, `shared/src/types.ts`, `server/src/room.ts`, `server/src/persist.ts`
- Test: `shared/test/scoring.test.ts`, `server/test/highscores.test.ts`

**Interfaces:**
- Produces in `types.ts`: `interface ItemState { id: number; x: number; y: number; kind: ItemKind; value: number; despawnTicks: number }`, `type ItemKind = "food"|"power"|"treasure"` with a `food` sprite index.
- Produces `scoring.ts`: popped enemy → food item at its landing spot worth per-enemy value; **chain multiplier**: enemies popped in one multi-pop (same tick cluster — popping a bubble pops adjacent trapped bubbles) score 1000/2000/4000/8000/16000… per the classic doubling; collecting food adds its value; extra life at 50,000 and every 100,000 after (`extend` event reuses `continue`? no — add `SimEvent kind "oneup"`). Falling food collected on touch.
- Produces in `room.ts`: on run end (`endRun` or ending), append `{names, score, round, date}` to `DATA_DIR/highscores.json` via `persist`, keep top 20 (Review Focus 5 pinned test: game over → declining continue writes the entry).

- [ ] **Step 1: Write failing tests**: single pop scores base value and spawns food; triple multi-pop scores 1000+2000+4000; food collection adds value to the collector; score crossing 50,000 grants a life and `oneup` event; server test: ending a run writes a sorted, capped `highscores.json`.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** `feat: scoring, chain pops, food, high scores`.

---

### Task 13: Items and power-ups

**Files:**
- Create: `shared/src/sim/items.ts`; Modify: `shared/src/sim/sim.ts`, `shared/src/types.ts`
- Test: `shared/test/items.test.ts`

**Interfaces:**
- Produces `items.ts`: `maybeSpawnItem(sim): void` — power items appear on a platform tile based on classic trigger counters (approximation per spec: track per-run counters of bubbles blown / jumps / distance; when a threshold crosses, spawn the matching item, max one power item on screen). Item table (kinds extend `ItemKind` powers via `power` + `powerId`):
  - shoe → `powers.speed`; candy pink/blue/yellow → `rapidFire` / `fastBubble` / `longBubble` (all until death)
  - umbrella orange/red/purple → skip 3/5/7 rounds (calls `Sim.loadRound(round + n)`, capped at 99)
  - ring/cross/necklace class → timed score-per-action and screen-clear effects: implement **three**: score ring (points per jump while held, 60 s), lightning cross (pops every on-screen enemy into food), water potion (floods: kills all, rains food)
  - All items despawn after `ITEM_TTL_TICKS` if uncollected.

- [ ] **Step 1: Write failing tests**: crossing the bubbles-blown threshold spawns exactly one power item on a platform; shoe collection sets `powers.speed` and dies with the player; orange umbrella advances `round` by 3; lightning cross kills all active enemies into food.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** `feat: power-ups and special items`.

---

### Task 14: Special bubbles and EXTEND

**Files:**
- Modify: `shared/src/sim/bubbles.ts`, `shared/src/sim/sim.ts`, `shared/src/types.ts`
- Test: `shared/test/special-bubbles.test.ts`

**Interfaces:**
- Special bubbles drift in from screen edges on rounds whose `LevelData.flags` allow them (rate via `Rng`):
  - **water**: popping releases a water stream that flows down/along floors carrying the popping player and killing enemies it touches (each kill scores like a chain element); stream dies at the bottom wrap.
  - **fire**: popping drops a flame that spreads along the floor tiles for ~2 s, killing enemies crossing it.
  - **lightning**: popping fires a horizontal bolt away from the player's facing, killing the first enemy in line through walls.
  - **letter**: E/X/T/E/N/D bubbles (random letter, rarer for missing ones); collecting all six → `oneup` + skip to next round + letters reset. Track per-player `letters: boolean[6]` on `PlayerState`.
- Enemies killed by specials become food (reuse Task 12 path).

- [ ] **Step 1: Write failing tests**: water pop spawns stream segments that advance along a floor and kill a walker; fire pop burns a flame for its duration; lightning bolt kills first enemy in row only; collecting the sixth distinct letter grants a life and advances the round; duplicate letters don't complete the set.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** `feat: water, fire, lightning and EXTEND bubbles`.

---

### Task 15: Secret rooms

**Files:**
- Create: `shared/src/levels/secret-rooms.ts`; Modify: `shared/src/sim/round.ts`, `shared/src/sim/items.ts`
- Test: `shared/test/secrets.test.ts`

**Interfaces:**
- Per the classic rules (verify details against StrategyWiki's secret-rooms page during implementation): a door appears on rounds **20, 30, 40** when a player reaches that round without dying in the preceding stretch; walking into it (door persists until round clear) warps to a treasure room — a layout whose walls spell a giant word, filled with high-value treasure items and no enemies; a timer returns players to the **next** round after collection, and each secret room shows a letter-code fragment on its wall (used for the Super-mode code, Task 16).
- Produces: three `LevelData` secret layouts in `secret-rooms.ts` (walls spell original words — e.g. "PIP", "POP", "WEB" — not the original game's text), `round.ts` hooks: `deathlessSince: number` per player, door spawn + warp + return.

- [ ] **Step 1: Write failing tests**: reaching round 20 with `deathlessSince ≤ round 10` spawns a door item; entering warps `round` to the secret layout, which validates (`validateLevel`) and contains ≥ 30 treasure items; timer expiry returns to round 21; a death before round 20 → no door.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** `feat: secret treasure rooms`.

---

### Task 16: Boss, endings, Super unlock

**Files:**
- Modify: `shared/src/sim/enemies.ts`, `shared/src/sim/round.ts`, `shared/src/types.ts`, `server/src/room.ts`, `server/src/persist.ts`
- Test: `shared/test/boss.test.ts`

**Interfaces:**
- Round 100 = boss: `type:"boss"` — a giant (48×48) enemy with HP, bouncing around the arena, hurling projectile volleys. It can't be bubbled; it's damaged by **lightning-class shots**: round 100 grants each player a potion on entry that turns their bubbles into bolts (approximation of the original's thunder-potion boss fight). Boss HP ~ 100 hits ×2 players; staggers on hit; on death → `phase:"ending"`.
- Endings: `GameState.ending: "bad"|"true"` — `true` iff **two players are present (connected, in-game) at the boss-death tick** (spec rule); otherwise `bad`. Ending data (text + which cutscene the client shows) rides the snapshot. True ending reveals `SUPER_CODE` (constant string of original design, shown as the three secret-room fragments combined).
- Super mode: joining a room with room code = `SUPER_CODE` (and the unlock recorded) starts hard mode — `Sim` constructed with `superMode: true`: all enemies start angry, hurry-up at half time. Unlock persisted by the server in `DATA_DIR/unlocks.json` when a true ending happens.
- Add `Sim` constructor options object: `{ playerCount: 1|2; superMode?: boolean; startRound?: number }` (refactor Task 3 call sites).

- [ ] **Step 1: Write failing tests**: boss takes N bolt hits then dies → phase `ending`; `ending:"true"` only when both players alive-or-respawning at kill tick, `"bad"` when single-player; superMode sim starts walkers angry; server records unlock file after a true ending; joining with `SUPER_CODE` before unlock → `err noroom`-equivalent rejection, after unlock → superMode room.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** (client cutscenes deferred to Task 23 — sim/events only here).
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** `feat: boss fight, dual endings, Super mode unlock`.

---

### Task 17: Level viewer / transcription tool

**Files:**
- Create: `tools/level-viewer/index.html`, `tools/level-viewer/viewer.ts`, `tools/level-viewer/build.mjs`
- Test: none beyond `validateLevel` reuse — this is an internal tool; its correctness is visual.

**Interfaces:**
- Consumes `LevelData`, `validateLevel`, the client renderer's tile drawing.
- Produces a static page: paste/edit a `LevelData` JSON in a textarea → live-renders the grid at 2× with grid lines, enemy spawn markers (lettered by type), drift arrows, and the `validateLevel` report; side panel shows rounds from `shared/src/levels/levels.json` for paging through a batch; an "export" button prints normalized JSON. Keyboard: arrows to page rounds.

- [ ] **Step 1: Build the page** (esbuild bundle, serves with `--serve`).
- [ ] **Step 2: Smoke:** load `TEST_LEVEL`, confirm render + validation output.
- [ ] **Step 3: Commit** `feat: level transcription viewer tool`.

---

### Tasks 18–21: Transcribe rounds 1–25, 26–50, 51–75, 76–100

Four identical tasks; each covers 25 rounds. **Files:** Create/extend `shared/src/levels/levels.json` (array of 100 `LevelData`), test `shared/test/levels.test.ts` (written in Task 18, grows).

**Process per batch (Task 18 shown; 19–21 repeat for their ranges):**

- [ ] **Step 1: Gather reference.** Fetch the VGMaps Bubble Bobble arcade full map image and the StrategyWiki walkthrough pages for the batch's rounds (round images + enemy lists). Download images into the scratchpad; read them with image-capable tooling. Enemy types/counts/positions come from the round images; delays default to 0 except where guides note staggered entry.
- [ ] **Step 2: Transcribe** each round into `LevelData`: 32×28 `#`/`.` grid (walls are 2×2-tile blocks on the reference maps — transcribe at 8 px granularity), theme number cycling per the original's décor changes (every ~5 rounds a new palette), enemy spawns, `flags` for rounds the guides mark as water/fire/lightning-bubble rounds, drift cells only where the reference shows strong currents (many rounds: none).
- [ ] **Step 3: Validation test** (write in Task 18): every level in the file passes `validateLevel`; rounds are numbered 1..N contiguously; every round except 100 has ≥ 1 enemy; round 100 has exactly the boss; each round has a floor or is open-bottom intentionally (wrap columns reachable). Run: expect PASS for the batch.
- [ ] **Step 4: Visual check** in the viewer against the reference image, round by round; fix mismatches. This is the real gate — eyeball every round.
- [ ] **Step 5: Play smoke:** start server, play 3 sampled rounds of the batch (e.g. first/middle/last) to clear.
- [ ] **Step 6: Commit** `content: rounds 1-25` (etc.).

---

### Task 22: Audio — synth engine, SFX, music

**Files:**
- Create: `client/src/audio/synth.ts`, `client/src/audio/sfx.ts`, `client/src/audio/music.ts`
- Test: `client/test/audio.test.ts`

**Interfaces:**
- Produces `synth.ts`: tiny WebAudio chip-synth — `class Chip { constructor(ctx: AudioContext); pulse(freq, dur, duty, vol): void; tri(...); noise(...) }`; `class AudioSys { static create(): AudioSys | null /* null if WebAudio unavailable */; unlock(): void; playSfx(name: SfxName): void; setMusic(track: "main"|"hurry"|"boss"|"ending"|null): void }` — `unlock()` resumes the context, called from the first user gesture; every public method is a no-op when locked/unavailable (Review Focus 4).
- Produces `sfx.ts`: mapped from `SimEvent.kind` (jump, fire, pop, bounce, die, collect, oneup, hurry).
- Produces `music.ts`: tracks as arrays of `{tick, ch, note, dur}` — **original compositions** in the idiom (bouncy major-key loop for main; do not transcribe the original melody), scheduled ahead via `ctx.currentTime`.
- Wire: client consumes snapshot `events` → sfx; phase/hurry changes → `setMusic`.

- [ ] **Step 1: Write failing tests** (with a stubbed `AudioContext`): `AudioSys.create()` returns null when `AudioContext` is undefined and callers no-op without throwing; `playSfx` before `unlock()` is a silent no-op; after `unlock()`, `playSfx("pop")` schedules ≥ 1 oscillator (stub records calls); music scheduler queues notes monotonically.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement**; hook `unlock()` to first `pointerdown`/`keydown`.
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Manual smoke:** play round 1 with sound on desktop and once on an iPhone (unlock path).
- [ ] **Step 6: Commit** `feat: chiptune audio engine, SFX, original music`.

---

### Task 23: Screens and flow — title, join, game over, endings, cutscenes

**Files:**
- Create: `client/src/screens/screens.ts`; Modify: `client/src/main.ts`, `client/src/render/renderer.ts`
- Test: `client/test/screens.test.ts`

**Interfaces:**
- Produces a screen-stack state machine: `type Screen = "title" | "join" | "game" | "gameover" | "ending" | "scores"`.
  - **title**: logo (original pixel lettering "BUBBLE WEB"), "touch to start", high-score ticker (fetched via `GET /scores` — add this trivial JSON endpoint to `server/src/index.ts`).
  - **join**: room code + PIN + name inputs (HTML overlay form, not canvas), remembered in `localStorage`; errors from `err` codes shown inline.
  - **gameover**: continue countdown (10 s) → sends `{t:"continue", accept}`.
  - **ending**: bad = short text scene with the heroes walking off; true = rescue scene (the heroes' captured family freed — original art), then the Super code reveal, then credits. Pure canvas scenes driven by tick scripts.
  - **scores**: top-20 table.
- Reconnect UX: a "reconnecting…" banner over the game screen while `Connection` retries.

- [ ] **Step 1: Write failing tests**: screen machine transitions title→join→game on join success; `err full` returns to join with message; gameover countdown reaching 0 auto-declines; ending screen picks true/bad from `GameState.ending`.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** screens + `/scores` endpoint + wiring.
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Full-game smoke:** with `startRound` dev param (add `?round=98` dev-only query, server env-gated `ALLOW_DEV=1`), play 98→100 two tabs, see the true ending and Super reveal; single tab → bad ending.
- [ ] **Step 6: Commit** `feat: screens, endings, cutscenes, game flow`.

---

### Task 24: Packaging and deployment

**Files:**
- Create: `Dockerfile`, `compose.yml`, `.dockerignore`, `docs/deploy.md`
- Test: local `docker compose up` smoke.

**Interfaces:**
- `Dockerfile`: multi-stage — build client (esbuild) + server (tsc/esbuild), final `node:22-slim` image running `server/dist/index.js`, serving the client statically; `DATA_DIR=/data` volume.
- `compose.yml`: service `bubbleweb`, volume `./data:/data`, env `PIN` from `.env`, joined to the external `web` network **per the box's standing convention** (containerized Caddy reaches apps by container name on that network). No published ports.
- `docs/deploy.md`: steps for the owner's Hetzner box — **first read the LIVE Caddyfile on the box** (standing rule) and then add a route following the existing apps' pattern (sslip.io host → `reverse_proxy bubbleweb:8080`, WebSocket works through Caddy by default); `docker compose up -d`; set a household `PIN` in `.env`.

- [ ] **Step 1: Write Dockerfile/compose**; build locally: `docker compose up --build`, join a room from a phone on the LAN through the container, play a round.
- [ ] **Step 2: Write `docs/deploy.md`** as above.
- [ ] **Step 3: Full test suite + typecheck pass:** `npx vitest run && npx tsc -b` — expect green.
- [ ] **Step 4: Commit** `feat: docker packaging and deployment docs`.
- [ ] **Step 5: Deploy with the owner:** this step touches the shared live server — do it when the owner says go, reading the live Caddyfile before any edit.

---

## Self-review notes

- **Spec coverage:** all goals mapped — 100 rounds (17–21), co-op netcode (7, 9), touch (10), enemies (5, 11), items (13), specials+EXTEND (14), secrets (15), boss/endings/Super (16), continue/resume (6, 7), scoring/high scores (12), audio (22), screens (23), deploy (24). Non-goals respected (no faithful Super rearrangement; server-only play — no offline path anywhere).
- **Type consistency:** `types.ts` is the single home for state interfaces; tasks that extend it say so. `Sim` constructor changes shape in Task 16 (options object) — Task 16 includes the refactor of earlier call sites.
- **Proportion:** bodies appear only where behavior isn't determined by signature+test (none shipped as full code); sprite art and level content are content tasks by nature.
- **Review Focus:** all five pinned to owning tasks (noted inline).
