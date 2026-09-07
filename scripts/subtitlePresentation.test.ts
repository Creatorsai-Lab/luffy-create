import assert from 'node:assert/strict'
import {
  getCaptionOrigin,
  getSubtitleBlockState,
  getSubtitleCurveOffset,
  getSubtitleWordState,
  layoutSubtitleLines,
} from '../src/subtitle/presentation'

const caption = 'Any Content with this Font Style is getting Viral'
const normal = layoutSubtitleLines(caption, 18)
assert.ok(normal.length <= 2)

const curveOut = layoutSubtitleLines(caption, 80)
assert.equal(curveOut.length, 1)
assert.equal(curveOut[0].text, caption)
assert.ok(layoutSubtitleLines(`${caption} ${caption}`, 18).length <= 2)

assert.ok(getSubtitleCurveOffset('curveOut', 100, 1, 3, 50) < getSubtitleCurveOffset('curveOut', 100, 0, 3, 50))
assert.ok(getSubtitleCurveOffset('curveIn', 100, 1, 3, 50) > getSubtitleCurveOffset('curveIn', 100, 0, 3, 50))
assert.equal(getSubtitleCurveOffset('curveOut', 0, 1, 3, 50), 0)

assert.deepEqual(getCaptionOrigin(1000, 500, 400, 100, 50, 50), { x: 300, y: 200 })
assert.deepEqual(getCaptionOrigin(1000, 500, 400, 100, 0, 0), { x: 0, y: 0 })
assert.deepEqual(getCaptionOrigin(1000, 500, 400, 100, 100, 100), { x: 600, y: 400 })
assert.deepEqual(getCaptionOrigin(100, 50, 120, 80, 50, 50), { x: 0, y: 0 })

assert.deepEqual(getSubtitleBlockState('smoothReveal', 0), { opacity: 0, scale: 0.94, offsetY: 24 })
assert.deepEqual(getSubtitleBlockState('smoothReveal', 1), { opacity: 1, scale: 1, offsetY: 0 })
assert.deepEqual(getSubtitleBlockState('wordPop', 0), { opacity: 1, scale: 1, offsetY: 0 })

const rising = getSubtitleWordState('wordRise', 0, 0, 3)
assert.equal(rising.opacity, 0)
assert.equal(rising.offsetY, 22)
assert.deepEqual(getSubtitleWordState('wordRise', 1, 2, 3), {
  opacity: 1, scale: 1, offsetY: 0, emphasis: 0,
})

const karaokeActive = getSubtitleWordState('karaokePulse', 0.45, 1, 3)
const karaokeFuture = getSubtitleWordState('karaokePulse', 0.45, 2, 3)
assert.equal(karaokeActive.opacity, 1)
assert.ok(karaokeActive.scale > 1)
assert.equal(karaokeFuture.opacity, 0.35)

console.log('subtitle presentation tests passed')
