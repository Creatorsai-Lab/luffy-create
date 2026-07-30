# Timed Stacked Media Effects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let images and videos hold multiple unique effects, show each as a removable settings card, and apply each effect only within its scene-local start/end interval.

**Architecture:** Store effect clips in an optional ordered array while retaining a runtime fallback for legacy single-effect projects. Resolve and normalize clips once per frame, compose motion and overlay effects in order, and use one lazy scratch canvas only when both source-distortion effects overlap.

**Tech Stack:** TypeScript, React, Zustand, Canvas2D, Konva, esbuild/Node focused assertions.

## Global Constraints

- Add no dependency.
- Keep existing single-effect project data readable.
- Treat effect times as scene-local seconds with inclusive boundaries.
- Prevent duplicate effect types in both UI and renderer normalization.
- Keep rendering lightweight; create scratch storage only for overlapping Glitch and Vibration Distort.

---

### Task 1: Effect Clip Model and Timing Resolver

**Files:**
- Modify: `src/types/editor.ts`
- Modify: `src/engine/mediaEffects.ts`
- Modify: `src/utils/defaults.ts`
- Modify: `scripts/mediaVisualEffects.test.ts`

**Interfaces:**
- Produces: `MediaEffectClip`, `getMediaEffectClips(el)`, and `getActiveMediaEffects(el, localTime)`.
- Preserves: legacy `mediaEffect*` properties as fallback input.

- [ ] **Step 1: Write failing resolver tests**

Add assertions that express the desired public API:

```ts
const clips = effects.getMediaEffectClips({
  type: 'image',
  mediaEffects: [
    { type: 'glitch', startAt: 1.5, endAt: 4 },
    { type: 'glitch', startAt: 0, endAt: 5 },
    { type: 'rain', startAt: 0, endAt: 2 },
  ],
} as never)
assert.deepEqual(clips.map(clip => clip.type), ['glitch', 'rain'])
assert.deepEqual(
  effects.getActiveMediaEffects({ type: 'image', mediaEffects: clips } as never, 1.5).map(clip => clip.type),
  ['glitch', 'rain'],
)
assert.deepEqual(
  effects.getActiveMediaEffects({ type: 'image', mediaEffects: clips } as never, 4).map(clip => clip.type),
  ['glitch'],
)
```

Also assert that an explicit `mediaEffects: []` suppresses a legacy `mediaEffect`, while an undefined array converts a valid legacy effect into one clip starting at `0` and ending at infinity.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npx --no-install esbuild scripts\mediaVisualEffects.test.ts --bundle --platform=node --format=cjs --outfile=.media-visual-test.cjs
node .media-visual-test.cjs
```

Expected: failure because `getMediaEffectClips` and `getActiveMediaEffects` do not exist.

- [ ] **Step 3: Add the saved model**

Refactor the current control interface without renaming persisted properties:

```ts
export interface MediaEffectSettings {
  mediaEffectAxis?: MediaEffectAxis
  mediaEffectIntensity?: number
  mediaEffectSpeed?: number
  mediaEffectHardness?: number
  mediaEffectDirection?: MediaEffectDirection
  mediaEffectBlend?: number
  mediaEffectColor?: string
  mediaEffectColorOpacity?: number
  mediaEffectSize?: number
  mediaEffectTarget?: MediaEffectTarget
  mediaEffectFocusX?: number
  mediaEffectFocusY?: number
}

export interface MediaEffectClip extends MediaEffectSettings {
  type: Exclude<MediaEffectType, 'none'>
  startAt: number
  endAt: number
}

export interface MediaEffectControls extends MediaEffectSettings {
  mediaEffect?: MediaEffectType
  mediaEffects?: MediaEffectClip[]
}
```

Add `mediaEffects: []` to new image and video defaults.

- [ ] **Step 4: Implement normalized clip resolution**

Export:

```ts
export function getMediaEffectClips(el: MediaElement): MediaEffectClip[]
export function getActiveMediaEffects(el: MediaElement, localTime: number): MediaEffectClip[]
```

`getMediaEffectClips` must:

- prefer any array, including an empty array;
- remove unknown/`none` types and later duplicates;
- clamp start to at least zero and end to at least start;
- copy all effect settings;
- otherwise convert the valid legacy effect to one `0..Infinity` clip;
- preserve the legacy video shake/distortion mapping.

`getActiveMediaEffects` filters with `localTime >= startAt && localTime <= endAt`.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run the two commands from Step 2. Expected: exit code `0`.

- [ ] **Step 6: Commit the model**

```powershell
git add src/types/editor.ts src/engine/mediaEffects.ts src/utils/defaults.ts scripts/mediaVisualEffects.test.ts
git commit -m "feat: add timed media effect clips"
```

---

### Task 2: Multiple-Effect Canvas Composition

**Files:**
- Modify: `src/engine/mediaEffects.ts`
- Modify: `src/components/canvas/elements/ImageKonva.tsx`
- Modify: `src/components/canvas/elements/VideoKonva.tsx`
- Modify: `scripts/mediaVisualEffects.test.ts`

**Interfaces:**
- Consumes: normalized effect clips from Task 1.
- Produces: `drawMediaWithEffects(...)`; existing image/video render paths call it.

- [ ] **Step 1: Add failing animation/timing tests**

Assert:

```ts
assert.equal(effects.mediaEffectRequiresAnimation({
  type: 'image',
  mediaEffects: [{ type: 'glitch', startAt: 2, endAt: 4, mediaEffectIntensity: 0.5 }],
} as never), true)
assert.equal(effects.mediaEffectRequiresAnimation({
  type: 'image',
  mediaEffects: [{ type: 'glitch', startAt: 0, endAt: 4, mediaEffectIntensity: 0 }],
} as never), false)
```

Expected RED: the existing predicate only reads the legacy single effect.

- [ ] **Step 2: Implement ordered composition**

Replace single-state rendering with:

```ts
export function drawMediaWithEffects(
  ctx: CanvasRenderingContext2D,
  el: MediaElement,
  width: number,
  height: number,
  localTime: number,
  fns: MediaDrawFns,
): void
```

Inside it:

1. resolve active clips;
2. cumulatively call `applyMotionTransform` for all active motion effects;
3. draw the base once when no source distortion is active;
4. render one Glitch/Vibration effect directly;
5. when both are active, render the first into a lazy module-level scratch canvas and use that canvas as `MediaDrawFns` for the second;
6. render each active light/weather overlay in clip order;
7. balance every `save()` with `restore()`.

Convert each clip to the existing clamped `EffectState` with a small `resolveEffectState(clip)` helper.

- [ ] **Step 3: Update render consumers**

Update image and video normal/perspective paths to call `drawMediaWithEffects`. Add `el.mediaEffects` to the image RAF and perspective-source dependency lists while retaining legacy dependencies.

- [ ] **Step 4: Run focused tests and production build**

```powershell
npx --no-install esbuild scripts\mediaVisualEffects.test.ts --bundle --platform=node --format=cjs --outfile=.media-visual-test.cjs
node .media-visual-test.cjs
npm run build
```

Expected: test and build exit `0`.

- [ ] **Step 5: Commit renderer composition**

```powershell
git add src/engine/mediaEffects.ts src/components/canvas/elements/ImageKonva.tsx src/components/canvas/elements/VideoKonva.tsx scripts/mediaVisualEffects.test.ts
git commit -m "feat: compose timed media effects"
```

---

### Task 3: Stacked Timed Effect Cards

**Files:**
- Modify: `src/components/panels/MediaEffectsPanel.tsx`
- Create: `src/components/panels/MediaEffectCard.tsx`
- Modify: `src/utils/defaults.ts`

**Interfaces:**
- Consumes: `MediaEffectClip`, `getMediaEffectClips`, current scene duration, and existing shared panel controls.
- Produces: ordered unique effect selection, card updates, individual removal, and 0.1-second time inputs.

- [ ] **Step 1: Add a clip factory**

Export a concise helper from defaults:

```ts
export function makeMediaEffectClip(
  type: MediaEffectClip['type'],
  endAt: number,
): MediaEffectClip
```

It returns the existing default settings plus `{ type, startAt: 0, endAt }`.

- [ ] **Step 2: Replace the selector behavior**

In `MediaEffectsPanel`:

- read `sceneDuration` from `getCurrentScene()?.duration ?? 5`;
- resolve displayed clips and replace infinite legacy end times with `sceneDuration`;
- render a selector with `value=""` and `Add effect…` placeholder;
- disable every option whose type is already used;
- on selection append `makeMediaEffectClip(type, sceneDuration)`;
- on every write store `mediaEffects` and set legacy `mediaEffect: 'none'`;
- remove `RotateCcw` and the global reset button.

- [ ] **Step 3: Build a focused card component**

`MediaEffectCard` receives:

```ts
interface Props {
  clip: MediaEffectClip
  label: string
  sceneDuration: number
  onChange: (clip: MediaEffectClip) => void
  onRemove: () => void
}
```

The card header contains its label and a `Trash2` Remove button. Use `NumberInput` for:

```tsx
<NumberInput value={clip.startAt} min={0} max={clip.endAt} step={0.1} />
<NumberInput value={clip.endAt} min={clip.startAt} max={sceneDuration} step={0.1} />
```

Clamp start/end before calling `onChange`. Move the current conditional Intensity, Speed, Hardness, Blend, Glitch axis, Direction, Color, Opacity, Size, Target, and Focus controls into the card, reading and updating the clip rather than the element.

- [ ] **Step 4: Verify panel behavior through build and source audit**

Run:

```powershell
npm run build
rg -n "Reset Effect|mediaEffect: e.target.value" src\components\panels\MediaEffectsPanel.tsx src\components\panels\MediaEffectCard.tsx
```

Expected: build exit `0`; audit returns no old reset/single-selector handler.

- [ ] **Step 5: Commit the UI**

```powershell
git add src/components/panels/MediaEffectsPanel.tsx src/components/panels/MediaEffectCard.tsx src/utils/defaults.ts
git commit -m "feat: add timed stacked effect controls"
```

---

### Task 4: Final Compatibility and Cleanup

**Files:**
- Verify: all files changed in Tasks 1-3

**Interfaces:**
- Confirms the full feature without changing unrelated user files.

- [ ] **Step 1: Run final focused assertions**

```powershell
npx --no-install esbuild scripts\mediaVisualEffects.test.ts --bundle --platform=node --format=cjs --outfile=.media-visual-test.cjs
node .media-visual-test.cjs
```

Expected: exit `0`.

- [ ] **Step 2: Run production verification**

```powershell
npm run build
npx --no-install tsc -p tsconfig.web.json --noEmit --pretty false
```

Expected: build exits `0`. Record only existing unrelated TypeScript errors if the repository baseline remains red; changed files must add none.

- [ ] **Step 3: Audit requirements**

```powershell
rg -n "Reset Effect" src
rg -n "mediaEffects|startAt|endAt" src/types/editor.ts src/engine/mediaEffects.ts src/components/panels
git diff --check
git status --short
```

Confirm unique disabled options, per-card Remove, inclusive timing, normal/perspective rendering, legacy fallback, and no obsolete reset control.

- [ ] **Step 4: Remove generated verification artifacts**

Delete only the verified workspace-local `.media-visual-test.cjs` and restore `tsconfig.web.tsbuildinfo` if TypeScript regenerated it.

- [ ] **Step 5: Request read-only code review and address findings**

Review against `docs/superpowers/specs/2026-07-30-timed-stacked-media-effects-design.md`. Fix every Critical/Important finding with a failing test first, then rerun Steps 1-3.
