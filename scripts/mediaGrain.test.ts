import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import MediaGrainControls from '../src/components/panels/MediaGrainControls'
import { drawGrain } from '../src/engine/imageFilters'
import { makeImage, makeVideo } from '../src/utils/defaults'

let tileCreates = 0
Object.defineProperty(globalThis, 'document', {
  configurable: true,
  value: {
    createElement(tag: string) {
      assert.equal(tag, 'canvas')
      tileCreates += 1
      return {
        width: 0,
        height: 0,
        getContext(kind: string) {
          assert.equal(kind, '2d')
          return {
            clearRect() {},
            fillRect() {},
            fillStyle: '',
            globalAlpha: 1,
          }
        },
      }
    },
  },
})

const operations: string[] = []
const fillRects: number[][] = []
const appliedAlphas: number[] = []
let patternCalls = 0
const context = {
  save() { operations.push('save') },
  restore() { operations.push('restore') },
  createPattern(_tile: unknown, repeat: string) {
    assert.equal(repeat, 'repeat')
    patternCalls += 1
    return { pattern: true }
  },
  fillRect(...values: number[]) {
    operations.push('fillRect')
    fillRects.push(values)
  },
  set filter(value: string) { operations.push(`filter:${value}`) },
  set globalCompositeOperation(value: string) { operations.push(`composite:${value}`) },
  set fillStyle(_value: unknown) { operations.push('fillStyle') },
  set globalAlpha(value: number) { appliedAlphas.push(value) },
} as unknown as CanvasRenderingContext2D

drawGrain(context, { width: 320, height: 180, grainOpacity: 0 })
assert.deepEqual(operations, [])
assert.equal(tileCreates, 0)

const grain = {
  width: 320,
  height: 180,
  grainColor: '#7a4b22',
  grainSize: 2,
  grainOpacity: 0.65,
}
drawGrain(context, grain)
drawGrain(context, grain)
assert.deepEqual(fillRects.at(-1), [0, 0, 320, 180])
assert.equal(patternCalls, 2)
assert.equal(tileCreates, 1)
assert.equal(appliedAlphas.at(-1), 0.65)

drawGrain(context, { ...grain, grainOpacity: 2 })
assert.equal(appliedAlphas.at(-1), 1)
assert.equal(tileCreates, 1)

drawGrain(context, { ...grain, grainSize: 4 })
assert.equal(tileCreates, 2)

for (const media of [
  makeImage(0, 0, 'image.png', 'image-id'),
  makeVideo(0, 0, 'video.mp4', 'video-id'),
]) {
  assert.equal(media.grainColor, '#000000')
  assert.equal(media.grainSize, 1)
  assert.equal(media.grainOpacity, 0)
}

const controlsMarkup = renderToStaticMarkup(createElement(MediaGrainControls, {
  value: { grainColor: '#7a4b22', grainSize: 3, grainOpacity: 0.45 },
  onChange() {},
}))
for (const label of ['Grain Color', 'Grain Size', 'Grain Hardness']) {
  assert.equal(controlsMarkup.includes(label), true)
}
assert.equal(controlsMarkup.includes('type="color"'), true)
assert.equal(controlsMarkup.includes('min="1" max="8"'), true)
assert.equal(controlsMarkup.includes('min="0" max="100"'), true)
assert.equal(controlsMarkup.includes('45%'), true)
s