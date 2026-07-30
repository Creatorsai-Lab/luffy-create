# Directional Transition Playback Fix Design

## Goal

Make Flash Blur and Flicker Shake visibly and reliably play at the start of an incoming scene in editor playback, Preview, and export.

## Root Cause

The transition is correctly stored on the incoming scene and its timeline window is correct. The live editor fails at the rendering boundary:

- Playback changes the current scene before the transition overlay is created.
- The overlay is created in a later React effect.
- Flash Blur then waits for a data-URL image to decode before its Canvas renderer can draw.
- During those delays, the outgoing scene appears as a static image over the incoming scene.
- Existing default blur and directional travel are only a few pixels, making remaining rendered motion difficult to perceive.

## Chosen Approach

Pre-arm the incoming transition shortly before the scene boundary and use a synchronous Canvas snapshot of the outgoing scene.

- The transition remains owned by the incoming scene.
- Before the boundary, capture the final visible frame of the outgoing scene into a small reusable Canvas cache.
- Prepare the transition metadata during that same lead window.
- At the boundary, render the transition Canvas immediately; do not wait for `Image.onload` or decode a data URL.
- Keep the cache bounded to the two most recent scenes.
- Do not render two full offscreen scene trees on every editor frame.

## Flash Blur Motion

Flash Blur has no opacity cross-fade.

- First half: draw only scene 1, moving and streak-blurring it in the selected direction.
- Midpoint: use the existing white flash to cover the hard source swap.
- Second half: draw only scene 2 from the directional offset, then reduce blur and motion smoothly to zero.
- Increase default-visible travel and blur while retaining edge-cover scale.
- Four directions remain supported.

## Flicker Shake Motion

Flicker Shake keeps hard scene selection with no opacity cross-fade.

- Use the pre-armed synchronous snapshot so its first frame cannot arrive late.
- Keep deterministic flicker/shake behavior.
- Preserve four directions and existing speed/hardness controls.

## Controls

No new controls or schema fields:

- Duration controls the complete transition window.
- Speed controls motion/flicker response within that window.
- Hardness controls blur, flash, travel, and shake strength.
- Direction controls the incoming scene's motion axis.

## Shared Rendering

- Continue using `renderTransition` as the visual source of truth.
- Editor playback supplies a synchronous cached outgoing Canvas plus the live incoming scene Canvas.
- Preview and export keep using the same renderer and state calculations.
- Remove the live editor's data-URL decode gate and static `<img>` fallback for directional transitions.

## Verification

- Test that an incoming transition is discoverable and pre-armable before its scene boundary.
- Test exact transition ownership: scene 2 transition connects scene 1 to scene 2.
- Test Flash Blur uses scene 1 before midpoint and scene 2 from midpoint onward.
- Record Canvas operations at representative progress values and assert nonzero directional translation and blur.
- Test the end frame settles on scene 2 with zero motion and blur.
- Test Flicker Shake remains deterministic.
- Run transition timing regressions, directional renderer regressions, and the production Electron build.
- Keep generated test bundles out of the repository.
