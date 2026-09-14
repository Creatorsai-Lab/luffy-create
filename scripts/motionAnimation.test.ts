import assert from 'node:assert/strict'
import { getAnimatedProps } from '../src/engine/animator'
import type { ElementAnimation } from '../src/types/editor'
import { makeImage } from '../src/utils/defaults'

const zoom = (
  type: 'zoomIn' | 'zoomOut',
  startTime: number,
  duration: number,
  zoomPosition: 'center' | 'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft' = 'center',
  zoomScale = type === 'zoomIn' ? 1.5 : 1,
) => ({
  id: `${type}-${startTime}`,
  type,
  timing: 'onEnter',
  startTime,
  duration,
  delay: 0,
  easing: 'easeInOut',
  params: { zoomPosition, zoomScale },
}) as unknown as ElementAnimation

const image = makeImage(100, 200, 'image.png', 'asset-1', 400, 200)

image.animations = [zoom('zoomIn', 1, 2, 'topLeft', 3)]
assert.deepEqual(
  pick(getAnimatedProps(image, 0.5)),
  { x: 100, y: 200, scaleX: 1, scaleY: 1 },
  'Zoom In must not alter the item before its start time',
)
const zoomMidpoint = pick(getAnimatedProps(image, 2))
assert.equal(zoomMidpoint.scaleX, 2, 'Zoom In must interpolate toward its selected multiplier')
assert.equal(zoomMidpoint.x, 100 + (image.width / 2) * (zoomMidpoint.scaleX - 1), 'top-left zoom must keep the left edge anchored')
assert.equal(zoomMidpoint.y, 200 + (image.height / 2) * (zoomMidpoint.scaleY - 1), 'top-left zoom must keep the top edge anchored')
assert.deepEqual(
  pick(getAnimatedProps(image, 4)),
  { x: 500, y: 400, scaleX: 3, scaleY: 3 },
  'Zoom In must remain enlarged after its duration',
)

image.animations = [zoom('zoomIn', 1, 1, 'center', 3), zoom('zoomOut', 4, 2, 'center', 1)]
assert.equal(getAnimatedProps(image, 3).scaleX, 3, 'completed Zoom In must remain active before Zoom Out')
const zoomOutMidpoint = getAnimatedProps(image, 5).scaleX
assert.equal(zoomOutMidpoint, 2, 'Zoom Out must interpolate from the current scale to its target')
assert.equal(getAnimatedProps(image, 7).scaleX, 1, 'completed Zoom Out must restore one zoom step')

image.animations = [zoom('zoomOut', 4, 2, 'center', 0.5), zoom('zoomIn', 1, 1, 'center', 3)]
assert.equal(getAnimatedProps(image, 7).scaleX, 0.5, 'zoom targets must follow their configured delays, not card creation order')

const move = {
  id: 'move-1',
  type: 'move',
  timing: 'onEnter',
  startTime: 0,
  duration: 4,
  delay: 0,
  easing: 'linear',
  params: { deltaX: 200, deltaY: 0 },
} as ElementAnimation
image.animations = [move, zoom('zoomIn', 1, 2, 'topRight', 1.5)]
const combined = getAnimatedProps(image, 2)
assert.equal(combined.scaleX, 1.25, 'Zoom In must animate while Move is active')
assert.equal(combined.x, 150, 'top-right zoom anchoring must compose with the Move position')
assert.equal(combined.y, 225, 'top-right zoom must keep the top edge anchored')

image.animations = [
  { ...move, id: 'move-x', params: { deltaX: 200, deltaY: 0 } },
  { ...move, id: 'move-y', params: { deltaX: 0, deltaY: 100 } },
]
assert.deepEqual(
  pick(getAnimatedProps(image, 2)),
  { x: 200, y: 250, scaleX: 1, scaleY: 1 },
  'separately timed Move cards must compose instead of replacing each other',
)

function pick(props: ReturnType<typeof getAnimatedProps>) {
  return { x: props.x, y: props.y, scaleX: props.scaleX, scaleY: props.scaleY }
}

console.log('motion animation tests passed')
