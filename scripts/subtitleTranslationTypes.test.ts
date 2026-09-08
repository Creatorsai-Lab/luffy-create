import assert from 'node:assert/strict'

import { makeSubtitleTrack, normalizeSubtitleTrack } from '../src/subtitle/types'
import {
  getCueText,
  isCueTranslationCurrent,
  mergeTranslationResults,
  mergeCueTranslation,
  selectTranslationCandidates,
  setCueReviewed,
  sourceTextHash,
  updateCueSource,
} from '../src/subtitle/translation'

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
assert.equal(translated.translations?.hi?.reviewed, false)
assert.equal(isCueTranslationCurrent(translated, 'hi'), true)

const reviewed = setCueReviewed(translated, 'hi', true)
assert.equal(reviewed.translations?.hi?.reviewed, true)

const edited = updateCueSource(reviewed, 'Energy equals mc^2')
assert.equal(edited.id, cue.id)
assert.equal(edited.start, cue.start)
assert.equal(edited.end, cue.end)
assert.equal(edited.translations?.hi?.reviewed, false)
assert.equal(edited.translations?.hi?.sourceHash, translated.translations?.hi?.sourceHash)
assert.equal(isCueTranslationCurrent(edited, 'hi'), false)
assert.ok(edited.translations?.hi?.warnings?.includes('Source caption changed'))

const manuallyEdited = mergeCueTranslation(reviewed, 'hi', 'ऊर्जा बराबर mc^2', ['Manual edit'])
assert.equal(manuallyEdited.translations?.hi?.reviewed, false)
assert.equal(reviewed.translations?.hi?.text, 'ऊर्जा = mc^2')

const candidateTrack = {
  ...makeSubtitleTrack(),
  cues: [
    { id: 'blank', start: 0, end: 1, text: '  ' },
    reviewed,
    { ...updateCueSource(reviewed, 'Changed source'), id: 'stale' },
    { id: 'new', start: 3, end: 4, text: 'New caption' },
  ],
}
assert.deepEqual(selectTranslationCandidates(candidateTrack, false).map(item => item.id), ['stale', 'new'])
assert.deepEqual(selectTranslationCandidates(candidateTrack, true).map(item => item.id), ['c1', 'stale', 'new'])

const submitted = selectTranslationCandidates(candidateTrack, false)
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
assert.equal(merged.cues[2].translations?.hi?.reviewed, false)
assert.deepEqual(merged.cues[2].translations?.hi?.warnings, ['Check term'])
assert.equal(merged.cues[3].translations?.hi, undefined)

console.log('subtitle translation type tests passed')
