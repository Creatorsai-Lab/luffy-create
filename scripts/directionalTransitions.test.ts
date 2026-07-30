import assert from 'node:assert/strict'
import { getDirectionalTransitionState } from '../src/engine/directionalTransitions'
import {
  TRANSITIONS,
  TRANSITIONS_WITH_DIRECTION,
  TRANSITIONS_WITH_STYLE_CONTROLS,
} from '../src/utils/transitions'

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

console.log('directional transition tests passed')
