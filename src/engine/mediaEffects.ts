import type { ImageElement, MediaEffectDirection, MediaEffectTarget, MediaEffectType, VideoElement } from '../types/editor'

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
}

export function mediaEffectRequiresAnimation(el: MediaElement) {
  return resolveMediaEffect(el).type !== 'none'
}

export function drawMediaWithEffect(
  ctx: CanvasRenderingContext2D,
  el: MediaElement,
  width: number,
  height: number,
  localTime: number,
  fns: MediaDrawFns,
) {
  const effect = resolveMediaEffect(el)
  if (effect.type === 'none' || effect.intensity <= 0) {
    fns.drawBase(ctx, 0, 0, width, height)
    return
  }

  ctx.save()
  applyMotionTransform(ctx, effect, width, height, localTime)

  if (effect.type === 'vibrationDistort') {
    drawVibrationDistort(ctx, effect, width, height, localTime, fns)
  } else if (effect.type === 'glitch') {
    drawGlitch(ctx, effect, width, height, localTime, fns)
  } else if (effect.type === 'motionBlur') {
    drawMotionBlur(ctx, effect, width, height, fns)
  } else {
    fns.drawBase(ctx, 0, 0, width, height)
  }

  ctx.restore()

  if (effect.type === 'godRays') drawGodRays(ctx, effect, width, height, localTime)
  if (effect.type === 'lightSweep') drawLightSweep(ctx, effect, width, height, localTime)
  if (effect.type === 'cloudy') drawCloudy(ctx, effect, width, height, localTime)
  if (effect.type === 'smoke') drawSmoke(ctx, effect, width, height, localTime)
  if (effect.type === 'rain') drawRain(ctx, effect, width, height, localTime)
  if (effect.type === 'snow') drawSnow(ctx, effect, width, height, localTime)
}

function resolveMediaEffect(el: MediaElement): EffectState {
  const legacyVideo = el.type === 'video' ? el.videoEffect : undefined
  const mediaEffect = el.mediaEffect ?? 'none'
  const type = mediaEffect !== 'none'
    ? mediaEffect
    : legacyVideo === 'shake'
      ? 'shake'
      : legacyVideo === 'distortion'
        ? 'vibrationDistort'
        : 'none'

  return {
    type,
    intensity: clamp01(el.mediaEffectIntensity ?? (el.type === 'video' ? el.videoEffectIntensity : undefined) ?? 0.45),
    speed: clamp(el.mediaEffectSpeed ?? 1, 0.1, 5),
    hardness: clamp01(el.mediaEffectHardness ?? 0.5),
    direction: el.mediaEffectDirection ?? 'diagonal',
    blend: clamp01(el.mediaEffectBlend ?? 0.55),
    color: el.mediaEffectColor ?? '#fff2b8',
    colorOpacity: clamp01(el.mediaEffectColorOpacity ?? 1),
    size: clamp01(el.mediaEffectSize ?? 0.5),
    target: el.mediaEffectTarget ?? 'centerSubject',
    focusX: clamp01(el.mediaEffectFocusX ?? 0.5),
    focusY: clamp01(el.mediaEffectFocusY ?? 0.5),
  }
}

function applyMotionTransform(
  ctx: CanvasRenderingContext2D,
  effect: EffectState,
  width: number,
  height: number,
  localTime: number,
) {
  const t = localTime * effect.speed
  const i = effect.intensity
  const h = 0.35 + effect.hardness * 0.65

  if (effect.type === 'subtleHover') {
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

function drawMotionBlur(
  ctx: CanvasRenderingContext2D,
  effect: EffectState,
  width: number,
  height: number,
  fns: MediaDrawFns,
) {
  const [dx, dy] = directionVector(effect.direction)
  const amount = (10 + effect.hardness * 28) * effect.intensity
  const passes = Math.max(3, Math.round(4 + effect.hardness * 6))
  const prevAlpha = ctx.globalAlpha

  for (let p = passes; p >= 1; p--) {
    const k = p / passes
    ctx.globalAlpha = prevAlpha * effect.blend * 0.18 * k
    fns.drawBase(ctx, -dx * amount * k, -dy * amount * k, width, height)
  }

  ctx.globalAlpha = prevAlpha
  fns.drawBase(ctx, 0, 0, width, height)
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
  const burst = Math.max(0, Math.sin(t * 8.2) * 0.65 + Math.sin(t * 19.7) * 0.35)
  const strength = effect.intensity * (0.35 + effect.hardness * 0.65) * (0.35 + burst)
  const channel = (4 + effect.size * 28) * strength

  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  ctx.globalAlpha = 0.48 * effect.blend
  ctx.filter = 'none'
  fns.drawBase(ctx, -channel, 0, width, height)
  ctx.globalAlpha = 0.34 * effect.blend
  fns.drawBase(ctx, channel, Math.sin(t * 23) * channel * 0.25, width, height)
  ctx.restore()

  if (!fns.drawSlice) return

  const slices = Math.max(5, Math.round(6 + effect.hardness * 16))
  const maxOffset = (10 + effect.size * 46) * strength
  for (let s = 0; s < slices; s++) {
    const seed = seededUnit(s * 41 + Math.floor(t * 10))
    if (seed < 0.38) continue
    const sliceH = Math.max(4, height * (0.012 + seededUnit(s * 83) * 0.045))
    const y = seededUnit(s * 131 + Math.floor(t * 6)) * Math.max(1, height - sliceH)
    const offset = (seededUnit(s * 17 + Math.floor(t * 12)) - 0.5) * maxOffset * 2
    fns.drawSlice(ctx, y, sliceH, offset, y, width, sliceH)
  }
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

function drawCloudy(
  ctx: CanvasRenderingContext2D,
  effect: EffectState,
  width: number,
  height: number,
  localTime: number,
) {
  const rgb = hexToRgb(effect.color)
  const focus = focusPoint(effect, width, height)
  const count = Math.max(5, Math.round(7 + effect.hardness * 9))
  const baseRadius = Math.max(width, height) * (0.08 + effect.size * 0.16)
  const drift = localTime * effect.speed * (20 + effect.hardness * 42)

  ctx.save()
  ctx.filter = `blur(${Math.round(10 + effect.size * 26)}px)`
  ctx.globalCompositeOperation = 'screen'

  for (let i = 0; i < count; i++) {
    const seed = i * 97
    const radius = baseRadius * (0.55 + seededUnit(seed) * 0.9)
    const band = (i / count - 0.5) * height * 0.78
    const x = wrap(focus.x + (seededUnit(seed + 7) - 0.5) * width * 0.95 + drift * (0.45 + seededUnit(seed + 11)), -radius, width + radius)
    const y = focus.y + band + Math.sin(localTime * effect.speed * 0.45 + i) * height * 0.035
    const alpha = effect.intensity * effect.blend * effect.colorOpacity * (0.045 + seededUnit(seed + 19) * 0.075)
    const grad = ctx.createRadialGradient(x, y, 0, x, y, radius)
    grad.addColorStop(0, `rgba(${rgb}, ${alpha})`)
    grad.addColorStop(0.62, `rgba(${rgb}, ${alpha * 0.45})`)
    grad.addColorStop(1, `rgba(${rgb}, 0)`)
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.restore()
}

function drawSmoke(
  ctx: CanvasRenderingContext2D,
  effect: EffectState,
  width: number,
  height: number,
  localTime: number,
) {
  const rgb = hexToRgb(effect.color)
  const focus = focusPoint(effect, width, height)
  const count = Math.max(8, Math.round(10 + effect.hardness * 16))
  const baseRadius = Math.max(width, height) * (0.035 + effect.size * 0.12)

  ctx.save()
  ctx.filter = `blur(${Math.round(12 + effect.size * 34)}px)`
  ctx.globalCompositeOperation = 'source-over'

  for (let i = 0; i < count; i++) {
    const seed = i * 113
    const cycle = ((localTime * effect.speed * (0.09 + effect.hardness * 0.18) + seededUnit(seed)) % 1 + 1) % 1
    const side = seededUnit(seed + 5) - 0.5
    const wave = Math.sin(cycle * Math.PI * 2 + i) * width * 0.06 * effect.hardness
    const x = focus.x + side * width * 0.52 + wave
    const y = height + baseRadius - cycle * (height + baseRadius * 2)
    const radius = baseRadius * (0.75 + cycle * 1.75 + seededUnit(seed + 17) * 0.55)
    const alpha = effect.intensity * effect.blend * effect.colorOpacity * (1 - cycle) * 0.16
    const grad = ctx.createRadialGradient(x, y, 0, x, y, radius)
    grad.addColorStop(0, `rgba(${rgb}, ${alpha})`)
    grad.addColorStop(0.55, `rgba(${rgb}, ${alpha * 0.42})`)
    grad.addColorStop(1, `rgba(${rgb}, 0)`)
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
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
