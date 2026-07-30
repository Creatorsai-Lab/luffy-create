# Media Grain Adjustment Design

## Goal

Add fine, dense procedural grain to both images and videos with three controls: color, size, and opacity/hardness. The result should resemble the supplied reference while keeping rendering and code size small.

## Controls and Data

- `grainColor`: color picker, default black.
- `grainSize`: 1–8 px, default 1 px.
- `grainOpacity`: 0–100% in the UI and 0–1 in stored data, default 0.
- Opacity zero disables grain, so no separate enable flag is needed.
- A shared `MediaGrainControls` component is used by image and video adjustment panels.

## Rendering

- Generate a small deterministic transparent noise tile from the selected color and size.
- Cache a bounded number of tiles by color and size.
- Repeat the tile across the media with a Canvas pattern and apply the selected opacity.
- Draw grain after color adjustments and before vignette, so it inherits edge shading naturally.
- Use the same renderer for images and videos.
- Do not use per-frame pixel reads, external texture assets, or continuously regenerate noise. This keeps video playback lightweight.

## Reset and Compatibility

- New images and videos default to black, 1 px grain at zero opacity.
- Image and video adjustment resets restore those defaults.
- Existing projects require no migration because all fields are optional and zero opacity is the fallback.

## Verification

- Unit tests cover deterministic tile generation, size mapping, opacity clamping, and the zero-opacity fast path.
- Source integration tests confirm both panels expose the shared controls and both render paths call the grain renderer once.
- Existing media-effect and vignette tests continue to pass.
- The project typecheck/build remains clean.
