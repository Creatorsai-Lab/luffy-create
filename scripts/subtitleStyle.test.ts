import assert from 'node:assert/strict'

import { defaultSubtitleStyle, normalizeSubtitleStyle } from '../src/subtitle/types'

const defaults = defaultSubtitleStyle()

assert.equal(defaults.fontFamily, 'Inter')
assert.equal(defaults.fillMode, 'solid')
assert.equal(defaults.backgroundEnabled, true)
assert.equal(defaults.marginTop, 80)
assert.equal(defaults.marginRight, 120)
assert.equal(defaults.marginBottom, 80)
assert.equal(defaults.marginLeft, 120)
assert.equal(defaults.animation, 'fade')

const normalized = normalizeSubtitleStyle({
  fontFamily: 'Poppins',
  color: '#f8fafc',
  backgroundOpacity: 0.4,
})

assert.equal(normalized.fontFamily, 'Poppins')
assert.equal(normalized.color, '#f8fafc')
assert.equal(normalized.backgroundOpacity, 0.4)
assert.equal(normalized.gradientColor2, '#8b5cf6')
assert.equal(normalized.marginBottom, 80)
assert.equal(normalized.animation, 'fade')

console.log('subtitle style tests passed')
