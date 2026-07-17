import assert from 'node:assert/strict'
import { audioFadeMultiplierAt, buildFfmpegFadeVolumeExpression } from '../src/utils/audioFade'

const base = {
  duration: 20,
  fadeIn: 5,
  fadeInVolume: 1.2,
  fadeOut: 4,
  fadeOutVolume: 0.4,
}

assert.equal(audioFadeMultiplierAt({ ...base, clipTime: 0 }), 0)
assert.equal(audioFadeMultiplierAt({ ...base, clipTime: 2.5 }), 0.6)
assert.equal(audioFadeMultiplierAt({ ...base, clipTime: 5 }), 1.2)
assert.equal(audioFadeMultiplierAt({ ...base, clipTime: 5.1 }), 1)
assert.equal(audioFadeMultiplierAt({ ...base, clipTime: 15.9 }), 1)
assert.equal(audioFadeMultiplierAt({ ...base, clipTime: 18 }), 0.7)
assert.equal(audioFadeMultiplierAt({ ...base, clipTime: 20 }), 0.4)

assert.equal(audioFadeMultiplierAt({
  duration: 10,
  fadeIn: 0,
  fadeInVolume: 1.8,
  fadeOut: 0,
  fadeOutVolume: 0.2,
  clipTime: 5,
}), 1)

const expr = buildFfmpegFadeVolumeExpression({
  duration: 20,
  baseVolume: 0.8,
  fadeIn: 5,
  fadeInVolume: 1.2,
  fadeOut: 4,
  fadeOutVolume: 0.4,
})

assert.match(expr, /^volume='/)
assert.match(expr, /0\.8000\*/)
assert.match(expr, /min\(t\/5\.000\\,1\)\*1\.2000/)
assert.match(expr, /if\(gte\(t\\,16\.000\)\\,/)
assert.match(expr, /0\.4000/)

console.log('audio fade tests passed')
