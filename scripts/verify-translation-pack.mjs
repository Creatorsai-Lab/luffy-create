import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { runTranslationProbe } from './translationWorkerProcess.mjs'

const MAX_BYTES = 500 * 1024 * 1024

function option(name) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : null
}

async function folderBytes(folder) {
  let total = 0
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name)
    total += entry.isDirectory() ? await folderBytes(path) : (await stat(path)).size
  }
  return total
}

async function translate(python, pack, manifest) {
  const sourceLanguage = manifest.direction === 'en-hi' ? 'en' : 'hi'
  const targetLanguage = sourceLanguage === 'en' ? 'hi' : 'en'
  const text = sourceLanguage === 'en'
    ? [
        '__LF_CUE_law__ Newton\'s second law is __LF_KEEP_0001__, where force is measured in newtons.',
        '__LF_CUE_experiment__ The experiment used __LF_KEEP_0002__ at __LF_KEEP_0003__; see __LF_KEEP_0004__.',
        '__LF_CUE_dna__ DNA stores genetic information, while RNA helps express it.',
      ].join('\n')
    : [
        '__LF_CUE_law__ न्यूटन का दूसरा नियम __LF_KEEP_0001__ है, जहाँ बल को न्यूटन में मापा जाता है।',
        '__LF_CUE_experiment__ प्रयोग में __LF_KEEP_0002__ और __LF_KEEP_0003__ का उपयोग किया गया; __LF_KEEP_0004__ देखें।',
        '__LF_CUE_dna__ DNA आनुवंशिक जानकारी संग्रहीत करता है, जबकि RNA उसे व्यक्त करने में मदद करता है।',
      ].join('\n')
  const result = await runTranslationProbe(
    python,
    [join(pack, 'runner.py'), pack],
    JSON.stringify({ jobId: 'verify', sourceLanguage, targetLanguage, chunks: [{ id: 'check', text }] }) + '\n',
  )
  return result.text
}

async function main() {
  const archive = resolve(option('archive') ?? '')
  if (!existsSync(archive)) throw new Error('Pass an existing archive with --archive')
  const python = option('python') ?? (process.platform === 'win32' ? 'python.exe' : 'python3')
  const archiveBytes = (await stat(archive)).size
  if (archiveBytes > MAX_BYTES) throw new Error('Archive exceeds 500 MB')
  const temp = await mkdtemp(join(tmpdir(), 'luffy-translation-verify-'))
  const pack = join(temp, 'pack')
  try {
    const install = spawnSync(python, [resolve('resources/translation/install_pack.py'), archive, pack, String(MAX_BYTES)], { encoding: 'utf8' })
    if (install.status !== 0) throw new Error(install.stderr || 'Pack extraction failed')
    const manifest = JSON.parse(await readFile(join(pack, 'manifest.json'), 'utf8'))
    const required = ['runner.py', 'model/model.bin', 'vocab/model.SRC', 'vocab/model.TGT', 'licenses/IndicTrans2-LICENSE', 'licenses/CTranslate2-LICENSE']
    for (const path of required) if (!existsSync(join(pack, path))) throw new Error(`Pack is missing ${path}`)
    if (manifest.computeType !== 'int8') throw new Error('Pack is not INT8')
    const expandedBytes = await folderBytes(pack)
    if (expandedBytes > MAX_BYTES) throw new Error('Expanded pack exceeds 500 MB')
    const checksum = createHash('sha256').update(await readFile(archive)).digest('hex')
    const translated = await translate(python, pack, manifest)
    for (const marker of ['law', 'experiment', 'dna']) {
      if (translated.split(`__LF_CUE_${marker}__`).length !== 2) throw new Error(`Worker did not preserve cue marker ${marker}`)
    }
    for (const token of ['0001', '0002', '0003', '0004']) {
      if (translated.split(`__LF_KEEP_${token}__`).length !== 2) throw new Error(`Worker did not preserve protected value ${token}`)
    }
    console.log(JSON.stringify({ valid: true, computeType: 'int8', archiveBytes, expandedBytes, sha256: checksum, sample: translated }))
  } finally {
    await rm(temp, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
