import assert from 'node:assert/strict'
import {
  fitSubtitleRow,
  getCaptionOrigin,
  getSubtitleRenderRows,
  getSubtitleBlockState,
  getSubtitleWarpScale,
  getSubtitleWordState,
  layoutMeasuredSubtitleWords,
  layoutSubtitleLines,
  layoutSubtitleStack,
} from '../src/subtitle/presentation'
import { makeSubtitleTrack } from '../src/subtitle/types'
import { mergeCueTranslation } from '../src/subtitle/translation'

const sourceCue = { id: 'bilingual', start: 0, end: 2, text: 'गुरुत्वाकर्षण द्रव्यमानों को आकर्षित करता है।' }
const hindiTrack = { ...makeSubtitleTrack(), language: 'hi' as const, translation: { ...makeSubtitleTrack().translation!, targetLanguage: 'en' as const } }
const bilingualCue = mergeCueTranslation(sourceCue, 'en', 'Gravity attracts masses.')
const rows = getSubtitleRenderRows(hindiTrack, bilingualCue)
assert.deepEqual(rows.map(row => row.language), ['en', 'hi'])
assert.equal(rows[0].text, 'Gravity attracts masses.')
assert.equal(rows[1].text, sourceCue.text)

const hiddenRows = getSubtitleRenderRows({ ...hindiTrack, translation: { ...hindiTrack.translation!, visible: false } }, bilingualCue)
assert.deepEqual(hiddenRows.map(row => row.language), ['hi'])
assert.deepEqual(getSubtitleRenderRows(hindiTrack, { ...bilingualCue, text: `${sourceCue.text}!` }).map(row => row.language), ['hi'])

const fitted = fitSubtitleRow('a deliberately long caption', 48, 300, (text, size) => text.length * size * 0.55)
assert.ok(fitted.width <= 300)
assert.ok(fitted.fontSize <= 48)
assert.equal(fitted.lines, 1)

const tinyFit = fitSubtitleRow('a caption that cannot fit at minimum font size', 48, 20, (text, size) => text.length * size)
assert.ok(tinyFit.width * tinyFit.scaleX <= 20)
assert.equal(tinyFit.fontSize, 12)

const stack = layoutSubtitleStack([{ width: 280, height: 48 }, { width: 260, height: 42 }], 8)
assert.equal(stack.width, 280)
assert.equal(stack.height, 98)
assert.deepEqual(stack.rows.map(row => row.y), [0, 56])

const caption = 'Any Content with this Font Style is getting Viral'
const normal = layoutSubtitleLines(caption, 18)
assert.ok(normal.length <= 2)

const curveOut = layoutSubtitleLines(caption, 80)
assert.equal(curveOut.length, 1)
assert.equal(curveOut[0].text, caption)
assert.ok(layoutSubtitleLines(`${caption} ${caption}`, 18).length <= 2)

assert.ok(getSubtitleWarpScale('bulge', 100, 1, 3) > getSubtitleWarpScale('bulge', 100, 0, 3))
assert.ok(getSubtitleWarpScale('inflate', 100, 0, 3) > getSubtitleWarpScale('inflate', 100, 1, 3))
assert.equal(getSubtitleWarpScale('normal', 100, 1, 3), 1)
assert.equal(getSubtitleWarpScale('bulge', 0, 1, 3), 1)

const measured = layoutMeasuredSubtitleWords('Wide i', value => ({ Wide: 80, i: 5, ' ': 7 })[value] ?? 0)
assert.deepEqual(measured.words.map(word => ({ text: word.text, x: word.x, width: word.width })), [
  { text: 'Wide', x: 0, width: 80 },
  { text: 'i', x: 87, width: 5 },
])
assert.equal(measured.naturalWidth, 92)

const smoothBulge = Array.from({ length: 9 }, (_, index) => getSubtitleWarpScale('bulge', 100, index, 9))
assert.ok(smoothBulge[4] >= 1.8, 'maximum bulge intensity should be visibly strong')
assert.ok(smoothBulge[0] <= 0.71, 'maximum bulge intensity should compress its outer edges')
assert.deepEqual(smoothBulge.map(value => value.toFixed(3)), [...smoothBulge].reverse().map(value => value.toFixed(3)))
assert.ok(smoothBulge.slice(1).every((value, index) => Math.abs(value - smoothBulge[index]) < 0.5), 'warp profile should change smoothly')

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
