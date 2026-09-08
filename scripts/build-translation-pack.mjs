import { createHash } from 'node:crypto'
import { createWriteStream, existsSync } from 'node:fs'
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { officialPackLayout, runtimePackages } from './translationPackLayout.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MAX_BYTES = 500 * 1024 * 1024
const SOURCE_REPO = 'ai4bharat/BPCC'
function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : fallback
}

function run(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? ROOT,
      env: { ...process.env, ...options.env },
      shell: false,
      windowsHide: true,
      stdio: 'inherit',
    })
    child.on('error', reject)
    child.on('close', code => code === 0 ? resolveRun() : reject(new Error(`${command} exited with ${code}`)))
  })
}

async function download(url, path) {
  const response = await fetch(url, { headers: { 'User-Agent': 'luffy-create-model-builder' } })
  if (!response.ok || !response.body) throw new Error(`Download failed: ${response.status} ${response.statusText}`)
  await pipeline(Readable.fromWeb(response.body), createWriteStream(path))
}

async function folderBytes(folder) {
  let total = 0
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name)
    total += entry.isDirectory() ? await folderBytes(path) : (await stat(path)).size
  }
  return total
}

async function sha256(path) {
  const hash = createHash('sha256')
  hash.update(await readFile(path))
  return hash.digest('hex')
}

async function main() {
  const direction = option('direction')
  const layout = officialPackLayout(direction)
  const packages = runtimePackages()
  const python = option('python', process.platform === 'win32' ? 'python.exe' : 'python3')
  const version = option('version', '1')
  const target = `${process.platform}-${process.arch}`
  const assetName = `indictrans2-${direction}-int8-${target}.tar.gz`
  const work = join(ROOT, 'build', '.translation-pack', `${direction}-${target}`)
  const sourceCache = join(ROOT, 'build', '.translation-source')
  const requestedSource = option('source-archive')
  let sourceArchive = requestedSource ? resolve(requestedSource) : join(sourceCache, layout.archiveName)
  const downloadedSource = join(sourceCache, 'additional', layout.archiveName)
  const sourceDir = join(work, 'source')
  const pack = join(work, 'pack')
  const outputDir = join(ROOT, 'build', 'translation-packs')
  const output = join(outputDir, assetName)

  await rm(work, { recursive: true, force: true })
  await mkdir(sourceDir, { recursive: true })
  await mkdir(join(pack, 'vocab'), { recursive: true })
  await mkdir(join(pack, 'licenses'), { recursive: true })
  await mkdir(outputDir, { recursive: true })

  if (!existsSync(sourceArchive) && !requestedSource) {
    console.log(`Downloading authenticated ${SOURCE_REPO}/${layout.archiveName}`)
    await run('hf', [
      'download', SOURCE_REPO, `additional/${layout.archiveName}`,
      '--repo-type', 'dataset', '--local-dir', sourceCache,
    ])
    sourceArchive = downloadedSource
  }
  if (!existsSync(sourceArchive)) throw new Error(`Source archive not found: ${sourceArchive}`)

  await run('tar', ['-xzf', sourceArchive, '-C', sourceDir, ...layout.modelMembers])
  const root = layout.modelMembers[0].split('/')[0]
  const sourceVocab = join(sourceDir, root, 'fairseq_model', 'vocab', 'model.SRC')
  const targetVocab = join(sourceDir, root, 'fairseq_model', 'vocab', 'model.TGT')

  await cp(join(sourceDir, root, 'ct2_int8_model'), join(pack, 'model'), { recursive: true })
  await cp(sourceVocab, join(pack, 'vocab', 'model.SRC'))
  await cp(targetVocab, join(pack, 'vocab', 'model.TGT'))
  await cp(join(ROOT, 'resources', 'translation', 'runner.py'), join(pack, 'runner.py'))
  await run(python, ['-m', 'pip', 'install', '--no-compile', '--no-deps', '--target', join(pack, 'python'), ...packages])
  await download('https://raw.githubusercontent.com/AI4Bharat/IndicTrans2/main/LICENSE', join(pack, 'licenses', 'IndicTrans2-LICENSE'))
  await download('https://raw.githubusercontent.com/OpenNMT/CTranslate2/master/LICENSE', join(pack, 'licenses', 'CTranslate2-LICENSE'))
  await writeFile(join(pack, 'manifest.json'), JSON.stringify({
    version,
    direction,
    platform: process.platform,
    arch: process.arch,
    computeType: 'int8',
    source: `https://huggingface.co/datasets/${SOURCE_REPO}/resolve/main/additional/${layout.archiveName}`,
    runtimePackages: packages,
  }, null, 2))

  const expandedBytes = await folderBytes(pack)
  if (expandedBytes > MAX_BYTES) throw new Error(`Expanded pack is ${expandedBytes} bytes; limit is ${MAX_BYTES}`)
  await rm(output, { force: true })
  await run('tar', ['-czf', output, '-C', pack, '.'])
  const archiveBytes = (await stat(output)).size
  if (archiveBytes > MAX_BYTES) throw new Error(`Archive is ${archiveBytes} bytes; limit is ${MAX_BYTES}`)

  const catalogPath = join(ROOT, 'resources', 'translation', 'model-catalog.json')
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8'))
  catalog.packs[direction] ??= {}
  catalog.packs[direction][target] = {
    version,
    url: `https://github.com/Creatorsai-Lab/luffy-create/releases/download/translation-models-v1/${assetName}`,
    sha256: await sha256(output),
    archiveBytes,
    expandedBytes,
  }
  await writeFile(catalogPath, JSON.stringify(catalog, null, 2) + '\n')
  console.log(JSON.stringify({ asset: relative(ROOT, output), archiveBytes, expandedBytes }, null, 2))
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
