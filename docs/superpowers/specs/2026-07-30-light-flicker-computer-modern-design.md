# Light Flicker and Computer Modern Roman Design

## Goal

Add a lightweight thunder-like Light Flicker media effect and expose Computer Modern Roman in every editor font selector without adding a dependency.

## Light Flicker

`lightFlicker` becomes a normal `MediaEffectType`, so it automatically inherits multiple-effect stacking, per-effect removal, and scene-local Start At/End At timing.

The renderer produces irregular flashes from a deterministic time-based sequence. It must not call `Math.random()` per frame: the same project time must always produce the same flash in preview and export. Speed controls both how often flashes occur and how quickly each flash rises and fades.

Each flash is a wide full-media colored wash rendered with Canvas `screen` compositing. The effect remains an overlay and does not require a scratch canvas, persistent bitmap, particle system, or dependency.

The effect card exposes only these relevant controls:

- Color: `mediaEffectColor`
- Fade: `mediaEffectBlend`, where a larger value creates a longer, softer decay
- Opacity: `mediaEffectHardness`
- Speed: `mediaEffectSpeed`

The generic Intensity control is hidden for Light Flicker to avoid a second opacity control. Internally, a non-zero default intensity keeps the existing animation-redraw predicate compatible.

## Computer Modern Roman

The selectable family name is exactly `Computer Modern Roman`.

Reuse the TeX Roman faces already shipped by the existing `mathjax-full` dependency:

- `MathJax_Main-Regular.woff` for weight 400
- `MathJax_Main-Bold.woff` for weight 700
- `MathJax_Main-Italic.woff` for italic 400

Register these three faces through concise `@font-face` rules in `src/index.css`, add the family to `FONT_FAMILIES`, and add its regular/bold weights to `CANVAS_FONTS` so Konva and Canvas preload it like the other bundled fonts. No new npm package or copied binary is added; Vite emits only the three referenced faces, approximately 90 KB total.

The existing MathJax LaTeX renderer is unchanged. Normal text, counters, chart labels, subtitles, and AI font normalization receive the new family automatically through the shared list.

## Validation

Focused assertions cover:

- `lightFlicker` normalization as a supported media effect
- deterministic irregular flash strength for equal times
- Speed changing flash frequency/tempo
- zero strength outside a flash window
- Computer Modern Roman appearing in `FONT_FAMILIES`

Production build verification confirms the WOFF assets resolve and the renderer/UI integration compiles. Generated test and TypeScript cache files are removed, and unrelated user changes remain untouched.
