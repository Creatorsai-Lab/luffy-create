import {
  MEDIA_EFFECT_TYPES,
  type ImageElement,
  type MediaEffectAxis,
  type MediaEffectClip,
  type MediaEffectDirection,
  type MediaEffectSettings,
  type MediaEffectTarget,
  type MediaEffectType,
  type MediaZoomPosition,
  type VideoElement,
} from '../types/editor'

type MediaElement = ImageElement | VideoElement

export interface MediaDrawFns {
  drawBase: (ctx: CanvasRenderingContext2D, dx?: number, dy?: number, dw?: number, dh?: number) => void
  drawSlice?: (
    ctx: CanvasRenderingContext2D,
    sourceY: number,
    sourceH: number,
    destX: number,
    destY: number,
    destW: number,
    destH: number,
  ) => void
}

interface EffectState {
  type: MediaEffectType
  axis: MediaEffectAxis
  intensity: number
  speed: number
  hardness: number
  direction: MediaEffectDirection
  blend: number
  color: string
  colorOpacity: number
  size: number
  target: MediaEffectTarget
  focusX: number
  focusY: number
  zoomPosition: MediaZoomPosition
}

export function mediaEffectRequiresAnimation(el: MediaElement) {
  return getMediaEffectClips(el).some(clip => isVisibleEffect(resolveEffectState(clip)))
}

export function normalizeMediaEffect(value: unknown): MediaEffectType {
  return MEDIA_EFFECT_TYPES.includes(value as MediaEffectType) ? value as MediaEffectType : 'none'
}

export function resolveGlitchAxis(value: unknown): MediaEffectAxis {
  return value === 'vertical' ? 'vertical' : 'horizontal'
}

const EFFECT_SETTING_KEYS: (keyof MediaEffectSettings)[] = [
  'mediaEffectAxis', 'mediaEffectIntensity', 'mediaEffectSpeed', 'mediaEffectHardness',
  'mediaEffectDirection', 'mediaEffectBlend', 'mediaEffectColor', 'mediaEffectColorOpacity',
  'mediaEffectSize', 'mediaEffectTarget', 'mediaEffectFocusX', 'mediaEffectFocusY',
  'mediaEffectZoomPosition',
]

export function getMediaEffectClips(el: MediaElement): MediaEffectClip[] {
  if (Array.isArray(el.mediaEffects)) {
    const seen = new Set<MediaEffectType>()
    const clips = el.mediaEffects.flatMap(raw => {
      const type = normalizeMediaEffect(raw?.type)
      if (type === 'none' || seen.has(type)) return []
      seen.add(type)
      const startAt = finiteAtLeast(raw.startAt, 0, 0)
      const endAt = finiteAtLeast(raw.endAt, startAt, Infinity)
      return [{ type, startAt, endAt, ...copyEffectSettings(raw) }]
    })
    return clips
  }

  const normalized = normalizeMediaEffect(el.mediaEffect)
  return normalized === 'none'
    ? legacyVideoEffectClip(el)
    : [{ type: normalized, startAt: 0, endAt: Infinity, ...copyEffectSettings(el) }]
}

export function getActiveMediaEffects(el: MediaElement, localTime: number): MediaEffectClip[] {
  return getMediaEffectClips(el).filter(clip => localTime >= clip.startAt && localTime <= clip.endAt)
}

export function drawMediaWithEffects(
  ctx: CanvasRenderingContext2D,
  el: MediaElement,
  width: number,
  height: number,
  localTime: number,
  fns: MediaDrawFns,
) {
  const effects = getActiveMediaEffects(el, localTime)
    .map(clip => ({
      ...resolveEffectState(clip),
      time: Math.max(0, localTime - clip.startAt),
      duration: Number.isFinite(clip.endAt) ? Math.max(0, clip.endAt - clip.startAt) : 0,
    }))
    .filter(isVisibleEffect)

  if (effects.length === 0) {
    fns.drawBase(ctx, 0, 0, width, height)
    return
  }

  ctx.save()
  for (const effect of effects) applyMotionTransform(ctx, effect, width, height, effect.time)

  const distortions = effects.filter(effect => effect.type === 'vibrationDistort' || effect.type === 'glitch')
  if (distortions.length === 0) {
    fns.drawBase(ctx, 0, 0, width, height)
  } else if (distortions.length === 1) {
    drawSourceEffect(ctx, distortions[0], width, height, fns)
  } else {
    drawStackedDistortions(ctx, distortions, width, height, fns)
  }

  ctx.restore()

  for (const effect of effects) drawOverlayEffect(ctx, effect, width, height)
}

function resolveEffectState(clip: MediaEffectClip): EffectState {
  return {
    type: clip.type,
    axis: resolveGlitchAxis(clip.mediaEffectAxis),
    intensity: clamp01(clip.mediaEffectIntensity ?? 0.45),
    speed: clamp(clip.mediaEffectSpeed ?? 1, 0.1, 5),
    hardness: clamp01(clip.mediaEffectHardness ?? 0.5),
    direction: clip.mediaEffectDirection ?? 'diagonal',
    blend: clamp01(clip.mediaEffectBlend ?? 0.55),
    color: clip.mediaEffectColor ?? '#fff2b8',
    colorOpacity: clamp01(clip.mediaEffectColorOpacity ?? 1),
    size: clamp01(clip.mediaEffectSize ?? 0.5),
    target: clip.mediaEffectTarget ?? 'centerSubject',
    focusX: clamp01(clip.mediaEffectFocusX ?? 0.5),
    focusY: clamp01(clip.mediaEffectFocusY ?? 0.5),
    zoomPosition: resolveZoomPosition(clip.mediaEffectZoomPosition),
  }
}

type TimedEffectState = EffectState & { time: number; duration: number }

function isVisibleEffect(effect: EffectState) {
  if (effect.type === 'zoomIn' || effect.type === 'zoomOut') return true
  return effect.intensity > 0 && (effect.type !== 'lightFlicker' || effect.hardness > 0)
}

function drawSourceEffect(
  ctx: CanvasRenderingContext2D,
  effect: TimedEffectState,
  width: number,
  height: number,
  fns: MediaDrawFns,
) {
  if (effect.type === 'vibrationDistort') drawVibrationDistort(ctx, effect, width, height, effect.time, fns)
  else if (effect.type === 'glitch') drawGlitch(ctx, effect, width, height, effect.time, fns)
  else fns.drawBase(ctx, 0, 0, width, height)
}

function drawOverlayEffect(
  ctx: CanvasRenderingContext2D,
  effect: TimedEffectState,
  width: number,
  height: number,
) {
  if (effect.type === 'godRays') drawGodRays(ctx, effect, width, height, effect.time)
  else if (effect.type === 'lightSweep') drawLightSweep(ctx, effect, width, height, effect.time)
  else if (effect.type === 'lightFlicker') drawLightFlicker(ctx, effect, width, height)
  else if (effect.type === 'rain') drawRain(ctx, effect, width, height, effect.time)
  else if (effect.type === 'snow') drawSnow(ctx, effect, width, height, effect.time)
}

let distortionScratch: HTMLCanvasElement | null = null

function drawStackedDistortions(
  ctx: CanvasRenderingContext2D,
  effects: TimedEffectState[],
  width: number,
  height: number,
  fns: MediaDrawFns,
) {
  distortionScratch ??= document.createElement('canvas')
  const scratchWidth = Math.max(1, Math.ceil(width))
  const scratchHeight = Math.max(1, Math.ceil(height))
  if (distortionScratch.width !== scratchWidth) distortionScratch.width = scratchWidth
  if (distortionScratch.height !== scratchHeight) distortionScratch.height = scratchHeight
  const scratchCtx = distortionScratch.getContext('2d')!
  scratchCtx.setTransform(1, 0, 0, 1, 0, 0)
  scratchCtx.clearRect(0, 0, scratchWidth, scratchHeight)
  scratchCtx.globalAlpha = 1
  scratchCtx.globalCompositeOperation = 'source-over'
  scratchCtx.filter = ctx.filter
  drawSourceEffect(scratchCtx, effects[0], width, height, fns)

  const scratchFns: MediaDrawFns = {
    drawBase: (target, dx = 0, dy = 0, dw = width, dh = height) => {
      target.drawImage(distortionScratch!, dx, dy, dw, dh)
    },
    drawSlice: (target, sourceY, sourceH, destX, destY, destW, destH) => {
      target.drawImage(distortionScratch!, 0, sourceY, width, sourceH, destX, destY, destW, destH)
    },
  }

  ctx.filter = 'none'
  drawSourceEffect(ctx, effects[1], width, height, scratchFns)
}

function applyMotionTransform(
  ctx: CanvasRenderingContext2D,
  effect: TimedEffectState,
  width: number,
  height: number,
  localTime: number,
) {
  const t = localTime * effect.speed
  const i = effect.intensity
  const h = 0.35 + effect.hardness * 0.65

  if (effect.type === 'zoomIn' || effect.type === 'zoomOut') {
    const scale = getMediaZoomScale(effect.type, localTime, effect.duration, effect.speed)
    const anchorX = getMediaZoomAnchor(effect.zoomPosition, width, 'x')
    const anchorY = getMediaZoomAnchor(effect.zoomPosition, height, 'y')
    ctx.translate(anchorX, anchorY)
    ctx.scale(scale, scale)
    ctx.translate(-anchorX, -anchorY)
  } else if (effect.type === 'subtleHover') {
    const x = Math.sin(t * 1.7) * 10 * i
    const y = Math.cos(t * 1.15) * 8 * i
    const scale = 1 + 0.018 * i
    ctx.translate(width / 2 + x, height / 2 + y)
    ctx.scale(scale, scale)
    ctx.translate(-width / 2, -height / 2)
  } else if (effect.type === 'wiggle') {
    const angle = Math.sin(t * 7) * 2.8 * i * h
    const x = Math.sin(t * 4.4) * 5 * i
    const y = Math.cos(t * 5.2) * 4 * i
    ctx.translate(width / 2 + x, height / 2 + y)
    ctx.rotate(degToRad(angle))
    ctx.translate(-width / 2, -height / 2)
  } else if (effect.type === 'doodleDrift') {
    const angle = (Math.sin(t * 2.1) + Math.sin(t * 3.7) * 0.35) * 1.8 * i
    const x = (Math.sin(t * 1.6) + Math.sin(t * 3.1) * 0.4) * 14 * i
    const y = (Math.cos(t * 1.2) + Math.sin(t * 2.4) * 0.3) * 12 * i
    ctx.translate(width / 2 + x, height / 2 + y)
    ctx.rotate(degToRad(angle))
    ctx.translate(-width / 2, -height / 2)
  } else if (effect.type === 'shake') {
    const x = Math.sin(t * 36) * Math.cos(t * 19) * 18 * i * h
    const y = Math.cos(t * 31) * Math.sin(t * 23) * 18 * i * h
    const angle = Math.sin(t * 28) * 1.4 * i * h
    ctx.translate(width / 2 + x, height / 2 + y)
    ctx.rotate(degToRad(angle))
    ctx.translate(-width / 2, -height / 2)
  }
}

export function getMediaZoomScale(
  type: 'zoomIn' | 'zoomOut',
  elapsed: number,
  duration: number,
  speed: number,
) {
  const safeElapsed = finiteAtLeast(elapsed, 0, 0)
  const safeDuration = finiteAtLeast(duration, 0, 0)
  const time = type === 'zoomIn' ? safeElapsed : Math.max(0, safeDuration - safeElapsed)
  return 1 + time * clamp(Number.isFinite(speed) ? speed : 1, 0.1, 5) * 0.12
}

function resolveZoomPosition(value: unknown): MediaZoomPosition {
  return value === 'topLeft' || value === 'topRight' || value === 'bottomRight' || value === 'bottomLeft'
    ? value
    : 'center'
}

export function getMediaZoomAnchor(position: unknown, size: number, axis: 'x' | 'y') {
  const edge = finiteAtLeast(size, 0, 0)
  const resolved = resolveZoomPosition(position)
  if (axis === 'x') {
    if (resolved === 'topLeft' || resolved === 'bottomLeft') return 0
    if (resolved === 'topRight' || resolved === 'bottomRight') return edge
  } else {
    if (resolved === 'topLeft' || resolved === 'topRight') return 0
    if (resolved === 'bottomLeft' || resolved === 'bottomRight') return edge
  }
  return edge / 2
}

function drawVibrationDistort(
  ctx: CanvasRenderingContext2D,
  effect: EffectState,
  width: number,
  height: number,
  localTime: number,
  fns: MediaDrawFns,
) {
  if (!fns.drawSlice) {
    fns.drawBase(ctx, 0, 0, width, height)
    return
  }

  const slices = Math.max(12, Math.round(18 + effect.hardness * 36))
  const sliceH = height / slices
  const amp = (8 + effect.hardness * 22) * effect.intensity
  const t = localTime * effect.speed * 12

  for (let s = 0; s < slices; s++) {
    const y = s * sliceH
    const wobble = Math.sin(s * 0.9 + t) + Math.sin(s * 0.35 + t * 1.7) * 0.45
    fns.drawSlice(ctx, y, sliceH + 1, wobble * amp, y, width, sliceH + 1)
  }
}

function drawGlitch(
  ctx: CanvasRenderingContext2D,
  effect: EffectState,
  width: number,
  height: number,
  localTime: number,
  fns: MediaDrawFns,
) {
  const t = localTime * effect.speed
  const frame = Math.floor(t * 12)
  const burst = 0.45 + Math.max(0, Math.sin(t * 8.2) * 0.7 + Math.sin(t * 19.7) * 0.3)
  const strength = effect.intensity * (0.35 + effect.hardness * 0.65) * burst
  const channel = (2 + effect.size * 18) * strength
  const horizontal = effect.axis === 'horizontal'

  fns.drawBase(ctx, 0, 0, width, height)

  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  ctx.globalAlpha = 0.2 * effect.blend * strength
  ctx.filter = 'sepia(1) saturate(7) hue-rotate(135deg)'
  fns.drawBase(ctx, horizontal ? -channel : 0, horizontal ? 0 : -channel, width, height)
  ctx.filter = 'sepia(1) saturate(7) hue-rotate(285deg)'
  fns.drawBase(ctx, horizontal ? channel : 0, horizontal ? 0 : channel, width, height)
  ctx.restore()

  const bands = Math.round(5 + effect.hardness * 8)
  const crossSize = horizontal ? height : width
  const maxOffset = (8 + effect.size * 42) * strength
  for (let i = 0; i < bands; i++) {
    if (seededUnit(frame * 47 + i * 31) < 0.3) continue
    const thickness = Math.max(2, crossSize * (0.008 + seededUnit(i * 83 + frame) * 0.045))
    const position = seededUnit(i * 131 + frame * 7) * Math.max(1, crossSize - thickness)
    const offset = (seededUnit(i * 17 + frame * 13) - 0.5) * maxOffset * 2
    ctx.save()
    ctx.beginPath()
    ctx.rect(horizontal ? 0 : position, horizontal ? position : 0, horizontal ? width : thickness, horizontal ? thickness : height)
    ctx.clip()
    fns.drawBase(ctx, horizontal ? offset : 0, horizontal ? 0 : offset, width, height)
    ctx.restore()
  }

  drawGlitchLines(ctx, effect, width, height, frame)
}

function legacyVideoEffectClip(el: MediaElement): MediaEffectClip[] {
  if (el.type !== 'video' || (el.videoEffect !== 'shake' && el.videoEffect !== 'distortion')) return []
  return [{
    type: el.videoEffect === 'shake' ? 'shake' : 'vibrationDistort',
    startAt: 0,
    endAt: Infinity,
    ...copyEffectSettings(el),
    ...(el.mediaEffectIntensity === undefined && el.videoEffectIntensity !== undefined
      ? { mediaEffectIntensity: el.videoEffectIntensity }
      : {}),
  }]
}

function copyEffectSettings(source: MediaEffectSettings): MediaEffectSettings {
  const settings: MediaEffectSettings = {}
  for (const key of EFFECT_SETTING_KEYS) {
    const value = source[key]
    if (value !== undefined) (settings as Record<string, unknown>)[key] = value
  }
  return settings
}

function finiteAtLeast(value: unknown, min: number, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, value) : fallback
}

function drawGlitchLines(
  ctx: CanvasRenderingContext2D,
  effect: EffectState,
  width: number,
  height: number,
  frame: number,
) {
  const horizontal = effect.axis === 'horizontal'
  const crossSize = horizontal ? height : width
  const longSize = horizontal ? width : height
  const lines = Math.round(5 + effect.hardness * 9)

  ctx.save()
  ctx.filter = 'none'
  ctx.globalAlpha = effect.intensity * effect.blend
  for (let i = 0; i < lines; i++) {
    const cross = seededUnit(frame * 61 + i * 43) * crossSize
    const start = seededUnit(frame * 23 + i * 73) * longSize * 0.82
    const length = longSize * (0.04 + seededUnit(frame * 11 + i * 97) * 0.2)
    const thickness = 1 + Math.round(seededUnit(i * 37 + frame) * 1.2)
    ctx.fillStyle = i % 3 === 0 ? 'rgba(4, 8, 16, .75)' : i % 2 ? '#ff2fa8' : '#19e6ff'
    ctx.fillRect(horizontal ? start : cross, horizontal ? cross : start, horizontal ? length : thickness, horizontal ? thickness : length)
  }
  ctx.restore()
}

function drawLightSweep(
  ctx: CanvasRenderingContext2D,
  effect: EffectState,
  width: number,
  height: number,
  localTime: number,
) {
  const progress = ((localTime * effect.speed * 0.45) % 1 + 1) % 1
  const span = Math.max(width, height) * (0.06 + effect.size * 0.38)
  const travel = width + height + span * 2
  const pos = progress * travel - height - span
  const alpha = effect.intensity * effect.blend * effect.colorOpacity
  const rgb = hexToRgb(effect.color)

  ctx.save()
  ctx.filter = 'none'
  ctx.globalCompositeOperation = 'screen'
  ctx.translate(width / 2, height / 2)
  ctx.rotate(directionAngle(effect.direction))
  ctx.translate(-width / 2, -height / 2)

  const grad = ctx.createLinearGradient(pos - span, 0, pos + span, 0)
  grad.addColorStop(0, `rgba(${rgb}, 0)`)
  grad.addColorStop(0.42, `rgba(${rgb}, ${0.02 * alpha})`)
  grad.addColorStop(0.5, `rgba(${rgb}, ${0.65 * alpha})`)
  grad.addColorStop(0.58, `rgba(${rgb}, ${0.04 * alpha})`)
  grad.addColorStop(1, `rgba(${rgb}, 0)`)
  ctx.fillStyle = grad
  ctx.fillRect(pos - span, -height, span * 2, height * 3)
  ctx.restore()
}

export function getLightFlickerStrength(localTime: number, speed: number, fade: number) {
  const rawTime = Math.max(0, Number.isFinite(localTime) ? localTime : 0)
    * clamp(Number.isFinite(speed) ? speed : 1, 0.1, 5)
  const scaledTime = Number.isFinite(rawTime) ? rawTime : Number.MAX_SAFE_INTEGER
  const position = scaledTime / 0.32
  const slot = Math.floor(position)
  const phase = position - slot
  if (seededUnit(slot * 47 + 19) < 0.42) return 0

  const softness = clamp01(Number.isFinite(fade) ? fade : 0.5)
  const duration = 0.14 + softness * 0.72
  if (phase > duration) return 0

  const attack = Math.min(1, phase / 0.055)
  const decay = 1 - Math.max(0, phase - 0.055) / Math.max(0.001, duration - 0.055)
  const amplitude = 0.45 + seededUnit(slot * 83 + 7) * 0.55
  return clamp01(attack * Math.pow(clamp01(decay), 1.25 - softness * 0.65) * amplitude)
}

function drawLightFlicker(
  ctx: CanvasRenderingContext2D,
  effect: TimedEffectState,
  width: number,
  height: number,
) {
  const strength = getLightFlickerStrength(effect.time, effect.speed, effect.blend) * effect.hardness
  if (strength <= 0) return
  ctx.save()
  ctx.filter = 'none'
  ctx.globalCompositeOperation = 'screen'
  ctx.globalAlpha = strength
  ctx.fillStyle = effect.color
  ctx.fillRect(0, 0, width, height)
  ctx.restore()
}

function drawGodRays(
  ctx: CanvasRenderingContext2D,
  effect: EffectState,
  width: number,
  height: number,
  localTime: number,
) {
  const focus = focusPoint(effect, width, height)
  const rgb = hexToRgb(effect.color)
  const alpha = effect.intensity * effect.blend * effect.colorOpacity * 0.22
  const rays = Math.max(6, Math.round(8 + effect.hardness * 10))
  const base = localTime * effect.speed * 0.18 + directionAngle(effect.direction)
  const radius = Math.sqrt(width * width + height * height) * 1.25

  ctx.save()
  ctx.filter = 'none'
  ctx.globalCompositeOperation = 'screen'
  for (let r = 0; r < rays; r++) {
    const angle = base + (r / rays) * Math.PI * 2
    const spread = 0.035 + effect.hardness * 0.045
    const a1 = angle - spread
    const a2 = angle + spread
    const pulse = 0.65 + 0.35 * Math.sin(localTime * effect.speed * 1.7 + r)
    const grad = ctx.createRadialGradient(focus.x, focus.y, 0, focus.x, focus.y, radius)
    grad.addColorStop(0, `rgba(${rgb}, ${alpha * pulse})`)
    grad.addColorStop(0.55, `rgba(${rgb}, ${alpha * 0.35 * pulse})`)
    grad.addColorStop(1, `rgba(${rgb}, 0)`)
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.moveTo(focus.x, focus.y)
    ctx.lineTo(focus.x + Math.cos(a1) * radius, focus.y + Math.sin(a1) * radius)
    ctx.lineTo(focus.x + Math.cos(a2) * radius, focus.y + Math.sin(a2) * radius)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
}

function drawRain(
  ctx: CanvasRenderingContext2D,
  effect: EffectState,
  width: number,
  height: number,
  localTime: number,
) {
  const rgb = hexToRgb(effect.color)
  const drops = Math.max(28, Math.round(45 + effect.hardness * 90))
  const [dx, dy] = directionVector(effect.direction === 'diagonal' ? 'diagonal' : effect.direction)
  const length = Math.max(width, height) * (0.025 + effect.size * 0.08)
  const speed = localTime * effect.speed * (0.65 + effect.hardness * 1.5)
  const alpha = effect.intensity * effect.blend * effect.colorOpacity * 0.42

  ctx.save()
  ctx.filter = 'none'
  ctx.strokeStyle = `rgba(${rgb}, ${alpha})`
  ctx.lineWidth = 1 + effect.size * 2.5
  ctx.lineCap = 'round'

  for (let i = 0; i < drops; i++) {
    const seed = i * 59
    const x = wrap(seededUnit(seed) * width + speed * width * 0.28 * dx, -length, width + length)
    const y = wrap(seededUnit(seed + 9) * height + speed * height * (0.75 + seededUnit(seed + 17) * 0.65), -length, height + length)
    ctx.globalAlpha = 0.38 + seededUnit(seed + 23) * 0.62
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x - dx * length, y - Math.max(0.65, dy) * length)
    ctx.stroke()
  }

  ctx.restore()
}

function drawSnow(
  ctx: CanvasRenderingContext2D,
  effect: EffectState,
  width: number,
  height: number,
  localTime: number,
) {
  const rgb = hexToRgb(effect.color)
  const flakes = Math.max(22, Math.round(34 + effect.hardness * 72))
  const speed = localTime * effect.speed * (0.045 + effect.hardness * 0.12)
  const alphaBase = effect.intensity * effect.blend * effect.colorOpacity

  ctx.save()
  ctx.filter = `blur(${Math.round(effect.size * 1.5)}px)`
  ctx.fillStyle = `rgb(${rgb})`

  for (let i = 0; i < flakes; i++) {
    const seed = i * 71
    const size = 1.2 + effect.size * 7 * (0.35 + seededUnit(seed + 13))
    const fall = (speed * (0.65 + seededUnit(seed + 5) * 0.9) + seededUnit(seed + 19)) % 1
    const x = wrap(seededUnit(seed) * width + Math.sin(localTime * effect.speed * 0.7 + i) * width * 0.035, -size, width + size)
    const y = fall * (height + size * 2) - size
    ctx.globalAlpha = alphaBase * (0.25 + seededUnit(seed + 29) * 0.55)
    ctx.beginPath()
    ctx.arc(x, y, size, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.restore()
}

function focusPoint(effect: EffectState, width: number, height: number) {
  if (effect.target === 'wholeMedia') return { x: width * 0.5, y: height * 0.35 }
  if (effect.target === 'manualFocus') return { x: width * effect.focusX, y: height * effect.focusY }
  return { x: width * 0.5, y: height * 0.42 }
}

function seededUnit(seed: number) {
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

function wrap(value: number, min: number, max: number) {
  const range = max - min
  return ((value - min) % range + range) % range + min
}

function directionVector(direction: MediaEffectDirection): [number, number] {
  if (direction === 'left') return [-1, 0]
  if (direction === 'right') return [1, 0]
  if (direction === 'up') return [0, -1]
  if (direction === 'down') return [0, 1]
  return [0.707, 0.707]
}

function directionAngle(direction: MediaEffectDirection) {
  if (direction === 'left') return Math.PI
  if (direction === 'right') return 0
  if (direction === 'up') return -Math.PI / 2
  if (direction === 'down') return Math.PI / 2
  return -Math.PI / 4
}

function hexToRgb(color: string) {
  const hex = color.startsWith('#') ? color.slice(1) : color
  const full = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  if ([r, g, b].some(v => Number.isNaN(v))) return '255,242,184'
  return `${r},${g},${b}`
}

function clamp01(value: number) {
  return clamp(value, 0, 1)
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function degToRad(deg: number) {
  return deg * Math.PI / 180
}
