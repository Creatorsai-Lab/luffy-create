import assert from 'node:assert/strict'
import { cuesToSrt } from '../src/subtitle/srt'
import { mergeCueTranslation } from '../src/subtitle/translation'

const cue = mergeCueTranslation({ id: 'c1', start: 1.25, end: 3.5, text: 'Gravity.' }, 'hi', 'गुरुत्वाकर्षण।')
const options = { sourceLanguage: 'en' as const, targetLanguage: 'hi' as const }

const source = cuesToSrt([cue], { ...options, mode: 'source' })
assert.match(source, /Gravity\./)
assert.doesNotMatch(source, /गुरुत्व/)
assert.match(source, /00:00:01,250 --> 00:00:03,500/)

const translated = cuesToSrt([cue], { ...options, mode: 'translated' })
assert.match(translated, /गुरुत्व/)
assert.doesNotMatch(translated, /Gravity\./)

const bilingual = cuesToSrt([cue], { ...options, mode: 'bilingual' })
assert.match(bilingual, /Gravity\.\nगुरुत्व/)

const hindiCue = mergeCueTranslation({ id: 'h1', start: 0, end: 1, text: 'बल।' }, 'en', 'Force.')
assert.match(cuesToSrt([hindiCue], { sourceLanguage: 'hi', targetLanguage: 'en', mode: 'bilingual' }), /Force\.\nबल।/)

const missing = { id: 'missing', start: 4, end: 5, text: 'Available source.' }
const withBlank = { id: 'blank', start: 6, end: 7, text: '   ' }
const fallback = cuesToSrt([withBlank, missing], { ...options, mode: 'translated' })
assert.match(fallback, /^1\n00:00:04,000 --> 00:00:05,000\nAvailable source\./)
assert.doesNotMatch(fallback, /^2/m)

console.log('subtitle SRT tests passed')
