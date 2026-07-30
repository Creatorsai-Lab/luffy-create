import assert from 'node:assert/strict'
import { TEXT_EFFECT_OPTIONS, normalizeTextEffects } from '../src/utils/textEffects'

assert.deepEqual(TEXT_EFFECT_OPTIONS.map(option => option.value), ['glow', 'hollow'])
assert.deepEqual(
  normalizeTextEffects(['shadow', 'glow', 'outline', 'hollow', 'glitch', 'bubble', 'glow']),
  ['glow', 'hollow'],
)
assert.deepEqual(normalizeTextEffects(), [])
