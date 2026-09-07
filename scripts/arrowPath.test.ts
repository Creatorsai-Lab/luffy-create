import assert from 'node:assert/strict'
import { getArrowPathPoints } from '../src/engine/arrowPath'

const route = { x1: 0, y1: 0, x2: 100, y2: 80, curve: 0 }

assert.deepEqual(getArrowPathPoints(route), [0, 0, 100, 80])
assert.deepEqual(
  getArrowPathPoints({ ...route, bendCount: 1, bendDirection: 'horizontal', bendCurve: 0 }),
  [0, 0, 100, 0, 100, 80],
)
assert.deepEqual(
  getArrowPathPoints({ ...route, bendCount: 1, bendDirection: 'vertical', bendCurve: 0 }),
  [0, 0, 0, 80, 100, 80],
)
assert.deepEqual(
  getArrowPathPoints({ ...route, bendCount: 2, bendDirection: 'horizontal', bendCurve: 0 }),
  [0, 0, 50, 0, 50, 80, 100, 80],
)
assert.deepEqual(
  getArrowPathPoints({ ...route, bendCount: 2, bendDirection: 'vertical', bendCurve: 0 }),
  [0, 0, 0, 40, 100, 40, 100, 80],
)

const rounded = getArrowPathPoints({
  ...route,
  bendCount: 2,
  bendDirection: 'horizontal',
  bendCurve: 20,
})
assert.deepEqual(rounded.slice(0, 2), [0, 0])
assert.deepEqual(rounded.slice(-2), [100, 80])
assert.ok(rounded.length > 8)
assert.ok(rounded.every(Number.isFinite))

const halfDrawn = getArrowPathPoints({
  ...route,
  bendCount: 2,
  bendDirection: 'horizontal',
  bendCurve: 0,
}, 0.5)
assert.deepEqual(halfDrawn.slice(-2), [50, 40])

const bowed = getArrowPathPoints({ ...route, curve: 40 })
assert.deepEqual(bowed.slice(0, 2), [0, 0])
assert.deepEqual(bowed.slice(-2), [100, 80])
assert.ok(bowed.length > 4)

assert.deepEqual(
  getArrowPathPoints({ x1: 5, y1: 7, x2: 5, y2: 7, bendCount: 2 }),
  [5, 7, 5, 7],
)

console.log('arrow path tests passed')
