import { createWriteStream, existsSync } from 'node:fs'
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { pipeline } from 'node:stream/promises'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputDir = join(root, 'build', 'python-sandbox')
const tempDir = join(root, 'build', '.python-sandbox-tmp')
const archivePath = join(tempDir, 'python-runtime.tar.gz')
const pythonMinor = process.env.LUFFY_PYTHON_VERSION || '3.12'
const packages = [
  'numpy',
  'matplotlib',
  'pillow',
  'scipy',
  'imageio',
  'imageio-ffmpeg',
  'manim',
]
const pythonEnv = {
  PYTHONNOUSERSITE: '1',
  PYTHONDONTWRITEBYTECODE: '1',
}

function runtimeTarget() {
  if (process.platform === 'win32') return 'x86_64-pc-windows-msvc'
  if (process.platform === 'darwin') {
    return process.arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin'
  }
  if (process.platform === 'linux') {
    return process.arch === 'arm64' ? 'aarch64-unknown-linux-gnu' : 'x86_64-unknown-linux-gnu'
  }
  throw new Error(`Unsupported platform for bundled Python runtime: ${process.platform}/${process.arch}`)
}

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
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'luffy-create-python-sandbox-builder',
    },
  })
  if (!response.ok) throw new Error(`GitHub request failed: ${response.status} ${response.statusText}`)
  return response.json()
}

async function download(url, destination) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'luffy-create-python-sandbox-builder' },
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

async function findPythonExecutable(folder) {
  const preferred = process.platform === 'win32'
    ? [join(folder, 'python', 'python.exe'), join(folder, 'python.exe')]
    : [join(folder, 'python', 'bin', 'python3'), join(folder, 'python', 'bin', 'python'), join(folder, 'bin', 'python3'), join(folder, 'bin', 'python')]

  for (const candidate of preferred) {
    if (existsSync(candidate)) return candidate
  }

  const names = process.platform === 'win32'
    ? new Set(['python.exe'])
    : new Set(['python3', 'python'])

  return findFile(folder, async (full, name) => {
    if (!names.has(name)) return false
    if (full.includes(`${join('Lib', 'venv')}${process.platform === 'win32' ? '\\' : '/'}`)) return false
    const info = await stat(full)
    return info.isFile()
  })
}

async function main() {
  const target = runtimeTarget()
  console.log(`Preparing bundled Python Sandbox for ${target}`)

  await rm(tempDir, { recursive: true, force: true })
  await rm(outputDir, { recursive: true, force: true })
  await mkdir(tempDir, { recursive: true })
  await mkdir(outputDir, { recursive: true })

  const release = await githubJson('https://api.github.com/repos/astral-sh/python-build-standalone/releases/latest')
  const assets = Array.isArray(release.assets) ? release.assets : []
  const asset = assets.find(item => {
    const name = String(item.name || '')
    return name.startsWith(`cpython-${pythonMinor}.`)
      && name.includes(`-${target}-`)
      && name.endsWith('-install_only.tar.gz')
  })

  if (!asset?.browser_download_url) {
    throw new Error(`Could not find python-build-standalone ${pythonMinor} install_only asset for ${target}`)
  }

  console.log(`Downloading ${asset.name}`)
  await download(asset.browser_download_url, archivePath)

  console.log('Extracting Python runtime')
  await run('tar', ['-xzf', archivePath, '-C', outputDir])

  const python = await findPythonExecutable(outputDir)
  if (!python) throw new Error('Could not find Python executable after extracting the runtime')

  console.log(`Using Python runtime: ${python}`)
  await run(python, ['-m', 'ensurepip', '--upgrade'], { env: pythonEnv })
  await run(python, ['-m', 'pip', 'install', '--upgrade', '--no-warn-script-location', 'pip', 'setuptools', 'wheel'], { env: pythonEnv })
  await run(python, ['-m', 'pip', 'install', '--upgrade', '--no-warn-script-location', ...packages], { env: pythonEnv })
  await run(python, ['-c', 'import numpy, matplotlib, PIL, scipy, imageio, imageio_ffmpeg, manim; print(imageio_ffmpeg.get_ffmpeg_exe()); print("Python Sandbox packages ready")'], { env: pythonEnv })

  const manifest = {
    createdAt: new Date().toISOString(),
    source: 'astral-sh/python-build-standalone',
    pythonVersion: pythonMinor,
    platform: process.platform,
    arch: process.arch,
    target,
    pythonRelativePath: relative(outputDir, python).replace(/\\/g, '/'),
    packages,
  }
  await writeFile(join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8')
  await rm(tempDir, { recursive: true, force: true })

  if (!existsSync(join(outputDir, 'manifest.json'))) {
    throw new Error('Bundled Python Sandbox manifest was not written')
  }
  console.log('Bundled Python Sandbox is ready')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
