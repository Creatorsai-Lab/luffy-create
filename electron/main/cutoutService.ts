import { utilityProcess, type UtilityProcess } from 'electron'
import { cpus } from 'node:os'
import { readdir, readFile, rm, stat, writeFile, mkdir, utimes } from 'node:fs/promises'
import { join } from 'node:path'
import type { CutoutRequest, CutoutResponse } from './cutoutWorker'

type Request = CutoutRequest extends infer R ? R extends { id: number } ? Omit<R, 'id'> : never : never

const IDLE_MS = 120_000
const CACHE_LIMIT = 1024 * 1024 * 1024

/**
 * Runs background-removal requests in a utility process (see cutoutWorker),
 * started on first use and stopped after two idle minutes so it holds no
 * memory while unused. Also keeps the disk cache of processed video masks.
 */
export function createCutoutService(opts: { workerPath: string; ortPath: string; modelDir: string; cacheDir: string }) {
  let worker: UtilityProcess | null = null
  let nextId = 1
  let idle: NodeJS.Timeout | null = null
  const pending = new Map<number, { resolve: (r: CutoutResponse) => void }>()

  // Leave a core for the editor; more than 4 threads gains little on these small models.
  const threads = Math.max(1, Math.min(4, cpus().length - 1))

  function stop() {
    worker?.kill()
    worker = null
  }

  function start() {
    if (worker) return worker
    const w = utilityProcess.fork(opts.workerPath, [], {
      serviceName: 'Luffy background removal',
      env: { ...process.env, LUFFY_ORT_PATH: opts.ortPath, LUFFY_CUTOUT_MODELS: opts.modelDir, LUFFY_CUTOUT_THREADS: String(threads) },
    })
    w.on('message', (res: CutoutResponse) => {
      pending.get(res.id)?.resolve(res)
      pending.delete(res.id)
    })
    w.on('exit', () => {
      if (worker === w) worker = null
      for (const [id, p] of pending) p.resolve({ id, ok: false, error: 'Background removal stopped unexpectedly. Try again.' })
      pending.clear()
    })
    worker = w
    return w
  }

  async function run(req: Request): Promise<CutoutResponse> {
    if (idle) clearTimeout(idle)
    const id = nextId++
    const response = new Promise<CutoutResponse>(resolve => pending.set(id, { resolve }))
    start().postMessage({ ...req, id })
    const res = await response
    if (!pending.size) idle = setTimeout(stop, IDLE_MS)
    return res
  }

  const cacheFile = (key: string) => join(opts.cacheDir, `${key.replace(/[^a-z0-9-]/gi, '')}.bin`)

  async function cacheRead(key: string): Promise<Uint8Array | null> {
    try {
      const file = cacheFile(key)
      const data = await readFile(file)
      const now = new Date()
      await utimes(file, now, now).catch(() => {})
      return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    } catch {
      return null
    }
  }

  async function cacheWrite(key: string, data: Uint8Array) {
    await mkdir(opts.cacheDir, { recursive: true })
    await writeFile(cacheFile(key), data)
    // Keep the cache under its limit, oldest-used first.
    const files = await Promise.all((await readdir(opts.cacheDir)).map(async name => {
      const s = await stat(join(opts.cacheDir, name))
      return { name, size: s.size, used: s.mtimeMs }
    }))
    let total = files.reduce((sum, f) => sum + f.size, 0)
    for (const f of files.sort((a, b) => a.used - b.used)) {
      if (total <= CACHE_LIMIT) break
      await rm(join(opts.cacheDir, f.name), { force: true })
      total -= f.size
    }
  }

  return { run, stop, cacheRead, cacheWrite }
}
