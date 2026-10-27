/**
 * Timeline video thumbnails, decoded once and reused.
 *
 * Every frame is a slot on a time grid of the video (at most ~240 slots per
 * file), so clips of the same file and every zoom level share frames. Frames
 * live in memory and in a small disk cache (main process), so a reopened
 * project shows them at once. Decoding — one seek per frame, the slow part —
 * runs one frame at a time per file, at most two files at once, and only for
 * frames somebody still wants.
 */
import { toFileUrl } from './pathUtils'

/** Thumbnails are stored this wide (height follows the video). */
const THUMB_WIDTH = 112
const MAX_ACTIVE_FILES = 2
const SAVE_DELAY = 1500

/** Seconds between grid slots for a video this long. */
export function frameGrid(duration: number) {
  return Math.max(0.25, duration / 240)
}

/** Slot order that fills a strip coarse to fine: the ends, the middle, the quarters, … */
export function coarseToFine(count: number): number[] {
  if (count <= 0) return []
  const order: number[] = [0]
  if (count > 1) order.push(count - 1)
  const seen = new Set(order)
  for (let parts = 2; order.length < count; parts *= 2) {
    for (let k = 1; k < parts; k += 2) {
      const i = Math.round((k / parts) * (count - 1))
      if (!seen.has(i)) { seen.add(i); order.push(i) }
    }
    if (parts > count * 2) for (let i = 0; i < count; i++) if (!seen.has(i)) { seen.add(i); order.push(i) }
  }
  return order
}

type Thumb = HTMLCanvasElement | HTMLImageElement
type Listener = (slot: number, image: Thumb) => void

interface VideoEntry {
  src: string
  ready: Promise<boolean>
  duration: number
  grid: number
  frames: Map<number, Thumb>
  /** Slots waiting to be decoded, in order, with who wants each. */
  queue: number[]
  wanted: Map<number, Set<Listener>>
  running: boolean
  dirty: boolean
  saveTimer: ReturnType<typeof setTimeout> | null
}

const videos = new Map<string, VideoEntry>()
let activeFiles = 0
const waitingFiles: Array<() => void> = []

const api = () => (typeof window !== 'undefined' ? window.api?.filmstrip : undefined)

function entryFor(src: string): VideoEntry {
  let entry = videos.get(src)
  if (entry) return entry
  entry = {
    src, duration: 0, grid: 0.25, frames: new Map(), queue: [], wanted: new Map(),
    running: false, dirty: false, saveTimer: null, ready: Promise.resolve(false),
  }
  const e = entry
  e.ready = (async () => {
    const duration = await probeDuration(src)
    if (!duration) return false
    e.duration = duration
    e.grid = frameGrid(duration)
    // Frames from an earlier session.
    const cached = await api()?.load(src, e.grid).catch(() => null)
    if (cached?.frames) {
      await Promise.all(Object.entries(cached.frames).map(([slot, url]) => loadImage(url).then(img => { if (img && !e.frames.has(Number(slot))) e.frames.set(Number(slot), img) })))
    }
    return true
  })()
  videos.set(src, entry)
  return entry
}

/**
 * Asks for the frames at these source times (seconds). `onFrame(i, image)` is
 * called for each as soon as it is there — right away when cached. Returns a
 * cancel function: frames nobody wants any more are not decoded.
 */
export function requestFrames(src: string, times: number[], onFrame: (index: number, image: Thumb) => void, opts: { loopFrom?: number } = {}): () => void {
  const entry = entryFor(src)
  let cancelled = false
  const listeners: Array<[number, Listener]> = []
  void entry.ready.then(ok => {
    if (!ok || cancelled) return
    const maxSlot = Math.max(0, Math.floor((entry.duration - 0.05) / entry.grid))
    // A looping clip starts over from its trim point when the file ends.
    const wrap = (time: number) => {
      if (opts.loopFrom == null) return time
      const span = Math.max(0.05, entry.duration - opts.loopFrom)
      return opts.loopFrom + (((time - opts.loopFrom) % span) + span) % span
    }
    times.forEach((time, index) => {
      const slot = Math.min(maxSlot, Math.max(0, Math.round(wrap(time) / entry.grid)))
      const have = entry.frames.get(slot)
      if (have) { onFrame(index, have); return }
      const listener: Listener = (_slot, image) => { if (!cancelled) onFrame(index, image) }
      listeners.push([slot, listener])
      const set = entry.wanted.get(slot) ?? new Set()
      set.add(listener)
      entry.wanted.set(slot, set)
      if (!entry.queue.includes(slot)) entry.queue.push(slot)
    })
    void run(entry)
  })
  return () => {
    cancelled = true
    for (const [slot, listener] of listeners) {
      const set = entry.wanted.get(slot)
      set?.delete(listener)
      if (set && !set.size) entry.wanted.delete(slot)
    }
  }
}

async function run(entry: VideoEntry) {
  if (entry.running || !entry.queue.some(slot => entry.wanted.has(slot))) return
  entry.running = true
  if (activeFiles >= MAX_ACTIVE_FILES) await new Promise<void>(resolve => waitingFiles.push(resolve))
  activeFiles++
  const video = document.createElement('video')
  video.crossOrigin = 'anonymous'
  video.muted = true
  video.preload = 'auto'
  try {
    video.src = toFileUrl(entry.src)
    await once(video, 'loadeddata')
    while (entry.queue.length) {
      const slot = entry.queue.shift()!
      const listeners = entry.wanted.get(slot)
      if (!listeners?.size || entry.frames.has(slot)) {
        if (entry.frames.has(slot)) listeners?.forEach(l => l(slot, entry.frames.get(slot)!))
        entry.wanted.delete(slot)
        continue
      }
      video.currentTime = Math.min(Math.max(0, entry.duration - 0.05), slot * entry.grid)
      await once(video, 'seeked')
      const thumb = document.createElement('canvas')
      const vw = video.videoWidth || 16
      const vh = video.videoHeight || 9
      thumb.width = THUMB_WIDTH
      thumb.height = Math.max(1, Math.round(THUMB_WIDTH * vh / vw))
      thumb.getContext('2d')!.drawImage(video, 0, 0, thumb.width, thumb.height)
      entry.frames.set(slot, thumb)
      entry.wanted.get(slot)?.forEach(l => l(slot, thumb))
      entry.wanted.delete(slot)
      entry.dirty = true
      scheduleSave(entry)
    }
  } catch {
    // An unreadable video keeps its placeholder.
  } finally {
    video.removeAttribute('src')
    video.load()
    entry.running = false
    activeFiles--
    waitingFiles.shift()?.()
  }
}

function scheduleSave(entry: VideoEntry) {
  if (!api() || entry.saveTimer) return
  entry.saveTimer = setTimeout(() => {
    entry.saveTimer = null
    if (!entry.dirty) return
    entry.dirty = false
    const frames: Record<string, string> = {}
    for (const [slot, image] of entry.frames) frames[slot] = toJpeg(image)
    void api()?.save(entry.src, { grid: entry.grid, frames }).catch(() => {})
  }, SAVE_DELAY)
}

function toJpeg(image: Thumb): string {
  if (image instanceof HTMLCanvasElement) return image.toDataURL('image/jpeg', 0.72)
  const c = document.createElement('canvas')
  c.width = image.naturalWidth
  c.height = image.naturalHeight
  c.getContext('2d')!.drawImage(image, 0, 0)
  return c.toDataURL('image/jpeg', 0.72)
}

function probeDuration(src: string): Promise<number> {
  return new Promise(resolve => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    const done = (value: number) => { video.removeAttribute('src'); video.load(); resolve(value) }
    video.onloadedmetadata = () => done(Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0)
    video.onerror = () => done(0)
    video.src = toFileUrl(src)
  })
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

function once(target: HTMLMediaElement, event: 'loadeddata' | 'seeked') {
  return new Promise<void>((resolve, reject) => {
    const ok = () => { cleanup(); resolve() }
    const fail = () => { cleanup(); reject(new Error(`video ${event} failed`)) }
    const cleanup = () => { target.removeEventListener(event, ok); target.removeEventListener('error', fail) }
    target.addEventListener(event, ok, { once: true })
    target.addEventListener('error', fail, { once: true })
    if (event === 'loadeddata' && target.readyState >= 2) ok()
  })
}
