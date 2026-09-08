import assert from 'node:assert/strict'
import { officialPackLayout, runtimePackages } from './translationPackLayout.mjs'

const englishToHindi = officialPackLayout('en-hi')
assert.equal(englishToHindi.archiveName, 'en-indic-dist.tar.gz')
assert.deepEqual(englishToHindi.modelMembers, [
  'en-indic-dist/ct2_int8_model',
  'en-indic-dist/fairseq_model/vocab/model.SRC',
  'en-indic-dist/fairseq_model/vocab/model.TGT',
])

const hindiToEnglish = officialPackLayout('hi-en')
assert.equal(hindiToEnglish.archiveName, 'indic-en-dist.tar.gz')
assert.equal(hindiToEnglish.modelMembers[0], 'indic-en-dist/ct2_int8_model')

assert.throws(() => officialPackLayout('en-en'), /direction/i)

const runtime = runtimePackages()
assert.ok(runtime.includes('ctranslate2==4.8.2'))
assert.ok(runtime.includes('indic-nlp-library==0.92'))
assert.equal(runtime.some(name => /sphinx|pandas/i.test(name)), false)
assert.equal(new Set(runtime).size, runtime.length)

console.log('subtitle translation pack builder tests passed')
