import assert from 'node:assert/strict'
import { clampAudioVolume } from '../src/utils/audioEffects'

assert.equal(clampAudioVolume(undefined), 1)
assert.equal(clampAudioVolume(-0.5), 0)
assert.equal(clampAudioVolume(0.75), 0.75)
assert.equal(clampAudioVolume(1.5), 1.5)
assert.equal(clampAudioVolume(2), 2)
assert.equal(clampAudioVolume(3), 2)

console.log('audio volume tests passed')
