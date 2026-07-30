# Timed Media Zoom Effects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add lightweight, stackable Zoom In and Zoom Out media effects whose scale is driven by effect duration and speed around one of five selectable anchors.

**Architecture:** Extend the existing media-effect clip schema and renderer instead of adding a new animation system. A small pure transform helper will calculate scale and anchor, while the existing timed effect loop applies the Canvas transform and the existing panel edits its settings.

**Tech Stack:** TypeScript, React, Canvas 2D, Node assertions, esbuild, Electron/Vite

## Global Constraints

- Each zoom runs once from its effect clip's `startAt` through `endAt`.
- Speed is constant, and zoom distance is uncapped.
- Scale never falls below `1`.
- Support Center, Top Left, Top Right, Bottom Right, and Bottom Left.
- Hide Intensity, Hardness, and Blend for zoom effects.
- Add no dependency, intermediate canvas, filter, or per-frame allocation.

---

### Task 1: Zoom Data Model and Pure Transform

**Files:**
- Modify: `scripts/mediaVisualEffects.test.ts`
- Modify: `src/types/editor.ts`
- Modify: `src/utils/defaults.ts`
- Modify: `src/engine/mediaEffects.ts`

**Interfaces:**
- Produces: `MediaZoomPosition`
- Produces: `getMediaZoomTransform(type, elapsed, duration, speed, position, width, height)`
- Produces: persisted `mediaEffectZoomPosition?: MediaZoomPosition`

- [ ] **Step 1: Write the failing regression assertions**

Add assertions that `zoomIn` and `zoomOut` normalize, new clips default to `center`, both effects require animation, and the pure transform helper returns:

```ts
assert.deepEqual(getZoom('zoomIn', 2, 4, 1, 'center', 100, 80), {
  scale: 1.24, anchorX: 50, anchorY: 40,
})
assert.deepEqual(getZoom('zoomOut', 2, 4, 1, 'bottomRight', 100, 80), {
  scale: 1.24, anchorX: 100, anchorY: 80,
})
```

Also assert all five anchors and start/end values using a fixed `0.12` scale-per-second rate at `1x`.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npx --no-install esbuild scripts/mediaVisualEffects.test.ts --bundle --platform=node --format=cjs --loader:.css=empty --outfile=.media-effects-test.cjs
node .media-effects-test.cjs
```

Expected: assertion failure because zoom types/defaults/helper do not exist.

- [ ] **Step 3: Add types, defaults, persistence, and transform math**

Add:

```ts
export type MediaZoomPosition = 'center' | 'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft'
```

Add `zoomIn` and `zoomOut` to `MEDIA_EFFECT_TYPES`, add `mediaEffectZoomPosition?: MediaZoomPosition`, default it to `center`, and copy it through `EFFECT_SETTING_KEYS`.

Export a pure helper with finite input normalization:

```ts
export function getMediaZoomTransform(
  type: 'zoomIn' | 'zoomOut',
  elapsed: number,
  duration: number,
  speed: number,
  position: MediaZoomPosition,
  width: number,
  height: number,
) {
  const time = type === 'zoomIn' ? elapsed : Math.max(0, duration - elapsed)
  const scale = 1 + Math.max(0, time) * clamp(speed, 0.1, 5) * 0.12
  const [anchorX, anchorY] = zoomAnchor(position, width, height)
  return { scale, anchorX, anchorY }
}
```

Resolve duration and zoom position into each active effect, treat zoom as visible independent of hidden intensity, and apply:

```ts
ctx.translate(anchorX, anchorY)
ctx.scale(scale, scale)
ctx.translate(-anchorX, -anchorY)
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the same esbuild and Node commands. Expected: all assertions pass.

- [ ] **Step 5: Commit the engine slice**

```powershell
git add -- scripts/mediaVisualEffects.test.ts src/types/editor.ts src/utils/defaults.ts src/engine/mediaEffects.ts
git commit -m "feat: add timed media zoom transforms"
```

### Task 2: Effects Menu Controls

**Files:**
- Modify: `src/components/panels/MediaEffectsPanel.tsx`
- Modify: `src/components/panels/MediaEffectCard.tsx`

**Interfaces:**
- Consumes: `MediaZoomPosition`
- Consumes: `mediaEffectZoomPosition`

- [ ] **Step 1: Add zoom choices to the effect menu**

Add:

```ts
{ label: 'Zoom In', value: 'zoomIn', description: 'Continuous push toward a chosen point' }
{ label: 'Zoom Out', value: 'zoomOut', description: 'Continuous pull back from a chosen point' }
```

- [ ] **Step 2: Add the position control and simplify zoom cards**

For `zoomIn` and `zoomOut`, keep Start At, End At, Speed, Zoom Position, and Remove. Hide Intensity, Hardness, and Blend and render one select with `MediaZoomPosition` values:

```ts
const ZOOM_POSITIONS = [
  { label: 'Center', value: 'center' },
  { label: 'Top Left', value: 'topLeft' },
  { label: 'Top Right', value: 'topRight' },
  { label: 'Bottom Right', value: 'bottomRight' },
  { label: 'Bottom Left', value: 'bottomLeft' },
] satisfies { label: string; value: MediaZoomPosition }[]
```

- [ ] **Step 3: Run focused regression and production build**

Run:

```powershell
npx --no-install esbuild scripts/mediaVisualEffects.test.ts --bundle --platform=node --format=cjs --loader:.css=empty --outfile=.media-effects-test.cjs
node .media-effects-test.cjs
npm run build -- --logLevel error
```

Expected: focused assertions pass and Electron production build exits `0`.

- [ ] **Step 4: Remove the generated focused-test bundle**

Delete only `D:\luffy-editor\.media-effects-test.cjs` after verifying it is inside the repository.

- [ ] **Step 5: Commit the UI slice**

```powershell
git add -- src/components/panels/MediaEffectsPanel.tsx src/components/panels/MediaEffectCard.tsx
git commit -m "feat: expose timed zoom effect controls"
```

### Task 3: Final Verification

**Files:**
- Verify: all files changed by Tasks 1–2

**Interfaces:**
- Consumes: completed engine and UI slices
- Produces: verified implementation ready for user testing

- [ ] **Step 1: Inspect the scoped diff**

Run:

```powershell
git diff HEAD~2 --check
git diff HEAD~2 --stat
```

Expected: no whitespace errors; only the planned test, type, default, renderer, and panel files appear.

- [ ] **Step 2: Run fresh verification**

Run the focused regression and production build once more. Expected: both exit `0`.

- [ ] **Step 3: Review against the approved design**

Confirm zoom timing, speed-only distance, all five positions, stackability, hidden irrelevant controls, and absence of added dependencies or render buffers.
