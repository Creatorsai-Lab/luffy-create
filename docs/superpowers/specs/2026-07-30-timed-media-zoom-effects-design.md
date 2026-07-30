# Timed Media Zoom Effects Design

## Goal

Add stackable **Zoom In** and **Zoom Out** effects for images and videos.

## Behavior

- Each zoom runs once from its effect clip's `startAt` through `endAt`.
- Speed is constant throughout the active interval.
- Zoom distance is uncapped and equals elapsed active time multiplied by speed and a fixed visual rate.
- Zoom In starts at scale `1` and enlarges continuously.
- Zoom Out starts enlarged by the amount its full duration and speed produce, then returns continuously to scale `1` at `endAt`.
- Both effects always use a scale of at least `1`, preventing exposed empty edges.
- Multiple effects continue to stack through the existing motion-transform pipeline.

## Controls

Both zoom effects show:

- Start At
- End At
- Speed (`0.1–5.0×`)
- Zoom Position: Center, Top Left, Top Right, Bottom Right, Bottom Left
- Remove

Intensity, Hardness, and Blend are hidden for zoom effects because speed and duration alone determine the zoom distance.

## Data and Rendering

- Add `zoomIn` and `zoomOut` to `MEDIA_EFFECT_TYPES`.
- Add optional `mediaEffectZoomPosition` with a default of `center`.
- Preserve the setting through effect normalization and storage.
- Resolve the selected position to a Canvas transform anchor and scale around that anchor.
- Supply each active effect's clip duration to the motion transform so Zoom Out can calculate its starting scale.
- Add no dependency, intermediate canvas, filter, or per-frame allocation.

## Verification

- Test effect normalization and default clip creation.
- Test scale values at start, midpoint, and end for both effects.
- Test that higher speed and longer duration produce proportionally more zoom.
- Test all five anchor positions.
- Test effect timing and stacking remain compatible.
- Run the focused media-effects regression and production Electron build.
