/**
 * Precise background removal (the AI cut-out), made for low-end computers.
 *
 * - Silueta (a small U²-Net, 44 MB, downloaded on first use) finds the
 *   subject — people, cars, products, groups — and the guided filter snaps
 *   the mask to the picture's real edges.
 * - MobileSAM (45 MB, downloaded when first used) turns a click into "this
 *   person/object": keep only it, or remove it.
 *
 * Both run in a background process on the CPU (electron/main/cutoutWorker).
 * Images are done once; videos are processed in the background at 15 masks a
 * second, smoothed in time so edges don't flicker, and kept on disk. Until a
 * precise mask is ready the quick MediaPipe mask is shown (see keying.ts).
 * Masks cover the whole source picture; keying crops them per element.
 */
import Konva from 'konva'
import { useEditorStore } from '../../store/editorStore'
import type { CutoutPack, CutoutRunRequest } from '../../types/global'
import type { ImageElement, KeyingPick, VideoElement } from '../../types/editor'
import { toFileUrl } from '../../utils/pathUtils'
import { footageSpan } from '../../utils/speedCurve'
import {
  applyPicks, blendMasks, cropMask, dilate, guidedFilter, luminance, refineRadius, regionsTouching, resizeMask,
  rleDecode, rleEncode, smoothInTime, unionMasks, type Mask,
} from './maskMath'

const SEG = 320
const IMAGE_SIDE = 1600
const VIDEO_SIDE = 384
const SAM_SIDE = 1024
/** Masks per second of video. */
export const MASK_FPS = 15

// ── Models ───────────────────────────────────────────────────────────────────

type PackStatus = { installed: boolean; downloading: boolean; bytes: number }
let packs: Record<CutoutPack, PackStatus> | null = null
let packsLoading: Promise<void> | null = null
const downloads: Partial<Record<CutoutPack, { received: number; total: number }>> = {}
const listeners = new Set<() => void>()
/** Bumped whenever a precise mask becomes ready, so cached keyed frames are redrawn. */
let generation = 0

function changed(redraw = true) {
  if (redraw) generation++
  for (const fn of listeners) fn()
  if (redraw) for (const stage of Konva.stages) stage.batchDraw()
}

/** Calls `fn` when model or processing state changes; returns the unsubscribe. */
export function subscribeCutout(fn: () => void) {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** Changes whenever a precise mask becomes ready (part of keyed-frame cache stamps). */
export const cutoutGeneration = () => generation

function refreshPacks() {
  packsLoading ??= window.api.cutout.status()
    .then(status => { packs = status })
    .catch(() => { packs = null })
    .finally(() => { packsLoading = null; changed() })
  return packsLoading
}

/** Installed / downloading / size of a model pack (null until known). */
export function packStatus(pack: CutoutPack): (PackStatus & { received?: number; total?: number }) | null {
  if (!packs) { void refreshPacks(); return null }
  const d = downloads[pack]
  return { ...packs[pack], ...(d && { received: d.received, total: d.total }) }
}

export const packReady = (pack: CutoutPack) => Boolean(packs?.[pack].installed)

let progressHooked = false
/** Downloads a model pack once (verified). Resolves when installed. */
export async function installPack(pack: CutoutPack) {
  if (!progressHooked) {
    progressHooked = true
    window.api.cutout.onProgress(p => {
      if (p.phase === 'finished') delete downloads[p.pack]
      else downloads[p.pack] = { received: p.receivedBytes, total: p.totalBytes }
      changed(false)
    })
  }
  downloads[pack] = { received: 0, total: packs?.[pack].bytes ?? 0 }
  changed(false)
  try {
    await window.api.cutout.install(pack)
  } finally {
    delete downloads[pack]
    await refreshPacks()
  }
}

export const cancelPack = (pack: CutoutPack) => window.api.cutout.cancel(pack)

async function run(request: CutoutRunRequest) {
  const res = await window.api.cutout.run(request)
  if (!res.ok) throw new Error(res.error)
  return res
}

// ── Pictures → masks ─────────────────────────────────────────────────────────

type Picture = HTMLImageElement | HTMLVideoElement
const canvases = new Map<string, HTMLCanvasElement>()
function canvas(name: string, w: number, h: number) {
  let c = canvases.get(name)
  if (!c) { c = document.createElement('canvas'); canvases.set(name, c) }
  if (c.width !== w) c.width = w
  if (c.height !== h) c.height = h
  return c
}
const ctx2d = (c: HTMLCanvasElement) => c.getContext('2d', { willReadFrequently: true })!

/** The picture's luminance at w×h, which guides the edge refine. */
function guideOf(picture: Picture, w: number, h: number) {
  const g = canvas('guide', w, h)
  ctx2d(g).drawImage(picture, 0, 0, w, h)
  return luminance(ctx2d(g).getImageData(0, 0, w, h).data, w * h)
}

/**
 * The automatic subject mask of a picture at w×h, edges refined on the picture
 * itself. The picture goes in letterboxed (in proportion, grey bands): stretched
 * to a square, the model's idea of "the subject" jumps between people in group
 * shots from one video frame to the next.
 */
async function subjectMask(picture: Picture, w: number, h: number): Promise<Uint8Array> {
  const seg = canvas('seg', SEG, SEG)
  const ctx = ctx2d(seg)
  const k = SEG / Math.max(w, h)
  const pw = Math.max(1, Math.round(w * k)), ph = Math.max(1, Math.round(h * k))
  const px = Math.floor((SEG - pw) / 2), py = Math.floor((SEG - ph) / 2)
  ctx.fillStyle = 'rgb(124,116,104)' // the model's average colour: bands read as nothing
  ctx.fillRect(0, 0, SEG, SEG)
  ctx.drawImage(picture, px, py, pw, ph)
  const rgba = new Uint8Array(ctx.getImageData(0, 0, SEG, SEG).data.buffer)
  const res = await run({ type: 'segment', rgba })
  const inner = cropMask({ data: res.mask!, w: SEG, h: SEG }, px, py, pw, ph, w, h)
  return guidedFilter(guideOf(picture, w, h), inner, w, h, refineRadius(w, h))
}

const encoded = new Set<string>()
async function samEncode(key: string, picture: Picture, sw: number, sh: number) {
  if (encoded.has(key)) return
  const c = canvas('sam', sw, sh)
  ctx2d(c).drawImage(picture, 0, 0, sw, sh)
  const rgba = ctx2d(c).getImageData(0, 0, sw, sh).data
  const rgb = new Uint8Array(sw * sh * 3)
  for (let i = 0; i < sw * sh; i++) { rgb[i * 3] = rgba[i * 4]; rgb[i * 3 + 1] = rgba[i * 4 + 1]; rgb[i * 3 + 2] = rgba[i * 4 + 2] }
  await run({ type: 'samEncode', key, rgb, width: sw, height: sh })
  encoded.add(key)
  // The worker keeps the last few pictures; forget older ones here too.
  while (encoded.size > 3) encoded.delete(encoded.values().next().value as string)
}

/** The clicked objects (MobileSAM) of a picture at w×h, edges refined; keep and remove unions. */
async function pickedObjects(samKey: string, picture: Picture, pw: number, ph: number, picks: KeyingPick[], w: number, h: number) {
  if (!picks.length) return { keep: null, remove: null }
  if (!packReady('select')) throw new Error('Download the subject-picking model first (Pick subject).')
  const k = SAM_SIDE / Math.max(pw, ph)
  const sw = Math.round(pw * k), sh = Math.round(ph * k)
  await samEncode(samKey, picture, sw, sh)
  const guide = guideOf(picture, w, h)
  const keep: Uint8Array[] = [], remove: Uint8Array[] = []
  for (const p of picks) {
    const ask = () => run({ type: 'samDecode', key: samKey, x: p.x * sw, y: p.y * sh, width: sw, height: sh })
    let res
    try { res = await ask() } catch {
      // The worker restarted (idle) and forgot the picture: analyse it again.
      encoded.delete(samKey)
      await samEncode(samKey, picture, sw, sh)
      res = await ask()
    }
    const obj = guidedFilter(guide, resizeMask(res.mask!, sw, sh, w, h), w, h, refineRadius(w, h))
    ;(p.keep ? keep : remove).push(obj)
  }
  return { keep: unionMasks(keep), remove: unionMasks(remove) }
}

const picksKey = (picks: KeyingPick[] | undefined) =>
  (picks ?? []).map(p => `${p.keep ? '+' : '-'}${p.x.toFixed(4)},${p.y.toFixed(4)}${p.t != null ? '@' + p.t.toFixed(3) : ''}`).join(';')

// ── Images ───────────────────────────────────────────────────────────────────

interface Entry { mask: Mask | null; promise?: Promise<Mask | null> }
const bases = new Map<string, Entry>()
const images = new Map<string, Entry>()

/** Keeps a few entries (each up to 1600 px on its long side). */
function remember(map: Map<string, Entry>, key: string, entry: Entry) {
  map.set(key, entry)
  while (map.size > 12) map.delete(map.keys().next().value as string)
}

function baseOf(img: HTMLImageElement): Promise<Mask | null> {
  const hit = bases.get(img.src)
  if (hit) return hit.promise ?? Promise.resolve(hit.mask)
  const entry: Entry = { mask: null }
  entry.promise = (async () => {
    try {
      const k = Math.min(1, IMAGE_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
      const w = Math.max(16, Math.round(img.naturalWidth * k)), h = Math.max(16, Math.round(img.naturalHeight * k))
      entry.mask = { data: await subjectMask(img, w, h), w, h }
    } catch (error) {
      console.warn('[cutout] image', error)
      bases.delete(img.src)
    }
    entry.promise = undefined
    return entry.mask
  })()
  remember(bases, img.src, entry)
  return entry.promise
}

function ensureImage(img: HTMLImageElement, picks?: KeyingPick[]): Promise<Mask | null> {
  const key = `${img.src}|${picksKey(picks)}`
  const hit = images.get(key)
  if (hit) return hit.promise ?? Promise.resolve(hit.mask)
  const entry: Entry = { mask: null }
  entry.promise = (async () => {
    const base = await baseOf(img)
    if (base && picks?.length) {
      try {
        const { keep, remove } = await pickedObjects(`img:${img.src}`, img, img.naturalWidth, img.naturalHeight, picks, base.w, base.h)
        entry.mask = { data: applyPicks(base.data, keep, remove, base.w, base.h, Math.round(Math.max(base.w, base.h) / 40)), w: base.w, h: base.h }
      } catch (error) {
        console.warn('[cutout] picks', error)
        entry.mask = base
      }
    } else entry.mask = base
    entry.promise = undefined
    if (!entry.mask) images.delete(key)
    changed()
    return entry.mask
  })()
  remember(images, key, entry)
  return entry.promise
}

/** The precise mask of an image (whole picture), or null while it is made or when the model isn't installed. */
export function imageMask(img: HTMLImageElement, picks?: KeyingPick[]): Mask | null {
  if (!packReady('cutout') || !img.naturalWidth) return null
  const hit = images.get(`${img.src}|${picksKey(picks)}`)
  if (hit) return hit.mask
  void ensureImage(img, picks)
  return null
}

// ── Videos ───────────────────────────────────────────────────────────────────

interface VideoJob {
  url: string
  w: number
  h: number
  duration: number
  /** Smoothed automatic masks, run-length coded, by frame index (frame = time × MASK_FPS). */
  frames: Map<number, Uint8Array>
  /** Masks with keep/remove picks applied, by picks key. */
  picked: Map<string, { frames: Map<number, Uint8Array>; promise?: Promise<void> }>
  done: number
  total: number
  running: boolean
  loaded: boolean
  checkedAt: number
  error?: string
  waiters: Array<() => void>
}

const jobs = new Map<string, VideoJob>()
const queue: VideoJob[] = []
let working = false

const normalizeUrl = (u: string) => { try { return new URL(u).href } catch { return u } }

/** The processing state of a video for the panel: frames done / needed. */
export function videoProgress(src: string): { done: number; total: number; running: boolean; error?: string } | null {
  const job = jobs.get(normalizeUrl(toFileUrl(src)))
  return job ? { done: job.done, total: job.total, running: job.running, error: job.error } : null
}

/** Source-time ranges of a video that clips with the AI cut-out play. */
function neededRanges(url: string): Array<[number, number]> {
  const project = useEditorStore.getState().project
  const out: Array<[number, number]> = []
  for (const scene of project?.scenes ?? []) {
    for (const el of scene.elements) {
      if (el.type !== 'video' || el.keying?.mode !== 'person' || normalizeUrl(toFileUrl(el.src)) !== url) continue
      const start = el.startTime ?? 0
      out.push([start, start + footageSpan(el as VideoElement) + 0.2])
    }
  }
  return out
}

function neededFrames(job: VideoJob) {
  const set = new Set<number>()
  const end = Math.floor(job.duration * MASK_FPS)
  for (const [a, b] of neededRanges(job.url)) {
    for (let f = Math.max(0, Math.floor(a * MASK_FPS)); f <= Math.min(end, Math.ceil(b * MASK_FPS)); f++) set.add(f)
  }
  return [...set].sort((x, y) => x - y)
}

function jobFor(url: string, width: number, height: number, duration: number) {
  let job = jobs.get(url)
  if (!job) {
    const k = VIDEO_SIDE / Math.max(width, height)
    job = {
      url, w: Math.max(16, Math.round(width * k)), h: Math.max(16, Math.round(height * k)), duration: Number.isFinite(duration) ? duration : 0,
      frames: new Map(), picked: new Map(), done: 0, total: 0, running: false, loaded: false, checkedAt: 0, waiters: [],
    }
    jobs.set(url, job)
  }
  return job
}

/** The precise mask of a video frame (whole picture), or null while it is processed. */
export function videoMask(video: HTMLVideoElement, time: number, picks?: KeyingPick[]): Mask | null {
  if (!packReady('cutout') || !video.videoWidth) return null
  const job = jobFor(normalizeUrl(video.currentSrc || video.src), video.videoWidth, video.videoHeight, video.duration)
  const f = time * MASK_FPS
  const i0 = Math.floor(f), i1 = i0 + 1
  let frames = job.frames
  // Picks are applied once the clip is processed (they follow the subject through all of it).
  if (picks?.length && !job.running) {
    const picked = job.picked.get(picksKey(picks))
    if (picked && !picked.promise) frames = picked.frames
    else if (!picked) ensurePicked(job, picks)
  }
  const a = frames.get(i0) ?? frames.get(i1)
  if (!a) {
    // A part of the clip not processed yet (new, or the trim changed): queue it, checking at most every 2 s.
    if (!job.running && !queue.includes(job) && performance.now() - job.checkedAt > 2000) {
      job.checkedAt = performance.now()
      enqueue(job)
    }
    return null
  }
  const b = frames.get(i1) ?? a
  return { data: blendMasks(decoded(job, frames, i0, a), decoded(job, frames, i1, b), f - i0), w: job.w, h: job.h }
}

// A few decoded frames, so playback and redraws don't decode the same mask twice.
const decodedCache = new Map<string, Uint8Array>()
function decoded(job: VideoJob, frames: Map<number, Uint8Array>, i: number, rle: Uint8Array) {
  const key = `${job.url}|${frames === job.frames ? 'auto' : 'picked'}|${i}|${rle.length}`
  let d = decodedCache.get(key)
  if (!d) {
    d = rleDecode(rle, job.w * job.h)
    decodedCache.set(key, d)
    while (decodedCache.size > 8) decodedCache.delete(decodedCache.keys().next().value as string)
  }
  return d
}

/** Queues a video; resolves when it has been processed (one video at a time, to leave the CPU free). */
function enqueue(job: VideoJob): Promise<void> {
  const done = new Promise<void>(resolve => job.waiters.push(resolve))
  if (!queue.includes(job) && !job.running) queue.push(job)
  if (!working) void work()
  return done
}

async function work() {
  working = true
  while (queue.length) {
    const job = queue.shift()!
    job.running = true
    try { await processVideo(job) } catch (error) {
      job.error = error instanceof Error ? error.message : String(error)
      console.warn('[cutout] video', job.error)
    }
    job.running = false
    for (const resolve of job.waiters.splice(0)) resolve()
    changed()
  }
  working = false
}

/** Waits for a video element's frame at `t` (seconds). */
function seek(video: HTMLVideoElement, t: number) {
  return new Promise<void>(resolve => {
    const done = () => { video.removeEventListener('seeked', done); resolve() }
    video.addEventListener('seeked', done)
    video.currentTime = t
  })
}

async function openVideo(url: string) {
  const video = document.createElement('video')
  video.crossOrigin = 'anonymous'
  video.muted = true
  video.preload = 'auto'
  video.src = url
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve()
    video.onerror = () => reject(new Error('The video could not be read for background removal.'))
  })
  return video
}

function closeVideo(video: HTMLVideoElement) {
  video.removeAttribute('src')
  video.load()
}

/** One cache file per source video (and mask size). */
function cacheKey(job: VideoJob) {
  let h1 = 0x811c9dc5, h2 = 0x01000193
  const s = `silueta2|${job.url}|${job.w}x${job.h}|${job.duration.toFixed(3)}`
  for (let i = 0; i < s.length; i++) {
    h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619)
    h2 = Math.imul(h2 ^ s.charCodeAt(i), 2246822519)
  }
  return `v-${(h1 >>> 0).toString(16)}${(h2 >>> 0).toString(16)}`
}

async function loadCache(job: VideoJob) {
  job.loaded = true
  const data = await window.api.cutout.cacheRead(cacheKey(job)).catch(() => null)
  if (!data || data.length < 4) return
  try {
    const headLen = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(0)
    const head = JSON.parse(new TextDecoder().decode(data.subarray(4, 4 + headLen))) as { w: number; h: number; frames: Array<[number, number]> }
    if (head.w !== job.w || head.h !== job.h) return
    let at = 4 + headLen
    for (const [index, length] of head.frames) {
      job.frames.set(index, data.slice(at, at + length))
      at += length
    }
  } catch {
    job.frames.clear() // an unreadable cache: process again
  }
}

async function saveCache(job: VideoJob) {
  const entries = [...job.frames.entries()].sort((a, b) => a[0] - b[0])
  const head = new TextEncoder().encode(JSON.stringify({ w: job.w, h: job.h, frames: entries.map(([i, d]) => [i, d.length]) }))
  const out = new Uint8Array(4 + head.length + entries.reduce((s, [, d]) => s + d.length, 0))
  new DataView(out.buffer).setUint32(0, head.length)
  out.set(head, 4)
  let at = 4 + head.length
  for (const [, d] of entries) { out.set(d, at); at += d.length }
  await window.api.cutout.cacheWrite(cacheKey(job), out).catch(() => {})
}

async function processVideo(job: VideoJob) {
  if (!packReady('cutout')) return
  if (!job.loaded) await loadCache(job)
  const needed = neededFrames(job)
  const wanted = new Set(needed)
  const missing = needed.filter(f => !job.frames.has(f))
  job.total = needed.length
  job.done = needed.length - missing.length
  changed(false)
  if (!missing.length) return
  job.picked.clear()
  const video = await openVideo(job.url)
  try {
    // Raw (unsmoothed) masks of the frames around the one being finished.
    const raw = new Map<number, Uint8Array>()
    const rawAt = async (f: number) => {
      let m = raw.get(f)
      if (!m) {
        await seek(video, Math.min(f / MASK_FPS, Math.max(0, job.duration - 0.001)))
        m = await subjectMask(video, job.w, job.h)
        raw.set(f, m)
      }
      return m
    }
    let sinceSave = 0
    for (const f of missing) {
      const cur = await rawAt(f)
      const prev = wanted.has(f - 1) ? await rawAt(f - 1) : null
      const next = wanted.has(f + 1) ? await rawAt(f + 1) : null
      job.frames.set(f, rleEncode(smoothInTime(prev, cur, next)))
      for (const k of raw.keys()) if (k < f - 1) raw.delete(k)
      job.done++
      if (++sinceSave >= 45) { sinceSave = 0; void saveCache(job) }
      changed(job.done % 5 === 0)
    }
    await saveCache(job)
  } finally {
    closeVideo(video)
  }
}

/**
 * Keep/remove picks on a video: the clicked object (MobileSAM, on the frame
 * clicked) chooses regions of the automatic mask, which are then followed
 * frame by frame — a subject moves only a little between masks.
 */
function ensurePicked(job: VideoJob, picks: KeyingPick[]): Promise<void> {
  const pk = picksKey(picks)
  const existing = job.picked.get(pk)
  if (existing) return existing.promise ?? Promise.resolve()
  const entry: { frames: Map<number, Uint8Array>; promise?: Promise<void> } = { frames: new Map() }
  job.picked.set(pk, entry)
  entry.promise = (async () => {
    try {
      const indices = [...job.frames.keys()].sort((a, b) => a - b)
      if (!indices.length) return
      const n = job.w * job.h
      const base = (i: number) => rleDecode(job.frames.get(i)!, n)
      const reach = Math.max(2, Math.round(Math.max(job.w, job.h) / 50))
      const tracks: Array<{ keep: boolean; regions: Map<number, Uint8Array> }> = []
      const video = await openVideo(job.url)
      try {
        for (const p of picks) {
          const t = p.t ?? indices[0] / MASK_FPS
          await seek(video, t)
          const { keep, remove } = await pickedObjects(`vid:${job.url}@${t.toFixed(3)}`, video, video.videoWidth, video.videoHeight, [p], job.w, job.h)
          const obj = (keep ?? remove)!
          const f0 = indices.reduce((best, i) => (Math.abs(i - t * MASK_FPS) < Math.abs(best - t * MASK_FPS) ? i : best), indices[0])
          let start = regionsTouching(base(f0), dilate(obj, job.w, job.h, 2), job.w, job.h)
          if (!start.some(v => v)) start = obj
          const regions = new Map<number, Uint8Array>([[f0, start]])
          for (const dir of [1, -1]) {
            let prev = start
            for (let i = f0 + dir; job.frames.has(i); i += dir) {
              prev = regionsTouching(base(i), dilate(prev, job.w, job.h, reach), job.w, job.h)
              regions.set(i, prev)
              if (!prev.some(v => v)) break
            }
          }
          tracks.push({ keep: p.keep, regions })
        }
      } finally {
        closeVideo(video)
      }
      const keeps = tracks.filter(t => t.keep), removes = tracks.filter(t => !t.keep)
      const empty = new Uint8Array(n)
      for (const i of indices) {
        const out = base(i)
        // Followed regions are hard-edged: grow them a little and let the automatic mask keep the soft edges.
        const keep = keeps.length ? unionMasks(keeps.map(t => t.regions.get(i) ?? empty)) : null
        const remove = unionMasks(removes.map(t => t.regions.get(i) ?? empty))
        if (keep) { const near = dilate(keep, job.w, job.h, 2); for (let k = 0; k < n; k++) if (!near[k]) out[k] = 0 }
        if (remove) { const near = dilate(remove, job.w, job.h, 2); for (let k = 0; k < n; k++) if (near[k]) out[k] = 0 }
        entry.frames.set(i, rleEncode(out))
      }
    } catch (error) {
      console.warn('[cutout] picks', error)
      entry.frames.clear()
    }
    entry.promise = undefined
    changed()
  })()
  return entry.promise
}

// ── Export ───────────────────────────────────────────────────────────────────

/**
 * Makes every precise mask a project needs (images, video frames, picks)
 * before export, so the exported video uses them. Without the model it does
 * nothing (the quick mask is used).
 */
export async function prepareCutouts(onProgress?: (message: string) => void) {
  if (!packs) await refreshPacks()
  if (!packReady('cutout')) return
  const project = useEditorStore.getState().project
  const els = (project?.scenes ?? []).flatMap(s => s.elements)
    .filter((el): el is ImageElement | VideoElement => (el.type === 'image' || el.type === 'video') && (el as ImageElement).keying?.mode === 'person')
  for (const el of els) {
    const url = normalizeUrl(toFileUrl(el.src))
    if (el.type === 'image') {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.src = url
      try { await img.decode() } catch { continue }
      onProgress?.(`Removing the background of ${el.name}…`)
      await ensureImage(img, el.keying?.picks)
      continue
    }
    const video = await openVideo(url).catch(() => null)
    if (!video) continue
    const job = jobFor(url, video.videoWidth, video.videoHeight, video.duration)
    closeVideo(video)
    const stop = subscribeCutout(() => {
      if (job.running && job.total) onProgress?.(`Removing the background of ${el.name}… ${Math.round((job.done / job.total) * 100)}%`)
    })
    try {
      await enqueue(job)
      const picks = el.keying?.picks
      if (picks?.length) await ensurePicked(job, picks)
    } finally {
      stop()
    }
  }
}
