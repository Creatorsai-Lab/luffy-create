import assert from 'node:assert/strict'
import {
  getDirectionalTransitionGeometry,
  getDirectionalTransitionState,
  isDirectionalTransition,
} from '../src/engine/directionalTransitions'
import {
  captureStageToCanvas,
  rememberRecentSnapshot,
} from '../src/components/canvas/captureStageToCanvas'
import {
  getTransitionCapabilities,
  TRANSITIONS,
  TRANSITIONS_WITH_DIRECTION,
  TRANSITIONS_WITH_STYLE_CONTROLS,
} from '../src/utils/transitions'
import { renderTransition } from '../src/engine/transitionRenderer'
import { prepareAiPlan } from '../src/ai/prepare'
import { planAiEdit } from '../src/ai/planner'
import type { AiProjectContext } from '../src/ai/types'

const flashStart = getDirectionalTransitionState('flashBlur', 0, 'right', 1, 50)
const flashPeak = getDirectionalTransitionState('flashBlur', 0.5, 'right', 1, 50)
const flashEnd = getDirectionalTransitionState('flashBlur', 1, 'right', 1, 50)

assert.deepEqual(flashStart, {
  scene: 'from', offsetX: 0, offsetY: 0, streakX: 0, streakY: 0, light: 0,
})
assert.equal(flashPeak.scene, 'to')
assert.ok(flashPeak.offsetX > 0 && flashPeak.streakX > 0 && flashPeak.light > 0)
assert.deepEqual(flashEnd, {
  scene: 'to', offsetX: 0, offsetY: 0, streakX: 0, streakY: 0, light: 0,
})

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
for (const type of ['flashBlur', 'flickerShake'] as const) {
  const zero = getDirectionalTransitionState(type, 0.5, 'right', 1, 0)
  assert.deepEqual(
    { offsetX: zero.offsetX, offsetY: zero.offsetY, streakX: zero.streakX, streakY: zero.streakY, light: zero.light },
    { offsetX: 0, offsetY: 0, streakX: 0, streakY: 0, light: 0 },
  )
}

function countCuts(speed: number) {
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
assert.deepEqual(
  getDirectionalTransitionState('flashBlur', Number.NaN, 'right', -10, 500),
  flashStart,
)

assert.ok(TRANSITIONS.some(item => item.value === 'flashBlur'))
assert.ok(TRANSITIONS.some(item => item.value === 'flickerShake'))
assert.ok(TRANSITIONS_WITH_DIRECTION.includes('flashBlur'))
assert.ok(TRANSITIONS_WITH_STYLE_CONTROLS.includes('flickerShake'))
assert.deepEqual(getTransitionCapabilities('flashBlur'), { direction: true, style: true })
assert.deepEqual(getTransitionCapabilities('fade'), { direction: false, style: false })
assert.equal(isDirectionalTransition('flashBlur'), true)
assert.equal(isDirectionalTransition('flickerShake'), true)
assert.equal(isDirectionalTransition('fade'), false)

const verticalPeak = getDirectionalTransitionState('flashBlur', 0.5, 'up', 1, 100)
const geometry = getDirectionalTransitionGeometry('flashBlur', verticalPeak, 640, 360, 100)
assert.ok((geometry.scale - 1) * 360 / 2 >=
  Math.abs(geometry.dy) + Math.abs(geometry.streakDy) + geometry.blur * 2)
const visiblePeak = getDirectionalTransitionGeometry('flashBlur', flashPeak, 640, 360, 50)
assert.ok(visiblePeak.dx >= 20)
assert.ok(visiblePeak.streakDx >= 25)
assert.ok(visiblePeak.blur >= 7)

const layerCanvases = [{ id: 'background' }, { id: 'elements' }]
const captured: object[] = []
const destination = {
  width: 0,
  height: 0,
  getContext: () => ({
    clearRect() {},
    drawImage(image: object) { captured.push(image) },
  }),
}
const stage = {
  getLayers: () => layerCanvases.map(image => ({
    getNativeCanvasElement: () => image,
  })),
}
assert.equal(
  captureStageToCanvas(
    stage as unknown as import('konva').default.Stage,
    destination as unknown as HTMLCanvasElement,
    640,
    360,
  ),
  destination,
)
assert.deepEqual(captured, layerCanvases)
assert.deepEqual({ width: destination.width, height: destination.height }, { width: 640, height: 360 })

const snapshots = new Map<string, string>()
rememberRecentSnapshot(snapshots, 'scene-1', 'one')
rememberRecentSnapshot(snapshots, 'scene-2', 'two')
rememberRecentSnapshot(snapshots, 'scene-3', 'three')
assert.deepEqual([...snapshots], [['scene-2', 'two'], ['scene-3', 'three']])
rememberRecentSnapshot(snapshots, 'scene-2', 'new-two')
assert.deepEqual([...snapshots], [['scene-3', 'three'], ['scene-2', 'new-two']])

function recordFrame(type: 'flashBlur' | 'flickerShake', progress: number) {
  const draws: Array<{ image: object; alpha: number; filter: string }> = []
  const translations: Array<[number, number]> = []
  const stack: Array<{ alpha: number; filter: string }> = []
  const ctx = {
    globalAlpha: 1,
    filter: 'none',
    fillStyle: '',
    save() { stack.push({ alpha: this.globalAlpha, filter: this.filter }) },
    restore() {
      const state = stack.pop()
      if (state) {
        this.globalAlpha = state.alpha
        this.filter = state.filter
      }
    },
    setTransform() {},
    clearRect() {},
    drawImage(image: object) {
      draws.push({ image, alpha: this.globalAlpha, filter: this.filter })
    },
    translate(x: number, y: number) { translations.push([x, y]) },
    scale() {},
    fillRect() {},
  }
  const from = { id: 'from' }
  const to = { id: 'to' }
  renderTransition({
    ctx: ctx as unknown as CanvasRenderingContext2D,
    width: 640,
    height: 360,
    progress,
    type,
    direction: 'right',
    speed: 1,
    hardness: 50,
    fromCanvas: from as unknown as HTMLCanvasElement,
    toCanvas: to as unknown as HTMLCanvasElement,
  })
  return { draws, translations, from, to }
}

for (const [type, progress] of [
  ['flashBlur', 0.49],
  ['flashBlur', 0.5],
  ['flickerShake', 0.35],
] as const) {
  const { draws, from, to } = recordFrame(type, progress)
  const expected = getDirectionalTransitionState(type, progress, 'right', 1, 50).scene === 'from'
    ? from : to
  assert.ok(draws.length > 0)
  assert.ok(draws.every(draw => draw.image === expected))
  assert.ok(draws.some(draw => draw.alpha === 1))
}

const beforeSwap = recordFrame('flashBlur', 0.25)
assert.ok(beforeSwap.draws.every(draw => draw.image === beforeSwap.from))
assert.ok(beforeSwap.draws.some(draw => /^blur\((?!0(?:\.0+)?px)/.test(draw.filter)))
assert.ok(beforeSwap.translations.some(([x, y]) => x !== 320 || y !== 180))

const afterSwap = recordFrame('flashBlur', 0.75)
assert.ok(afterSwap.draws.every(draw => draw.image === afterSwap.to))
assert.ok(afterSwap.draws.some(draw => /^blur\((?!0(?:\.0+)?px)/.test(draw.filter)))

const settled = getDirectionalTransitionGeometry('flashBlur', flashEnd, 640, 360, 50)
assert.deepEqual(
  { dx: settled.dx, dy: settled.dy, streakDx: settled.streakDx, streakDy: settled.streakDy, blur: settled.blur },
  { dx: 0, dy: 0, streakDx: 0, streakDy: 0, blur: 0 },
)
const settledFrame = recordFrame('flashBlur', 1)
assert.ok(settledFrame.draws.every(draw => draw.image === settledFrame.to))

const aiContext: AiProjectContext = {
  project: {
    id: 'project',
    name: 'Test',
    width: 1920,
    height: 1080,
    fps: 30,
    sceneCount: 2,
    totalDuration: 10,
  },
  currentSceneIndex: 2,
  currentSceneId: 'scene-2',
  selectedIds: [],
  selectedElements: [],
  scenes: [],
  assets: [],
}

async function testAiTransitions() {
  const prepared = prepareAiPlan({
    summary: 'Set flash blur',
    commands: [{
      type: 'setTransition',
      sceneIndex: 2,
      transition: {
        type: 'flashBlur',
        duration: 8,
        direction: 'up',
        speed: 9,
        hardness: -20,
      },
    }],
  }, aiContext)
  const preparedCommand = prepared.plan.commands[0]
  assert.equal(preparedCommand.type, 'setTransition')
  if (preparedCommand.type === 'setTransition') {
    assert.deepEqual(preparedCommand.transition, {
      type: 'flashBlur',
      duration: 5,
      direction: 'up',
      speed: 3,
      hardness: 0,
    })
  }

  Object.assign(globalThis, { window: { api: {} } })
  const planned = await planAiEdit(
    'Set flicker shake transition on scene 2 from top duration 1.2 speed 2.4 hardness 70',
    aiContext,
  )
  assert.equal(planned.source, 'local')
  const command = planned.plan.commands[0]
  assert.equal(command.type, 'setTransition')
  if (command.type === 'setTransition') {
    assert.deepEqual(command.transition, {
      type: 'flickerShake',
      duration: 1.2,
      direction: 'up',
      speed: 2.4,
      hardness: 70,
    })
  }
}

testAiTransitions()
  .then(() => console.log('directional transition tests passed'))
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
