# Touch controls: defaults and what to tune on a real phone

No real-phone test has been done yet (emulated phone only, headless Edge with real touch events). Constants live in `client/src/input/pad.ts` (pad behaviour) and `client/src/input/touch.ts` (geometry).

Left thumb: a FIXED-centre 2D move pad (base ring, knob that follows the finger, left/right/up arrows; the up arrow lights green+white while jump is on). Right thumb: ONE button, BUBBLE (fire). There is no JUMP button; the keyboard/gamepad mapping is unchanged and the wire input is still L/R/J/F booleans per tick.

How the sim reads jump (`shared/src/sim/player.ts`): level-triggered, no buffer, no variable height. A tick with J set while on the ground jumps (holding J through a landing jumps again; holding J when touching a floating bubble bounces instead of popping). So the pad just holds J while the thumb is up. BTN has no down bit: there is no drop-through, so pushing down does nothing.

| Knob | Default | Notes |
|---|---|---|
| pad centre | fixed | portrait: centre of the left `PAD_COLUMN_FRAC` 0.58 of the deck; landscape: left side column; overlay: bottom-left corner |
| `MAX_PAD_RADIUS` | 150 px | otherwise the largest circle that fits (portrait 390x844: r 105, landscape 844x390: r 96) |
| `PAD_DEAD_X` | 0.15 of pad radius | horizontal dead zone either side of centre; raise if the hero twitches at rest |
| `PAD_JUMP_ON` | 0.28 of radius | thumb must go this far up from centre to jump (vertical dead zone, so left-right sliding never jumps) |
| `PAD_JUMP_OFF` | 0.18 of radius | hysteresis: once jumping, J stays on until the thumb falls below this |
| `FLICK_MIN_PX` / `FLICK_WINDOW_MS` | 22 px / 120 ms | a quick upward move of at least this much, ending above centre by `FLICK_END_FRAC` 0.10, is a flick |
| `FLICK_HOLD_TICKS` | 4 ticks (66.7 ms) | a flick holds J this long even if the thumb returns or lifts (covers a tick sample; longer would make bubble contact bounce instead of pop) |
| `PAD_FORGIVE` | 24 px | a fresh touch within pad radius + 24 starts a pad touch |
| pad ownership | whole life | a touch that starts on the pad stays pad-owned until lifted; the vector is clamped to the unit disk (overshoot keeps its direction) |
| `MIN_BUTTON_RADIUS` / `MAX_BUTTON_RADIUS` | 40 / 86 px | radius = 0.28 x 1.35 of the usable height, clamped, and never wider than its column (portrait 390x844: 73) |
| `BUTTON_FORGIVE` | 10 px | fresh touch counts within r + 10 |
| `BUTTON_STICKY` | 20 px | a touch that started on the button stays pressed within r + 20 |
| placement | portrait: bottom-right of the right 42 %; landscape: centred in the right column, lower; overlay: bottom-right corner | |
| `MIN_MARGIN_W` (layout.ts) | 120 px | landscape margin needed for side controls, else translucent overlay (alpha 0.35 idle) |
| haptic | 8 ms, >= 30 ms apart | on fire press and on jump trigger; `navigator.vibrate` (not on iOS Safari) |

Things to check on a real device:
- Does a plain short upward flick jump every time (lower `FLICK_MIN_PX` / `PAD_JUMP_ON` if not), and does sliding left-right ever jump by accident (raise `PAD_JUMP_ON`)?
- Does a thumb resting at the pad centre stay neutral? Is `PAD_DEAD_X` right?
- A thumb pushed up and held keeps bunny-hopping (same as holding Space); if that feels wrong consider a re-arm rule.
- Is the pad big enough/too big in landscape (it is limited by the side column width)? Is the fire button where the right thumb rests?
- Does the home-indicator inset (`env(safe-area-inset-bottom)`) clear the pad and the button? Landscape notch insets are applied to the side columns.
- Sticky release: do thumbs drift off the fire button and lose it? (Button touches beyond r + 20 are released until lifted; pad touches never are.)
- Landscape overlay layout when margins < 120 px: a smaller pad over the field.

Verified in emulation (390x844@3 and 844x390@3, real `Input.dispatchTouchEvent`): pad left sends L (1), pad up-right sends R|J (6) with the hero rising diagonally, fire sends F (8), pad+fire together 14, a flick up-and-back sends J for 4-5 ticks. Screenshots: `docs/progress/controls2-portrait.png`, `controls2-landscape.png`.

## Layout (client/src/render/layout.ts)
- Portrait: integer device-pixel scale as before; when that fills less than 92 % of the width (`PORTRAIT_MIN_FILL`) the field is fitted to the full width at a fractional scale (canvas backing = ceil, `image-rendering: pixelated`), never leaving less than `MIN_DECK_CSS_HEIGHT` (200 px) for the deck. 390x844@3: field 341 -> 390 px wide; the deck keeps the rest (64 % -> 59 % of the height; the field cannot grow past the width, so landscape is the way to a bigger view). 360x800@3 stays integer 4x (deck 62 %).
- Landscape (the "wide" mode): controls are already in side columns (move pad left, BUBBLE right) whenever each side margin is >= `MIN_MARGIN_W`; the columns span the margin up to the screen edges, where thumbs rest. At dpr >= 2 (`LANDSCAPE_MIN_DPR`) the field now also fits the height fractionally when the integer scale fills < 92 % of it, but never eats into the 120 px columns. 800x360@3: 299 -> 360 px tall field. A mouse desktop (dpr 1) keeps strict integer scale and gets no controls unless touch is detected.
