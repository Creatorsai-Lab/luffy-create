# Directional Flash Transitions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add lightweight Flash Blur and Flicker Shake page transitions with four directions, speed, hardness, duration, and no opacity crossfade.

**Architecture:** Put all timing, hard-cut selection, and directional motion in one pure deterministic helper. The existing Canvas 2D renderer consumes that state for export, while both live preview surfaces use preview-resolution canvas compositors backed by the same renderer.

**Tech Stack:** TypeScript, React 18, Konva, Canvas 2D, Node assertions bundled with esbuild.

## Global Constraints

- Add no runtime or development dependency.
- Never blend outgoing and incoming scene opacity for either new transition.
- Keep random-looking flicker and shake deterministic.
- Preserve all existing transition behavior and stored-project compatibility.
- Defaults: direction `right`, speed `1`, hardness `50`.
- Ranges: duration `0.1–2.0s`, speed `0.25–3.0`, hardness `0–100`.

---

### Task 1: Deterministic transition state and model

**Files:**
- Create: `src/engine/directionalTransitions.ts`
- Create: `scripts/directionalTransitions.test.ts`
- Modify: `src/types/editor.ts:20,511-516`
- Modify: `src/utils/transitions.ts`

**Interfaces:**
- Produces: `getDirectionalTransitionState(type, progress, direction, speed, hardness): DirectionalTransitionState`
- Produces: `DirectionalTransitionState` with `scene`, `offsetX`, `offsetY`, `streakX`, `streakY`, and `light`.
- Produces: transition types `flashBlur` and `flickerShake`, plus optional scene-transition `speed` and `hardness`.

- [ ] **Step 1: Write the failing pure-behavior test**

```ts
import assert from 'node:assert/strict'
import { getDirectionalTransitionState } from '../src/engine/directionalTransitions'
import { TRANSITIONS, TRANSITIONS_WITH_DIRECTION, TRANSITIONS_WITH_STYLE_CONTROLS } from '../src/utils/transitions'

const flashStart = getDirectionalTransitionState('flashBlur', 0, 'right', 1, 50)
const flashPeak = getDirectionalTransitionState('flashBlur', 0.5, 'right', 1, 50)
const flashEnd = getDirectionalTransitionState('flashBlur', 1, 'right', 1, 50)
assert.deepEqual(flashStart, { scene: 'from', offsetX: 0, offsetY: 0, streakX: 0, streakY: 0, light: 0 })
assert.equal(flashPeak.scene, 'to')
assert.ok(flashPeak.offsetX > 0 && flashPeak.streakX > 0 && flashPeak.light > 0)
assert.deepEqual(flashEnd, { scene: 'to', offsetX: 0, offsetY: 0, streakX: 0, streakY: 0, light: 0 })

for (const [direction, axis, sign] of [
  ['right', 'offsetX', 1], ['left', 'offsetX', -1],
  ['down', 'offsetY', 1], ['up', 'offsetY', -1],
] as const) {
  const state = getDirectionalTransitionState('flashBlur', 0.5, direction, 1, 50)
  assert.equal(Math.sign(state[axis]), sign)
}

const soft = getDirectionalTransitionState('flickerShake', 0.4, 'right', 1, 10)
const hard = getDirectionalTransitionState('flickerShake', 0.4, 'right', 1, 90)
assert.ok(Math.abs(hard.offsetX) > Math.abs(soft.offsetX))
assert.ok(hard.light > soft.light)

const countCuts = (speed: number) => {
  let cuts = 0
  let previous = getDirectionalTransitionState('flickerShake', 0, 'right', speed, 50).scene
  for (let i = 1; i <= 100; i++) {
    const scene = getDirectionalTransitionState('flickerShake', i / 100, 'right', speed, 50).scene
    if (scene !== previous) cuts++
    previous = scene
  }
  return cuts
}
assert.ok(countCuts(3) > countCuts(0.25))
assert.deepEqual(
  getDirectionalTransitionState('flickerShake', 0.37, 'up', 1.4, 65),
  getDirectionalTransitionState('flickerShake', 0.37, 'up', 1.4, 65),
)
assert.equal(getDirectionalTransitionState('flickerShake', 0.95, 'left', 3, 100).scene, 'to')
assert.ok(TRANSITIONS.some(item => item.value === 'flashBlur'))
assert.ok(TRANSITIONS.some(item => item.value === 'flickerShake'))
assert.ok(TRANSITIONS_WITH_DIRECTION.includes('flashBlur'))
assert.ok(TRANSITIONS_WITH_STYLE_CONTROLS.includes('flickerShake'))
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npx --no-install esbuild scripts/directionalTransitions.test.ts --bundle --platform=node --format=cjs --outfile=.directional-transitions-test.cjs
node .directional-transitions-test.cjs
```

Expected: FAIL because `directionalTransitions.ts` and the new registry entries do not exist.

- [ ] **Step 3: Implement the minimal model and pure state helper**

Use these model additions:

```ts
export type TransitionType =
  'none' | 'fade' | 'slide' | 'zoom' | 'wipe' | 'push' | 'morph' |
  'flashBlur' | 'flickerShake'

export interface SceneTransition {
  type: TransitionType
  duration: number
  direction?: SlideDir
  speed?: number
  hardness?: number
}
```

Implement the helper around a clamped sine envelope:

```ts
export type DirectionalTransitionType = 'flashBlur' | 'flickerShake'
export interface DirectionalTransitionState {
  scene: 'from' | 'to'
  offsetX: number
  offsetY: number
  streakX: number
  streakY: number
  light: number
}

export function getDirectionalTransitionState(
  type: DirectionalTransitionType,
  progress: number,
  direction: SlideDir = 'right',
  speed = 1,
  hardness = 50,
): DirectionalTransitionState {
  const p = clamp(progress, 0, 1)
  const rate = clamp(speed, 0.25, 3)
  const force = clamp(hardness, 0, 100) / 100
  const [x, y] = directionVector(direction)
  if (p === 0) return zero('from')
  if (p === 1) return zero('to')

  if (type === 'flashBlur') {
    const peak = Math.pow(Math.sin(Math.PI * p), 0.7 + rate * 0.8)
    const phaseSign = p < 0.5 ? -1 : 1
    const motion = peak * force * phaseSign
    const streak = peak * (0.15 + force * 0.85)
    return {
      scene: p < 0.5 ? 'from' : 'to',
      offsetX: x * motion,
      offsetY: y * motion,
      streakX: x * streak,
      streakY: y * streak,
      light: Math.min(0.94, peak * (0.35 + force * 0.59)),
    }
  }

  const envelope = Math.sin(Math.PI * p)
  const phase = p * Math.PI * 2 * (3 + rate * 3)
  const primary = Math.sin(phase) * envelope * force
  const cross = Math.sin(phase * 1.7 + 1.1) * envelope * force * 0.22
  const pulses = 4 + Math.round(rate * 4)
  return {
    scene: p >= 0.82 || Math.floor(p * pulses) % 2 === 1 ? 'to' : 'from',
    offsetX: x * primary - y * cross,
    offsetY: y * primary + x * cross,
    streakX: 0,
    streakY: 0,
    light: Math.pow(Math.abs(Math.sin(phase * 0.5)), 3) * envelope * (0.12 + force * 0.42),
  }
}
```

Add registry entries and control groups:

```ts
{ label: 'Flash Blur', value: 'flashBlur', desc: 'Directional blur through a clean flash cut', color: '#f8fafc' },
{ label: 'Flicker Shake', value: 'flickerShake', desc: 'Merged hard-cut flicker with directional shake', color: '#a855f7' },

export const TRANSITIONS_WITH_DIRECTION: TransitionType[] =
  ['push', 'wipe', 'flashBlur', 'flickerShake']
export const TRANSITIONS_WITH_STYLE_CONTROLS: TransitionType[] =
  ['flashBlur', 'flickerShake']
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the Step 2 commands. Expected: `directional transition tests passed`.

- [ ] **Step 5: Commit**

```powershell
git add src/engine/directionalTransitions.ts src/types/editor.ts src/utils/transitions.ts scripts/directionalTransitions.test.ts
git commit -m "feat: add directional transition state"
```

### Task 2: Canvas renderer and editor controls

**Files:**
- Modify: `src/engine/transitionRenderer.ts`
- Modify: `src/components/panels/TransitionPanel.tsx`
- Modify: `scripts/directionalTransitions.test.ts`

**Interfaces:**
- Consumes: `getDirectionalTransitionState`.
- Extends: `TransitionRenderOptions` with optional `speed` and `hardness`.
- Produces: Canvas rendering for both new transitions without crossfade.

- [ ] **Step 1: Extend the test with renderer/control contracts**

```ts
import fs from 'node:fs'
const renderer = fs.readFileSync('src/engine/transitionRenderer.ts', 'utf8')
const panel = fs.readFileSync('src/components/panels/TransitionPanel.tsx', 'utf8')
assert.match(renderer, /case 'flashBlur'/)
assert.match(renderer, /case 'flickerShake'/)
assert.match(renderer, /getDirectionalTransitionState/)
assert.match(panel, /label="Speed"/)
assert.match(panel, /label="Hardness"/)
assert.match(panel, /TRANSITIONS_WITH_STYLE_CONTROLS/)
```

- [ ] **Step 2: Run the focused test and verify RED**

Run the Task 1 test commands. Expected: FAIL on the missing renderer cases and panel controls.

- [ ] **Step 3: Add renderer options and compact directional drawing**

Pass controls through the switch:

```ts
export interface TransitionRenderOptions {
  // existing fields
  speed?: number
  hardness?: number
}

case 'flashBlur':
case 'flickerShake':
  renderDirectionalTransition(ctx, width, height, type, p, direction ?? 'right',
    speed ?? 1, hardness ?? 50, fromCanvas, toCanvas)
  break
```

The directional renderer must:

1. draw only `state.scene` as a full-opacity base;
2. overscan by at most five percent so shake never exposes empty edges;
3. for Flash Blur, draw five low-alpha translated copies along `streakX/streakY`;
4. add `rgba(255,255,255,state.light)` over the complete frame;
5. restore `globalAlpha`, `filter`, and transforms before returning.

Use `Math.min(width, height) * 0.075` for Flash Blur travel and `* 0.035` for Flicker Shake travel. Do not use outgoing/incoming opacity interpolation.

- [ ] **Step 4: Add contextual controls**

```tsx
const hasStyleControls = TRANSITIONS_WITH_STYLE_CONTROLS.includes(tr.type)

{hasStyleControls && (
  <>
    <Row label="Speed">
      <Slider value={tr.speed ?? 1} min={0.25} max={3} step={0.05}
        onChange={speed => setTransition(scene.id, { ...tr, speed })}
        display={`${(tr.speed ?? 1).toFixed(2)}×`} />
    </Row>
    <Row label="Hardness">
      <Slider value={tr.hardness ?? 50} min={0} max={100} step={1}
        onChange={hardness => setTransition(scene.id, { ...tr, hardness })}
        display={`${Math.round(tr.hardness ?? 50)}%`} />
    </Row>
  </>
)}
```

When selecting either new transition, preserve existing settings and allow missing values to resolve through the displayed defaults.

- [ ] **Step 5: Run focused tests and build**

Run:

```powershell
npx --no-install esbuild scripts/directionalTransitions.test.ts --bundle --platform=node --format=cjs --loader:.css=empty --outfile=.directional-transitions-test.cjs
node .directional-transitions-test.cjs
npm run build -- --logLevel error
```

Expected: focused test passes and Electron production build exits `0`.

- [ ] **Step 6: Commit**

```powershell
git add src/engine/transitionRenderer.ts src/components/panels/TransitionPanel.tsx scripts/directionalTransitions.test.ts
git commit -m "feat: render directional flash transitions"
```

### Task 3: Matching live previews

**Files:**
- Modify: `src/components/canvas/EditorCanvas.tsx`
- Modify: `src/components/modals/PreviewModal.tsx`
- Modify: `scripts/directionalTransitions.test.ts`

**Interfaces:**
- Consumes: `renderTransition` with speed and hardness.
- Produces: canvas-composited preview frames for both special transitions in the main editor and Preview modal.

- [ ] **Step 1: Add failing preview-wiring assertions**

```ts
const editorCanvas = fs.readFileSync('src/components/canvas/EditorCanvas.tsx', 'utf8')
const previewModal = fs.readFileSync('src/components/modals/PreviewModal.tsx', 'utf8')
assert.match(editorCanvas, /renderTransition\(\{/)
assert.match(editorCanvas, /speed: transOverlay\.speed/)
assert.match(editorCanvas, /hardness: transOverlay\.hardness/)
assert.match(previewModal, /renderTransition\(\{/)
assert.match(previewModal, /frameState\.transition\.speed/)
assert.match(previewModal, /frameState\.transition\.hardness/)
```

- [ ] **Step 2: Run focused test and verify RED**

Run the Task 2 focused-test commands. Expected: FAIL because neither preview surface calls the shared renderer.

- [ ] **Step 3: Add the main-editor preview canvas**

Type `transOverlay.type` as `TransitionType`, `direction` as `SlideDir`, and store `speed`/`hardness` when the transition window starts:

```ts
setTransOverlay({
  snap,
  type: toSc.transition.type,
  direction: toSc.transition.direction,
  speed: toSc.transition.speed,
  hardness: toSc.transition.hardness,
  toSceneId: toSc.id,
  transitionStart: tStart,
  duration: transD,
})
```

For only `flashBlur` and `flickerShake`, render one absolutely positioned preview canvas. Reuse a decoded outgoing `Image`, capture the currently rendered incoming stage with `stageRef.current.toCanvas({ pixelRatio: 1 })`, and call:

```ts
renderTransition({
  ctx,
  width: canvasW,
  height: canvasH,
  progress: rawP,
  type: transOverlay.type,
  direction: transOverlay.direction,
  speed: transOverlay.speed,
  hardness: transOverlay.hardness,
  fromCanvas,
  toCanvas,
})
```

Keep the current HTML overlay path unchanged for existing transitions.

- [ ] **Step 4: Add the Preview-modal compositor**

Allow `PreviewSceneStage` to receive a Konva stage callback. For either new type, render the outgoing and incoming stages at preview resolution with `opacity: 0`, capture each using `stage.toCanvas({ pixelRatio: 1 })`, and draw them to one visible canvas with `renderTransition`. Reuse all three refs across frames and schedule capture in one `requestAnimationFrame` after React/Konva has rendered.

Pass raw `frameState.progress`; the renderer and pure helper own all easing for the special transitions. Pass `direction`, `speed`, and `hardness` from `frameState.transition`.

- [ ] **Step 5: Run focused test and production build**

Run the Task 2 verification commands. Expected: all exit `0`.

- [ ] **Step 6: Commit**

```powershell
git add src/components/canvas/EditorCanvas.tsx src/components/modals/PreviewModal.tsx scripts/directionalTransitions.test.ts
git commit -m "feat: preview directional flash transitions"
```

### Task 4: AI command compatibility

**Files:**
- Modify: `src/ai/types.ts`
- Modify: `src/ai/prepare.ts`
- Modify: `src/ai/executor.ts`
- Modify: `src/ai/planner.ts`
- Modify: `scripts/directionalTransitions.test.ts`

**Interfaces:**
- Accepts and preserves new transition names and controls through prepare/execute.
- Parses `flash blur` and `flicker shake` in the local planner.

- [ ] **Step 1: Add failing source and preparation tests**

```ts
const prepare = fs.readFileSync('src/ai/prepare.ts', 'utf8')
const executor = fs.readFileSync('src/ai/executor.ts', 'utf8')
const planner = fs.readFileSync('src/ai/planner.ts', 'utf8')
assert.match(prepare, /'flashBlur'/)
assert.match(prepare, /'flickerShake'/)
assert.match(prepare, /hardness: clampOptional/)
assert.match(prepare, /speed: clampOptional/)
assert.match(executor, /hardness: tr\.hardness/)
assert.match(executor, /speed: tr\.speed/)
assert.match(planner, /flash blur/)
assert.match(planner, /flicker shake/)
```

- [ ] **Step 2: Run focused test and verify RED**

Run the Task 2 focused-test commands. Expected: FAIL on the new AI compatibility assertions.

- [ ] **Step 3: Preserve and clamp controls**

Extend the command’s lightweight transition shape with `speed?: number` and `hardness?: number`. Add both types to `TRANSITION_TYPES`, then normalize:

```ts
transition: {
  ...command.transition,
  type,
  duration: clampOptional(command.transition.duration, 0, 5),
  speed: clampOptional(command.transition.speed, 0.25, 3),
  hardness: clampOptional(command.transition.hardness, 0, 100),
}
```

Forward both fields in `executor.ts`.

- [ ] **Step 4: Parse local transition prompts**

Recognize `flash blur` before generic `blur`/`fade` matching and `flicker shake` before generic shake text. Add a four-direction reader returning `left | right | up | down`, and include parsed direction, speed, and hardness in the `setTransition` command.

- [ ] **Step 5: Verify and commit**

Run the Task 2 verification commands. Expected: all exit `0`.

```powershell
git add src/ai/types.ts src/ai/prepare.ts src/ai/executor.ts src/ai/planner.ts scripts/directionalTransitions.test.ts
git commit -m "feat: support flash transitions in ai commands"
```

### Task 5: Final regression and cleanup

**Files:**
- Verify: all files above
- Remove after tests: `.directional-transitions-test.cjs`

- [ ] **Step 1: Run fresh verification**

```powershell
npx --no-install esbuild scripts/directionalTransitions.test.ts --bundle --platform=node --format=cjs --loader:.css=empty --outfile=.directional-transitions-test.cjs
node .directional-transitions-test.cjs
npx --no-install esbuild scripts/transitionTiming.test.ts --bundle --platform=node --format=cjs --outfile=.transition-timing-test.cjs
node .transition-timing-test.cjs
npm run build -- --logLevel error
```

Expected: both focused scripts pass and the production build exits `0`.

- [ ] **Step 2: Remove generated test bundles and inspect the diff**

```powershell
Remove-Item -LiteralPath .directional-transitions-test.cjs -Force
Remove-Item -LiteralPath .transition-timing-test.cjs -Force
git diff --check
git status --short
git log --oneline -6
```

Expected: no generated bundle remains; only known user-owned working-tree changes remain outside committed transition work.

- [ ] **Step 3: Request read-only code review**

Review the complete feature range for crossfade violations, nondeterminism, preview/export mismatch, edge exposure, old-project compatibility, and accidental changes to existing transitions. Resolve all Critical or Important findings with a new failing regression test before changing production code.

- [ ] **Step 4: Run Step 1 again after review**

Expected: fresh focused tests and production build all pass after the final reviewed code state.
