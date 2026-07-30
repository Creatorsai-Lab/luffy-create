# Outline Text Reveal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add lightweight Outline Reveal In and Outline Reveal Out text animations matching the supplied recording.

**Architecture:** The animator emits one `outlineReveal` text mode with progress increasing for enter and decreasing for exit. A pure helper converts progress into a leading outline band and trailing solid-fill clip; `TextKonva` renders those two clipped layers with the existing text styles.

**Tech Stack:** TypeScript, React, React-Konva, Electron Vite, Node assertions bundled with esbuild.

## Global Constraints

- Match the approved left-to-right outline-then-fill entrance and its right-to-left inverse exit.
- Reuse existing Duration and Easing controls.
- Add no dependencies, shaders, per-character React nodes, or unrelated refactors.
- Expose the animations only for text.

---

### Task 1: Animation State and Reveal Math

**Files:**
- Create: `src/engine/textOutlineReveal.ts`
- Create: `scripts/textOutlineReveal.test.ts`
- Modify: `src/types/editor.ts`
- Modify: `src/engine/animator.ts`

**Interfaces:**
- Produces: `getOutlineRevealClips(progress: number, width: number): { fillWidth: number; outlineX: number; outlineWidth: number }`
- Produces: `AnimatedProps.textMode === 'outlineReveal'` while the animation is active.

- [ ] **Step 1: Write the failing assertions**

Assert that the pure clip helper has a leading trace and lagging fill at mid-progress, clamps invalid bounds, and that `getAnimatedProps()` emits `0 → 1` progress for enter and `1 → 0` for exit.

- [ ] **Step 2: Run the focused test to verify RED**

Run:

```powershell
npx --no-install esbuild scripts/textOutlineReveal.test.ts --bundle --platform=node --format=cjs --outfile=.text-outline-test.cjs
node .text-outline-test.cjs
```

Expected: failure because `getOutlineRevealClips` and the new animation types do not exist.

- [ ] **Step 3: Implement the minimal state and math**

Add both animation types, the `outlineReveal` text mode, enter/exit cases in `applyAnim`, and:

```ts
export function getOutlineRevealClips(progress: number, width: number) {
  const p = clamp(progress)
  const safeWidth = Math.max(0, Number.isFinite(width) ? width : 0)
  const traceWidth = safeWidth * clamp(p / 0.72)
  const fillWidth = safeWidth * clamp((p - 0.28) / 0.72)
  return { fillWidth, outlineX: fillWidth, outlineWidth: Math.max(0, traceWidth - fillWidth) }
}
```

- [ ] **Step 4: Run the focused test to verify GREEN**

Run the commands from Step 2. Expected: exit code `0`.

- [ ] **Step 5: Commit**

Commit only the four Task 1 files with message `feat: add outline reveal animation state`.

### Task 2: Text Rendering and Menus

**Files:**
- Modify: `src/components/canvas/elements/TextKonva.tsx`
- Modify: `src/components/panels/TextPanel.tsx`
- Test: `scripts/textOutlineReveal.test.ts`

**Interfaces:**
- Consumes: `getOutlineRevealClips()` and `textMode: 'outlineReveal'`.
- Produces: two clipped text layers and text-only menu choices.

- [ ] **Step 1: Add failing menu assertions**

Assert the text menu exports include `outlineRevealIn` and `outlineRevealOut` in their respective lists while the shared counter/LaTeX lists do not.

- [ ] **Step 2: Run the focused test to verify RED**

Run the Task 1 focused commands. Expected: failure because the menu choices are absent.

- [ ] **Step 3: Implement the renderer and menu wiring**

Create text-only menu arrays by extending the existing shared arrays. When `textMode === 'outlineReveal'` and progress is below `1`, render:

- normal styled text clipped from `0` to `fillWidth`;
- outline-only text clipped from `outlineX` through `outlineWidth`;
- the existing background normally and inner shadow inside the fill clip.

Use `effectiveColor` for the thin trace, disable trace shadows, and use `Math.max(1, el.fontSize * 0.018)` for stroke width.

- [ ] **Step 4: Verify focused behavior and production build**

Run:

```powershell
npx --no-install esbuild scripts/textOutlineReveal.test.ts --bundle --platform=node --format=cjs --outfile=.text-outline-test.cjs
node .text-outline-test.cjs
npm run build -- --logLevel error
```

Expected: all commands exit `0`.

- [ ] **Step 5: Clean and commit**

Remove `.text-outline-test.cjs`, confirm `git diff --check`, and commit the Task 2 files with message `feat: render outline text reveal`.
