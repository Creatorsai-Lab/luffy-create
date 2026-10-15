// The Python runtime is downloaded by the app on first use instead of shipping in the installer.
//
//   node scripts/python-runtime.mjs pack            Archive build/python-sandbox (after npm run prepare-python-sandbox)
//                                                   into build/python-runtime/ with its size + sha256.
//   node scripts/python-runtime.mjs catalog <dir>   Merge the packed entries in <dir> into resources/python-runtime/catalog.json.
//   node scripts/python-runtime.mjs sync            Copy the published catalog.json from GitHub into resources/ (needs the gh CLI).
//   node scripts/python-runtime.mjs check           Fail unless the catalog has a published runtime for every release platform.
//
// Archives are published by .github/workflows/python-runtime.yml to the release python-runtime-v<version>.

import { createHash } from 'node:crypto'
import { createReadStream, existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sandboxDir = join(root, 'build', 'python-sandbox')
const outDir = join(root, 'build', 'python-runtime')
const catalogPath = join(root, 'resources', 'python-runtime', 'catalog.json')
const repo = 'Creatorsai-Lab/luffy-create'
// Must match what release.yml builds: windows x64, macOS arm64 (macos-latest), linux x64.
export const RELEASE_TARGETS = ['win32-x64', 'darwin-arm64', 'linux-x64']

const readCatalog = async () => JSON.parse(await readFile(catalogPath, 'utf8'))
const archiveName = target => `python-runtime-${target}.tar.gz`

function tarCommand() {
  // A bare "tar" on Windows can be Git's GNU tar, which misreads C:\ paths.
  return process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar'
}

async function folderBytes(dir) {
  let total = 0
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) total += await folderBytes(path)
    else if (entry.isFile()) total += (await stat(path)).size
  }
  return total
}

function sha256(path) {
  return new Promise((resolveHash, reject) => {
    const hash = createHash('sha256')
    createReadStream(path).on('data', chunk => hash.update(chunk)).on('error', reject)
      .on('end', () => resolveHash(hash.digest('hex')))
  })
}

async function pack() {
  if (!existsSync(join(sandboxDir, 'manifest.json'))) {
    throw new Error('build/python-sandbox is missing. Run npm run prepare-python-sandbox first.')
  }
  const target = `${process.platform}-${process.arch}`
  const archive = join(outDir, archiveName(target))
  await mkdir(outDir, { recursive: true })
  await rm(archive, { force: true })

  console.log(`Packing ${target} runtime...`)
  const tar = spawnSync(tarCommand(), ['-czf', archive, '-C', sandboxDir, '.'], { stdio: 'inherit' })
  if (tar.status !== 0) throw new Error('tar failed')

  const entry = {
    target,
    file: archiveName(target),
    sha256: await sha256(archive),
    archiveBytes: (await stat(archive)).size,
    expandedBytes: await folderBytes(sandboxDir),
  }
  await writeFile(join(outDir, `python-runtime-${target}.json`), JSON.stringify(entry, null, 2))
  const mb = bytes => `${Math.round(bytes / 1024 / 1024)} MB`
  console.log(`${entry.file}: ${mb(entry.archiveBytes)} download, ${mb(entry.expandedBytes)} installed`)
}

async function catalog(entriesDir) {
  if (!entriesDir) throw new Error('Usage: python-runtime.mjs catalog <dir with python-runtime-*.json>')
  const current = await readCatalog()
  const targets = {}
  for (const name of (await readdir(entriesDir)).filter(n => /^python-runtime-.+\.json$/.test(n)).sort()) {
    const entry = JSON.parse(await readFile(join(entriesDir, name), 'utf8'))
    targets[entry.target] = {
      url: `https://github.com/${repo}/releases/download/python-runtime-v${current.version}/${entry.file}`,
      sha256: entry.sha256,
      archiveBytes: entry.archiveBytes,
      expandedBytes: entry.expandedBytes,
    }
  }
  if (!Object.keys(targets).length) throw new Error(`No python-runtime-*.json entries in ${entriesDir}`)
  const next = { schemaVersion: current.schemaVersion, version: current.version, targets }
  await writeFile(catalogPath, `${JSON.stringify(next, null, 2)}\n`)
  console.log(`Wrote ${Object.keys(targets).join(', ')} to resources/python-runtime/catalog.json`)
}

/** Returns a list of problems; empty means every release platform can download its runtime. */
export async function checkCatalog() {
  const { targets = {} } = await readCatalog()
  const problems = []
  for (const target of RELEASE_TARGETS) {
    const entry = targets[target]
    if (!entry) { problems.push(`${target}: missing from resources/python-runtime/catalog.json`); continue }
    const response = await fetch(entry.url, { method: 'HEAD', redirect: 'follow' }).catch(() => null)
    if (!response?.ok) problems.push(`${target}: ${entry.url} is not downloadable (${response?.status ?? 'network error'})`)
    else if (response.headers.has('content-length') && Number(response.headers.get('content-length')) !== entry.archiveBytes) {
      problems.push(`${target}: published archive size does not match the catalog`)
    }
  }
  return problems
}

async function sync() {
  const { version } = await readCatalog()
  const tag = `python-runtime-v${version}`
  const gh = spawnSync('gh', ['release', 'download', tag, '--repo', repo,
    '--pattern', 'catalog.json', '--output', catalogPath, '--clobber'], { stdio: 'inherit' })
  if (gh.status !== 0) throw new Error(`Could not download catalog.json from release ${tag}`)
  console.log('Updated resources/python-runtime/catalog.json — commit it.')
}

async function check() {
  const problems = await checkCatalog()
  for (const problem of problems) console.error(`✘ ${problem}`)
  if (problems.length) {
    console.error('Publish the runtime with the "Python Runtime" workflow, then run npm run python-runtime:sync and commit.')
    process.exitCode = 1
  } else {
    console.log(`✔ Python runtime is published for ${RELEASE_TARGETS.join(', ')}`)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, arg] = process.argv.slice(2)
  const run = { pack, catalog: () => catalog(arg), sync, check }[command]
  if (!run) {
    console.error('Usage: node scripts/python-runtime.mjs pack | catalog <dir> | sync | check')
    process.exitCode = 1
  } else {
    run().catch(error => { console.error(error.message); process.exitCode = 1 })
  }
}
