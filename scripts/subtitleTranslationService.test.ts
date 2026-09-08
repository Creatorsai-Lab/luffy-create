import assert from 'node:assert/strict'
import { dirname, resolve } from 'node:path'
import { createSubtitleTranslationService } from '../electron/main/subtitleTranslationService'

const fixture = resolve('scripts/fixtures/fake-translation-runner.mjs')
const hanging = resolve('scripts/fixtures/hanging-translation-runner.mjs')
const packManager = { getInstalledPath: async () => dirname(fixture) }

async function main() {
  const service = createSubtitleTranslationService({
    packManager,
    worker: async () => ({ command: process.execPath, args: [fixture] }),
  })
  const result = await service.translate({
    jobId: 'one', sourceLanguage: 'en', targetLanguage: 'hi', glossary: [],
    cues: [{ id: 'a', text: 'hello world' }, { id: 'blank', text: '   ' }],
  }, () => {})
  assert.equal(result.cancelled, false)
  assert.deepEqual(result.skipped, ['blank'])
  assert.deepEqual(result.failed, [])
  assert.equal(result.translated[0].id, 'a')
  assert.match(result.translated[0].text, /नमस्ते/)

  const cancelling = createSubtitleTranslationService({
    packManager,
    worker: async () => ({ command: process.execPath, args: [hanging] }),
  })
  const pending = cancelling.translate({
    jobId: 'cancel-me', sourceLanguage: 'en', targetLanguage: 'hi', glossary: [],
    cues: [{ id: 'a', text: 'hello' }],
  }, () => {})
  await new Promise(resolveWait => setTimeout(resolveWait, 50))
  await assert.rejects(() => cancelling.translate({
    jobId: 'second', sourceLanguage: 'en', targetLanguage: 'hi', glossary: [], cues: [{ id: 'b', text: 'hello' }],
  }, () => {}), /already running/i)
  assert.equal(cancelling.cancel('cancel-me'), true)
  assert.equal((await pending).cancelled, true)
  assert.equal(cancelling.cancel('missing'), false)
}

main()
  .then(() => console.log('subtitle translation service tests passed'))
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
