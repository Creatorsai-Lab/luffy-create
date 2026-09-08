import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { runTranslationProbe } from './translationWorkerProcess.mjs'

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'luffy-worker-probe-'))
  try {
    const pidFile = join(root, 'pid.txt')
    const request = {
      jobId: 'test', sourceLanguage: 'en', targetLanguage: 'hi',
      chunks: [{ id: 'cue', text: '__LF_CUE_cue__ hello' }],
    }
    const result = await runTranslationProbe(
      process.execPath,
      [resolve('scripts/fixtures/delayed-translation-runner.mjs')],
      JSON.stringify(request) + '\n',
      { ...process.env, PROBE_PID_FILE: pidFile },
    )
    assert.equal(result.text, '__LF_CUE_cue__ hello')
    const pid = Number(await readFile(pidFile, 'utf8'))
    assert.throws(() => process.kill(pid, 0), /ESRCH|not found|no such process/i)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

main()
  .then(() => console.log('subtitle translation verifier tests passed'))
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
