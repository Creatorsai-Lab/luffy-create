import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { downloadVerified } from './verifiedDownload'

/**
 * The Python runtime (CPython + numpy/matplotlib/manim/imageio-ffmpeg…) used by
 * the Python Sandbox, local Whisper audio conversion and subtitle translation.
 * It is too large for the installer, so it is downloaded once into userData.
 * Archives are built by .github/workflows/python-runtime.yml.
 */

export interface PythonRuntimeEntry {
  url: string
  sha256: string
  archiveBytes: number
  expandedBytes: number
}

export interface PythonRuntimeCatalog {
  schemaVersion: number
  /** Bumped only when the runtime changes, so app updates don't force a re-download. */
  version: string
  targets: Record<string, PythonRuntimeEntry>
}

export interface PythonRuntimeManifest {
  pythonRelativePath?: string
}

export interface PythonRuntimeStatus {
  state: 'unavailable' | 'not-installed' | 'downloading' | 'installed'
  version: string
  archiveBytes: number
  expandedBytes: number
}

export interface PythonRuntimeProgress {
  phase: 'download' | 'install' | 'finished'
  receivedBytes: number
  totalBytes: number
}

interface PythonRuntimeDependencies {
  root: string
  catalog: PythonRuntimeCatalog
  target?: string
  fetch?: typeof fetch
  extract: (archive: string, destination: string) => Promise<void>
}

const MAX_BYTES = 1024 * 1024 * 1024

export function readRuntimeManifest(dir: string): PythonRuntimeManifest | null {
  try {
    return JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf-8')) as PythonRuntimeManifest
  } catch {
    return null
  }
}

function isComplete(dir: string) {
  const manifest = readRuntimeManifest(dir)
  return Boolean(manifest?.pythonRelativePath && existsSync(join(dir, manifest.pythonRelativePath)))
}

export function createPythonRuntimeManager(deps: PythonRuntimeDependencies) {
  const target = deps.target ?? `${process.platform}-${process.arch}`
  const entry = deps.catalog.targets[target] ?? null
  const version = deps.catalog.version
  const destination = join(deps.root, version)
  let active: AbortController | null = null

  function installedPath() {
    return isComplete(destination) ? destination : null
  }

  function getStatus(): PythonRuntimeStatus {
    const state = !entry
      ? 'unavailable'
      : active
        ? 'downloading'
        : installedPath() ? 'installed' : 'not-installed'
    return { state, version, archiveBytes: entry?.archiveBytes ?? 0, expandedBytes: entry?.expandedBytes ?? 0 }
  }

  async function install(onProgress: (progress: PythonRuntimeProgress) => void) {
    if (!entry) throw new Error(`The Python runtime is not available for ${target}`)
    if (active) throw new Error('The Python runtime download is already running')
    if (installedPath()) return getStatus()

    const downloadPath = join(deps.root, `${version}.download`)
    const staging = join(deps.root, `${version}.installing`)
    const controller = new AbortController()
    active = controller
    try {
      await mkdir(deps.root, { recursive: true })
      const totalBytes = await downloadVerified({
        url: entry.url,
        destination: downloadPath,
        sha256: entry.sha256,
        bytes: entry.archiveBytes,
        maxBytes: MAX_BYTES,
        label: 'Python runtime',
        signal: controller.signal,
        fetch: deps.fetch,
        onProgress: (receivedBytes, totalBytes) => onProgress({ phase: 'download', receivedBytes, totalBytes }),
      })

      onProgress({ phase: 'install', receivedBytes: entry.archiveBytes, totalBytes })
      await rm(staging, { recursive: true, force: true })
      await mkdir(staging, { recursive: true })
      await deps.extract(downloadPath, staging)
      if (!isComplete(staging)) throw new Error('The downloaded Python runtime is incomplete')
      await rm(destination, { recursive: true, force: true })
      await rename(staging, destination)
      await removeOtherVersions()
    } catch (error) {
      await rm(staging, { recursive: true, force: true }).catch(() => {})
      if (controller.signal.aborted) throw new Error('Python runtime download cancelled')
      throw error
    } finally {
      active = null
      await rm(downloadPath, { force: true }).catch(() => {})
    }
    return getStatus()
  }

  async function removeOtherVersions() {
    for (const name of readdirSync(deps.root)) {
      if (name !== version) await rm(join(deps.root, name), { recursive: true, force: true }).catch(() => {})
    }
  }

  function cancel() {
    if (!active) return false
    active.abort()
    return true
  }

  async function remove() {
    if (active) throw new Error('Cancel the Python runtime download first')
    await rm(deps.root, { recursive: true, force: true })
  }

  return { getStatus, install, cancel, remove, installedPath }
}
