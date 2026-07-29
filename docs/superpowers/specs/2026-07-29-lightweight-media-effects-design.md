# Lightweight Media Effects Design

## Goal

Improve the existing media effects without adding a new framework: remove three low-value effects, replace Glitch with a retro RGB/slice treatment, and add a shared vignette adjustment for images and videos.

## Scope

- Remove `motionBlur`, `cloudy`, and `smoke` from media-effect types, controls, dispatch, and renderer code.
- Treat those values as `none` when loading older project data.
- Keep Glitch in the existing Canvas2D path and add an axis control: `horizontal` or `vertical`.
- Match the supplied reference with deterministic displaced bands, cyan/magenta channel ghosts, dark tracking cuts, and thin short colored lines.
- Reuse Intensity, Speed, Hardness, Blend, and Size for glitch strength and character.
- Put Vignette inside image and video Adjustments with Enabled, Color, Size, Hardness/Opacity, and Fade controls.
- Reuse the existing video vignette fields where possible and render both media types through one helper.

## Architecture

The existing `mediaEffects.ts` renderer remains the only dynamic-effect engine. Glitch is rewritten in place and uses clipped redraws, avoiding offscreen canvases and dependencies. Vignette rendering lives beside the existing image adjustment helpers and is called by both image and video canvas renderers.

Removed effect values are normalized at the renderer and panel boundaries so legacy project JSON remains safe.

## Defaults

- Glitch axis: horizontal.
- Vignette color: `#000000`.
- Vignette size: `50%`.
- Vignette hardness/opacity: `50%`.
- Vignette fade: `65%`.

## Verification

- Built-in assertion tests cover removed-effect normalization, glitch axis behavior, and vignette gradient calculations.
- TypeScript compilation and the production Electron build must pass.
- No package dependency is added.
