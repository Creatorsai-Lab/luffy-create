# Directional Flash Transitions Design

## Goal

Add two smooth, lightweight scene transitions:

- **Flash Blur**: a directional motion smear enters a brief overexposed flash, switches scenes at the flash peak, then resolves the incoming scene.
- **Flicker Shake**: outgoing and incoming scenes alternate through deterministic hard cuts while directional shake and restrained light pulses hide the final switch.

Neither transition crossfades scene opacity.

## Controls

Both transitions use the existing duration control (`0.1–2.0s`) and add:

- **Direction**: `left`, `right`, `up`, or `down`.
- **Speed**: `0.25–3.0`, default `1`. Flash Blur uses it to shape how quickly the flash reaches and leaves its peak. Flicker Shake uses it to control hard-cut frequency.
- **Hardness**: `0–100`, default `50`. Flash Blur maps it to streak distance and flash strength. Flicker Shake maps it to shake distance and light-pulse strength.

The settings are optional in stored projects so old projects remain compatible. Missing values resolve to the defaults above.

## Rendering

### Shared state

A small pure helper converts transition progress and controls into deterministic visual state. It clamps invalid values and returns:

- which scene is visible;
- primary and perpendicular offsets;
- directional streak distance;
- flash/light strength.

Preview and export consume this same state, preventing timing or hard-cut differences.

### Flash Blur

The outgoing scene remains fully opaque during the first half. Its directional streak and white flash rise smoothly toward the midpoint. At the midpoint, the renderer switches directly to the incoming scene. The incoming scene remains fully opaque while the streak and flash resolve in reverse.

Directional blur is drawn with a small fixed number of translated scene samples rather than an image-processing dependency. A full-opacity base frame prevents darkening. The white flash is an overlay, not scene-opacity fading.

### Flicker Shake

The helper selects complete outgoing or incoming frames using a speed-controlled deterministic pulse sequence. There is no fractional scene mixing. Direction controls the primary shake axis; a smaller deterministic perpendicular offset keeps the movement organic. The shake and light pulse use a smooth envelope that is zero at both endpoints, and the final portion always holds the incoming scene.

## Integration

- Extend `TransitionType` and `SceneTransition` with the two types and optional `speed` and `hardness`.
- Add both entries to the existing transition registry and show Direction, Speed, and Hardness only when supported.
- Extend the existing Canvas 2D transition renderer; add no package or shader dependency.
- Replace the special-transition HTML preview styling with a canvas overlay that captures the currently rendered incoming Konva stage at preview resolution and calls the same renderer used by export.
- Preserve the existing preview path for current transitions unless sharing the new overlay makes the code smaller without changing their behavior.
- Extend AI transition allowlists so saved or AI-created commands do not discard the new types and controls.

## Performance and Compatibility

- Use a fixed, low sample count for streaks and allocate no canvases per rendered export frame.
- Reuse one preview canvas and one decoded outgoing snapshot during a transition.
- Keep all random-looking flicker and shake deterministic from progress; exported frames and repeated previews must match.
- Existing transitions and projects must render unchanged.

## Verification

- Unit-test endpoint stability, midpoint hard cuts, direction signs, speed-controlled flicker frequency, hardness scaling, clamping, and deterministic output.
- Test the transition registry and panel control visibility.
- Verify focused transition tests and the production Electron build.
- Manually preview both transitions in all four directions and compare the Flash Blur rhythm with `flash-blur-transition.mp4`.
