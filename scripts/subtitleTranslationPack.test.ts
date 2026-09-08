import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createTranslationPackManager } from '../electron/main/subtitleTranslationPack'

const target = `${process.platform}-${process.arch}`
const bytes = Buffer.from('verified translation pack')
const sha256 = createHash('sha256').update(bytes).digest('hex')

function catalog(checksum = sha256) {
  const entry = { version: '1', url: 'https://example.test/model.tar.gz', sha256: checksum, archiveBytes: bytes.length, expandedBytes: 64 }
  return { schemaVersion: 1, packs: { 'en-hi': { [target]: entry }, 'hi-en': { [target]: entry } } }
}

async function extract(_archive: string, destination: string) {
  await mkdir(destination, { recursive: true })
  await writeFile(join(destination, 'manifest.json'), JSON.stringify({ version: '1' }))
  await writeFile(join(destination, 'runner.py'), 'print(1)')
}

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'luffy-translation-pack-'))
  try {
    const validFetch = async () => new Response(bytes, { headers: { 'content-length': String(bytes.length) } })
    const manager = createTranslationPackManager({ root, catalog: catalog(), fetch: validFetch, extract })
    assert.deepEqual(await manager.getStatus('en-hi'), { state: 'not-installed', direction: 'en-hi' })

    const oversizedFetch = async () => new Response(null, { headers: { 'content-length': String(500 * 1024 * 1024 + 1) } })
    const oversized = createTranslationPackManager({ root, catalog: catalog(), fetch: oversizedFetch, extract })
    await assert.rejects(() => oversized.install('en-hi', () => {}), /500 MB/)

    const corrupt = createTranslationPackManager({ root, catalog: catalog('0'.repeat(64)), fetch: validFetch, extract })
    await assert.rejects(() => corrupt.install('en-hi', () => {}), /checksum/i)
    assert.equal(existsSync(join(root, 'en-hi', '1')), false)

    const hangingFetch = async (_url: string | URL | Request, init?: RequestInit) => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1]))
        init?.signal?.addEventListener('abort', () => controller.error(new Error('cancelled')))
      },
    }), { headers: { 'content-length': String(bytes.length) } })
    const cancellable = createTranslationPackManager({ root, catalog: catalog(), fetch: hangingFetch as typeof fetch, extract })
    const installing = cancellable.install('en-hi', () => {})
    await new Promise(resolve => setTimeout(resolve, 10))
    assert.equal(cancellable.cancel('en-hi'), true)
    await assert.rejects(installing, /cancel/i)
    assert.equal(existsSync(join(root, 'en-hi.download')), false)
    assert.equal(existsSync(join(root, 'en-hi', '1.installing')), false)

    assert.equal((await manager.install('en-hi', () => {})).state, 'installed')
    await manager.install('hi-en', () => {})
    assert.equal((await manager.getStatus('en-hi')).state, 'installed')
    assert.equal((await manager.getStatus('hi-en')).state, 'installed')

    await manager.remove('en-hi')
    assert.equal((await manager.getStatus('en-hi')).state, 'not-installed')
    assert.equal((await manager.getStatus('hi-en')).state, 'installed')
    assert.equal(existsSync(join(root, 'en-hi.download')), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

main()
  .then(() => console.log('subtitle translation pack tests passed'))
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
