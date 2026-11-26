# Touch controls: defaults and what to tune on a real phone

No real-phone test has been done yet (emulated phone only). All numbers are named constants in `client/src/input/touch.ts` unless noted.

| Knob | Default | Notes |
|---|---|---|
| `SLIDE_FRAC` | 0.45 of deck width | left thumb zone |
| `DEAD_ZONE_FRAC` | 0.12 of slide width | thumb resting in the middle does nothing; raise if the hero twitches |
| `SLIDE_EXTEND_Y` | 24 px | vertical hit-area extension of the slide zone |
| slide ownership | whole life | a touch that starts in the slide zone stays slide-owned until lifted; its x is clamped into the zone (overshoot keeps L/R) |
| `MIN_BUTTON_RADIUS` / `MAX_BUTTON_RADIUS` | 40 / 64 px | radius = 28 % of the usable deck height, clamped |
| `BUTTON_FORGIVE` | 10 px | fresh touch counts within r + 10 |
| `BUTTON_STICKY` | 20 px | a touch that started on a button stays pressed within r + 20 |
| button gap | 10 px | BUBBLE bottom-right, JUMP above/left (diagonal) |
| `MIN_MARGIN_W` (layout.ts) | 120 px | landscape margin needed for side controls, else translucent overlay (alpha 0.35 idle) |
| haptic | 8 ms, >= 30 ms apart | `navigator.vibrate` (not on iOS Safari) |

Things to check on a real device:
- Is the slide zone too wide/tall (accidental walking)? Is the dead zone right?
- Can the right thumb roll between JUMP and BUBBLE and mash both? Gap/diagonal offset may need tuning; very tall decks leave the buttons low with empty space above.
- Does the home-indicator inset (`env(safe-area-inset-bottom)`) clear the bottom button? Landscape left/right notch insets are applied to the side columns (`env(safe-area-inset-left/right)` read through the #safe probe); top inset is not.
- Sticky release distances: do thumbs drift off buttons and lose them?
- Slide thumb indicator is mask-driven (left / centre / right), not finger-tracking.
- Landscape overlay layout when margins < 120 px: size/position of the corner controls.
- Button touches that drift beyond r + 20 are released until lifted (slide touches never are); revisit if that feels harsh.

## Layout (client/src/render/layout.ts)
- Portrait: integer device-pixel scale as before; when that fills less than 92 % of the width (`PORTRAIT_MIN_FILL`) the field is fitted to the full width at a fractional scale (canvas backing = ceil, `image-rendering: pixelated`), never leaving less than `MIN_DECK_CSS_HEIGHT` (200 px) for the deck. 390x844@3: field 341 -> 390 px wide; the deck keeps the rest (64 % -> 59 % of the height; the field cannot grow past the width, so landscape is the way to a bigger view). 360x800@3 stays integer 4x (deck 62 %).
- Landscape (the "wide" mode): controls are already in side columns (slide pad left, JUMP/BUBBLE right) whenever each side margin is >= `MIN_MARGIN_W`; the columns span the margin up to the screen edges, where thumbs rest. At dpr >= 2 (`LANDSCAPE_MIN_DPR`) the field now also fits the height fractionally when the integer scale fills < 92 % of it, but never eats into the 120 px columns. 800x360@3: 299 -> 360 px tall field. A mouse desktop (dpr 1) keeps strict integer scale and gets no controls unless touch is detected.
