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
| `MIN_MARGIN_W` | 120 px | landscape margin needed for side controls, else translucent overlay (alpha 0.35 idle) |
| haptic | 8 ms, >= 30 ms apart | `navigator.vibrate` (not on iOS Safari) |

Things to check on a real device:
- Is the slide zone too wide/tall (accidental walking)? Is the dead zone right?
- Can the right thumb roll between JUMP and BUBBLE and mash both? Gap/diagonal offset may need tuning; very tall decks leave the buttons low with empty space above.
- Does the home-indicator inset (`env(safe-area-inset-bottom)`) clear the bottom button? Landscape left/right notch insets are NOT handled (fixed 8 px edge pad).
- Sticky release distances: do thumbs drift off buttons and lose them?
- Slide thumb indicator is mask-driven (left / centre / right), not finger-tracking.
- Landscape overlay layout when margins < 120 px: size/position of the corner controls.
- Button touches that drift beyond r + 20 are released until lifted (slide touches never are); revisit if that feels harsh.
