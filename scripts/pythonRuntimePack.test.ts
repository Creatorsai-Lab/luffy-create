// The Python runtime download must verify what it downloaded, leave nothing
// half-installed on failure or cancel, and replace an older runtime version.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPythonRuntimeManager, type PythonRuntimeCatalog } from '../electron/main/pythonRuntimePack'

const archive = Buffer.from('fake runtime archive '.repeat(1000))
const sha256 = createHash('sha256').update(archive).digest('hex')
const target = 'test-x64'

function catalog(version = '1', hash = sha256): PythonRuntimeCatalog {
  return {
    schemaVersion: 1,
    version,
    targets: { [target]: { url: 'https://example.test/runtime.tar.gz', sha256: hash, archiveBytes: archive.length, expandedBytes: 5000 } },
  }
}

// Serves the archive in 1 KB chunks; `gate` (if set) pauses after the first chunk.
function fakeFetch(gate?: Promise<void>): typeof fetch {
  return async (_url, init) => {
    let sent = 0
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (sent > 0 && gate) await gate
        if (init?.signal?.aborted) { controller.error(new Error('aborted')); return }
        if (sent >= archive.length) { controller.close(); return }
        controller.enqueue(archive.subarray(sent, sent + 1024))
        sent += 1024
      },
    })
    return new Response(body, { headers: { 'content-length': String(archive.length) } })
  }
}

// "Extracts" a runtime with a manifest and a python executable, like the real archive.
async function fakeExtract(_archive: string, destination: string) {
  await mkdir(join(destination, 'python'), { recursive: true })
  await writeFile(join(destination, 'python', 'python.exe'), '')
  await writeFile(join(destination, 'manifest.json'), JSON.stringify({ pythonRelativePath: 'python/python.exe' }))
}

async function main() {
  const root = join(mkdtempSync(join(tmpdir(), 'luffy-runtime-')), 'python-runtime')
  try {
    { // a platform without a published runtime is reported as unavailable
      const manager = createPythonRuntimeManager({ root, catalog: catalog(), target: 'other-arm64', extract: fakeExtract })
      assert.equal(manager.getStatus().state, 'unavailable')
      await assert.rejects(manager.install(() => {}), /not available/)
    }

    { // a checksum mismatch installs nothing
      const manager = createPythonRuntimeManager({ root, catalog: catalog('1', '0'.repeat(64)), target, fetch: fakeFetch(), extract: fakeExtract })
      await assert.rejects(manager.install(() => {}), /checksum/)
      assert.equal(manager.getStatus().state, 'not-installed')
      assert.deepEqual(readdirSync(root), [])
    }

    { // an archive without a usable python is rejected and its staging folder removed
      const manager = createPythonRuntimeManager({ root, catalog: catalog(), target, fetch: fakeFetch(), extract: async () => {} })
      await assert.rejects(manager.install(() => {}), /incomplete/)
      assert.deepEqual(readdirSync(root), [])
    }

    { // cancelling mid-download installs nothing
      let release!: () => void
      const manager = createPythonRuntimeManager({ root, catalog: catalog(), target, fetch: fakeFetch(new Promise(r => { release = r })), extract: fakeExtract })
      const install = manager.install(() => {})
      await new Promise(r => setTimeout(r, 20))
      assert.equal(manager.getStatus().state, 'downloading')
      assert.equal(manager.cancel(), true)
      release()
      await assert.rejects(install, /cancelled/)
      assert.equal(manager.getStatus().state, 'not-installed')
      assert.deepEqual(readdirSync(root), [])
    }

    { // a verified download installs, reporting download then install progress
      const manager = createPythonRuntimeManager({ root, catalog: catalog(), target, fetch: fakeFetch(), extract: fakeExtract })
      const phases = new Set<string>()
      const status = await manager.install(p => phases.add(p.phase))
      assert.equal(status.state, 'installed')
      assert.deepEqual([...phases], ['download', 'install'])
      assert.equal(manager.installedPath(), join(root, '1'))
      assert.deepEqual(readdirSync(root), ['1'])
    }

    { // a new runtime version replaces the old one
      const manager = createPythonRuntimeManager({ root, catalog: catalog('2'), target, fetch: fakeFetch(), extract: fakeExtract })
      assert.equal(manager.getStatus().state, 'not-installed')
      await manager.install(() => {})
      assert.deepEqual(readdirSync(root), ['2'])

      await manager.remove()
      assert.equal(existsSync(root), false)
      assert.equal(manager.getStatus().state, 'not-installed')
    }
  } finally {
    await rm(join(root, '..'), { recursive: true, force: true })
  }
  console.log('pythonRuntimePack tests passed')
}

main().catch(err => { console.error(err); process.exit(1) })
