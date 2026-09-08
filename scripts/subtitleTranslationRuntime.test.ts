import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

const python = process.platform === 'win32' ? 'python.exe' : 'python3'
const installer = resolve('resources/translation/install_pack.py')
const runner = resolve('resources/translation/runner.py')

function makeArchive(path: string, traversal = false) {
  const script = [
    'import io, json, sys, tarfile',
    'archive, traversal = sys.argv[1], sys.argv[2] == "1"',
    'with tarfile.open(archive, "w:gz") as tar:',
    '  files = {"manifest.json": json.dumps({"version":"test"}).encode(), "runner.py": b"print(1)"}',
    '  if traversal: files = {"../escape.txt": b"unsafe"}',
    '  for name, data in files.items():',
    '    info = tarfile.TarInfo(name); info.size = len(data)',
    '    tar.addfile(info, io.BytesIO(data))',
  ].join('\n')
  execFileSync(python, ['-c', script, path, traversal ? '1' : '0'])
}

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'luffy-pack-installer-'))
  try {
  const validArchive = join(root, 'valid.tar.gz')
  const destination = join(root, 'installed')
  makeArchive(validArchive)
  const valid = spawnSync(python, [installer, validArchive, destination, '1024'], { encoding: 'utf8' })
  assert.equal(valid.status, 0, valid.stderr)
  assert.equal(JSON.parse(valid.stdout).ok, true)
  assert.equal(JSON.parse(await readFile(join(destination, 'manifest.json'), 'utf8')).version, 'test')

  const oversizedDestination = join(root, 'oversized')
  const oversized = spawnSync(python, [installer, validArchive, oversizedDestination, '5'], { encoding: 'utf8' })
  assert.notEqual(oversized.status, 0)
  assert.match(oversized.stderr, /size limit/i)
  assert.equal(existsSync(oversizedDestination), false)

  const unsafeArchive = join(root, 'unsafe.tar.gz')
  const unsafeDestination = join(root, 'unsafe')
  makeArchive(unsafeArchive, true)
  const unsafe = spawnSync(python, [installer, unsafeArchive, unsafeDestination, '1024'], { encoding: 'utf8' })
  assert.notEqual(unsafe.status, 0)
  assert.match(unsafe.stderr, /unsafe archive path/i)
  assert.equal(existsSync(join(root, 'escape.txt')), false)
  assert.equal(existsSync(unsafeDestination), false)

  execFileSync(python, ['-c', 'import sys; compile(open(sys.argv[1], encoding="utf-8").read(), sys.argv[1], "exec")', runner])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

main()
  .then(() => console.log('subtitle translation runtime tests passed'))
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
