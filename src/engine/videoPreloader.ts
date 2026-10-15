import type { Project, VideoElement } from '../types/editor'
import { toFileUrl } from '../utils/pathUtils'

// Pool of <video> elements that are loaded and already seeked to their clip's
// in-point before the clip appears on screen. When a split/trimmed clip (or a
// clip in the next scene) mounts, VideoKonva takes the warm element instead of
// starting a fresh load — so the first painted frame is the trimmed frame, not
// source time 0, and there is no load gap at the cut.

export interface WarmVideo {
  src: string
  video: HTMLVideoElement
  ready: Promise<boolean>
  isReady: boolean
}

const MAX_WARM = 6
const LOAD_TIMEOUT_MS = 4000
const pool = new Map<string, WarmVideo>()

function disposeVideo(video: HTMLVideoElement) {
  video.pause()
  video.removeAttribute('src')
  video.load()
}

function hasFrame(video: HTMLVideoElement) {
  return video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
}

function clampTarget(video: HTMLVideoElement, t: number) {
  const dur = Number.isFinite(video.duration) ? video.duration : 0
  return Math.max(0, dur ? Math.min(t, dur - 0.03) : t)
}

/** True when the video is already showing the frame at `t` (within `tolerance`). */
export function isAtFrame(video: HTMLVideoElement, t: number, tolerance: number) {
  return !video.seeking && hasFrame(video) && Math.abs(video.currentTime - clampTarget(video, t)) <= tolerance
}

/** Seek and resolve once the target frame is decodable (or after a safety timeout). */
export function seekVideo(video: HTMLVideoElement, t: number): Promise<boolean> {
  return new Promise(resolve => {
    const target = clampTarget(video, t)
    if (!video.seeking && hasFrame(video) && Math.abs(video.currentTime - target) <= 0.015) {
      resolve(true)
      return
    }
    let done = false
    const finish = () => {
      if (done) return
      done = true
      clearTimeout(timer)
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onError)
      resolve(hasFrame(video))
    }
    const onSeeked = () => {
      if (hasFrame(video)) finish()
      else video.addEventListener('loadeddata', finish, { once: true })
    }
    const onError = () => finish()
    const timer = setTimeout(finish, LOAD_TIMEOUT_MS)
    video.addEventListener('seeked', onSeeked, { once: true })
    video.addEventListener('error', onError, { once: true })
    video.currentTime = target
  })
}

/** Wait for metadata on a fresh video, then seek to `target()` before reporting ready. */
export function loadVideoAt(video: HTMLVideoElement, target: () => number): Promise<boolean> {
  return new Promise<boolean>(resolve => {
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) { resolve(true); return }
    let done = false
    const finish = (ok: boolean) => {
      if (done) return
      done = true
      clearTimeout(timer)
      video.removeEventListener('loadedmetadata', onMeta)
      video.removeEventListener('error', onError)
      resolve(ok)
    }
    const onMeta = () => finish(true)
    const onError = () => finish(false)
    const timer = setTimeout(() => finish(video.readyState >= HTMLMediaElement.HAVE_METADATA), LOAD_TIMEOUT_MS)
    video.addEventListener('loadedmetadata', onMeta, { once: true })
    video.addEventListener('error', onError, { once: true })
  }).then(ok => ok ? seekVideo(video, target()) : false)
}

export function createVideoFor(el: VideoElement): HTMLVideoElement {
  const video = document.createElement('video')
  video.src          = toFileUrl(el.src)
  video.crossOrigin  = 'anonymous'
  video.loop         = el.loop
  video.muted        = el.muted
  video.volume       = el.volume
  video.playbackRate = el.playbackRate
  video.preload      = 'auto'
  return video
}

function putInPool(id: string, entry: WarmVideo) {
  const existing = pool.get(id)
  if (existing && existing.video !== entry.video) disposeVideo(existing.video)
  pool.delete(id)
  pool.set(id, entry)
  while (pool.size > MAX_WARM) {
    const [oldestId, oldest] = pool.entries().next().value as [string, WarmVideo]
    disposeVideo(oldest.video)
    pool.delete(oldestId)
  }
}

function makeEntry(src: string, video: HTMLVideoElement, ready: Promise<boolean>): WarmVideo {
  const entry: WarmVideo = { src, video, ready, isReady: false }
  entry.ready = ready.then(ok => { entry.isReady = ok; return ok })
  return entry
}

export function prewarmVideo(el: VideoElement) {
  const existing = pool.get(el.id)
  if (existing && existing.src === el.src) return
  const video = createVideoFor(el)
  putInPool(el.id, makeEntry(el.src, video, loadVideoAt(video, () => el.startTime ?? 0)))
}

/**
 * Return a video a clip no longer displays. It is parked at the clip's
 * in-point so a remount (scrubbing back, React StrictMode) starts on the
 * right frame instead of reloading.
 */
export function releaseVideo(el: VideoElement, video: HTMLVideoElement) {
  video.pause()
  if (video.error || !video.src) { disposeVideo(video); return }
  putInPool(el.id, makeEntry(el.src, video, seekVideo(video, el.startTime ?? 0)))
}

/** Hand ownership of a warm video to the caller (removes it from the pool). */
export function takeWarmVideo(id: string, src: string): WarmVideo | null {
  const entry = pool.get(id)
  if (!entry) return null
  pool.delete(id)
  if (entry.src !== src) { disposeVideo(entry.video); return null }
  return entry
}

const LOOKAHEAD_SEC = 1.5

/** Prewarm every video clip that starts within the lookahead window after `time`. */
export function prewarmUpcomingVideos(project: Project, time: number) {
  let sceneStart = 0
  for (const scene of project.scenes) {
    if (sceneStart > time + LOOKAHEAD_SEC) break
    for (const el of scene.elements) {
      if (el.type !== 'video' || !el.visible) continue
      const v = el as VideoElement
      const lead = sceneStart + (v.timelineX ?? 0) - time
      if (lead > 0 && lead <= LOOKAHEAD_SEC) prewarmVideo(v)
    }
    sceneStart += scene.duration
  }
}
