# Light Flicker and Computer Modern Roman Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an irregular thunder-light media effect and make Computer Modern Roman selectable throughout the editor with no new dependency.

**Architecture:** Extend the existing timed media-effect union and overlay renderer with one deterministic scalar flash envelope, then expose four existing clip properties under effect-specific labels. Register three TeX Roman WOFF faces already shipped by MathJax, and route the family through the shared font list and Canvas preloader.

**Tech Stack:** TypeScript, React, Canvas2D, Konva, Tailwind CSS, MathJax font assets, esbuild/Node focused assertions.

## Global Constraints

- Add no npm dependency and copy no font binary into the repository.
- Never call `Math.random()` during rendering; equal local times must render equal flashes.
- Keep Light Flicker compatible with multiple effects and per-effect Start At/End At timing.
- Use only Color, Fade, Opacity, and Speed controls for Light Flicker.
- Preserve `.gitignore`, `docs/release-notes-v1.3.md`, and `MediaVignetteControls.tsx` as unrelated user changes.

---

### Task 1: Deterministic Light Flicker Model and Renderer

**Files:**
- Modify: `scripts/mediaVisualEffects.test.ts`
- Modify: `src/types/editor.ts`
- Modify: `src/utils/defaults.ts`
- Modify: `src/engine/mediaEffects.ts`

**Interfaces:**
- Produces: `MediaEffectType` value `lightFlicker`.
- Produces: `getLightFlickerStrength(localTime: number, speed: number, fade: number): number`.
- Consumes: the existing `MediaEffectClip` timing resolver and `EffectState`.

- [ ] **Step 1: Write failing behavior assertions**

Add assertions that catch an unsupported type, nondeterministic output, ignored Speed, and an inactive/always-off envelope:

```ts
assert.equal(normalize('lightFlicker'), 'lightFlicker')

const flicker = (effects as Record<string, unknown>).getLightFlickerStrength
assert.equal(typeof flicker, 'function')
if (typeof flicker === 'function') {
  const times = [0, 0.06, 0.18, 0.34, 0.57, 0.83, 1.16, 1.51]
  const normal = times.map(time => flicker(time, 1, 0.5))
  assert.deepEqual(normal, times.map(time => flicker(time, 1, 0.5)))
  assert.notDeepEqual(normal, times.map(time => flicker(time, 2, 0.5)))
  assert.equal(normal.some(value => value === 0), true)
  assert.equal(normal.some(value => value > 0 && value <= 1), true)
}

const flickerClip = defaults.makeMediaEffectClip('lightFlicker', 5)
assert.equal(flickerClip.mediaEffectColor, '#dcecff')
assert.equal(flickerClip.mediaEffectHardness, 0.4)
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npx --no-install esbuild scripts\mediaVisualEffects.test.ts --bundle --platform=node --format=cjs --outfile=.media-visual-test.cjs
node .media-visual-test.cjs
```

Expected: assertion failure because `lightFlicker` normalizes to `none` and `getLightFlickerStrength` does not exist.

- [ ] **Step 3: Add the supported type and subtle defaults**

Append `lightFlicker` to `MEDIA_EFFECT_TYPES`. In `makeMediaEffectClip`, override only the new effect’s defaults:

```ts
const effectDefaults = type === 'lightFlicker'
  ? { mediaEffectColor: '#dcecff', mediaEffectHardness: 0.4, mediaEffectBlend: 0.55 }
  : {}
return { ...settings, ...effectDefaults, type, startAt: 0, endAt: Math.max(0, endAt) }
```

- [ ] **Step 4: Implement the deterministic envelope**

Export a pure helper from `mediaEffects.ts`. Use fixed time slots scaled by Speed, a small integer hash per slot to skip some flashes and vary amplitude, a fast attack, and a Fade-controlled decay. Clamp every input and output to finite ranges:

```ts
export function getLightFlickerStrength(localTime: number, speed: number, fade: number): number
```

The helper must return `0..1`, produce both zero and positive samples, and never use mutable or random state.

- [ ] **Step 5: Draw the wide light wash**

Route `lightFlicker` through `drawOverlayEffect`. Multiply the pure envelope by `effect.hardness`, then render one full-size fill:

```ts
ctx.save()
ctx.globalCompositeOperation = 'screen'
ctx.globalAlpha = strength * effect.hardness
ctx.fillStyle = effect.color
ctx.fillRect(0, 0, width, height)
ctx.restore()
```

Use `effect.time`, `effect.speed`, and `effect.blend` as local time, speed, and fade.

- [ ] **Step 6: Run the focused test and verify GREEN**

Run the two commands from Step 2. Expected: exit code `0`.

- [ ] **Step 7: Commit the effect engine**

```powershell
git add scripts/mediaVisualEffects.test.ts src/types/editor.ts src/utils/defaults.ts src/engine/mediaEffects.ts
git commit -m "feat: add irregular light flicker effect"
```

---

### Task 2: Light Flicker Effect Card Controls

**Files:**
- Modify: `src/components/panels/MediaEffectsPanel.tsx`
- Modify: `src/components/panels/MediaEffectCard.tsx`

**Interfaces:**
- Consumes: `MediaEffectClip['type'] === 'lightFlicker'`.
- Produces: an Add Effect option and the four approved controls.

- [ ] **Step 1: Add the effect menu entry**

Add:

```ts
{ label: 'Light Flicker', value: 'lightFlicker', description: 'Irregular wide thunder-light flashes' }
```

The existing `used` set must continue disabling the option after one instance is added.

- [ ] **Step 2: Specialize the card labels without adding fields**

In `MediaEffectCard`, derive:

```ts
const isLightFlicker = clip.type === 'lightFlicker'
```

For this type:

- hide the generic Intensity slider;
- retain Speed;
- label `mediaEffectHardness` as `Opacity`;
- label `mediaEffectBlend` as `Fade`;
- show Color using `mediaEffectColor`;
- do not show the separate Color Opacity slider.

All other effect cards must keep their current controls and labels.

- [ ] **Step 3: Run production build and source audit**

Run:

```powershell
npm run build
rg -n "Light Flicker|isLightFlicker|Opacity|Fade" src\components\panels\MediaEffectsPanel.tsx src\components\panels\MediaEffectCard.tsx
```

Expected: build exits `0`; the audit shows the option and specialized branches.

- [ ] **Step 4: Commit the effect UI**

```powershell
git add src/components/panels/MediaEffectsPanel.tsx src/components/panels/MediaEffectCard.tsx
git commit -m "feat: add light flicker controls"
```

---

### Task 3: Computer Modern Roman Font Registration

**Files:**
- Modify: `scripts/mediaVisualEffects.test.ts`
- Modify: `src/index.css`
- Modify: `src/types/editor.ts`
- Modify: `src/utils/fontLoader.ts`

**Interfaces:**
- Produces: shared family name `Computer Modern Roman`.
- Consumes: existing MathJax WOFF assets and `preloadFonts()`.

- [ ] **Step 1: Write the failing shared-list assertion**

Add:

```ts
const editorTypes = await import('../src/types/editor')
assert.equal(editorTypes.FONT_FAMILIES.includes('Computer Modern Roman'), true)
```

- [ ] **Step 2: Run the focused test and verify RED**

Run the two focused-test commands from Task 1 Step 2.

Expected: assertion failure because the family is absent.

- [ ] **Step 3: Register the three existing TeX Roman faces**

Add concise `@font-face` rules near the top of `src/index.css`:

```css
@font-face {
  font-family: 'Computer Modern Roman';
  src: url('../node_modules/mathjax-full/es5/output/chtml/fonts/woff-v2/MathJax_Main-Regular.woff') format('woff');
  font-style: normal;
  font-weight: 400;
}
```

Repeat for `MathJax_Main-Bold.woff` with weight `700` and `MathJax_Main-Italic.woff` with style `italic`, weight `400`.

- [ ] **Step 4: Expose and preload the family**

Insert `Computer Modern Roman` alphabetically in `FONT_FAMILIES`. Add:

```ts
{ family: 'Computer Modern Roman', weights: ['400', '700'] },
```

to `CANVAS_FONTS`, allowing the existing app-start and on-demand loaders to handle Canvas/Konva rendering.

- [ ] **Step 5: Verify GREEN and asset bundling**

Run:

```powershell
npx --no-install esbuild scripts\mediaVisualEffects.test.ts --bundle --platform=node --format=cjs --outfile=.media-visual-test.cjs
node .media-visual-test.cjs
npm run build
Get-ChildItem out\renderer\assets | Where-Object Name -Match 'MathJax_Main-(Regular|Bold|Italic)'
```

Expected: focused test and build exit `0`; exactly three emitted MathJax Main font assets are listed.

- [ ] **Step 6: Commit the font**

```powershell
git add scripts/mediaVisualEffects.test.ts src/index.css src/types/editor.ts src/utils/fontLoader.ts
git commit -m "feat: add computer modern roman font"
```

---

### Task 4: Final Verification and Cleanup

**Files:**
- Verify: all files changed in Tasks 1-3.

**Interfaces:**
- Confirms both features and preserves unrelated user work.

- [ ] **Step 1: Run fresh focused tests and production build**

```powershell
npx --no-install esbuild scripts\mediaVisualEffects.test.ts --bundle --platform=node --format=cjs --outfile=.media-visual-test.cjs
node .media-visual-test.cjs
npm run build
```

Expected: every command exits `0`.

- [ ] **Step 2: Run TypeScript diagnostics into an isolated cache**

```powershell
npx --no-install tsc -p tsconfig.web.json --noEmit --pretty false --tsBuildInfoFile .light-font.tsbuildinfo
```

Record only existing unrelated baseline errors; changed files must add none.

- [ ] **Step 3: Audit requirements and working tree**

```powershell
rg -n "lightFlicker|Light Flicker|getLightFlickerStrength" src scripts
rg -n "Computer Modern Roman|MathJax_Main-" src
git diff --check
git status --short
```

Confirm timed stacking is inherited, no `Math.random()` was added, no dependency changed, and only the user’s pre-existing `.gitignore`, release-notes deletion, and vignette edit remain uncommitted.

- [ ] **Step 4: Remove generated verification files**

Delete only:

```text
.media-visual-test.cjs
.light-font.tsbuildinfo
```

- [ ] **Step 5: Request read-only review and address findings**

Review against `docs/superpowers/specs/2026-07-30-light-flicker-computer-modern-design.md`. Fix every Critical or Important issue with a failing regression test first, then rerun Steps 1-3.
