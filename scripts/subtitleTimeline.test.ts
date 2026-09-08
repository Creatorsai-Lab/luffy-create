import assert from 'node:assert/strict'
import { splitLongSubtitleCues, splitScriptIntoCueTexts } from '../src/subtitle/timeline'

const longCue = {
  id: 'long',
  start: 2,
  end: 10,
  text: 'Tommy is a good pet dog he has white fur and small tail',
}
const split = splitLongSubtitleCues([longCue], 4)

assert.deepEqual(split.map(cue => [cue.start, cue.end]), [[2, 6], [6, 10]])
assert.deepEqual(split.map(cue => cue.text), [
  'Tommy is a good pet dog',
  'dog he has white fur and small tail',
])
assert.ok(split.every(cue => cue.end - cue.start <= 4))

assert.deepEqual(splitLongSubtitleCues([
  { id: 'first', start: 0, end: 2, text: 'Tommy is' },
  { id: 'second', start: 2, end: 4, text: 'a good dog' },
]).map(cue => cue.text), ['Tommy is', 'is a good dog'])

assert.deepEqual(splitScriptIntoCueTexts(longCue.text, 2), [
  'Tommy is a good pet dog',
  'dog he has white fur and small tail',
])

console.log('subtitle timeline tests passed')
