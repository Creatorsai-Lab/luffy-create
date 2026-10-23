/**
 * Speed ramps (velocity edits) and freeze frames for video clips.
 *
 * A curve gives the speed — multiplying the clip's own speed — over the
 * clip's footage (x = 0 its first frame, 1 its last), linear between points.
 * The footage stays the same, so the clip's length becomes footage ÷ the
 * curve's average speed. A freeze frame holds the picture for a while at a
 * point in the clip. Pure.
 */
import type { SpeedCurve, VideoElement } from '../types/editor'

export const SPEED_LIMITS = { min: 0.1, max: 10 }

type Points = SpeedCurve['points']

export const SPEED_PRESETS: Array<{ id: string; label: string; hint: string; points: Points }> = [
  { id: 'slowmoStart', label: 'Slow-mo start', hint: 'Starts in slow motion, then plays normally',
    points: [{ x: 0, speed: 0.3 }, { x: 0.22, speed: 0.3 }, { x: 0.4, speed: 1 }, { x: 1, speed: 1 }] },
  { id: 'montage', label: 'Montage', hint: 'Fast, a slow moment, fast again',
    points: [{ x: 0, speed: 3 }, { x: 0.3, speed: 3 }, { x: 0.42, speed: 0.4 }, { x: 0.58, speed: 0.4 }, { x: 0.7, speed: 3 }, { x: 1, speed: 3 }] },
  { id: 'hero', label: 'Hero', hint: 'Normal, a dramatic slow-motion middle, normal',
    points: [{ x: 0, speed: 1.5 }, { x: 0.35, speed: 1.5 }, { x: 0.45, speed: 0.25 }, { x: 0.6, speed: 0.25 }, { x: 0.7, speed: 1.5 }, { x: 1, speed: 1.5 }] },
  { id: 'bullet', label: 'Bullet', hint: 'Very fast into an almost-frozen moment and out',
    points: [{ x: 0, speed: 4 }, { x: 0.4, speed: 4 }, { x: 0.48, speed: 0.12 }, { x: 0.56, speed: 0.12 }, { x: 0.64, speed: 4 }, { x: 1, speed: 4 }] },
  { id: 'flashIn', label: 'Flash in', hint: 'Rushes in fast and settles to normal',
    points: [{ x: 0, speed: 6 }, { x: 0.3, speed: 3 }, { x: 0.65, speed: 1 }, { x: 1, speed: 1 }] },
  { id: 'flashOut', label: 'Flash out', hint: 'Plays normally, then rushes out',
    points: [{ x: 0, speed: 1 }, { x: 0.35, speed: 1 }, { x: 0.7, speed: 3 }, { x: 1, speed: 6 }] },
  { id: 'jump', label: 'Jump', hint: 'Steps between normal and fast',
    points: [{ x: 0, speed: 1 }, { x: 0.2, speed: 1 }, { x: 0.22, speed: 4 }, { x: 0.4, speed: 4 }, { x: 0.42, speed: 1 }, { x: 0.6, speed: 1 }, { x: 0.62, speed: 4 }, { x: 0.8, speed: 4 }, { x: 0.82, speed: 1 }, { x: 1, speed: 1 }] },
]

export function presetCurve(id: string): SpeedCurve | null {
  const preset = SPEED_PRESETS.find(p => p.id === id)
  return preset ? { preset: id, points: preset.points.map(p => ({ ...p })) } : null
}

/** Points sorted, inside 0–1, with speeds in range, covering both ends. */
export function cleanCurve(curve: SpeedCurve): SpeedCurve {
  const pts = curve.points
    .filter(p => Number.isFinite(p.x) && Number.isFinite(p.speed))
    .map(p => ({ x: Math.max(0, Math.min(1, p.x)), speed: Math.max(SPEED_LIMITS.min, Math.min(SPEED_LIMITS.max, p.speed)) }))
    .sort((a, b) => a.x - b.x)
  if (!pts.length) return { preset: curve.preset, points: [{ x: 0, speed: 1 }, { x: 1, speed: 1 }] }
  if (pts[0].x > 0) pts.unshift({ x: 0, speed: pts[0].speed })
  if (pts[pts.length - 1].x < 1) pts.push({ x: 1, speed: pts[pts.length - 1].speed })
  return { preset: curve.preset, points: pts }
}

/** The speed at a point of the footage (0–1). */
export function speedAtX(curve: SpeedCurve, x: number) {
  const pts = curve.points
  if (x <= pts[0].x) return pts[0].speed
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i].x) {
      const a = pts[i - 1]
      const b = pts[i]
      const k = b.x === a.x ? 1 : (x - a.x) / (b.x - a.x)
      return a.speed + (b.speed - a.speed) * k
    }
  }
  return pts[pts.length - 1].speed
}

const STEPS = 400

/**
 * Time taken to play the footage up to each of STEPS+1 evenly spaced points,
 * for footage of length 1 at speed 1 (scale by footage ÷ clip speed). The
 * last value is the whole curve's time.
 */
function timeTable(curve: SpeedCurve): Float64Array {
  const table = new Float64Array(STEPS + 1)
  for (let i = 1; i <= STEPS; i++) {
    const x0 = (i - 1) / STEPS
    const x1 = i / STEPS
    // Trapezoid on 1/speed.
    table[i] = table[i - 1] + (1 / speedAtX(curve, x0) + 1 / speedAtX(curve, x1)) / 2 / STEPS
  }
  return table
}

const tables = new WeakMap<SpeedCurve, Float64Array>()
function tableFor(curve: SpeedCurve) {
  let t = tables.get(curve)
  if (!t) { t = timeTable(curve); tables.set(curve, t) }
  return t
}

/** How much longer the clip is with the curve than without (1 / the average speed). */
export function curveStretch(curve: SpeedCurve) {
  return tableFor(curve)[STEPS]
}

/** The footage position (0–1) reached after `u` of the curve's play time (0–1). */
export function footageAt(curve: SpeedCurve, u: number) {
  const table = tableFor(curve)
  const target = Math.max(0, Math.min(1, u)) * table[STEPS]
  let lo = 0
  let hi = STEPS
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (table[mid] <= target) lo = mid
    else hi = mid
  }
  const span = table[hi] - table[lo]
  const k = span > 0 ? (target - table[lo]) / span : 0
  return (lo + k) / STEPS
}

/** The play-time position (0–1) at which the footage reaches `x` (0–1). */
export function playAtFootage(curve: SpeedCurve, x: number) {
  const table = tableFor(curve)
  const f = Math.max(0, Math.min(1, x)) * STEPS
  const i = Math.min(STEPS - 1, Math.floor(f))
  return (table[i] + (table[i + 1] - table[i]) * (f - i)) / table[STEPS]
}

/** Seconds of footage a clip covers (its trim span), which a curve or freeze leaves unchanged. */
export function footageSpan(el: Pick<VideoElement, 'duration' | 'sourceDuration' | 'startTime' | 'playbackRate' | 'speedCurve' | 'freeze'>) {
  const rate = el.playbackRate || 1
  const played = Math.max(0, (el.duration ?? Math.max(0, (el.sourceDuration ?? 0) - (el.startTime ?? 0)) / rate) - (el.freeze?.hold ?? 0))
  const stretch = el.speedCurve ? curveStretch(el.speedCurve) : 1
  return (played / stretch) * rate
}

/** The clip length for a footage span with this curve, speed and freeze. */
export function clipLengthFor(span: number, rate: number, curve?: SpeedCurve, freeze?: { hold: number }) {
  return (span / (rate || 1)) * (curve ? curveStretch(curve) : 1) + (freeze?.hold ?? 0)
}

/**
 * Seconds into the clip's footage (from its trim point) shown at `clipTime`
 * seconds into the clip, following the freeze frame and speed curve. Past
 * the clip's end it carries on at the last speed.
 */
export function footageTimeAt(el: Pick<VideoElement, 'duration' | 'sourceDuration' | 'startTime' | 'playbackRate' | 'speedCurve' | 'freeze'>, clipTime: number) {
  const rate = el.playbackRate || 1
  let t = clipTime
  const freeze = el.freeze
  if (freeze && freeze.hold > 0) {
    if (t > freeze.at) t = t < freeze.at + freeze.hold ? freeze.at : t - freeze.hold
  }
  if (!el.speedCurve) return t * rate
  const span = footageSpan(el)
  const playLength = (span / rate) * curveStretch(el.speedCurve)
  if (playLength <= 0) return 0
  if (t >= playLength) {
    const lastSpeed = el.speedCurve.points[el.speedCurve.points.length - 1].speed
    return span + (t - playLength) * rate * lastSpeed
  }
  return footageAt(el.speedCurve, t / playLength) * span
}

/**
 * The clip time at which the footage reaches `footage` seconds past the trim
 * point — footageTimeAt reversed (a frozen frame maps to where the freeze starts).
 */
export function clipTimeAtFootage(el: Pick<VideoElement, 'duration' | 'sourceDuration' | 'startTime' | 'playbackRate' | 'speedCurve' | 'freeze'>, footage: number) {
  const rate = el.playbackRate || 1
  let t = footage / rate
  if (el.speedCurve) {
    const points = el.speedCurve.points
    const span = footageSpan(el)
    const playLength = (span / rate) * curveStretch(el.speedCurve)
    t = footage <= 0 ? footage / (rate * points[0].speed)
      : footage >= span ? playLength + (footage - span) / (rate * points[points.length - 1].speed)
      : playAtFootage(el.speedCurve, footage / span) * playLength
  }
  const freeze = el.freeze
  if (freeze && freeze.hold > 0 && t > freeze.at) t += freeze.hold
  return t
}

/** The speed the footage plays at `clipTime` (0 while frozen) — the video's playbackRate during playback. */
export function playbackSpeedAt(el: Pick<VideoElement, 'duration' | 'sourceDuration' | 'startTime' | 'playbackRate' | 'speedCurve' | 'freeze'>, clipTime: number) {
  const rate = el.playbackRate || 1
  let t = clipTime
  const freeze = el.freeze
  if (freeze && freeze.hold > 0 && t > freeze.at) {
    if (t < freeze.at + freeze.hold) return 0
    t -= freeze.hold
  }
  if (!el.speedCurve) return rate
  const span = footageSpan(el)
  const playLength = (span / rate) * curveStretch(el.speedCurve)
  const x = playLength > 0 ? footageAt(el.speedCurve, Math.min(1, t / playLength)) : 0
  return rate * speedAtX(el.speedCurve, x)
}

/** The two halves of a curve split at footage position `x`, each stretched back over 0–1. */
export function splitCurve(curve: SpeedCurve, x: number): [SpeedCurve, SpeedCurve] {
  const at = Math.max(0.001, Math.min(0.999, x))
  const mid = { x: at, speed: speedAtX(curve, at) }
  const first = [...curve.points.filter(p => p.x < at), mid].map(p => ({ x: p.x / at, speed: p.speed }))
  const second = [mid, ...curve.points.filter(p => p.x > at)].map(p => ({ x: (p.x - at) / (1 - at), speed: p.speed }))
  return [cleanCurve({ preset: 'custom', points: first }), cleanCurve({ preset: 'custom', points: second })]
}

/**
 * Splitting a clip `clipTime` seconds in: the footage time where the second
 * part starts, and each part's curve and freeze.
 */
export function splitTiming(el: Pick<VideoElement, 'duration' | 'sourceDuration' | 'startTime' | 'playbackRate' | 'speedCurve' | 'freeze'>, clipTime: number) {
  const footage = footageTimeAt(el, clipTime)
  const span = footageSpan(el)
  const freeze = el.freeze
  const firstFreeze = freeze && freeze.at < clipTime ? { at: freeze.at, hold: Math.min(freeze.hold, clipTime - freeze.at) } : undefined
  const secondFreeze = freeze && freeze.at + freeze.hold > clipTime
    ? { at: Math.max(0, freeze.at - clipTime), hold: freeze.at >= clipTime ? freeze.hold : freeze.at + freeze.hold - clipTime }
    : undefined
  if (!el.speedCurve || span <= 0) return { footage, curves: [undefined, undefined] as const, freezes: [firstFreeze, secondFreeze] as const }
  const [a, b] = splitCurve(el.speedCurve, footage / span)
  return { footage, curves: [a, b] as const, freezes: [firstFreeze, secondFreeze] as const }
}

/**
 * Constant-speed pieces of a clip's sound for export: each plays `footage`
 * seconds from `from` (footage seconds from the trim point) at `tempo`, or is
 * `silence` seconds long (a freeze frame).
 */
export function soundPieces(el: Pick<VideoElement, 'duration' | 'sourceDuration' | 'startTime' | 'playbackRate' | 'speedCurve' | 'freeze'>, clipDuration: number, pieces = 24):
  Array<{ from: number; footage: number; tempo: number } | { silence: number }> {
  const out: Array<{ from: number; footage: number; tempo: number } | { silence: number }> = []
  const freeze = el.freeze && el.freeze.hold > 0 && el.freeze.at < clipDuration ? el.freeze : undefined
  const edges = new Set<number>([0, clipDuration])
  for (let i = 1; i < pieces; i++) edges.add((clipDuration * i) / pieces)
  if (freeze) { edges.add(freeze.at); edges.add(Math.min(clipDuration, freeze.at + freeze.hold)) }
  const times = [...edges].filter(t => t >= 0 && t <= clipDuration).sort((a, b) => a - b)
  for (let i = 1; i < times.length; i++) {
    const a = times[i - 1]
    const b = times[i]
    if (b - a < 1e-4) continue
    if (freeze && a >= freeze.at - 1e-6 && b <= freeze.at + freeze.hold + 1e-6) {
      out.push({ silence: b - a })
      continue
    }
    const fa = footageTimeAt(el, a)
    const fb = footageTimeAt(el, b)
    const footage = Math.max(0, fb - fa)
    if (footage <= 1e-4) { out.push({ silence: b - a }); continue }
    out.push({ from: fa, footage, tempo: footage / (b - a) })
  }
  // Fewer, longer pieces: neighbours at (nearly) the same speed play as one, and silences join up.
  const merged: typeof out = []
  for (const piece of out) {
    const last = merged[merged.length - 1]
    if (last && 'silence' in last && 'silence' in piece) { last.silence += piece.silence; continue }
    if (last && 'footage' in last && 'footage' in piece && Math.abs(piece.tempo / last.tempo - 1) < 0.03 &&
      Math.abs(last.from + last.footage - piece.from) < 1e-6) {
      const length = last.footage / last.tempo + piece.footage / piece.tempo
      last.footage += piece.footage
      last.tempo = last.footage / length
      continue
    }
    merged.push({ ...piece })
  }
  return merged
}
