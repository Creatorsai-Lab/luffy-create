/**
 * Disk cache for timeline video thumbnails (filmstrip frames), so reopening a
 * project shows them at once instead of decoding the video again. One small
 * JSON file per video, in the app's data folder, holding JPEG frames keyed by
 * their slot on a time grid. A cache is only used while the video file is
 * unchanged (same size and modified time); the oldest files are pruned.
 * No Electron imports, so it can be tested with a plain folder.
 */
import { createHash } from 'crypto'
import { mkdir, readdir, readFile, rm, stat } from 'fs/promises'
import { join } from 'path'

export interface FilmstripFrames {
  /** Seconds between grid slots; frames from another grid are not reused. */
  grid: number
  /** Grid slot → JPEG data URL. */
  frames: Record<string, string>
}

interface CacheFile extends FilmstripFrames {
  path: string
  size: number
  mtimeMs: number
}

const KEEP_FILES = 300
const MAX_FRAMES = 400

export function createFilmstripCache(dir: string, writeFileAtomic: (path: string, data: string) => Promise<void>) {
  const fileFor = (videoPath: string) => join(dir, `${createHash('sha1').update(videoPath).digest('hex')}.json`)
  let writes = 0

  async function prune() {
    const names = (await readdir(dir).catch(() => [] as string[])).filter(n => n.endsWith('.json'))
    if (names.length <= KEEP_FILES) return
    const dated = await Promise.all(names.map(async name => ({ name, at: (await stat(join(dir, name)).catch(() => null))?.mtimeMs ?? 0 })))
    dated.sort((a, b) => a.at - b.at)
    await Promise.all(dated.slice(0, dated.length - KEEP_FILES).map(f => rm(join(dir, f.name), { force: true })))
  }

  return {
    /** The cached frames for a video on this grid, or none if the video changed or nothing is cached. */
    async load(videoPath: string, grid: number): Promise<FilmstripFrames> {
      try {
        const [info, raw] = await Promise.all([stat(videoPath), readFile(fileFor(videoPath), 'utf-8')])
        const cached = JSON.parse(raw) as CacheFile
        if (cached.path !== videoPath || cached.size !== info.size || cached.mtimeMs !== info.mtimeMs || Math.abs(cached.grid - grid) > 1e-6) return { grid, frames: {} }
        return { grid, frames: cached.frames ?? {} }
      } catch {
        return { grid, frames: {} }
      }
    },

    /** Stores the frames for a video (replacing what was cached for it). */
    async save(videoPath: string, data: FilmstripFrames): Promise<void> {
      const info = await stat(videoPath).catch(() => null)
      if (!info || !data || typeof data.grid !== 'number' || !data.frames || typeof data.frames !== 'object') return
      const frames: Record<string, string> = {}
      for (const [slot, url] of Object.entries(data.frames).slice(0, MAX_FRAMES)) {
        if (/^\d+$/.test(slot) && typeof url === 'string' && url.startsWith('data:image/jpeg;base64,') && url.length < 200_000) frames[slot] = url
      }
      await mkdir(dir, { recursive: true })
      const file: CacheFile = { path: videoPath, size: info.size, mtimeMs: info.mtimeMs, grid: data.grid, frames }
      await writeFileAtomic(fileFor(videoPath), JSON.stringify(file))
      if (++writes % 20 === 1) await prune().catch(() => {})
    },
  }
}
