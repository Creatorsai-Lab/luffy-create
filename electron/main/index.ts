import { app, BrowserWindow, ipcMain, dialog, shell, protocol, powerSaveBlocker } from 'electron'

// Suppress GPU shader-cache permission errors on Windows
app.commandLine.appendSwitch('disable-gpu-shader-cache')

// Export renders every frame in the page. Without these, Chromium lowers the
// renderer's priority and throttles its timers and frames once the window is
// minimised or covered, and a long export crawls (or stops) until it is back
// in front. The editor does little work while idle, so this costs nothing then.
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
// …and keep video decoders alive in the background, or every export seek restarts one.
app.commandLine.appendSwitch('disable-background-media-suspend')

// Must be called before app.whenReady().
// - localasset: serves user media + ffmpeg core to the renderer
// - app:        serves the built renderer in production. We CANNOT load the
//               renderer over file:// because Web Workers (used by ffmpeg.wasm)
//               cannot be constructed from a file:// origin in Chromium.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'localasset',
    privileges: { secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
  },
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
  }
])
import { basename, dirname, join, normalize } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { mkdir, readFile, writeFile, copyFile, readdir, rm, stat, open, rename } from 'fs/promises'
import { createReadStream, existsSync, readFileSync, writeFileSync } from 'fs'
import type { Dirent } from 'fs'
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { Readable } from 'stream'
import { inferUploadAssetKind, makeAssetUploadName, randomAssetHash } from './assetNaming'
import { createPlannerStore } from './planner'
import { createFilmstripCache } from './filmstripCache'
import { createTranscriptCache } from './transcriptCache'
import {
  createTranslationPackManager,
  type TranslationDirection,
  type TranslationPackCatalog,
  type TranslationPackStatus,
} from './subtitleTranslationPack'
import { createSubtitleTranslationService, type SubtitleTranslateRequest } from './subtitleTranslationService'
import { createPythonRuntimeManager, readRuntimeManifest, type PythonRuntimeCatalog, type PythonRuntimeProgress } from './pythonRuntimePack'

const USER_DATA   = app.getPath('userData')
const PROJECTS_DIR = join(USER_DATA, 'projects')
const INDEX_FILE   = join(USER_DATA, 'projects.json')

// Safety net: never let an unhandled error silently kill the app at startup.
// Errors are absorbed (so the process doesn't exit) and written to userData/crash.log.
function logCrash(tag: string, err: unknown) {
  try {
    const msg = err instanceof Error ? `${err.message}\n${err.stack}` : String(err)
    writeFileSync(join(USER_DATA, 'crash.log'), `[${tag}] ${new Date().toISOString()}\n${msg}\n`)
  } catch { /* ignore */ }
}
process.on('uncaughtException', e => logCrash('uncaughtException', e))
process.on('unhandledRejection', e => logCrash('unhandledRejection', e))

// Production renderer location (electron-vite output).
const RENDERER_DIR = join(__dirname, '../renderer')

const MIME: Record<string, string> = {
  html:'text/html', htm:'text/html', js:'text/javascript', mjs:'text/javascript',
  css:'text/css', json:'application/json', wasm:'application/wasm', map:'application/json',
  svg:'image/svg+xml', png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg',
  gif:'image/gif', webp:'image/webp', ico:'image/x-icon', bmp:'image/bmp',
  woff:'font/woff', woff2:'font/woff2', ttf:'font/ttf', otf:'font/otf', eot:'application/vnd.ms-fontobject'
}

function mimeFor(p: string): string {
  return MIME[p.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream'
}

interface ProjectRecord {
  id: string
  name: string
  folder: string
  createdAt: number
  updatedAt: number
  lastOpenedAt?: number
}

async function ensureDir(dir: string) {
  if (!existsSync(dir)) await mkdir(dir, { recursive: true })
}

async function writeFileAtomic(filePath: string, data: string) {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  const fh = await open(tmpPath, 'w')
  try {
    await fh.writeFile(data, 'utf-8')
    await fh.sync()
  } finally {
    await fh.close()
  }

  try {
    await rename(tmpPath, filePath)
  } catch (err) {
    await rm(tmpPath, { force: true }).catch(() => {})
    throw err
  }
}

async function backupValidJsonFile(filePath: string) {
  try {
    const raw = await readFile(filePath, 'utf-8')
    JSON.parse(raw)
    await copyFile(filePath, `${filePath}.bak`)
  } catch {
    // No valid previous JSON to preserve.
  }
}

async function writeJsonFile(filePath: string, data: string) {
  JSON.parse(data)
  await backupValidJsonFile(filePath)
  await writeFileAtomic(filePath, data)
}

async function readJsonWithBackup<T>(filePath: string): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, 'utf-8'))
  } catch (primaryErr) {
    try {
      return JSON.parse(await readFile(`${filePath}.bak`, 'utf-8'))
    } catch {
      throw primaryErr
    }
  }
}

async function recordFromProjectFolder(folder: string): Promise<ProjectRecord | null> {
  try {
    const project = await readJsonWithBackup<{ id?: string; name?: string; createdAt?: number; updatedAt?: number }>(
      join(folder, 'project.json')
    )
    if (!project.id || !project.name) return null
    return {
      id: project.id,
      name: project.name,
      folder,
      createdAt: project.createdAt || Date.now(),
      updatedAt: project.updatedAt || Date.now(),
      lastOpenedAt: project.updatedAt || project.createdAt || Date.now()
    }
  } catch {
    return null
  }
}

function projectRecency(record: ProjectRecord) {
  return record.lastOpenedAt ?? record.updatedAt ?? record.createdAt ?? 0
}

function sortProjectRecordsByRecency(records: ProjectRecord[]) {
  return [...records].sort((a, b) => {
    const recent = projectRecency(b) - projectRecency(a)
    if (recent !== 0) return recent
    return (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
  })
}

async function readIndex(): Promise<ProjectRecord[]> {
  let records: ProjectRecord[] = []
  try {
    const parsed = await readJsonWithBackup<ProjectRecord[]>(INDEX_FILE)
    if (Array.isArray(parsed)) records = parsed
  } catch {
    records = []
  }

  const seen = new Set(records.map(r => r.id))
  try {
    await ensureDir(PROJECTS_DIR)
    const entries = await readdir(PROJECTS_DIR, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const record = await recordFromProjectFolder(join(PROJECTS_DIR, entry.name))
      if (record && !seen.has(record.id)) {
        records.push(record)
        seen.add(record.id)
      }
    }
  } catch {
    // If project-folder scanning fails, keep the parsed index.
  }

  return sortProjectRecordsByRecency(records)
}

async function writeIndex(records: ProjectRecord[]) {
  await writeJsonFile(INDEX_FILE, JSON.stringify(sortProjectRecordsByRecency(records), null, 2))
}

function focusedWindow(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
}
function appIconPath() {
  return is.dev
    ? join(process.cwd(), 'build', 'icon.ico')
    : join(process.resourcesPath, 'icon.ico')
}

type PythonRunKind = 'script' | 'manim'

interface PythonCommand {
  command: string
  args: string[]
  version?: string
  source?: 'bundled' | 'user' | 'system'
}

interface PythonOutputFile {
  name: string
  path: string
  ext: string
  size: number
  type: 'image' | 'video' | 'other'
}

interface PythonRunRequest {
  jobId?: string
  projectId: string
  code: string
  kind: PythonRunKind
  sceneName?: string
  width?: number
  height?: number
  fps?: number
  timeoutMs?: number
}

interface SubtitleTranscribeRequest {
  sourcePath: string
  language?: string
  /** Word-level cues that keep filler words. */
  words?: boolean
}

interface SubtitleTranscribeCue {
  start: number
  end: number
  text: string
}

const pythonJobs = new Map<string, ChildProcessWithoutNullStreams>()
function resolveDevBuildAsset(name: string) {
  const local = join(process.cwd(), 'build', name)
  if (existsSync(local)) return local
  const repository = join(process.cwd(), '..', '..', 'build', name)
  return basename(dirname(process.cwd())) === '.worktrees' && existsSync(repository) ? repository : local
}
const PYTHON_SANDBOX_DIR = join(USER_DATA, 'python-sandbox')
const PYTHON_SANDBOX_VENV_DIR = join(PYTHON_SANDBOX_DIR, 'venv')
// Dev can use a locally prepared runtime (npm run prepare-python-sandbox)
// instead of downloading it.
const DEV_PYTHON_SANDBOX_DIR = is.dev ? resolveDevBuildAsset('python-sandbox') : null
const PYTHON_SANDBOX_PACKAGES = [
  'numpy',
  'matplotlib',
  'pillow',
  'scipy',
  'imageio',
  'imageio-ffmpeg',
  'manim',
]
const PYTHON_OUTPUT_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'mp4', 'webm', 'mov'])
const PYTHON_IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'])
const PYTHON_VIDEO_EXTS = new Set(['mp4', 'webm', 'mov'])
const WHISPER_DIR = is.dev
  ? resolveDevBuildAsset('whisper')
  : join(process.resourcesPath, 'whisper')
const WHISPER_MODEL_NAMES = [
  'ggml-tiny.en.bin',
  'ggml-tiny.bin',
  'ggml-base.en.bin',
  'ggml-base.bin',
]
const PYTHON_SANDBOX_PRELUDE = `import os
import math
import random
import statistics
from pathlib import Path

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

try:
    from manim import *
except Exception:
    pass

from matplotlib import animation

out = os.environ["LUFFY_OUTPUT_DIR"]
WIDTH = int(os.environ.get("LUFFY_WIDTH", "1920"))
HEIGHT = int(os.environ.get("LUFFY_HEIGHT", "1080"))
FPS = int(os.environ.get("LUFFY_FPS", "30"))`

function pythonCandidates() {
  return [
    { command: 'python', args: [] },
    { command: 'py', args: ['-3'] },
    { command: 'python3', args: [] },
  ]
}

function sandboxPythonPath() {
  return process.platform === 'win32'
    ? join(PYTHON_SANDBOX_VENV_DIR, 'Scripts', 'python.exe')
    : join(PYTHON_SANDBOX_VENV_DIR, 'bin', 'python')
}

function userSandboxPythonCommand(): PythonCommand | null {
  const command = sandboxPythonPath()
  return existsSync(command) ? { command, args: [], source: 'user' } : null
}

function bundledPythonSandboxDir() {
  if (DEV_PYTHON_SANDBOX_DIR && existsSync(join(DEV_PYTHON_SANDBOX_DIR, 'manifest.json'))) return DEV_PYTHON_SANDBOX_DIR
  return pythonRuntime.installedPath()
}

function bundledPythonCommand(): PythonCommand | null {
  const dir = bundledPythonSandboxDir()
  const manifest = dir ? readRuntimeManifest(dir) : null
  if (!dir || !manifest?.pythonRelativePath) return null
  const command = join(dir, manifest.pythonRelativePath)
  return existsSync(command) ? { command, args: [], source: 'bundled' } : null
}

function runProcess(
  command: string,
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number; jobId?: string } = {}
): Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise(resolve => {
    let stdout = ''
    let stderr = ''
    let settled = false
    const child = spawn(command, args, {
      cwd: opts.cwd,
      env: opts.env,
      windowsHide: true,
      shell: false,
    })

    if (opts.jobId) pythonJobs.set(opts.jobId, child)

    const timer = opts.timeoutMs
      ? setTimeout(() => {
        if (!child.killed) child.kill()
        finish(null, true)
      }, opts.timeoutMs)
      : null

    function finish(code: number | null, timedOut: boolean) {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      if (opts.jobId) pythonJobs.delete(opts.jobId)
      resolve({ code, stdout, stderr, timedOut })
    }

    child.stdout.on('data', chunk => { stdout += chunk.toString() })
    child.stderr.on('data', chunk => { stderr += chunk.toString() })
    child.on('error', err => { stderr += String(err?.message ?? err); finish(null, false) })
    child.on('close', code => finish(code, false))
  })
}

async function resolveBasePython() {
  for (const candidate of pythonCandidates()) {
    const result = await runProcess(candidate.command, [...candidate.args, '--version'], { timeoutMs: 5000 })
    if (result.code === 0) {
      const version = `${result.stdout}${result.stderr}`.trim()
      return { ...candidate, version, source: 'system' as const }
    }
  }
  return null
}

async function resolveBundledPython() {
  const bundled = bundledPythonCommand()
  if (bundled) {
    const result = await runProcess(bundled.command, ['--version'], { timeoutMs: 5000 })
    if (result.code === 0) {
      return { ...bundled, version: `${result.stdout}${result.stderr}`.trim() }
    }
  }
  return null
}

async function resolveUserSandboxPython() {
  const sandbox = userSandboxPythonCommand()
  if (sandbox) {
    const result = await runProcess(sandbox.command, ['--version'], { timeoutMs: 5000 })
    if (result.code === 0) {
      return { ...sandbox, version: `${result.stdout}${result.stderr}`.trim() }
    }
  }
  return null
}

async function resolvePython() {
  const bundled = await resolveBundledPython()
  if (bundled) return bundled
  const sandbox = await resolveUserSandboxPython()
  if (sandbox) return sandbox
  return resolveBasePython()
}

const TRANSLATION_RESOURCE_DIR = is.dev
  ? join(process.cwd(), 'resources', 'translation')
  : join(process.resourcesPath, 'translation')
const translationCatalog = JSON.parse(
  readFileSync(join(TRANSLATION_RESOURCE_DIR, 'model-catalog.json'), 'utf8')
) as TranslationPackCatalog
/** In dev, serves a download from build/<folder>/<file name> when that file exists. */
function devLocalFetch(folder: string): typeof fetch {
  return async (input, init) => {
    if (!is.dev) return fetch(input, init)
    const url = input instanceof Request ? input.url : input.toString()
    const local = join(process.cwd(), 'build', folder, basename(new URL(url).pathname))
    if (!existsSync(local)) return fetch(input, init)
    const file = createReadStream(local)
    init?.signal?.addEventListener('abort', () => file.destroy(new Error('cancelled')), { once: true })
    return new Response(Readable.toWeb(file) as ReadableStream, {
      headers: { 'content-length': String((await stat(local)).size) },
    })
  }
}

const pythonRuntime = createPythonRuntimeManager({
  root: join(USER_DATA, 'python-runtime'),
  catalog: JSON.parse(readFileSync(join(
    is.dev ? join(process.cwd(), 'resources') : process.resourcesPath, 'python-runtime', 'catalog.json'
  ), 'utf8')) as PythonRuntimeCatalog,
  fetch: devLocalFetch('python-runtime'),
  extract: async (archive, destination) => {
    // Windows 10+ ships bsdtar in System32; a bare "tar" may resolve to Git's GNU tar, which misreads C:\ paths.
    const tar = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar'
    const result = await runProcess(tar, ['-xzf', archive, '-C', destination], { timeoutMs: 600_000 })
    if (result.code !== 0) throw new Error(`Could not unpack the Python runtime.\n${result.stderr || result.stdout}`)
  },
})
const PYTHON_RUNTIME_MISSING = 'The Python runtime is not installed yet. Download it once from the Python Sandbox window.'

const translationPacks = createTranslationPackManager({
  root: join(USER_DATA, 'translation-models'),
  catalog: translationCatalog,
  fetch: devLocalFetch('translation-packs'),
  extract: async (archive, destination, maxBytes) => {
    const python = await resolvePython()
    if (!python) throw new Error(PYTHON_RUNTIME_MISSING)
    const result = await runProcess(python.command, [
      ...python.args,
      join(TRANSLATION_RESOURCE_DIR, 'install_pack.py'),
      archive,
      destination,
      String(maxBytes),
    ], { timeoutMs: 180_000 })
    if (result.code !== 0) throw new Error(result.stderr || 'Translation model installation failed')
  },
})
const subtitleTranslation = createSubtitleTranslationService({
  packManager: translationPacks,
  worker: async packPath => {
    const python = await resolvePython()
    if (!python) throw new Error(PYTHON_RUNTIME_MISSING)
    return {
      command: python.command,
      args: [...python.args, join(packPath, 'runner.py'), packPath],
      env: {
        ...process.env,
        PYTHONPATH: join(packPath, 'python'),
        PYTHONDONTWRITEBYTECODE: '1',
        PYTHONIOENCODING: 'utf-8',
        PYTHONNOUSERSITE: '1',
      },
    }
  },
})

function publicTranslationStatus(status: TranslationPackStatus) {
  if (status.state !== 'installed') return status
  return { state: status.state, direction: status.direction, version: status.version }
}

async function pythonModuleAvailable(moduleName: string, python?: PythonCommand | null) {
  python = python ?? await resolvePython()
  if (!python) return false
  const result = await runProcess(
    python.command,
    [...python.args, '-c', `import ${moduleName}`],
    // The first import after installing compiles bytecode (manim: >8 s); later ones take ~2 s.
    { timeoutMs: 30_000 }
  )
  return result.code === 0
}

async function pythonImageioFfmpegPath(python: PythonCommand) {
  const result = await runProcess(
    python.command,
    [...python.args, '-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'],
    { timeoutMs: 8000 }
  )
  const ffmpegPath = result.stdout.trim()
  return result.code === 0 && ffmpegPath && existsSync(ffmpegPath) ? ffmpegPath : null
}

async function pythonSandboxStatus() {
  const bundledPython = await resolveBundledPython()
  const basePython = await resolveBasePython()
  const sandboxPython = await resolveUserSandboxPython()
  const activePython = bundledPython ?? sandboxPython ?? basePython
  const [matplotlib, manim] = activePython
    ? await Promise.all([
      pythonModuleAvailable('matplotlib', activePython),
      pythonModuleAvailable('manim', activePython),
    ])
    : [false, false]

  return {
    available: Boolean(activePython),
    pythonPath: activePython?.command ?? null,
    version: activePython?.version ?? null,
    runtimeSource: activePython?.source ?? null,
    matplotlib,
    manim,
    bundledPath: bundledPythonSandboxDir(),
    bundledReady: Boolean(bundledPython && matplotlib && manim),
    sandboxPath: PYTHON_SANDBOX_VENV_DIR,
    sandboxReady: Boolean((bundledPython || sandboxPython) && matplotlib && manim),
    basePythonAvailable: Boolean(basePython),
  }
}

async function setupPythonSandboxEnv() {
  const bundledPython = await resolveBundledPython()
  if (bundledPython) {
    return {
      ...(await pythonSandboxStatus()),
      stdout: 'Bundled Python Sandbox is already available.',
      stderr: '',
    }
  }

  await ensureDir(PYTHON_SANDBOX_DIR)
  const basePython = await resolveBasePython()
  if (!basePython) {
    throw new Error('Python 3 is required to create the sandbox environment. Install Python 3 once, then run setup again.')
  }

  const sandboxPython = sandboxPythonPath()
  let stdout = ''
  let stderr = ''

  if (!existsSync(sandboxPython)) {
    const venv = await runProcess(basePython.command, [...basePython.args, '-m', 'venv', PYTHON_SANDBOX_VENV_DIR], {
      cwd: PYTHON_SANDBOX_DIR,
      timeoutMs: 180_000,
    })
    stdout += venv.stdout
    stderr += venv.stderr
    if (venv.code !== 0) {
      throw new Error(`Could not create Python sandbox environment.\n${venv.stderr || venv.stdout}`)
    }
  }

  const python: PythonCommand = { command: sandboxPython, args: [] }
  const pipUpgrade = await runProcess(python.command, [
    '-m',
    'pip',
    'install',
    '--upgrade',
    'pip',
    'setuptools',
    'wheel',
  ], {
    cwd: PYTHON_SANDBOX_DIR,
    timeoutMs: 300_000,
  })
  stdout += pipUpgrade.stdout
  stderr += pipUpgrade.stderr
  if (pipUpgrade.code !== 0) {
    throw new Error(`Could not upgrade pip in the sandbox environment.\n${pipUpgrade.stderr || pipUpgrade.stdout}`)
  }

  const install = await runProcess(python.command, [
    '-m',
    'pip',
    'install',
    '--upgrade',
    ...PYTHON_SANDBOX_PACKAGES,
  ], {
    cwd: PYTHON_SANDBOX_DIR,
    timeoutMs: 900_000,
  })
  stdout += install.stdout
  stderr += install.stderr
  if (install.code !== 0) {
    throw new Error(`Could not install Python sandbox packages.\n${install.stderr || install.stdout}`)
  }

  return {
    ...(await pythonSandboxStatus()),
    stdout,
    stderr,
  }
}

async function listPythonOutputs(dir: string): Promise<PythonOutputFile[]> {
  const outputs: PythonOutputFile[] = []

  async function walk(folder: string) {
    let entries: Dirent<string>[]
    try {
      entries = await readdir(folder, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const full = join(folder, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
        continue
      }

      const ext = entry.name.split('.').pop()?.toLowerCase() ?? ''
      if (!PYTHON_OUTPUT_EXTS.has(ext)) continue
      const info = await stat(full)
      outputs.push({
        name: entry.name,
        path: full,
        ext,
        size: info.size,
        type: PYTHON_IMAGE_EXTS.has(ext) ? 'image' : PYTHON_VIDEO_EXTS.has(ext) ? 'video' : 'other',
      })
    }
  }

  await walk(dir)
  return outputs.sort((a, b) => a.name.localeCompare(b.name))
}

function firstExisting(paths: string[]) {
  return paths.find(path => existsSync(path)) ?? null
}

function resolveWhisperCli() {
  const exe = process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli'
  const legacy = process.platform === 'win32' ? 'main.exe' : 'main'
  return firstExisting([
    join(WHISPER_DIR, 'bin', exe),
    join(WHISPER_DIR, exe),
    join(WHISPER_DIR, 'bin', legacy),
    join(WHISPER_DIR, legacy),
  ])
}

function resolveWhisperModel(language?: string) {
  const wantsEnglish = !language || language.toLowerCase().startsWith('en')
  const names = wantsEnglish
    ? WHISPER_MODEL_NAMES
    : ['ggml-base.bin', 'ggml-tiny.bin', ...WHISPER_MODEL_NAMES]
  return firstExisting(names.map(name => join(WHISPER_DIR, 'models', name)))
}

function parseWhisperTimestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return 0
  const clean = value.replace(',', '.').trim()
  const parts = clean.split(':').map(Number)
  if (parts.some(part => Number.isNaN(part))) return Number(clean) || 0
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return parts[0] || 0
}

function coerceWhisperSegment(segment: unknown): SubtitleTranscribeCue | null {
  const item = segment as {
    start?: unknown
    end?: unknown
    text?: unknown
    timestamps?: { from?: unknown; to?: unknown }
  }
  const text = String(item.text ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return null
  const start = parseWhisperTimestamp(item.start ?? item.timestamps?.from)
  const end = parseWhisperTimestamp(item.end ?? item.timestamps?.to)
  return end > start ? { start, end, text } : null
}

function coerceWhisperJson(payload: unknown): SubtitleTranscribeCue[] {
  const data = payload as { transcription?: unknown; segments?: unknown; text?: unknown }
  const source = Array.isArray(data.transcription)
    ? data.transcription
    : Array.isArray(data.segments)
      ? data.segments
      : []
  return source
    .map(coerceWhisperSegment)
    .filter((cue): cue is SubtitleTranscribeCue => Boolean(cue))
}

async function resolveNativeFfmpeg() {
  const python = await resolvePython()
  return python ? pythonImageioFfmpegPath(python) : null
}

// Word timings (jump cuts, transcript editing) are kept so a clip is transcribed once.
const transcripts = createTranscriptCache(join(USER_DATA, 'transcripts'), writeFileAtomic)

async function transcribeAudioWithLocalWhisper(req: SubtitleTranscribeRequest) {
  if (!req.sourcePath) throw new Error('No audio file was provided for transcription.')
  const info = await stat(req.sourcePath)
  if (!info.isFile()) throw new Error('Selected audio source is not a file.')

  const variant = `words:${req.language?.trim() || 'auto'}`
  if (req.words) {
    const cached = await transcripts.load(req.sourcePath, variant)
    if (cached) return { source: 'whisper.cpp', text: cached.map(cue => cue.text).join(' ').trim(), cues: cached }
  }

  const cli = resolveWhisperCli()
  const model = resolveWhisperModel(req.language)
  if (!cli || !model) {
    throw new Error('Local Whisper is not installed. Add whisper.cpp CLI and a ggml model under build/whisper.')
  }

  const ffmpegPath = await resolveNativeFfmpeg()
  if (!ffmpegPath) {
    throw new Error(`Local Whisper needs FFmpeg from the Python runtime. ${PYTHON_RUNTIME_MISSING}`)
  }

  const jobId = `sub_${Date.now()}_${Math.random().toString(16).slice(2)}`
  const jobDir = join(USER_DATA, 'subtitle-jobs', jobId)
  await ensureDir(jobDir)

  const wavPath = join(jobDir, `${basename(req.sourcePath).replace(/\W+/g, '_')}.wav`)
  const outputBase = join(jobDir, 'captions')
  const outputJson = `${outputBase}.json`

  try {
    const convert = await runProcess(ffmpegPath, [
      '-y',
      '-i',
      req.sourcePath,
      '-vn',
      '-ar',
      '16000',
      '-ac',
      '1',
      '-c:a',
      'pcm_s16le',
      wavPath,
    ], { timeoutMs: 300_000 })
    if (convert.code !== 0) {
      throw new Error(`Could not prepare audio for local Whisper.\n${convert.stderr || convert.stdout}`)
    }

    const whisperArgs = [
      '-m',
      model,
      '-f',
      wavPath,
      '-oj',
      '-of',
      outputBase,
    ]
    const language = req.language?.trim()
    if (language) whisperArgs.push('-l', language)
    // One segment per word. Whisper normally drops "um"/"uh"; a prompt written
    // in that style makes it keep them (used by the AI "remove filler words").
    if (req.words) whisperArgs.push('-ml', '1', '-sow', '--prompt', 'Umm, let me think like, hmm... Okay, here is what I am, like, thinking. Uh, so, erm.')

    const result = await runProcess(cli, whisperArgs, { cwd: jobDir, timeoutMs: 900_000 })
    if (result.code !== 0) {
      throw new Error(`Local Whisper transcription failed.\n${result.stderr || result.stdout}`)
    }
    if (!existsSync(outputJson)) {
      throw new Error('Local Whisper finished but did not produce JSON captions.')
    }

    const payload = JSON.parse(await readFile(outputJson, 'utf-8'))
    const cues = coerceWhisperJson(payload)
    if (req.words) await transcripts.save(req.sourcePath, variant, cues).catch(() => {})
    return {
      source: 'whisper.cpp',
      text: cues.map(cue => cue.text).join(' ').trim(),
      cues,
    }
  } finally {
    await rm(jobDir, { recursive: true, force: true }).catch(() => {})
  }
}

function validatePythonUserCode(code: string): string | null {
  const rules: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /^\s*(import|from)\s+/m, label: 'Import statements are not allowed. Use the preloaded libraries.' },
    { pattern: /\b__import__\s*\(/, label: '__import__ is not allowed.' },
    { pattern: /\bimportlib\b/, label: 'importlib is not allowed.' },
    { pattern: /\bpip\b|\bensurepip\b/, label: 'Installing packages from the sandbox is not allowed.' },
    { pattern: /\bsubprocess\b/, label: 'Starting subprocesses from the sandbox is not allowed.' },
    { pattern: /\bos\.(system|popen|spawn|exec|startfile)\b/, label: 'Shell/system calls are not allowed.' },
    { pattern: /\b(eval|exec|compile)\s*\(/, label: 'Dynamic code execution is not allowed.' },
  ]

  for (const rule of rules) {
    if (rule.pattern.test(code)) return rule.label
  }
  return null
}

// ── Save before close ────────────────────────────────────────────────────────
// Closing a window first asks the renderer to flush its autosave; the window
// closes once the renderer reports back, or after a timeout.
const CLOSE_SAVE_TIMEOUT_MS = 4000
const closeAllowed = new WeakSet<BrowserWindow>()
let isQuitting = false
app.on('before-quit', () => { isQuitting = true })

function allowClose(win: BrowserWindow) {
  if (win.isDestroyed() || closeAllowed.has(win)) return
  closeAllowed.add(win)
  win.close()
  // A held close cancels app.quit (Cmd+Q on macOS), so resume quitting.
  if (isQuitting) app.quit()
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    frame: false,
    backgroundColor: '#0f0f0f',
    show: false,
    icon: appIconPath(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Hold the close until the editor has saved unsaved edits (see app:close-ready).
  win.on('close', e => {
    if (closeAllowed.has(win)) return
    e.preventDefault()
    win.webContents.send('app:before-close')
    setTimeout(() => allowClose(win), CLOSE_SAVE_TIMEOUT_MS)   // a stuck save must not block closing
  })

  win.on('ready-to-show', () => win.show())
  win.webContents.on('did-fail-load', (_e, code, desc, url) => logCrash('did-fail-load', `${code} ${desc} ${url}`))
  win.webContents.on('render-process-gone', (_e, d) => logCrash('render-gone', JSON.stringify(d)))
  // Force-show even if ready-to-show never fires, so a blank window is visible instead of nothing
  setTimeout(() => { if (!win.isDestroyed() && !win.isVisible()) win.show() }, 3000)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    // Served through the custom `app://` scheme (NOT file://) so ffmpeg.wasm
    // can spawn its Web Worker.
    win.loadURL('app://bundle/index.html')
  }
}

// Registered once (NOT per-window) — re-registering throws
// "Attempted to register a second handler for ...".
function registerIpcHandlers() {
  // Window controls
  ipcMain.handle('win:minimize', () => focusedWindow()?.minimize())
  ipcMain.handle('win:maximize', () => {
    const w = focusedWindow()
    if (w) w.isMaximized() ? w.unmaximize() : w.maximize()
  })
  ipcMain.handle('win:close', () => focusedWindow()?.close())
  ipcMain.on('app:close-ready', e => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (win) allowClose(win)
  })

  // Projects CRUD
  // The Planner: the app's own notes, shared by every project.
  const planner = createPlannerStore(join(USER_DATA, 'planner'), writeFileAtomic)
  ipcMain.handle('planner:load', () => planner.load())
  ipcMain.handle('planner:save', (_, data: unknown) => planner.save(data))

  // Timeline video thumbnails, kept so a reopened project shows them at once.
  // Not under userData/cache: on Windows that is Chromium's own Cache folder, which it clears at start.
  const filmstrips = createFilmstripCache(join(USER_DATA, 'thumbnails', 'filmstrips'), writeFileAtomic)
  ipcMain.handle('filmstrip:load', (_, videoPath: string, grid: number) => filmstrips.load(String(videoPath), Number(grid)))
  ipcMain.handle('filmstrip:save', (_, videoPath: string, data: unknown) => filmstrips.save(String(videoPath), data as never))

  ipcMain.handle('projects:list', () => readIndex())

  ipcMain.handle('projects:create', async (_, name: string) => {
    const id     = `prj_${Date.now()}`
    const folder = join(PROJECTS_DIR, id)
    await ensureDir(folder)
    await ensureDir(join(folder, 'assets'))
    const now = Date.now()
    const record: ProjectRecord = { id, name, folder, createdAt: now, updatedAt: now, lastOpenedAt: now }
    const idx = await readIndex()
    idx.unshift(record)
    await writeIndex(idx)
    return record
  })

  ipcMain.handle('projects:save', async (_, id: string, data: string) => {
    const idx    = await readIndex()
    const record = idx.find(r => r.id === id)
    if (!record) throw new Error('Project not found')
    const parsed = JSON.parse(data) as { name?: string }
    await writeJsonFile(join(record.folder, 'project.json'), data)
    if (parsed.name?.trim()) record.name = parsed.name.trim()
    const now = Date.now()
    record.updatedAt = now
    record.lastOpenedAt = now
    await writeIndex(idx)
  })

  ipcMain.handle('projects:load', async (_, id: string) => {
    const idx    = await readIndex()
    const record = idx.find(r => r.id === id)
    if (!record) throw new Error('Project not found')
    const project = await readJsonWithBackup(join(record.folder, 'project.json'))
    record.lastOpenedAt = Date.now()
    await writeIndex(idx).catch(err => logCrash('projects:load-touch', err))
    return project
  })

  ipcMain.handle('projects:delete', async (_, id: string) => {
    const idx    = await readIndex()
    const record = idx.find(r => r.id === id)
    if (record) await rm(record.folder, { recursive: true, force: true })
    await writeIndex(idx.filter(r => r.id !== id))
  })

  ipcMain.handle('projects:rename', async (_, id: string, name: string) => {
    const idx    = await readIndex()
    const record = idx.find(r => r.id === id)
    if (!record) throw new Error('Project not found')
    record.name = name
    record.updatedAt = Date.now()
    await writeIndex(idx)
  })

  // Assets
  let assetCounter = 0
  ipcMain.handle('assets:upload', async (_, projectId: string, sourcePath: string, requestedKind?: string) => {
    const idx    = await readIndex()
    const record = idx.find(r => r.id === projectId)
    if (!record) throw new Error('Project not found')
    const assetId  = `asset_${Date.now()}_${assetCounter++}`
    const kind     = requestedKind === 'image' || requestedKind === 'video' || requestedKind === 'audio'
      ? requestedKind
      : inferUploadAssetKind(sourcePath)
    let filename   = makeAssetUploadName(sourcePath, kind)
    let dest       = join(record.folder, 'assets', filename)
    while (existsSync(dest)) {
      filename = makeAssetUploadName(sourcePath, kind, randomAssetHash())
      dest = join(record.folder, 'assets', filename)
    }
    await copyFile(sourcePath, dest)
    return { id: assetId, filename, path: dest }
  })

  ipcMain.handle('assets:list', async (_, projectId: string) => {
    const idx    = await readIndex()
    const record = idx.find(r => r.id === projectId)
    if (!record) throw new Error('Project not found')
    const dir   = join(record.folder, 'assets')
    await ensureDir(dir)
    const files = await readdir(dir)
    return files.map(f => ({ filename: f, path: join(dir, f) }))
  })

  // Dialogs
  ipcMain.handle('dialog:open-file', async (_, filters: Electron.FileFilter[]) => {
    const r = await dialog.showOpenDialog(focusedWindow()!, { properties: ['openFile'], filters })
    return r.canceled ? null : r.filePaths[0]
  })

  ipcMain.handle('dialog:save-video', async (_, defaultName: string) => {
    const ext = (defaultName.split('.').pop() ?? 'mp4').toLowerCase()
    const filters: Electron.FileFilter[] = ext === 'webm'
      ? [{ name: 'WebM Video', extensions: ['webm'] }, { name: 'All Files', extensions: ['*'] }]
      : [{ name: 'MP4 Video', extensions: ['mp4'] }, { name: 'All Files', extensions: ['*'] }]

    const r = await dialog.showSaveDialog(focusedWindow()!, {
      defaultPath: join(app.getPath('downloads'), defaultName),
      filters
    })
    return r.canceled ? null : r.filePath
  })

  ipcMain.handle('dialog:save-image', async (_, defaultName: string) => {
    const ext = (defaultName.split('.').pop() ?? 'png').toLowerCase()
    const filters: Electron.FileFilter[] = ext === 'webp'
      ? [{ name: 'WebP Image', extensions: ['webp'] }, { name: 'All Files', extensions: ['*'] }]
      : [{ name: 'PNG Image', extensions: ['png'] }, { name: 'All Files', extensions: ['*'] }]
    const r = await dialog.showSaveDialog(focusedWindow()!, {
      defaultPath: join(app.getPath('downloads'), defaultName),
      filters
    })
    return r.canceled ? null : r.filePath
  })

  ipcMain.handle('shell:open-path', (_e, path: string) => shell.openPath(path))
  ipcMain.handle('shell:show-item', (_e, path: string) => shell.showItemInFolder(path))
  // Web links open in the user's browser — only http(s), never files or other schemes.
  ipcMain.handle('shell:open-external', async (_e, url: string) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) await shell.openExternal(url)
  })

  // File system
  ipcMain.handle('fs:write-file', async (_e, path: string, data: Uint8Array) => {
    await writeFile(path, Buffer.from(data))
  })

  // Export renders frames in the page, which Chromium throttles (and stops
  // drawing) while the window is minimised or covered. During an export: no
  // throttling, no system sleep, and progress on the taskbar button.
  let exportSleepBlocker: number | null = null
  ipcMain.handle('export:background', (event, active: boolean) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    event.sender.setBackgroundThrottling(!active)
    if (active && exportSleepBlocker == null) exportSleepBlocker = powerSaveBlocker.start('prevent-app-suspension')
    if (!active && exportSleepBlocker != null) {
      powerSaveBlocker.stop(exportSleepBlocker)
      exportSleepBlocker = null
    }
    win?.setProgressBar(active ? 0 : -1)
  })
  ipcMain.on('export:progress', (event, fraction: number) => {
    BrowserWindow.fromWebContents(event.sender)?.setProgressBar(Math.max(0, Math.min(1, fraction)))
  })
  ipcMain.on('export:finished', event => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isFocused()) return
    win.flashFrame(true)
    win.once('focus', () => win.flashFrame(false))
  })

  // FFmpeg core — return absolute file paths so renderer can fetch via localasset://
  // Tries production location (extraResources) first, falls back to dev node_modules.
  ipcMain.handle('ffmpeg:get-paths', () => {
    const prodDir = join(process.resourcesPath, 'ffmpeg-core')
    if (existsSync(join(prodDir, 'ffmpeg-core.js'))) {
      return {
        coreJs:   join(prodDir, 'ffmpeg-core.js'),
        coreWasm: join(prodDir, 'ffmpeg-core.wasm'),
      }
    }
    // Dev: node_modules relative to app root
    const appRoot = app.getAppPath()
    return {
      coreJs:   join(appRoot, 'node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js'),
      coreWasm: join(appRoot, 'node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm'),
    }
  })

  ipcMain.handle('python:check', async () => {
    return pythonSandboxStatus()
  })

  ipcMain.handle('python:setup', async () => {
    return setupPythonSandboxEnv()
  })

  ipcMain.handle('python:runtime-status', () => pythonRuntime.getStatus())
  ipcMain.handle('python:runtime-install', async event => {
    const send = (progress: PythonRuntimeProgress) => {
      if (!event.sender.isDestroyed()) event.sender.send('python:runtime-progress', progress)
    }
    // 'finished' lets a prompt that was closed and reopened mid-download refresh its status.
    try { return await pythonRuntime.install(send) }
    finally { send({ phase: 'finished', receivedBytes: 0, totalBytes: 0 }) }
  })
  ipcMain.handle('python:runtime-cancel', () => pythonRuntime.cancel())
  ipcMain.handle('python:runtime-remove', () => pythonRuntime.remove())

  ipcMain.handle('python:run', async (_e, req: PythonRunRequest) => {
    const idx = await readIndex()
    const record = idx.find(r => r.id === req.projectId)
    if (!record) throw new Error('Project not found')
    if (!req.code || req.code.length > 250_000) throw new Error('Python code is empty or too large')
    const validationError = validatePythonUserCode(req.code)
    if (validationError) throw new Error(validationError)

    const python = await resolvePython()
    if (!python) throw new Error(PYTHON_RUNTIME_MISSING)
    const requiredModule = req.kind === 'manim' ? 'manim' : 'matplotlib'
    if (!await pythonModuleAvailable(requiredModule, python)) {
      throw new Error(`${requiredModule} is not installed in the Python Sandbox environment. Download the Python runtime first.`)
    }

    const jobId = req.jobId || `py_${Date.now()}_${Math.random().toString(16).slice(2)}`
    const rootDir = join(record.folder, 'generated', 'python')
    const jobDir = join(rootDir, jobId)
    await ensureDir(jobDir)

    const scriptPath = join(jobDir, req.kind === 'manim' ? 'scene.py' : 'script.py')
    const scriptSource = [PYTHON_SANDBOX_PRELUDE, req.code].join('\n\n')
    if (scriptSource.length > 300_000) throw new Error('Python code is too large')
    await writeFile(scriptPath, scriptSource, 'utf-8')

    const ffmpegPath = req.kind === 'manim' ? await pythonImageioFfmpegPath(python) : null
    const env = {
      ...process.env,
      LUFFY_OUTPUT_DIR: jobDir,
      LUFFY_WIDTH: String(req.width ?? 1920),
      LUFFY_HEIGHT: String(req.height ?? 1080),
      LUFFY_FPS: String(req.fps ?? 30),
      MPLBACKEND: 'Agg',
      MPLCONFIGDIR: join(jobDir, '.matplotlib'),
      PYTHONDONTWRITEBYTECODE: '1',
      PYTHONIOENCODING: 'utf-8',
      PYTHONNOUSERSITE: '1',
      PATH: ffmpegPath ? `${dirname(ffmpegPath)}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}` : process.env.PATH,
    }

    const args = req.kind === 'manim'
      ? [
        ...python.args,
        '-m',
        'manim',
        '-qm',
        '--media_dir',
        jobDir,
        scriptPath,
        req.sceneName?.trim() || 'GeneratedScene',
      ]
      : [...python.args, scriptPath]

    const result = await runProcess(python.command, args, {
      cwd: jobDir,
      env,
      timeoutMs: Math.max(5000, Math.min(req.timeoutMs ?? 120_000, 600_000)),
      jobId,
    })

    const outputs = await listPythonOutputs(jobDir)
    return {
      jobId,
      outputDir: jobDir,
      success: result.code === 0,
      exitCode: result.code,
      timedOut: result.timedOut,
      stdout: result.stdout,
      stderr: result.stderr,
      outputs,
    }
  })

  ipcMain.handle('python:cancel', async (_e, jobId: string) => {
    const child = pythonJobs.get(jobId)
    if (!child) return false
    child.kill()
    pythonJobs.delete(jobId)
    return true
  })

  ipcMain.handle('python:list-outputs', async (_e, outputDir: string) => {
    return listPythonOutputs(outputDir)
  })

  ipcMain.handle('subtitle:transcribe-audio', async (_e, req: SubtitleTranscribeRequest) => {
    return transcribeAudioWithLocalWhisper(req)
  })
  ipcMain.handle('subtitle:translation-status', async (_event, direction: TranslationDirection) =>
    publicTranslationStatus(await translationPacks.getStatus(direction)))
  ipcMain.handle('subtitle:translation-install', async (event, direction: TranslationDirection) =>
    publicTranslationStatus(await translationPacks.install(direction, progress => event.sender.send('subtitle:translation-progress', progress))))
  ipcMain.handle('subtitle:translation-install-cancel', (_event, direction: TranslationDirection) =>
    translationPacks.cancel(direction))
  ipcMain.handle('subtitle:translation-remove', (_event, direction: TranslationDirection) =>
    translationPacks.remove(direction))
  ipcMain.handle('subtitle:translate', (event, request: SubtitleTranslateRequest) =>
    subtitleTranslation.translate(request, progress => event.sender.send('subtitle:translation-progress', progress)))
  ipcMain.handle('subtitle:translation-cancel', (_event, jobId: string) =>
    subtitleTranslation.cancel(jobId))
}

app.whenReady().then(async () => {
  await ensureDir(PROJECTS_DIR)
  electronApp.setAppUserModelId('com.luffy.app')

  // Serve the built renderer (production). Path-traversal guarded.
  protocol.handle('app', async (request) => {
    const url = new URL(request.url)
    const rel = decodeURIComponent(url.pathname) === '/' ? 'index.html' : decodeURIComponent(url.pathname).slice(1)
    const filePath = normalize(join(RENDERER_DIR, rel))
    if (!filePath.startsWith(normalize(RENDERER_DIR))) {
      return new Response('Forbidden', { status: 403 })
    }
    try {
      const data = await readFile(filePath)
      return new Response(data, {
        headers: {
          'Content-Type': mimeFor(filePath),
          'Cross-Origin-Resource-Policy': 'cross-origin'
        }
      })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })

  // Serve local assets with range-request support (required for <video>/<audio> seeking)
  protocol.handle('localasset', async (request) => {
    const raw = decodeURIComponent(request.url.replace('localasset:///', ''))
    // Strip leading slash on Windows paths like /C:/...
    const filePath = raw.match(/^\/[A-Za-z]:/) ? raw.slice(1) : raw
    try {
      const contentType = mimeFor(filePath)
      const rangeHeader = request.headers.get('Range')

      if (rangeHeader) {
        const { size } = await stat(filePath)
        const match = rangeHeader.match(/bytes=(\d*)-(\d*)/)
        const start = match?.[1] ? parseInt(match[1]) : 0
        const end   = match?.[2] ? Math.min(parseInt(match[2]), size - 1) : size - 1
        const chunkSize = end - start + 1

        const fh  = await open(filePath, 'r')
        const buf = Buffer.alloc(chunkSize)
        await fh.read(buf, 0, chunkSize, start)
        await fh.close()

        return new Response(buf, {
          status: 206,
          headers: {
            'Content-Type':   contentType,
            'Content-Range':  `bytes ${start}-${end}/${size}`,
            'Accept-Ranges':  'bytes',
            'Content-Length': String(chunkSize),
            'Cross-Origin-Resource-Policy': 'cross-origin',
            'Access-Control-Allow-Origin': '*'
          }
        })
      }

      const data = await readFile(filePath)
      return new Response(data, {
        headers: {
          'Content-Type':   contentType,
          'Accept-Ranges':  'bytes',
          'Content-Length': String(data.byteLength),
          'Cross-Origin-Resource-Policy': 'cross-origin',
          'Access-Control-Allow-Origin': '*'
        }
      })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })

  registerIpcHandlers()
  app.on('browser-window-created', (_, w) => optimizer.watchWindowShortcuts(w))
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
