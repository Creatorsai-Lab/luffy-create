import assert from 'node:assert/strict'
import { makePerspectiveControls, makePerspectivePtsFromControls } from '../src/engine/perspectiveUtils'

const neutral = makePerspectivePtsFromControls(200, 100, makePerspectiveControls())
assert.deepEqual(neutral, {
  tl: [0, 0],
  tr: [200, 0],
  br: [200, 100],
  bl: [0, 100],
})

const tiltedRight = makePerspectivePtsFromControls(200, 100, {
  ...makePerspectiveControls(),
  horizontalTilt: 50,
  depth: 50,
})
assert.deepEqual(tiltedRight, {
  tl: [25, 12.5],
  tr: [200, 0],
  br: [200, 100],
  bl: [25, 87.5],
})

const tiltedTop = makePerspectivePtsFromControls(200, 100, {
  ...makePerspectiveControls(),
  verticalTilt: -50,
  depth: 50,
})
assert.deepEqual(tiltedTop, {
  tl: [25, 12.5],
  tr: [175, 12.5],
  br: [200, 100],
  bl: [0, 100],
})

const skewed = makePerspectivePtsFromControls(200, 100, {
  ...makePerspectiveControls(),
  skewX: 20,
  skewY: -20,
})
assert.deepEqual(skewed, {
  tl: [10, -5],
  tr: [210, 5],
  br: [190, 105],
  bl: [-10, 95],
})

console.log('perspective control tests passed')
