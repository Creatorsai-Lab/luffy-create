import { createWriteStream, existsSync } from 'node:fs'
import { chmod, copyFile, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { pipeline } from 'node:stream/promises'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputDir = join(root, 'build', 'whisper')
const tempDir = join(root, 'build', '.whisper-tmp')
const modelName = process.env.LUFFY_WHISPER_MODEL || 'tiny.en'
const modelFile = `ggml-${modelName}.bin`
const modelUrl = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${modelFile}`

function run(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || root,
      env: { ...process.env, ...options.env },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => {
      const text = chunk.toString()
      stdout += text
      process.stdout.write(text)
    })
    child.stderr.on('data', chunk => {
      const text = chunk.toString()
      stderr += text
      process.stderr.write(text)
    })
    child.on('error', reject)
    child.on('close', code => {
      if (code === 0) resolveRun({ stdout, stderr })
      else reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code}\n${stderr || stdout}`))
    })
  })
}

async function githubJson(url) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'luffy-create-local-whisper-builder',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const response = await fetch(url, { headers })
  if (!response.ok) {
    throw new Error(`GitHub request failed: ${response.status} ${response.statusText}`)
  }
  return response.json()
}

async function download(url, destination) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'luffy-create-local-whisper-builder' },
  })
  if (!response.ok || !response.body) throw new Error(`Download failed: ${response.status} ${response.statusText}`)
  await pipeline(response.body, createWriteStream(destination))
}

async function findFile(folder, predicate) {
  const entries = await readdir(folder, { withFileTypes: true })
  for (const entry of entries) {
    const full = join(folder, entry.name)
    if (entry.isDirectory()) {
      const found = await findFile(full, predicate)
      if (found) return found
      continue
    }
    if (await predicate(full, entry.name)) return full
  }
  return null
}

function runtimeAssetName(assets) {
  const names = assets.map(asset => String(asset.name || ''))
  if (process.platform === 'win32') {
    return names.find(name => name === 'whisper-bin-x64.zip')
  }
  if (process.platform === 'linux') {
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
    return names.find(name => name === `whisper-bin-ubuntu-${arch}.tar.gz`)
  }
  return null
}

async function copyRuntimeFolder(sourceFile, binDir) {
  const folder = dirname(sourceFile)
  const entries = await readdir(folder, { withFileTypes: true })
  await mkdir(binDir, { recursive: true })
  for (const entry of entries) {
    if (!entry.isFile()) continue
    await copyFile(join(folder, entry.name), join(binDir, entry.name))
  }
}

async function prepareRuntimeFromRelease(release, binDir) {
  const assetName = runtimeAssetName(release.assets || [])
  const asset = (release.assets || []).find(item => item.name === assetName)
  if (!asset?.browser_download_url) return false

  const archivePath = join(tempDir, asset.name)
  const extractDir = join(tempDir, 'runtime')
  await mkdir(extractDir, { recursive: true })
  console.log(`Downloading ${asset.name}`)
  await download(asset.browser_download_url, archivePath)
  await run('tar', ['-xf', archivePath, '-C', extractDir])

  const exeNames = process.platform === 'win32'
    ? new Set(['whisper-cli.exe', 'main.exe'])
    : new Set(['whisper-cli', 'main'])
  const cli = await findFile(extractDir, async (_full, name) => exeNames.has(name))
  if (!cli) throw new Error(`Could not find whisper-cli in ${asset.name}`)
  await copyRuntimeFolder(cli, binDir)
  return true
}

async function prepareRuntimeFromSource(release, binDir) {
  const archivePath = join(tempDir, 'whisper-source.tar.gz')
  const sourceRoot = join(tempDir, 'source')
  await mkdir(sourceRoot, { recursive: true })
  console.log('Downloading whisper.cpp source for local build')
  await download(release.tarball_url, archivePath)
  await run('tar', ['-xzf', archivePath, '-C', sourceRoot, '--strip-components', '1'])

  const buildDir = join(tempDir, 'cmake-build')
  await run('cmake', [
    '-S',
    sourceRoot,
    '-B',
    buildDir,
    '-DGGML_NATIVE=OFF',
    '-DWHISPER_BUILD_TESTS=OFF',
    '-DCMAKE_BUILD_TYPE=Release',
  ])
  await run('cmake', ['--build', buildDir, '--config', 'Release', '--target', 'whisper-cli', '-j', '2'])

  const exeName = process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli'
  const cli = await findFile(buildDir, async (_full, name) => name === exeName)
  if (!cli) throw new Error('Could not find built whisper-cli executable')
  await copyRuntimeFolder(cli, binDir)
}

async function main() {
  console.log('Preparing local Whisper engine')
  await rm(tempDir, { recursive: true, force: true })
  await rm(outputDir, { recursive: true, force: true })
  await mkdir(tempDir, { recursive: true })
  await mkdir(join(outputDir, 'models'), { recursive: true })

  const release = await githubJson('https://api.github.com/repos/ggml-org/whisper.cpp/releases/latest')
  const binDir = join(outputDir, 'bin')
  const usedReleaseRuntime = await prepareRuntimeFromRelease(release, binDir)
  if (!usedReleaseRuntime) await prepareRuntimeFromSource(release, binDir)

  const cliPath = await findFile(binDir, async (_full, name) => name === (process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli'))
  if (!cliPath) throw new Error('Local Whisper runtime was not prepared')
  if (process.platform !== 'win32') await chmod(cliPath, 0o755)

  const modelPath = join(outputDir, 'models', modelFile)
  console.log(`Downloading ${modelFile}`)
  await download(modelUrl, modelPath)
  const modelInfo = await stat(modelPath)
  if (modelInfo.size < 1024 * 1024) throw new Error(`Downloaded model looks too small: ${modelPath}`)

  const licenseUrl = 'https://raw.githubusercontent.com/ggml-org/whisper.cpp/master/LICENSE'
  await download(licenseUrl, join(outputDir, 'WHISPER_CPP_LICENSE'))

  await writeFile(join(outputDir, 'manifest.json'), JSON.stringify({
    createdAt: new Date().toISOString(),
    source: 'ggml-org/whisper.cpp',
    release: release.tag_name,
    model: modelFile,
    platform: process.platform,
    arch: process.arch,
  }, null, 2), 'utf-8')
  await rm(tempDir, { recursive: true, force: true })
  console.log('Local Whisper engine is ready')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
