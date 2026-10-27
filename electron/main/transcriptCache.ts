/**
 * Disk cache for word-level transcripts (jump cuts, transcript editing), so a
 * clip is transcribed once, not every time a project is opened. One JSON file
 * per media file and settings, used only while the media file is unchanged
 * (same size and modified time); the oldest files are pruned.
 * No Electron imports, so it can be tested with a plain folder.
 */
import { createHash } from 'crypto'
import { mkdir, readdir, readFile, rm, stat } from 'fs/promises'
import { join } from 'path'

export interface CachedCue {
  start: number
  end: number
  text: string
}

interface CacheFile {
  path: string
  variant: string
  size: number
  mtimeMs: number
  cues: CachedCue[]
}

const KEEP_FILES = 200

export function createTranscriptCache(dir: string, writeFileAtomic: (path: string, data: string) => Promise<void>) {
  const fileFor = (mediaPath: string, variant: string) => join(dir, `${createHash('sha1').update(`${mediaPath}\n${variant}`).digest('hex')}.json`)
  let writes = 0

  async function prune() {
    const names = (await readdir(dir).catch(() => [] as string[])).filter(n => n.endsWith('.json'))
    if (names.length <= KEEP_FILES) return
    const dated = await Promise.all(names.map(async name => ({ name, at: (await stat(join(dir, name)).catch(() => null))?.mtimeMs ?? 0 })))
    dated.sort((a, b) => a.at - b.at)
    await Promise.all(dated.slice(0, dated.length - KEEP_FILES).map(f => rm(join(dir, f.name), { force: true })))
  }

  return {
    /** The cached cues for a file and variant (e.g. "words:en"), or null if the file changed or nothing is cached. */
    async load(mediaPath: string, variant: string): Promise<CachedCue[] | null> {
      try {
        const [info, raw] = await Promise.all([stat(mediaPath), readFile(fileFor(mediaPath, variant), 'utf-8')])
        const cached = JSON.parse(raw) as CacheFile
        if (cached.path !== mediaPath || cached.variant !== variant || cached.size !== info.size || cached.mtimeMs !== info.mtimeMs) return null
        return Array.isArray(cached.cues) ? cached.cues : null
      } catch {
        return null
      }
    },

    async save(mediaPath: string, variant: string, cues: CachedCue[]): Promise<void> {
      const info = await stat(mediaPath).catch(() => null)
      if (!info) return
      const clean = cues
        .filter(c => c && Number.isFinite(c.start) && Number.isFinite(c.end) && typeof c.text === 'string')
        .map(c => ({ start: c.start, end: c.end, text: c.text }))
      await mkdir(dir, { recursive: true })
      const file: CacheFile = { path: mediaPath, variant, size: info.size, mtimeMs: info.mtimeMs, cues: clean }
      await writeFileAtomic(fileFor(mediaPath, variant), JSON.stringify(file))
      if (++writes % 20 === 1) await prune().catch(() => {})
    },
  }
}
