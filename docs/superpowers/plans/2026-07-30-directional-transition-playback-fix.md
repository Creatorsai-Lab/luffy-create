# Directional Transition Playback Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make incoming Flash Blur and Flicker Shake transitions begin on time with visible motion/blur and no static scene overlay.

**Architecture:** Add a pure timeline helper that identifies an incoming transition shortly before its boundary. Use that signal in `EditorCanvas` to pre-arm a bounded synchronous Canvas snapshot, eliminating the late React-effect and image-decode gate; retain `renderTransition` as the shared visual implementation and strengthen its directional geometry.

**Tech Stack:** TypeScript, React, Konva, Canvas 2D, Node assertions, esbuild, Electron/Vite

## Global Constraints

- The transition remains owned by the incoming scene.
- Flash Blur and Flicker Shake use no opacity cross-fade.
- Editor playback, Preview, and export continue using the same renderer calculations.
- Keep the snapshot cache bounded to two scenes.
- Add no dependencies and do not render two full offscreen scene trees on every editor frame.
- Preserve Duration, Speed, Hardness, and four Direction controls.

---

### Task 1: Pre-Arm Timing Signal

**Files:**
- Modify: `scripts/transitionTiming.test.ts`
- Modify: `src/utils/transitionTiming.ts`

**Interfaces:**
- Produces: `getUpcomingTransitionEntry(timeline, time, leadTime)`
- Consumes: existing `TransitionTimelineEntry` and `getEffectiveTransitionDuration`

- [ ] **Step 1: Add failing pre-arm assertions**

Add literal assertions for a scene-2 Flash Blur beginning at global time `5`:

```ts
assert.equal(getUpcomingTransitionEntry(flashTimeline, 4.89, 0.1), null)
assert.equal(getUpcomingTransitionEntry(flashTimeline, 4.9, 0.1)?.sceneId, 'scene-2')
assert.equal(getUpcomingTransitionEntry(flashTimeline, 4.99, 0.1)?.transition.type, 'flashBlur')
assert.equal(getUpcomingTransitionEntry(flashTimeline, 5, 0.1), null)
```

These catch incorrect ownership, arming too early, and attempting to pre-arm after the active transition window begins.

- [ ] **Step 2: Run the timing regression and verify RED**

```powershell
npx --no-install esbuild scripts/transitionTiming.test.ts --bundle --platform=node --format=cjs --outfile=.transition-timing-test.cjs
node .transition-timing-test.cjs
```

Expected: FAIL because `getUpcomingTransitionEntry` is not exported.

- [ ] **Step 3: Implement the minimal timing helper**

Use the same timeline lookup as active-frame resolution:

```ts
export function getUpcomingTransitionEntry(
  timeline: TransitionTimelineEntry[],
  time: number,
  leadTime = 0.1,
) {
  if (!timeline.length) return null
  const safeTime = Math.max(0, Number.isFinite(time) ? time : 0)
  const current = findTimelineEntry(timeline, safeTime)
  const next = timeline[current.sceneIndex + 1]
  const lead = Math.max(0, Number.isFinite(leadTime) ? leadTime : 0)
  return next && getEffectiveTransitionDuration(next) > 0 &&
    safeTime < current.endTime && safeTime >= current.endTime - lead
    ? next
    : null
}
```

- [ ] **Step 4: Run the timing regression and verify GREEN**

Run the commands from Step 2. Expected: `transition timing tests passed`.

- [ ] **Step 5: Commit the timing slice**

```powershell
git add -- scripts/transitionTiming.test.ts src/utils/transitionTiming.ts
git commit -m "fix: pre-arm incoming scene transitions"
```

### Task 2: Visible Directional Motion

**Files:**
- Modify: `scripts/directionalTransitions.test.ts`
- Modify: `src/engine/directionalTransitions.ts`

**Interfaces:**
- Consumes: `getDirectionalTransitionState`
- Produces: stronger `getDirectionalTransitionGeometry` values used by editor, Preview, and export

- [ ] **Step 1: Add failing visible-motion assertions**

At `640×360`, `50%` hardness, and peak Flash Blur progress, assert:

```ts
const peakGeometry = getDirectionalTransitionGeometry(
  'flashBlur',
  getDirectionalTransitionState('flashBlur', 0.5, 'right', 1, 50),
  640,
  360,
  50,
)
assert.ok(peakGeometry.dx >= 20)
assert.ok(peakGeometry.streakDx >= 25)
assert.ok(peakGeometry.blur >= 7)
```

Extend the recording context to capture filters and translations, then assert a pre-midpoint frame draws scene 1 with blur and directional movement, a post-midpoint frame draws scene 2, and progress `1` settles scene 2 at zero movement/blur.

- [ ] **Step 2: Run the directional regression and verify RED**

```powershell
npx --no-install esbuild scripts/directionalTransitions.test.ts --bundle --platform=node --format=cjs --loader:.css=empty --outfile=.directional-transitions-test.cjs
node .directional-transitions-test.cjs
```

Expected: FAIL because current peak travel, streak, and blur are below the literal visible-motion thresholds.

- [ ] **Step 3: Strengthen only Flash Blur geometry**

Update the compact geometry constants:

```ts
const travel = span * (type === 'flashBlur' ? 0.12 : 0.025)
const streakDx = state.streakX * span * 0.16
const streakDy = state.streakY * span * 0.16
const blur = type === 'flashBlur'
  ? activity * (5 + clamp(hardness, 0, 100) * 0.18)
  : 0
```

Keep the edge-cover scale calculation and scene hard-swap behavior unchanged.

- [ ] **Step 4: Run the directional regression and verify GREEN**

Run the commands from Step 2. Expected: `directional transition tests passed`.

- [ ] **Step 5: Commit the renderer slice**

```powershell
git add -- scripts/directionalTransitions.test.ts src/engine/directionalTransitions.ts
git commit -m "fix: strengthen directional transition motion"
```

### Task 3: Synchronous Editor Playback Snapshot

**Files:**
- Modify: `src/components/canvas/captureStageToCanvas.ts`
- Modify: `src/components/canvas/EditorCanvas.tsx`
- Modify: `scripts/directionalTransitions.test.ts`

**Interfaces:**
- Consumes: `getUpcomingTransitionEntry`
- Consumes: `captureStageToCanvas(stage, canvas, width, height)`
- Produces: a bounded `Map<string, HTMLCanvasElement>` of outgoing scene frames for directional editor playback

- [ ] **Step 1: Add a Canvas-valued cache regression**

Verify the existing bounded-cache function preserves object identity and evicts the oldest Canvas-like value:

```ts
const canvasSnapshots = new Map<string, { id: string }>()
const first = { id: 'first' }
rememberRecentSnapshot(canvasSnapshots, 'scene-1', first)
rememberRecentSnapshot(canvasSnapshots, 'scene-2', { id: 'second' })
rememberRecentSnapshot(canvasSnapshots, 'scene-3', { id: 'third' })
assert.equal(canvasSnapshots.has('scene-1'), false)
assert.equal(canvasSnapshots.get('scene-2')?.id, 'second')
```

- [ ] **Step 2: Generalize the bounded cache and verify GREEN**

Change the signature without changing its algorithm:

```ts
export function rememberRecentSnapshot<T>(
  cache: Map<string, T>,
  key: string,
  value: T,
  limit = 2,
)
```

Run the directional regression. Expected: pass with both strings and object snapshots.

- [ ] **Step 3: Replace the directional data-URL gate**

In `EditorCanvas`:

- Add `transitionCanvasSnapshotsRef = useRef(new Map<string, HTMLCanvasElement>())`.
- During the `0.1s` pre-arm window, reuse or create one Canvas for the outgoing scene and call `captureStageToCanvas`.
- Set directional overlay metadata before the boundary, but keep `activeSceneId` on the current scene until `playhead >= transitionStart`.
- At and after the boundary, read the outgoing Canvas directly in `drawDirectionalPreview`.
- Remove `transitionFromImageRef`, `transitionImageReady`, the `Image.onload` effect, and the directional static `<img>` fallback.
- Keep the existing string snapshot path for non-directional transitions.
- Clear/prune the Canvas cache wherever the string cache is cleared/pruned.

- [ ] **Step 4: Run focused regressions and production build**

```powershell
npx --no-install esbuild scripts/transitionTiming.test.ts --bundle --platform=node --format=cjs --outfile=.transition-timing-test.cjs
node .transition-timing-test.cjs
npx --no-install esbuild scripts/directionalTransitions.test.ts --bundle --platform=node --format=cjs --loader:.css=empty --outfile=.directional-transitions-test.cjs
node .directional-transitions-test.cjs
npm run build -- --logLevel error
```

Expected: both regression scripts pass and the Electron production build exits `0`.

- [ ] **Step 5: Remove generated bundles and commit**

Delete only:

```text
D:\luffy-editor\.transition-timing-test.cjs
D:\luffy-editor\.directional-transitions-test.cjs
```

Then:

```powershell
git add -- src/components/canvas/captureStageToCanvas.ts src/components/canvas/EditorCanvas.tsx scripts/directionalTransitions.test.ts
git commit -m "fix: render transitions from synchronous snapshots"
```

### Task 4: Final Verification

**Files:**
- Verify: all files changed by Tasks 1–3

**Interfaces:**
- Consumes: completed timing, renderer, and editor playback slices
- Produces: reviewed transition fix ready for user testing

- [ ] **Step 1: Inspect the scoped diff**

```powershell
git diff --check df578de..HEAD
git diff --stat df578de..HEAD
```

Expected: only the planned timing, transition renderer, Canvas helper, editor playback, and focused test files.

- [ ] **Step 2: Run fresh focused regressions and build**

Run both focused regression scripts and `npm run build -- --logLevel error` again. Expected: all exit `0`.

- [ ] **Step 3: Request read-only code review**

Review the range `df578de..HEAD` against:

```text
docs/superpowers/specs/2026-07-30-directional-transition-playback-fix-design.md
```

Fix every Critical or Important finding, rerun verification, and keep unrelated user changes untouched.
