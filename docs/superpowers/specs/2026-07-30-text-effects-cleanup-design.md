# Text Effects Cleanup Design

## Goal

Keep only the useful `Glow` and `Hollow` text effects while removing the duplicated or non-functional `Shadow`, `Outline`, `Bubble`, and `Glitch` effects from both text editing surfaces and the rendering model.

## Design

- Reduce `TextEffectType` to `glow | hollow`.
- Show the same two effects in `TextPanel` and `TextEffectsPanel`.
- Remove the dedicated effect-renderer branches for Shadow and Outline. The existing text shadow and text stroke controls remain unchanged.
- Remove Bubble and Glitch from the effect model and UI. They currently have no renderer implementation.
- Filter legacy effect values when an effect is edited so older projects remain loadable and unsupported values disappear without a project migration.
- Share the two-option effect catalog between both panels to avoid duplicate definitions.

## Scope

This cleanup does not remove text shadows, text strokes, outline-reveal animations, or any other text styling feature. It only removes the four named entries from the optional text-effects selector.

## Verification

- Type-level tests confirm only Glow and Hollow are exposed.
- UI/source tests confirm both panels use the shared catalog.
- Renderer tests confirm Glow and Hollow still resolve correctly and removed effect branches no longer exist.
- The project typecheck/build remains clean.
