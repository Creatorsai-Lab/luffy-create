/**
 * Ducking: music dips while someone talks and comes back up in the pauses.
 * Pure — speech ranges in, volume keys out.
 */
import type { VolumeKey } from '../../types/editor'
import type { TimeRange } from './speech'

export interface DuckOptions {
  /** Music gain while talking (0–1). */
  level?: number
  /** Seconds to go down before speech and to come back up after it. */
  fade?: number
  /** Pauses shorter than this stay ducked, so the music doesn't pump between sentences (seconds). */
  hold?: number
}

export interface DuckClip {
  /** Where the clip starts on the project timeline (seconds). */
  absStart: number
  /** Length on the timeline (seconds). */
  duration: number
  /** Trim start in the source file (seconds). */
  startTime: number
  speed: number
}

export const DEFAULT_DUCK_LEVEL = 0.25
export const DEFAULT_DUCK_FADE = 0.3

/** Speech ranges (project timeline) → volume keys for a music clip, in source seconds. */
export function duckingKeys(speech: TimeRange[], clip: DuckClip, opts: DuckOptions = {}): VolumeKey[] {
  const level = Math.max(0, Math.min(1, opts.level ?? DEFAULT_DUCK_LEVEL))
  const fade = Math.max(0.02, Math.min(3, opts.fade ?? DEFAULT_DUCK_FADE))
  const hold = Math.max(0, opts.hold ?? 0.6)
  const end = clip.duration

  // Speech in clip time, only what touches the clip (with its fades).
  const local = speech
    .map(([a, b]): TimeRange => [a - clip.absStart, b - clip.absStart])
    .filter(([a, b]) => b > a && b + fade > 0 && a - fade < end)
    .sort((x, y) => x[0] - y[0])

  // Join ranges whose gap is too short to come back up and go down again.
  const joined: TimeRange[] = []
  for (const range of local) {
    const last = joined[joined.length - 1]
    if (last && range[0] - last[1] < 2 * fade + hold) last[1] = Math.max(last[1], range[1])
    else joined.push([range[0], range[1]])
  }
  if (!joined.length) return []

  const keys: VolumeKey[] = []
  for (const [a, b] of joined) {
    keys.push({ t: a - fade, v: 1 }, { t: a, v: level }, { t: b, v: level }, { t: b + fade, v: 1 })
  }
  const toSource = (t: number) => clip.startTime + t * (clip.speed || 1)
  return keys
    .map(k => ({ t: round(toSource(k.t)), v: round(k.v) }))
    .filter(k => k.t >= 0)
}

function round(value: number) {
  return Math.round(value * 1000) / 1000
}
