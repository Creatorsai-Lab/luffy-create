/**
 * The effect stack of a video or image: reading it (and converting older
 * projects), when each effect runs and how strongly, the combined camera move
 * and whole-item motion, and keeping windows right when a clip is split.
 * Pure — no browser APIs.
 */
import { v4 as uuid } from 'uuid'
import type { FxType, ImageElement, MediaEffectClip, MediaFx, VideoElement } from '../../types/editor'
import { fxDef } from './catalog'

export type FxMedia = VideoElement | ImageElement

/** A new effect with its defaults, running over the whole clip. */
export function makeFx(type: FxType, patch: Partial<MediaFx> = {}): MediaFx {
  const def = fxDef(type)
  const params = Object.fromEntries(def.params.map(p => [p.key, p.default]))
  return {
    id: uuid(),
    type,
    start: 0,
    intensity: def.intensity,
    ...(def.beat && (type === 'phonk') && { beatSync: true }),
    ...patch,
    params: { ...params, ...(patch.params ?? {}) },
  }
}

/** A setting of an effect, falling back to the catalogue default. */
export function fxParam<T extends number | string | boolean>(fx: MediaFx, key: string): T {
  const value = fx.params?.[key]
  if (value !== undefined) return value as T
  return fxDef(fx.type).params.find(p => p.key === key)?.default as T
}

// ── Older projects ─────────────────────────────────────────────────────────

const LEGACY_SHARED: Partial<Record<MediaEffectClip['type'], FxType>> = {
  subtleHover: 'float', wiggle: 'wiggle', doodleDrift: 'drift', shake: 'shake', zoomIn: 'kenBurnsIn', zoomOut: 'kenBurnsOut',
  vibrationDistort: 'wave', glitch: 'glitch', godRays: 'godRays', lightSweep: 'lightSweep', lightFlicker: 'flicker', rain: 'rain', snow: 'snow',
}
const LEGACY_VIDEO: Record<string, FxType> = { lensBlur: 'defocus', distortion: 'wave', shake: 'shake', comic: 'halftone', retro: 'vhs', flash: 'strobe' }

/**
 * The element's effects: its `fx`, or — for a project made before the
 * effects engine — the older shared effects, video effect, colour grade,
 * grain and vignette converted into one stack (old times were scene seconds).
 */
export function effectStack(el: FxMedia): MediaFx[] {
  if (el.fx) return el.fx
  const offset = el.type === 'video' ? el.timelineX ?? 0 : 0
  const out: MediaFx[] = []
  const id = (n: string) => `legacy-${n}`

  const clips: MediaEffectClip[] = el.mediaEffects?.length ? el.mediaEffects
    : el.mediaEffect && el.mediaEffect !== 'none' ? [{ ...el, type: el.mediaEffect, startAt: 0, endAt: Number.POSITIVE_INFINITY } as MediaEffectClip]
    : []
  clips.forEach((clip, i) => {
    const type = LEGACY_SHARED[clip.type]
    if (!type) return
    const end = Number.isFinite(clip.endAt) ? clip.endAt - offset : undefined
    const params: Record<string, number | string | boolean> = {}
    if (clip.mediaEffectColor && (type === 'godRays' || type === 'lightSweep' || type === 'flicker')) params.color = clip.mediaEffectColor
    if (clip.mediaEffectZoomPosition && (type === 'kenBurnsIn' || type === 'kenBurnsOut')) params.position = clip.mediaEffectZoomPosition
    if (clip.mediaEffectDirection && type === 'lightSweep' && clip.mediaEffectDirection !== 'diagonal') params.direction = clip.mediaEffectDirection
    out.push(makeFx(type, {
      id: id(`shared-${i}`),
      start: Math.max(0, clip.startAt - offset),
      end,
      intensity: clip.mediaEffectIntensity ?? 0.45,
      params,
    }))
  })

  if (el.type === 'video' && el.videoEffect && el.videoEffect !== 'none' && !clips.length) {
    const type = LEGACY_VIDEO[el.videoEffect]
    if (type) out.push(makeFx(type, { id: id('video'), intensity: el.videoEffectIntensity ?? 0.5 }))
  }
  if (el.type === 'video' && el.colorGrading && el.colorGrading !== 'none') {
    out.push(makeFx('look', { id: id('look'), intensity: 0.8, params: { look: el.colorGrading } }))
  }
  if ((el.grainOpacity ?? 0) > 0) {
    out.push(makeFx('grain', { id: id('grain'), intensity: Math.min(1, el.grainOpacity ?? 0), params: { size: Math.min(1, (el.grainSize ?? 1) / 4) } }))
  }
  if (el.vignetteEnabled) {
    out.push(makeFx('vignette', {
      id: id('vignette'),
      intensity: Math.min(1, el.vignetteAmount ?? 0.5),
      params: { size: el.vignetteSize ?? 0.5, softness: el.vignetteFade ?? 0.65, color: el.vignetteColor ?? '#000000' },
    }))
  }
  return out
}

/** The patch that stores a new stack and clears the older fields it replaces. */
export function stackPatch(el: FxMedia, fx: MediaFx[]): Partial<VideoElement> | Partial<ImageElement> {
  return {
    fx,
    mediaEffect: 'none' as const,
    mediaEffects: undefined,
    grainOpacity: 0,
    vignetteEnabled: false,
    ...(el.type === 'video' && { videoEffect: 'none' as const, colorGrading: 'none' as const }),
  }
}

// ── Time ───────────────────────────────────────────────────────────────────

/** The clip's own time: for a video, seconds since it starts in its scene; for an image, scene seconds. */
export function clipTimeOf(el: FxMedia, sceneLocalTime: number) {
  return el.type === 'video' ? sceneLocalTime - (el.timelineX ?? 0) : sceneLocalTime
}

/** How long an effect window lasts when it has no end (the clip, or for images the scene). */
export function fxEnd(fx: MediaFx, clipDuration: number) {
  return fx.end ?? clipDuration
}

/** How strongly an effect shows at a clip time: 0 outside its window, fading in and out, times its strength. */
export function fxWeight(fx: MediaFx, clipTime: number, clipDuration: number) {
  if (fx.off) return 0
  const end = fxEnd(fx, clipDuration)
  // Past the clip's end (a transition's outgoing scene keeps playing) effects without an end carry on.
  const open = fx.end == null && clipTime >= end
  if (clipTime < fx.start || (!open && clipTime > end)) return 0
  let w = 1
  if (fx.fadeIn && fx.fadeIn > 0) w = Math.min(w, (clipTime - fx.start) / fx.fadeIn)
  if (fx.fadeOut && fx.fadeOut > 0 && !open) w = Math.min(w, (end - clipTime) / fx.fadeOut)
  return Math.max(0, Math.min(1, w)) * Math.max(0, Math.min(1, fx.intensity))
}

/** Seconds into the effect, scaled by its speed — what animations run on. */
export function fxTime(fx: MediaFx, clipTime: number) {
  const speed = Number(fx.params?.speed ?? 1) || 1
  return Math.max(0, clipTime - fx.start) * speed
}

/** Effect windows after a clip is split `at` seconds in: the second part's clock starts at 0. */
export function shiftFx(fx: MediaFx[], at: number): MediaFx[] {
  return fx
    .filter(f => f.end == null || f.end > at)
    .map(f => ({ ...f, id: uuid(), start: f.start - at, ...(f.end != null && { end: f.end - at }) }))
}

/** Effects that end before `at` (the first part of a split keeps these, and ones that started before). */
export function trimFx(fx: MediaFx[], at: number): MediaFx[] {
  return fx.filter(f => f.start < at)
}

// ── Beats ──────────────────────────────────────────────────────────────────

/**
 * The beat pulse at a time: 1 on a beat, fading quickly to 0 before the next,
 * plus the beat's number. Without beats, a steady 120 BPM.
 */
export function beatPulse(beats: readonly number[] | null, time: number): { pulse: number; index: number } {
  if (!beats || beats.length < 2) {
    const period = 0.5
    const index = Math.floor(time / period)
    return { pulse: Math.exp(-((time - index * period) / period) * 5), index }
  }
  let lo = 0
  let hi = beats.length - 1
  if (time < beats[0]) return { pulse: 0, index: -1 }
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (beats[mid] <= time) lo = mid
    else hi = mid
  }
  const index = time >= beats[hi] ? hi : lo
  const next = beats[index + 1] ?? beats[index] + (beats[index] - beats[Math.max(0, index - 1)] || 0.5)
  const period = Math.max(0.15, next - beats[index])
  return { pulse: Math.exp(-((time - beats[index]) / period) * 5), index }
}

// ── Camera and whole-item motion ───────────────────────────────────────────

/** A smooth noise in [-1, 1] (sum of sines with unrelated periods). */
function wobble(t: number, seed: number) {
  return (Math.sin(t * 1.7 + seed) * 0.5 + Math.sin(t * 3.1 + seed * 2.3) * 0.3 + Math.sin(t * 5.3 + seed * 4.1) * 0.2)
}

const CORNER: Record<string, [number, number]> = {
  center: [0.5, 0.5], topLeft: [0.25, 0.25], topRight: [0.75, 0.25], bottomRight: [0.75, 0.75], bottomLeft: [0.25, 0.75],
}

export interface CameraMove {
  /** Zoom ≥ 1 (the picture is enlarged inside its box, so shakes never show empty edges). */
  zoom: number
  /** Centre of the visible part, 0–1 of the picture. */
  cx: number
  cy: number
  /** Radians. */
  rotate: number
}

/**
 * The camera move of all camera effects together at a clip time: Ken Burns,
 * handheld shake, zoom pulse and the phonk punch. Shakes enlarge the picture
 * enough that the frame never shows past its edge.
 */
export function cameraMove(stack: MediaFx[], clipTime: number, clipDuration: number, beat: (fx: MediaFx) => { pulse: number; index: number }): CameraMove {
  let zoom = 1
  let cx = 0.5
  let cy = 0.5
  let dx = 0
  let dy = 0
  let rotate = 0
  let overscan = 0
  for (const fx of stack) {
    const w = fxWeight(fx, clipTime, clipDuration)
    if (w <= 0) continue
    const t = fxTime(fx, clipTime)
    if (fx.type === 'kenBurnsIn' || fx.type === 'kenBurnsOut') {
      const length = Math.max(0.1, fxEnd(fx, clipDuration) - fx.start)
      const p = Math.min(1, Math.max(0, (clipTime - fx.start) / length))
      const eased = p * p * (3 - 2 * p)
      const amount = 0.08 + 0.5 * w
      const z = 1 + amount * (fx.type === 'kenBurnsIn' ? eased : 1 - eased)
      zoom *= z
      const [tx, ty] = CORNER[String(fxParam(fx, 'position'))] ?? CORNER.center
      // Move the view centre towards the chosen corner as it zooms (stays inside the picture).
      const k = (z - 1) / (amount || 1)
      cx += (tx - 0.5) * k * 0.5
      cy += (ty - 0.5) * k * 0.5
    } else if (fx.type === 'shake') {
      const b = fx.beatSync ? beat(fx).pulse : 1
      const amp = 0.025 * w * (fx.beatSync ? 0.4 + 1.6 * b : 1)
      dx += wobble(t * 6, 1.3) * amp
      dy += wobble(t * 6, 7.9) * amp
      if (fxParam<boolean>(fx, 'rotate')) rotate += wobble(t * 5, 3.7) * amp * 0.6
      overscan = Math.max(overscan, amp * 2.4)
    } else if (fx.type === 'zoomPulse') {
      const pulse = fx.beatSync ? beat(fx).pulse : Math.pow(Math.max(0, Math.sin(t * Math.PI * 2)), 6)
      zoom *= 1 + 0.18 * w * pulse
    } else if (fx.type === 'phonk') {
      const b = fx.beatSync === false ? { pulse: Math.pow(Math.max(0, Math.sin(t * Math.PI * 2)), 6), index: Math.floor(t) } : beat(fx)
      zoom *= 1 + 0.16 * w * Number(fxParam(fx, 'zoom')) * b.pulse
      const amp = 0.03 * w * Number(fxParam(fx, 'shake')) * b.pulse
      dx += wobble(t * 14 + b.index, 2.1) * amp
      dy += wobble(t * 14 + b.index, 5.4) * amp
      overscan = Math.max(overscan, amp * 2.4)
    } else if (fx.type === 'film8mm') {
      // Gate weave: the film frame drifts slightly in the projector.
      const amp = 0.004 * w
      dx += wobble(t * 3, 4.2) * amp
      dy += wobble(t * 4, 9.1) * amp * 1.5
      overscan = Math.max(overscan, amp * 3)
    }
  }
  zoom *= 1 + overscan
  // Keep the view inside the picture.
  const half = 0.5 / zoom
  cx = Math.min(1 - half, Math.max(half, cx + dx))
  cy = Math.min(1 - half, Math.max(half, cy + dy))
  return { zoom, cx, cy, rotate }
}

/** Whole-item motion (float, wiggle, drift): offset in element sizes and rotation in degrees. */
export function itemMotion(stack: MediaFx[], clipTime: number, clipDuration: number): { dx: number; dy: number; rotate: number; scale: number } {
  let dx = 0
  let dy = 0
  let rotate = 0
  let scale = 1
  for (const fx of stack) {
    const w = fxWeight(fx, clipTime, clipDuration)
    if (w <= 0 || fxDef(fx.type).stage !== 'item') continue
    const t = fxTime(fx, clipTime)
    if (fx.type === 'float') {
      dy += Math.sin(t * 2.2) * 0.025 * w
      scale *= 1 + Math.sin(t * 2.2 + 0.8) * 0.012 * w
    } else if (fx.type === 'wiggle') {
      rotate += Math.sin(t * 7.5) * 3.2 * w
      dx += Math.sin(t * 5.1) * 0.006 * w
    } else if (fx.type === 'drift') {
      dx += (Math.sin(t * 0.9) * 0.6 + Math.sin(t * 1.7) * 0.4) * 0.02 * w
      dy += (Math.cos(t * 1.1) * 0.6 + Math.sin(t * 2.3) * 0.4) * 0.02 * w
      rotate += Math.sin(t * 0.8) * 1.2 * w
    }
  }
  return { dx, dy, rotate, scale }
}

/** Effects that change the picture's pixels (anything but whole-item motion), or colour adjustments that need the GPU. */
export function needsPixelWork(el: FxMedia, stack: MediaFx[]) {
  return stack.some(fx => !fx.off && fxDef(fx.type).stage !== 'item') || hasAdjustments(el)
}

/** Any colour adjustment away from neutral. */
export function hasAdjustments(el: FxMedia) {
  return (el.brightness ?? 100) !== 100 || (el.contrast ?? 100) !== 100 || (el.saturation ?? 100) !== 100 || (el.hueRotate ?? 0) !== 0 ||
    (el.blur ?? 0) !== 0 || (el.exposure ?? 0) !== 0 || (el.vibrance ?? 0) !== 0 || (el.temperature ?? 0) !== 0 || (el.tint ?? 0) !== 0 ||
    (el.highlights ?? 0) !== 0 || (el.shadows ?? 0) !== 0 || (el.whites ?? 0) !== 0 || (el.blacks ?? 0) !== 0
}
