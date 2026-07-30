# Outline Text Reveal Design

## Goal

Add text-only **Outline Reveal In** and **Outline Reveal Out** animations matching `new-text-animation.mp4`.

## Motion

- Enter: a thin outline reveals from left to right; the solid text fill follows and replaces it.
- Exit: the exact visual inverse runs from right to left: solid text becomes outline, then disappears.
- Duration and easing use the existing animation controls.
- The trace front completes before the fill front, creating the two-stage look visible in the reference.

## Architecture

- Add `outlineRevealIn` and `outlineRevealOut` to `AnimationType`.
- Extend `AnimatedProps.textMode` with `outlineReveal`.
- The animator maps enter progress from `0 → 1` and exit progress from `1 → 0`.
- `TextKonva` renders two lightweight clipped layers:
  - an outline-only band between the fill and trace fronts;
  - the normal styled text behind the fill front.
- The final frame returns to normal text rendering, preserving existing fills, gradients, shadows, strokes, fonts, wrapping, and alignment.

## Scope

- Expose both animations only in the text On Enter and On Exit menus.
- Do not add dependencies, shaders, per-character React nodes, or new controls.
- Do not expose the text-only animations in counter or LaTeX menus.

## Edge Cases

- Progress is clamped to `0…1`.
- Empty text and zero-width text remain safe.
- Before enter and after exit, the text is invisible.
- At enter completion and before exit, rendering is identical to ordinary text.

## Verification

- Focused animator assertions cover enter/exit endpoints and mid-animation mode/progress.
- Focused reveal-math assertions cover the trace lead, fill lag, clamping, and reverse-safe progress.
- The production Electron/Vite build must pass.
