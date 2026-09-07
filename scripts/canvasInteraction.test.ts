import assert from 'node:assert/strict'
import {
  getCanvasElementInteraction,
  getCanvasCursor,
  shouldShowSelectionHandles,
} from '../src/utils/canvasInteraction'

assert.deepEqual(getCanvasElementInteraction('select', false, 'shape'), {
  draggable: true,
  listening: true,
})
assert.deepEqual(getCanvasElementInteraction('arrow', false, 'shape'), {
  draggable: false,
  listening: false,
})
assert.deepEqual(getCanvasElementInteraction('shape-rect', false, 'text'), {
  draggable: false,
  listening: false,
})
assert.deepEqual(getCanvasElementInteraction('select', true, 'image'), {
  draggable: false,
  listening: false,
})
assert.deepEqual(getCanvasElementInteraction('select', false, 'handDraw'), {
  draggable: false,
  listening: true,
})

assert.equal(getCanvasCursor('arrow'), 'crosshair')
assert.equal(getCanvasCursor('shape-circle', 'selected'), 'crosshair')
assert.equal(getCanvasCursor('select'), 'default')
assert.equal(getCanvasCursor('select', 'selected', true), 'move')
assert.equal(getCanvasCursor('select', 'selected', false), 'default')
assert.equal(getCanvasCursor('select', 'dragging', true), 'move')
assert.equal(shouldShowSelectionHandles('select'), true)
assert.equal(shouldShowSelectionHandles('arrow'), false)
assert.equal(shouldShowSelectionHandles('shape-rect'), false)

console.log('canvas interaction tests passed')
