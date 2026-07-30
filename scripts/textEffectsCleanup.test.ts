import assert from 'node:assert/strict'
import {
  TEXT_EFFECT_OPTIONS,
  normalizeTextEffects,
  resolveTextEffectProps,
} from '../src/utils/textEffects'

assert.deepEqual(TEXT_EFFECT_OPTIONS.map(option => option.value), ['glow', 'hollow'])
assert.deepEqual(
  normalizeTextEffects(['shadow', 'glow', 'outline', 'hollow', 'glitch', 'bubble', 'glow']),
  ['glow', 'hollow'],
)
assert.deepEqual(normalizeTextEffects(), [])

const baseText = {
  shadowColor: '#222222',
  shadowBlur: 4,
  shadowOffsetX: 1,
  shadowOffsetY: 2,
  textStroke: '',
  textStrokeWidth: 0,
}

assert.deepEqual(resolveTextEffectProps({ ...baseText, effects: ['shadow', 'outline'] }, '#ff8800'), {
  shadowEnabled: true,
  shadowColor: '#222222',
  shadowBlur: 4,
  shadowOffsetX: 1,
  shadowOffsetY: 2,
  stroke: undefined,
  strokeWidth: 0,
  strokeEnabled: false,
  fillEnabled: true,
})
assert.equal(resolveTextEffectProps({ ...baseText, effects: ['glow'] }, '#ff8800').shadowColor, '#ff8800')
assert.equal(resolveTextEffectProps({ ...baseText, effects: ['hollow'] }, '#ff8800').fillEnabled, false)
