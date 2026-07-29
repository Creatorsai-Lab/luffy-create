# Lightweight Media Effects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove three unnecessary media effects, implement a reference-matched retro glitch, and add shared image/video vignette adjustments.

**Architecture:** Keep the existing Canvas2D media pipeline. Rewrite Glitch in `mediaEffects.ts`, centralize vignette math/rendering in `imageFilters.ts`, and use one compact shared panel component for image/video controls.

**Tech Stack:** React 18, TypeScript, Konva/Canvas2D, Node assertions, esbuild.

## Global Constraints

- Add no dependency.
- Preserve existing project files by normalizing removed effect IDs to `none`.
- Keep all rendering compatible with editor, preview, and export.
- Prefer shared helpers over duplicated panel or renderer code.

---

### Task 1: Remove obsolete effects safely

**Files:**
- Modify: `src/types/editor.ts`
- Modify: `src/components/panels/MediaEffectsPanel.tsx`
- Modify: `src/engine/mediaEffects.ts`
- Test: `scripts/mediaVisualEffects.test.ts`

**Interfaces:**
- Produces: `normalizeMediaEffect(value: unknown): MediaEffectType`.
- Produces: `resolveGlitchAxis(value: unknown): MediaEffectAxis`.

- [ ] **Step 1: Write the failing normalization test**

```ts
import assert from 'node:assert/strict'
const effects = await import('../src/engine/mediaEffects')
assert.equal(typeof effects.normalizeMediaEffect, 'function')
assert.equal(effects.normalizeMediaEffect('smoke'), 'none')
assert.equal(effects.normalizeMediaEffect('cloudy'), 'none')
assert.equal(effects.normalizeMediaEffect('motionBlur'), 'none')
assert.equal(effects.normalizeMediaEffect('glitch'), 'glitch')
```

- [ ] **Step 2: Bundle and run it to verify RED**

Run:

```powershell
npx --no-install esbuild scripts/mediaVisualEffects.test.ts --bundle --platform=node --format=cjs --outfile=.media-visual-test.cjs
node .media-visual-test.cjs
```

Expected: assertion failure because `normalizeMediaEffect` is missing.

- [ ] **Step 3: Remove the obsolete values and renderer code**

Remove `motionBlur`, `cloudy`, and `smoke` from `MediaEffectType`, the effect selector, conditional controls, dispatch branches, and their three drawing functions. Normalize unknown and removed saved values:

```ts
export function normalizeMediaEffect(value: unknown): MediaEffectType {
  const effect = typeof value === 'string' ? value : 'none'
  return MEDIA_EFFECTS.has(effect as MediaEffectType) ? effect as MediaEffectType : 'none'
}
```

- [ ] **Step 4: Run the test to verify GREEN**

Run the same esbuild and Node commands. Expected: normalization assertions pass.

### Task 2: Replace Glitch with the retro reference treatment

**Files:**
- Modify: `src/types/editor.ts`
- Modify: `src/utils/defaults.ts`
- Modify: `src/components/panels/MediaEffectsPanel.tsx`
- Modify: `src/engine/mediaEffects.ts`
- Test: `scripts/mediaVisualEffects.test.ts`

**Interfaces:**
- Adds: `MediaEffectAxis = 'horizontal' | 'vertical'`.
- Adds: `mediaEffectAxis?: MediaEffectAxis`.

- [ ] **Step 1: Add the failing axis assertions**

```ts
assert.equal(effects.resolveGlitchAxis('vertical'), 'vertical')
assert.equal(effects.resolveGlitchAxis('horizontal'), 'horizontal')
assert.equal(effects.resolveGlitchAxis('diagonal'), 'horizontal')
```

- [ ] **Step 2: Run the focused test to verify RED**

Expected: assertion failure because `resolveGlitchAxis` is missing.

- [ ] **Step 3: Implement the minimal retro renderer**

Add horizontal/vertical buttons for Glitch. Rewrite `drawGlitch` so it:

```ts
fns.drawBase(ctx, 0, 0, width, height)
// Draw two cyan/magenta ghost copies.
// Clip deterministic narrow bands and redraw them with axis-specific offsets.
// Add sparse dark tracking cuts and short 1–2 px cyan/magenta/white lines.
```

Use the existing Intensity, Speed, Hardness, Blend, and Size fields. Use frame-quantized deterministic seeds; do not allocate offscreen canvases.

- [ ] **Step 4: Run the focused test to verify GREEN**

Expected: all normalization and axis assertions pass.

### Task 3: Add shared vignette calculations and rendering

**Files:**
- Modify: `src/types/editor.ts`
- Modify: `src/engine/imageFilters.ts`
- Modify: `src/utils/defaults.ts`
- Test: `scripts/mediaVisualEffects.test.ts`

**Interfaces:**
- Adds shared media fields: `vignetteEnabled`, `vignetteColor`, `vignetteAmount`, `vignetteSize`, and `vignetteFade`.
- Produces: `getVignetteStops(size: number, fade: number): { inner: number; fadeStart: number }`.
- Produces: `drawVignette(ctx, element)`.

- [ ] **Step 1: Add failing vignette geometry assertions**

```ts
const filters = await import('../src/engine/imageFilters')
assert.deepEqual(filters.getVignetteStops(0.5, 0.65), { inner: 0.455, fadeStart: 0.4275 })
assert.deepEqual(filters.getVignetteStops(1, 0), { inner: 0.18, fadeStart: 0.98 })
```

- [ ] **Step 2: Run the focused test to verify RED**

Expected: assertion failure because `getVignetteStops` is missing.

- [ ] **Step 3: Implement vignette math and one renderer**

```ts
export function getVignetteStops(size: number, fade: number) {
  return {
    inner: 0.18 + (1 - clamp01(size)) * 0.55,
    fadeStart: 0.98 - clamp01(fade) * 0.85,
  }
}
```

`drawVignette` creates one radial gradient, uses `vignetteAmount` as hardness/opacity, and does nothing when disabled.

- [ ] **Step 4: Run the focused test to verify GREEN**

Expected: all assertions pass.

### Task 4: Wire vignette into both media panels and renderers

**Files:**
- Create: `src/components/panels/MediaVignetteControls.tsx`
- Modify: `src/components/panels/ImagePanel.tsx`
- Modify: `src/components/panels/VideoPanel.tsx`
- Modify: `src/components/canvas/elements/ImageKonva.tsx`
- Modify: `src/components/canvas/elements/VideoKonva.tsx`

**Interfaces:**
- Consumes: `drawVignette`.
- Produces: `MediaVignetteControls` with `element` and `onChange` props.

- [ ] **Step 1: Build the compact shared control**

Render an enable toggle and, when enabled, Color, Size, Hardness, and Fade controls. Defaults are black, `0.5`, `0.5`, and `0.65`.

- [ ] **Step 2: Place it inside both Adjustments sections**

Remove the old video-only Vignette block from Cinematic & Effects. Include vignette fields in both reset handlers.

- [ ] **Step 3: Render after color adjustments**

Call `drawVignette` after image/video adjustments in normal and perspective media drawing paths so editor, preview, and export share the result.

### Task 5: Verify and clean generated artifacts

**Files:**
- Verify all modified files.

- [ ] **Step 1: Run focused assertions**

```powershell
npx --no-install esbuild scripts/mediaVisualEffects.test.ts --bundle --platform=node --format=cjs --outfile=.media-visual-test.cjs
node .media-visual-test.cjs
```

- [ ] **Step 2: Run TypeScript and production build**

```powershell
npx --no-install tsc -p tsconfig.web.json --noEmit
npx --no-install tsc -p tsconfig.node.json --noEmit
npm run build
```

- [ ] **Step 3: Remove generated verification files**

Delete `.media-visual-test.cjs`, `out`, and `node_modules/.vite`, then restore generated tracked TypeScript metadata.

- [ ] **Step 4: Audit the diff**

Run `git diff --check` and confirm no `motionBlur`, `cloudy`, or `smoke` references remain in the media effect type, panel, or renderer.
