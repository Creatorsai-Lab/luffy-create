# Timed Stacked Media Effects Design

## Goal

Allow an image or video to use multiple unique media effects, with independent controls and scene-local start/end times, while keeping rendering and saved data lightweight.

## Data Model

Add `MediaEffectClip`, containing:

- `type`: any supported media effect except `none`
- `startAt` and `endAt`: scene-local seconds
- the existing effect-specific control properties

Image and video elements receive `mediaEffects?: MediaEffectClip[]`. An existing legacy single effect is exposed as one virtual clip from `0` through the scene duration. The first edit converts it to the array model. An explicit empty array means no effects and prevents the legacy value from reappearing.

New clips start at `0` and end at the current scene duration. UI edits clamp times to the scene range and keep `endAt >= startAt`. Rendering treats both boundaries as inclusive.

## Effects Panel

The selector remains at the top and acts as an Add Effect control. `None` is only its placeholder. Effects already present on the element are disabled in the selector, preventing duplicates.

Applied effects appear below in selection order as compact cards. Every card contains:

- effect name and Remove button
- Start At and End At number inputs with `0.1s` precision
- only the controls relevant to that effect

The global Reset Effect button is removed. Removing a card removes only that effect.

## Rendering

At each frame, resolve the array (or legacy fallback), normalize its values, and keep only clips whose interval contains the current scene-local time.

- Motion transforms compose in clip order.
- Lighting and weather overlays render in clip order.
- One active source-distortion effect renders directly.
- When Glitch and Vibration Distort overlap, use one lazily created scratch canvas to compose them; no persistent per-effect canvases or new dependency is added.

Normal and perspective image/video paths use the same resolver. Animation redraws are requested when at least one non-zero effect clip exists, including clips scheduled later in the scene.

## Compatibility and Validation

- Existing `mediaEffect*` fields remain readable for old projects.
- Removed or unknown legacy effects resolve to no effect.
- Invalid numeric values are clamped during resolution.
- Missing end times fall back to the scene duration in the panel and to infinity in renderer-only contexts.
- Duplicate saved effect types are normalized to the first occurrence.

## Verification

Focused tests cover legacy migration, duplicate removal, interval boundaries, active-effect filtering, and zero-intensity animation behavior. Production build and residual audits verify panel/render integration without adding packages.
