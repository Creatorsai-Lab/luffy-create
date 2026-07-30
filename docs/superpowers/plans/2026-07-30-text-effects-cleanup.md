# Text Effects Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Shadow, Outline, Bubble, and Glitch from optional text effects while preserving Glow, Hollow, and the independent text shadow/stroke controls.

**Architecture:** Put the supported effect catalog and legacy-value normalization in one small utility consumed by both panels. Narrow the editor type and delete removed renderer branches without changing ordinary shadow, stroke, or outline-reveal behavior.

**Tech Stack:** TypeScript, React, Konva, Node assertions, esbuild, Electron/Vite

## Global Constraints

- Keep only Glow and Hollow in both text effect selectors.
- Preserve the existing text shadow controls, text stroke controls, and outline-reveal animations.
- Old project values must be ignored safely.
- Add no dependencies.

---

### Task 1: Supported Text Effect Model

**Files:**
- Create: `scripts/textEffectsCleanup.test.ts`
- Create: `src/utils/textEffects.ts`
- Modify: `src/types/editor.ts`

**Interfaces:**
- Produces: `TEXT_EFFECT_OPTIONS: readonly { label: string; value: TextEffectType; description: string }[]`
- Produces: `normalizeTextEffects(values: readonly unknown[]): TextEffectType[]`
- Consumes: `TextEffectType`

- [ ] **Step 1: Write the failing model test**

Assert that the shared catalog contains exactly Glow and Hollow, and normalization removes legacy and duplicate values:

```ts
assert.deepEqual(TEXT_EFFECT_OPTIONS.map(option => option.value), ['glow', 'hollow'])
assert.deepEqual(
  normalizeTextEffects(['shadow', 'glow', 'outline', 'hollow', 'glitch', 'bubble', 'glow']),
  ['glow', 'hollow'],
)
```

- [ ] **Step 2: Run the focused test and verify RED**

```powershell
npx --no-install esbuild scripts/textEffectsCleanup.test.ts --bundle --platform=node --format=cjs --loader:.css=empty --outfile=.text-effects-cleanup-test.cjs
node .text-effects-cleanup-test.cjs
```

Expected: FAIL because `src/utils/textEffects.ts` does not exist.

- [ ] **Step 3: Add the minimal model**

Narrow the type:

```ts
export type TextEffectType = 'glow' | 'hollow'
```

Create the shared utility:

```ts
export const TEXT_EFFECT_OPTIONS = [
  { label: 'Glow', value: 'glow', description: 'Glowing outline' },
  { label: 'Hollow', value: 'hollow', description: 'Hollow text' },
] as const satisfies readonly { label: string; value: TextEffectType; description: string }[]

const SUPPORTED = new Set<TextEffectType>(TEXT_EFFECT_OPTIONS.map(option => option.value))

export function normalizeTextEffects(values: readonly unknown[] = []): TextEffectType[] {
  return [...new Set(values.filter((value): value is TextEffectType =>
    typeof value === 'string' && SUPPORTED.has(value as TextEffectType),
  ))]
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the commands from Step 2. Expected: exit `0`.

- [ ] **Step 5: Commit the model**

```powershell
git add -- scripts/textEffectsCleanup.test.ts src/utils/textEffects.ts src/types/editor.ts
git commit -m "refactor: narrow supported text effects"
```

### Task 2: Panels and Renderer Cleanup

**Files:**
- Modify: `scripts/textEffectsCleanup.test.ts`
- Modify: `src/components/panels/TextPanel.tsx`
- Modify: `src/components/panels/TextEffectsPanel.tsx`
- Modify: `src/components/canvas/elements/TextKonva.tsx`

**Interfaces:**
- Consumes: `TEXT_EFFECT_OPTIONS`
- Consumes: `normalizeTextEffects(values)`
- Produces: selectors and renderer supporting only Glow and Hollow

- [ ] **Step 1: Extend the test with source integration assertions**

Read both panel and renderer source files and assert:

```ts
assert.equal(textPanel.includes('TEXT_EFFECT_OPTIONS.map'), true)
assert.equal(effectsPanel.includes('TEXT_EFFECT_OPTIONS.map'), true)
for (const removed of ["includes('shadow')", "includes('outline')", "value: 'bubble'", "value: 'glitch'"]) {
  assert.equal(combinedSource.includes(removed), false)
}
```

Also assert both panel toggle paths call `normalizeTextEffects`.

- [ ] **Step 2: Run the focused test and verify RED**

Run the commands from Task 1 Step 2. Expected: FAIL because the panels still define all six effects and the renderer contains removed branches.

- [ ] **Step 3: Use the shared catalog and normalization**

- Delete both local `TEXT_EFFECTS` arrays.
- Import `TEXT_EFFECT_OPTIONS` and `normalizeTextEffects`.
- Map `TEXT_EFFECT_OPTIONS` in both panels.
- Normalize existing values before toggling, so the saved array also cleans legacy values.
- In `TextEffectsPanel`, show only normalized active values and remove the obsolete implementation warning.
- Delete only the Shadow and Outline effect branches from `resolveEffectProps`; leave base shadow/stroke values and Glow/Hollow branches unchanged.

- [ ] **Step 4: Run focused test and production build**

```powershell
node .text-effects-cleanup-test.cjs
npm run build -- --logLevel error
```

Expected: test passes and build exits `0`.

- [ ] **Step 5: Commit the cleanup**

```powershell
git add -- scripts/textEffectsCleanup.test.ts src/components/panels/TextPanel.tsx src/components/panels/TextEffectsPanel.tsx src/components/canvas/elements/TextKonva.tsx
git commit -m "refactor: remove unused text effects"
```
