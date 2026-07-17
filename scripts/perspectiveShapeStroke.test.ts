import assert from 'node:assert/strict'
import type { ShapeElement } from '../src/types/editor'
import { perspectiveShapeStrokeOutlines } from '../src/engine/perspectiveUtils'

const baseShape: ShapeElement = {
  id: 'shape-1',
  type: 'shape',
  name: 'Shape',
  x: 0,
  y: 0,
  width: 100,
  height: 80,
  rotation: 0,
  opacity: 1,
  zIndex: 0,
  locked: false,
  visible: true,
  animations: [],
  shapeType: 'rect',
  fill: '#3366ff',
  stroke: '#ff0000',
  strokeWidth: 6,
  cornerRadius: 0,
  perspectivePts: {
    tl: [10, 0],
    tr: [110, 20],
    br: [100, 100],
    bl: [0, 80],
  },
}

const rectOutlines = perspectiveShapeStrokeOutlines(baseShape)
assert.equal(rectOutlines.length, 1)
assert.deepEqual(rectOutlines[0].closed, true)
assert.deepEqual(rectOutlines[0].points, [
  [10, 0],
  [110, 20],
  [100, 100],
  [0, 80],
])

const diamondOutlines = perspectiveShapeStrokeOutlines({
  ...baseShape,
  shapeType: 'diamond',
})
assert.equal(diamondOutlines.length, 1)
assert.deepEqual(diamondOutlines[0].points[0], [60, 10])
assert.deepEqual(diamondOutlines[0].points[1], [105, 60])
assert.deepEqual(diamondOutlines[0].points[2], [50, 90])
assert.deepEqual(diamondOutlines[0].points[3], [5, 40])

console.log('perspective shape stroke tests passed')
