/**
 * Volume automation: a gain curve through keys, linear between them and flat
 * outside them. Keys are in source-file seconds, so trimming, splitting or
 * changing the speed of a clip never moves them relative to the sound.
 */
import type { VolumeKey } from '../types/editor'

const MAX_GAIN = 2

/** Sorted, finite keys with gains in 0..2; consecutive keys with the same time keep the last. */
export function normalizeVolumeKeys(keys: readonly VolumeKey[] | undefined): VolumeKey[] {
  if (!keys?.length) return []
  const sorted = keys
    .filter(k => Number.isFinite(k.t) && Number.isFinite(k.v))
    .map(k => ({ t: Math.max(0, k.t), v: Math.max(0, Math.min(MAX_GAIN, k.v)) }))
    .sort((a, b) => a.t - b.t)
  const out: VolumeKey[] = []
  for (const key of sorted) {
    if (out.length && Math.abs(out[out.length - 1].t - key.t) < 1e-4) out[out.length - 1] = key
    else out.push(key)
  }
  return out
}

/** Gain at a source time; 1 when there are no keys. */
export function volumeKeyGain(keys: readonly VolumeKey[] | undefined, sourceTime: number): number {
  if (!keys?.length) return 1
  if (sourceTime <= keys[0].t) return keys[0].v
  const last = keys[keys.length - 1]
  if (sourceTime >= last.t) return last.v
  let lo = 0
  let hi = keys.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (keys[mid].t <= sourceTime) lo = mid
    else hi = mid
  }
  const a = keys[lo]
  const b = keys[hi]
  return b.t === a.t ? b.v : a.v + (b.v - a.v) * (sourceTime - a.t) / (b.t - a.t)
}

/** Source seconds a clip plays at a time within the clip (on the timeline). */
export function clipSourceTime(clip: { startTime?: number; speed?: number }, clipTime: number) {
  return (clip.startTime ?? 0) + Math.max(0, clipTime) * (clip.speed || 1)
}

/**
 * An FFmpeg `volume` filter for the keys over a clip, or null when they don't
 * change its volume. `t` in the filter is the clip time (after trim and speed),
 * so keys are moved into clip time first. The expression is a flat sum of
 * segments (no nesting), which stays parseable with hundreds of keys.
 */
export function buildFfmpegVolumeKeysFilter(keys: readonly VolumeKey[] | undefined, clip: { startTime?: number; speed?: number; duration: number }): string | null {
  const sorted = normalizeVolumeKeys(keys)
  if (!sorted.length || sorted.every(k => Math.abs(k.v - 1) < 1e-4)) return null
  const from = clip.startTime ?? 0
  const speed = clip.speed || 1
  const timed = sorted.map(k => ({ t: (k.t - from) / speed, v: k.v }))
  // Only keys that shape the clip: the last key before it, those inside, the first after it.
  const firstInside = timed.findIndex(k => k.t >= 0)
  const start = firstInside < 0 ? timed.length - 1 : Math.max(0, firstInside - 1)
  const afterEnd = timed.findIndex(k => k.t > clip.duration)
  const end = afterEnd < 0 ? timed.length - 1 : afterEnd
  const used = timed.slice(start, end + 1)
  if (used.length === 1) return `volume=${fixed(used[0].v)}`

  const parts = [`lt(t\\,${fixed(used[0].t)})*${fixed(used[0].v)}`]
  for (let i = 0; i < used.length - 1; i++) {
    const a = used[i]
    const b = used[i + 1]
    if (b.t - a.t < 1e-4) continue
    const slope = (b.v - a.v) / (b.t - a.t)
    const since = a.t >= 0 ? `t-${fixed(a.t)}` : `t+${fixed(-a.t)}`
    const value = Math.abs(slope) < 1e-6 ? fixed(a.v) : `(${fixed(a.v)}+(${fixed(slope, 6)})*(${since}))`
    parts.push(`gte(t\\,${fixed(a.t)})*lt(t\\,${fixed(b.t)})*${value}`)
  }
  const last = used[used.length - 1]
  parts.push(`gte(t\\,${fixed(last.t)})*${fixed(last.v)}`)
  return `volume='${parts.join('+')}':eval=frame`
}

function fixed(value: number, digits = 4) {
  return Number(value.toFixed(digits)).toString()
}
