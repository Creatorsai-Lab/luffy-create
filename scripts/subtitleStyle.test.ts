import assert from 'node:assert/strict'

import { defaultSubtitleStyle, normalizeSubtitleStyle } from '../src/subtitle/types'

const defaults = defaultSubtitleStyle()

assert.equal(defaults.fontFamily, 'Inter')
assert.equal(defaults.fillMode, 'solid')
assert.equal(defaults.maxWidthPct, 90)
assert.equal(defaults.positionX, 50)
assert.equal(defaults.positionY, 4)
assert.equal('backgroundEnabled' in defaults, false)
assert.equal('position' in defaults, false)
assert.equal('align' in defaults, false)
assert.equal(defaults.animation, 'wordPop')
assert.equal(defaults.captionLook, 'normal')
assert.equal(defaults.warpIntensity, 50)
assert.equal('curveIntensity' in defaults, false)

const normalized = normalizeSubtitleStyle({
  fontFamily: 'Poppins',
  color: '#f8fafc',
  positionX: 140,
  positionY: -20,
})

assert.equal(normalized.fontFamily, 'Poppins')
assert.equal(normalized.color, '#f8fafc')
assert.equal(normalized.gradientColor2, '#8b5cf6')
assert.equal(normalized.positionX, 100)
assert.equal(normalized.positionY, 0)
assert.equal(normalized.animation, 'wordPop')

assert.equal(normalizeSubtitleStyle({ animation: 'fade' }).animation, 'smoothReveal')
assert.equal(normalizeSubtitleStyle({ animation: 'slideUp' }).animation, 'smoothReveal')
assert.equal(normalizeSubtitleStyle({ animation: 'pop' }).animation, 'wordPop')

const legacyBulge = normalizeSubtitleStyle({ captionLook: 'curveOut', curveIntensity: 70 } as unknown as Partial<typeof defaults>)
const legacyInflate = normalizeSubtitleStyle({ captionLook: 'curveIn' } as unknown as Partial<typeof defaults>)
assert.equal(legacyBulge.captionLook, 'bulge')
assert.equal(legacyBulge.warpIntensity, 70)
assert.equal(legacyInflate.captionLook, 'inflate')
assert.equal(normalizeSubtitleStyle({ warpIntensity: 140 }).warpIntensity, 100)

console.log('subtitle style tests passed')
