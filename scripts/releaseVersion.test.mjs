import assert from 'node:assert/strict'
import { verifyTagVersion } from './verify-release.mjs'

assert.equal(verifyTagVersion('v1.3.4', '1.3.4'), true)
assert.throws(() => verifyTagVersion('1.3.4', '1.3.4'), /must use v/)
assert.throws(() => verifyTagVersion('v1.3.5', '1.3.4'), /does not match/)

console.log('release version tests passed')
