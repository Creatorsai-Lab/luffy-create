# Media Grain Adjustment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add lightweight configurable grain to image and video adjustments with color, size, and opacity/hardness controls.

**Architecture:** Store three optional grain properties on both media element types, expose them through one shared panel component, and render a deterministic cached Canvas pattern. Both ordinary and perspective media paths use the same `drawGrain` helper after adjustments and before vignette.

**Tech Stack:** TypeScript, React, Canvas 2D, Konva, Node assertions, esbuild, Electron/Vite

## Global Constraints

- Controls are Grain Color, Grain Size from 1–8 px, and Opacity/Hardness from 0–100%.
- Stored opacity is 0–1 and zero disables rendering.
- Default grain is black, 1 px, zero opacity.
- Use no external texture asset, per-frame pixel read, or new dependency.
- Keep the cache bounded.

---

### Task 1: Grain Data and Rendering

**Files:**
- Create: `scripts/mediaGrain.test.ts`
- Modify: `src/types/editor.ts`
- Modify: `src/utils/defaults.ts`
- Modify: `src/engine/imageFilters.ts`

**Interfaces:**
- Produces: `MediaGrainControls`
- Produces: `drawGrain(ctx: CanvasRenderingContext2D, el: AdjustableElement): void`
- Consumes: `grainColor`, `grainSize`, and `grainOpacity`

- [ ] **Step 1: Write the failing renderer test**

Use a recording Canvas context and a stubbed `document.createElement('canvas')` to assert:

```ts
drawGrain(recordingContext, { width: 320, height: 180, grainOpacity: 0 })
assert.equal(recordingContext.operations.length, 0)

drawGrain(recordingContext, {
  width: 320, height: 180,
  grainColor: '#7a4b22', grainSize: 2, grainOpacity: 0.65,
})
assert.deepEqual(recordingContext.fillRectCalls.at(-1), [0, 0, 320, 180])
assert.equal(recordingContext.patternCalls, 1)
assert.equal(recordingContext.appliedAlpha, 0.65)
```

Call the same settings twice and assert only one noise tile is created. Pass opacity `2` and assert the applied alpha is clamped to `1`.

- [ ] **Step 2: Run the focused test and verify RED**

```powershell
npx --no-install esbuild scripts/mediaGrain.test.ts --bundle --platform=node --format=cjs --outfile=.media-grain-test.cjs
node .media-grain-test.cjs
```

Expected: FAIL because `drawGrain` is not exported.

- [ ] **Step 3: Add the minimal data and renderer**

Add:

```ts
export interface MediaGrainControls {
  grainColor?: string
  grainSize?: number
  grainOpacity?: number
}
```

Extend `ImageElement` and `VideoElement` with it. Add default fields to `makeImage` and `makeVideo`.

In `imageFilters.ts`, extend `AdjustableElement` and implement `drawGrain` with:

- early return when clamped opacity is zero;
- 64×64 deterministic noise tiles;
- cell size clamped and rounded to 1–8;
- transparent pixels tinted with the selected color and deterministic varying alpha;
- a `Map` cache capped at eight entries;
- `ctx.createPattern(tile, 'repeat')`;
- a saved `source-over` draw over `el.width × el.height`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the commands from Step 2. Expected: exit `0`.

- [ ] **Step 5: Commit the renderer slice**

```powershell
git add -- scripts/mediaGrain.test.ts src/types/editor.ts src/utils/defaults.ts src/engine/imageFilters.ts
git commit -m "feat: add lightweight media grain renderer"
```

### Task 2: Shared Grain Controls

**Files:**
- Modify: `scripts/mediaGrain.test.ts`
- Create: `src/components/panels/MediaGrainControls.tsx`
- Modify: `src/components/panels/ImagePanel.tsx`
- Modify: `src/components/panels/VideoPanel.tsx`

**Interfaces:**
- Consumes: `MediaGrainControls`
- Produces: `MediaGrainControls` patches through `onChange`

- [ ] **Step 1: Add failing panel integration assertions**

Assert both panels import and render `<MediaGrainControls value={el} onChange={upd} />`. Assert the shared component contains the exact labels `Grain Color`, `Grain Size`, and `Grain Hardness`, uses ranges `1–8` and `0–100`, and converts hardness to stored opacity with `v / 100`.

- [ ] **Step 2: Run the focused test and verify RED**

Run the commands from Task 1 Step 2. Expected: FAIL because the shared controls do not exist.

- [ ] **Step 3: Implement the controls and reset values**

Create a small component using the existing `Row` and `Slider` controls:

```tsx
<Row label="Grain Color"><input type="color" ... /></Row>
<Row label="Grain Size"><Slider min={1} max={8} step={1} ... /></Row>
<Row label="Grain Hardness"><Slider min={0} max={100} step={1} ... /></Row>
```

Render it after vignette in both adjustment panels. Add black, 1 px, zero-opacity grain values to both reset handlers.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the commands from Task 1 Step 2. Expected: exit `0`.

- [ ] **Step 5: Commit the panel slice**

```powershell
git add -- scripts/mediaGrain.test.ts src/components/panels/MediaGrainControls.tsx src/components/panels/ImagePanel.tsx src/components/panels/VideoPanel.tsx
git commit -m "feat: add media grain controls"
```

### Task 3: Image and Video Integration

**Files:**
- Modify: `scripts/mediaGrain.test.ts`
- Modify: `src/components/canvas/elements/ImageKonva.tsx`
- Modify: `src/components/canvas/elements/VideoKonva.tsx`

**Interfaces:**
- Consumes: `drawGrain(ctx, el)`
- Produces: grain in ordinary and perspective image/video rendering

- [ ] **Step 1: Add failing render-order assertions**

Read both renderer files and assert every media path contains this exact order:

```ts
applyCanvasAdjustments(context, el)
drawGrain(context, el)
drawVignette(context, el)
```

Assert image perspective dependencies include all three grain fields.

- [ ] **Step 2: Run the focused test and verify RED**

Run the commands from Task 1 Step 2. Expected: FAIL because neither renderer imports or calls `drawGrain`.

- [ ] **Step 3: Integrate the shared renderer**

- Import `drawGrain` beside the existing adjustment helpers.
- Call it once after adjustments and before vignette in both ImageKonva paths.
- Add grain fields to ImageKonva’s perspective-canvas dependency list.
- Call it once after adjustments/color grading and before vignette in the ordinary VideoKonva path.
- Call it once after adjustments and before vignette in VideoKonva’s perspective path.

- [ ] **Step 4: Run focused regressions and build**

```powershell
node .media-grain-test.cjs
npx --no-install esbuild scripts/mediaVisualEffects.test.ts --bundle --platform=node --format=cjs --loader:.css=empty --outfile=.media-effects-test.cjs
node .media-effects-test.cjs
npm run build -- --logLevel error
```

Expected: both test scripts and build pass.

- [ ] **Step 5: Commit the integration**

```powershell
git add -- scripts/mediaGrain.test.ts src/components/canvas/elements/ImageKonva.tsx src/components/canvas/elements/VideoKonva.tsx
git commit -m "feat: render grain on images and videos"
```

### Task 4: Final Verification

**Files:**
- Verify: all files changed by Tasks 1–3

**Interfaces:**
- Consumes: completed grain feature
- Produces: reviewed feature ready for user testing

- [ ] **Step 1: Remove generated test bundles**

Delete only `.media-grain-test.cjs`, `.media-effects-test.cjs`, and `.text-effects-cleanup-test.cjs` from `D:\luffy-editor`.

- [ ] **Step 2: Inspect the scoped diff and run clean verification**

```powershell
git diff --check 851bfcc..HEAD
npx --no-install esbuild scripts/textEffectsCleanup.test.ts --bundle --platform=node --format=cjs --loader:.css=empty --outfile=.text-effects-cleanup-test.cjs
node .text-effects-cleanup-test.cjs
npx --no-install esbuild scripts/mediaGrain.test.ts --bundle --platform=node --format=cjs --outfile=.media-grain-test.cjs
node .media-grain-test.cjs
npx --no-install esbuild scripts/mediaVisualEffects.test.ts --bundle --platform=node --format=cjs --loader:.css=empty --outfile=.media-effects-test.cjs
node .media-effects-test.cjs
npm run build -- --logLevel error
```

Expected: diff check, all focused tests, and build exit `0`.

- [ ] **Step 3: Request read-only code review**

Review `851bfcc..HEAD` against both approved specs. Fix every Critical or Important finding, rerun verification, and preserve all unrelated user-owned working-tree changes.
