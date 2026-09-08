import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, open, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'

export type TranslationDirection = 'en-hi' | 'hi-en'

export interface TranslationPackEntry {
  version: string
  url: string
  sha256: string
  archiveBytes: number
  expandedBytes: number
}

export interface TranslationPackCatalog {
  schemaVersion: number
  packs: Record<TranslationDirection, Record<string, TranslationPackEntry>>
}

export interface TranslationPackProgress {
  direction: TranslationDirection
  phase: 'download' | 'install'
  receivedBytes: number
  totalBytes: number
}

export type TranslationPackStatus =
  | { state: 'not-installed'; direction: TranslationDirection }
  | { state: 'downloading'; direction: TranslationDirection }
  | { state: 'installed'; direction: TranslationDirection; version: string; path: string }

interface TranslationPackDependencies {
  root: string
  catalog: TranslationPackCatalog
  target?: string
  fetch?: typeof fetch
  extract: (archive: string, destination: string, maxBytes: number) => Promise<void>
}

const MAX_BYTES = 500 * 1024 * 1024

function isDirection(value: string): value is TranslationDirection {
  return value === 'en-hi' || value === 'hi-en'
}

export function createTranslationPackManager(deps: TranslationPackDependencies) {
  const target = deps.target ?? `${process.platform}-${process.arch}`
  const fetchFile = deps.fetch ?? fetch
  const active = new Map<TranslationDirection, AbortController>()

  function entry(direction: TranslationDirection) {
    if (!isDirection(direction)) throw new Error('Unsupported translation direction')
    const value = deps.catalog.packs[direction]?.[target]
    if (!value) throw new Error(`Translation model is unavailable for ${target}`)
    if (value.archiveBytes > MAX_BYTES || value.expandedBytes > MAX_BYTES) {
      throw new Error('Translation model exceeds the 500 MB limit')
    }
    return value
  }

  function packPath(direction: TranslationDirection, version: string) {
    return join(deps.root, direction, version)
  }

  async function getStatus(direction: TranslationDirection): Promise<TranslationPackStatus> {
    if (active.has(direction)) return { state: 'downloading', direction }
    const model = entry(direction)
    const path = packPath(direction, model.version)
    if (existsSync(join(path, 'manifest.json')) && existsSync(join(path, 'runner.py'))) {
      return { state: 'installed', direction, version: model.version, path }
    }
    return { state: 'not-installed', direction }
  }

  async function install(direction: TranslationDirection, onProgress: (progress: TranslationPackProgress) => void) {
    const model = entry(direction)
    if (active.has(direction)) throw new Error('Translation model download is already running')
    const downloadPath = join(deps.root, `${direction}.download`)
    const destination = packPath(direction, model.version)
    const controller = new AbortController()
    active.set(direction, controller)
    await mkdir(deps.root, { recursive: true })
    await rm(downloadPath, { force: true })
    try {
      const response = await fetchFile(model.url, { signal: controller.signal })
      if (!response.ok) throw new Error(`Translation model download failed (${response.status})`)
      const declaredBytes = Number(response.headers.get('content-length') || model.archiveBytes)
      if (declaredBytes > MAX_BYTES) throw new Error('Translation model exceeds the 500 MB limit')
      if (!response.body) throw new Error(`Translation model download failed (${response.status})`)

      const file = await open(downloadPath, 'w')
      const reader = response.body.getReader()
      const hash = createHash('sha256')
      let receivedBytes = 0
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          receivedBytes += value.byteLength
          if (receivedBytes > MAX_BYTES) throw new Error('Translation model exceeds the 500 MB limit')
          hash.update(value)
          await file.write(value)
          onProgress({ direction, phase: 'download', receivedBytes, totalBytes: declaredBytes })
        }
      } finally {
        await file.close()
      }
      if (receivedBytes !== model.archiveBytes) throw new Error('Translation model download size does not match the catalog')
      if (hash.digest('hex') !== model.sha256) throw new Error('Translation model checksum verification failed')

      onProgress({ direction, phase: 'install', receivedBytes, totalBytes: declaredBytes })
      await mkdir(join(deps.root, direction), { recursive: true })
      await rm(destination, { recursive: true, force: true })
      await deps.extract(downloadPath, destination, MAX_BYTES)
      const manifest = JSON.parse(await readFile(join(destination, 'manifest.json'), 'utf8'))
      if (manifest.version !== model.version || !existsSync(join(destination, 'runner.py'))) {
        throw new Error('Installed translation model is invalid')
      }
      return { state: 'installed' as const, direction, version: model.version, path: destination }
    } catch (error) {
      await rm(destination, { recursive: true, force: true }).catch(() => {})
      await rm(`${destination}.installing`, { recursive: true, force: true }).catch(() => {})
      if (controller.signal.aborted) throw new Error('Translation model download cancelled')
      throw error
    } finally {
      active.delete(direction)
      await rm(downloadPath, { force: true }).catch(() => {})
    }
  }

  async function remove(direction: TranslationDirection) {
    entry(direction)
    await rm(join(deps.root, direction), { recursive: true, force: true })
    await rm(join(deps.root, `${direction}.download`), { force: true })
  }

  async function getInstalledPath(direction: TranslationDirection) {
    const status = await getStatus(direction)
    return status.state === 'installed' ? status.path : null
  }

  function cancel(direction: TranslationDirection) {
    const controller = active.get(direction)
    if (!controller) return false
    controller.abort()
    return true
  }

  return { getStatus, install, remove, getInstalledPath, cancel }
}
