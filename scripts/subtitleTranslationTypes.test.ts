import assert from 'node:assert/strict'

import { makeSubtitleTrack, normalizeSubtitleTrack } from '../src/subtitle/types'
import {
  getCueText,
  getTranslationDirection,
  isCueTranslationCurrent,
  mergeTranslationResults,
  mergeCueTranslation,
  selectTranslationCandidates,
  sourceTextHash,
  updateCueSource,
} from '../src/subtitle/translation'

assert.equal(getTranslationDirection('en'), 'en-hi')
assert.equal(getTranslationDirection('hi'), 'hi-en')

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

const cue = { id: 'c1', start: 1, end: 2, text: 'Energy = mc^2' }
const translated = mergeCueTranslation(cue, 'hi', 'ऊर्जा = mc^2', [])
assert.equal(getCueText(translated, 'en', 'en'), cue.text)
assert.equal(getCueText(translated, 'en', 'hi'), 'ऊर्जा = mc^2')
assert.equal(translated.translations?.hi?.sourceHash, sourceTextHash(cue.text))
assert.equal(isCueTranslationCurrent(translated, 'hi'), true)

const edited = updateCueSource(translated, 'Energy equals mc^2')
assert.equal(edited.id, cue.id)
assert.equal(edited.start, cue.start)
assert.equal(edited.end, cue.end)
assert.equal(edited.translations?.hi?.sourceHash, translated.translations?.hi?.sourceHash)
assert.equal(isCueTranslationCurrent(edited, 'hi'), false)
assert.deepEqual(edited.translations?.hi?.warnings, [])

const manuallyEdited = mergeCueTranslation(translated, 'hi', 'ऊर्जा बराबर mc^2', ['Manual edit'])
assert.equal(translated.translations?.hi?.text, 'ऊर्जा = mc^2')

const candidateTrack = {
  ...makeSubtitleTrack(),
  cues: [
    { id: 'blank', start: 0, end: 1, text: '  ' },
    translated,
    { ...updateCueSource(translated, 'Changed source'), id: 'stale' },
    { id: 'new', start: 3, end: 4, text: 'New caption' },
  ],
}
assert.deepEqual(selectTranslationCandidates(candidateTrack).map(item => item.id), ['c1', 'stale', 'new'])

const submitted = selectTranslationCandidates(candidateTrack)
const editedWhileRunning = {
  ...candidateTrack,
  cues: candidateTrack.cues.map(item => item.id === 'new' ? updateCueSource(item, 'Edited while running') : item),
}
const merged = mergeTranslationResults(editedWhileRunning, 'hi', submitted, [
  { id: 'stale', text: 'बदला हुआ स्रोत', warnings: ['Check term'] },
  { id: 'new', text: 'नया कैप्शन', warnings: [] },
  { id: 'missing', text: 'अनदेखा', warnings: [] },
])
assert.equal(merged.cues[2].translations?.hi?.text, 'बदला हुआ स्रोत')
assert.deepEqual(merged.cues[2].translations?.hi?.warnings, ['Check term'])
assert.equal(merged.cues[3].translations?.hi, undefined)

console.log('subtitle translation type tests passed')
