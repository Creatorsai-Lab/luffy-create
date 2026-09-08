import assert from 'node:assert/strict'

import { makeSubtitleTrack, normalizeSubtitleTrack } from '../src/subtitle/types'

const fresh = makeSubtitleTrack()
assert.equal(fresh.language, 'en')
assert.equal(fresh.translation?.targetLanguage, 'hi')
assert.equal(fresh.translation?.visible, true)
assert.deepEqual(fresh.translation?.glossary, [])
assert.equal(fresh.translation?.style.fontFamily, 'Poppins')
assert.equal(fresh.translation?.style.sizePct, 90)
assert.equal(fresh.translation?.style.rowGap, 8)

const legacy = normalizeSubtitleTrack({
  id: 'legacy',
  name: 'Legacy',
  language: 'hi',
  enabled: true,
  cues: [],
  style: { ...fresh.style, maxWidthPct: 120 },
})
assert.equal(legacy.style.maxWidthPct, 100)
assert.equal(legacy.translation?.targetLanguage, 'en')
assert.equal(legacy.translation?.style.fontFamily, undefined)

console.log('subtitle translation type tests passed')
