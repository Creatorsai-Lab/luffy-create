import assert from 'node:assert/strict'

import {
  buildTranslationChunks,
  parseTranslatedChunk,
  protectTranslationChunk,
  restoreTranslationChunk,
  validateTranslation,
} from '../electron/main/subtitleTranslationCore'

const cues = [
  { id: 'a', text: 'Einstein wrote E = mc^2 in 1905.' },
  { id: 'b', text: 'Read https://example.org and keep DNA unchanged.' },
]
const chunks = buildTranslationChunks(cues, 120)
assert.equal(chunks.length, 1)
assert.deepEqual(chunks[0].cueIds, ['a', 'b'])
assert.match(chunks[0].text, /^__LF_CUE_a__/)

const split = buildTranslationChunks([
  { id: 'a', text: 'one two three' },
  { id: 'b', text: 'four five three' },
], 4)
assert.deepEqual(split.map(chunk => chunk.cueIds), [['a'], ['b']])

const protectedChunk = protectTranslationChunk(chunks[0], [
  { source: 'Einstein', target: 'आइंस्टीन' },
  { source: 'DNA', target: 'DNA' },
])
assert.ok(!protectedChunk.text.includes('1905'))
assert.ok(!protectedChunk.text.includes('https://example.org'))
assert.ok(!protectedChunk.text.includes('E = mc^2'))
assert.match(protectedChunk.text, /__LF_KEEP_\d{4}__/)

const translatedWire = protectedChunk.text
  .replace('wrote', 'ने लिखा')
  .replace('Read', 'पढ़ें')
const restored = restoreTranslationChunk(translatedWire, protectedChunk.tokens)
const parsed = parseTranslatedChunk(restored, ['a', 'b'])
assert.equal(parsed.size, 2)
assert.match(parsed.get('a') ?? '', /आइंस्टीन/)
assert.match(parsed.get('a') ?? '', /1905/)
assert.match(parsed.get('a') ?? '', /E = mc\^2/)
assert.match(parsed.get('b') ?? '', /https:\/\/example\.org/)
assert.match(parsed.get('b') ?? '', /DNA/)

assert.throws(
  () => parseTranslatedChunk(restored.replace('__LF_CUE_b__', ''), ['a', 'b']),
  /marker/i,
)
assert.throws(
  () => parseTranslatedChunk(`${restored}\n__LF_CUE_a__ duplicate`, ['a', 'b']),
  /marker/i,
)
assert.throws(
  () => parseTranslatedChunk(restored.replace(/(__LF_CUE_a__)([\s\S]*?)(__LF_CUE_b__)/, '$3$2$1'), ['a', 'b']),
  /order/i,
)
assert.throws(
  () => restoreTranslationChunk(translatedWire.replace(protectedChunk.tokens[0].token, ''), protectedChunk.tokens),
  /protected/i,
)

const longest = protectTranslationChunk(buildTranslationChunks([
  { id: 'term', text: 'machine learning improves a machine.' },
], 120)[0], [
  { source: 'machine', target: 'मशीन' },
  { source: 'machine learning', target: 'मशीन लर्निंग' },
])
const longestRestored = restoreTranslationChunk(longest.text, longest.tokens)
assert.match(longestRestored, /मशीन लर्निंग improves a मशीन/)

assert.deepEqual(validateTranslation('hello world', '', 'hi', []), ['empty-output'])
assert.ok(validateTranslation('hello world', 'hello world', 'hi', []).includes('unchanged-output'))
assert.ok(validateTranslation('hello world', 'plain latin output', 'hi', []).includes('unexpected-script'))
assert.ok(validateTranslation('नमस्ते दुनिया', 'केवल देवनागरी', 'en', []).includes('unexpected-script'))
assert.ok(validateTranslation('short', 'बहुत '.repeat(40), 'hi', []).includes('length-outlier'))
assert.ok(validateTranslation('Use DNA', 'डीएनए का उपयोग करें', 'hi', ['DNA']).includes('missing-protected-value'))

console.log('subtitle translation core tests passed')
