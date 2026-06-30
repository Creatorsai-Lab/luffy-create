import { app, BrowserWindow, ipcMain, dialog, shell, protocol } from 'electron'

// Suppress GPU shader-cache permission errors on Windows
app.commandLine.appendSwitch('disable-gpu-shader-cache')

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
import { join, normalize } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { mkdir, readFile, writeFile, copyFile, readdir, rm, stat, open, rename } from 'fs/promises'
import { existsSync, writeFileSync } from 'fs'

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
      updatedAt: project.updatedAt || Date.now()
    }
  } catch {
    return null
  }
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

  return records
}

async function writeIndex(records: ProjectRecord[]) {
  await writeJsonFile(INDEX_FILE, JSON.stringify(records, null, 2))
}

function focusedWindow(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
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
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
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

  // Projects CRUD
  ipcMain.handle('projects:list', () => readIndex())

  ipcMain.handle('projects:create', async (_, name: string) => {
    const id     = `prj_${Date.now()}`
    const folder = join(PROJECTS_DIR, id)
    await ensureDir(folder)
    await ensureDir(join(folder, 'assets'))
    const record: ProjectRecord = { id, name, folder, createdAt: Date.now(), updatedAt: Date.now() }
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
    record.updatedAt = Date.now()
    await writeIndex(idx)
  })

  ipcMain.handle('projects:load', async (_, id: string) => {
    const idx    = await readIndex()
    const record = idx.find(r => r.id === id)
    if (!record) throw new Error('Project not found')
    return readJsonWithBackup(join(record.folder, 'project.json'))
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
  ipcMain.handle('assets:upload', async (_, projectId: string, sourcePath: string) => {
    const idx    = await readIndex()
    const record = idx.find(r => r.id === projectId)
    if (!record) throw new Error('Project not found')
    const ext      = sourcePath.split('.').pop() ?? 'bin'
    const assetId  = `asset_${Date.now()}_${assetCounter++}`
    const filename = `${assetId}.${ext}`
    const dest     = join(record.folder, 'assets', filename)
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

  // File system
  ipcMain.handle('fs:write-file', async (_e, path: string, data: Uint8Array) => {
    await writeFile(path, Buffer.from(data))
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
