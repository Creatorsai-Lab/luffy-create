import assert from 'node:assert/strict'
import type { ImageElement, ShapeElement } from '../src/types/editor'
import { borderAnimationAngle, getElementBorderColor, getElementBorderWidth, isGradientBorderActive } from '../src/engine/borderRenderer'

const shape: ShapeElement = {
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
}

assert.equal(getElementBorderWidth(shape), 6)
assert.equal(getElementBorderColor(shape), '#ff0000')
assert.equal(isGradientBorderActive(shape), false)

const image: ImageElement = {
  id: 'image-1',
  type: 'image',
  name: 'Image',
  x: 0,
  y: 0,
  width: 160,
  height: 120,
  rotation: 0,
  opacity: 1,
  zIndex: 0,
  locked: false,
  visible: true,
  animations: [],
  src: 'image.png',
  assetId: 'asset-1',
  cornerRadius: 12,
  borderColor: '#00ff88',
  borderWidth: 4,
  borderFillMode: 'linearGradient',
}

assert.equal(getElementBorderWidth(image), 4)
assert.equal(getElementBorderColor(image), '#00ff88')
assert.equal(isGradientBorderActive(image), true)
assert.equal(borderAnimationAngle(30, 1, 0.5), 210)
assert.equal(borderAnimationAngle(350, 0.5, 1), 170)

console.log('gradient border tests passed')
