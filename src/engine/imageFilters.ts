export interface AdjustableElement {
  width: number
  height: number
  brightness?: number   // 0-200
  contrast?: number     // 0-200
  saturation?: number   // 0-200
  hueRotate?: number    // -180 to 180
  blur?: number         // 0-20
  glass?: boolean
  exposure?: number     // -100 to 100
  vibrance?: number     // -100 to 100
  temperature?: number  // -100 to 100
  tint?: number         // -100 to 100
  highlights?: number   // -100 to 100
  shadows?: number      // -100 to 100
  whites?: number       // -100 to 100
  blacks?: number       // -100 to 100
  vignetteEnabled?: boolean
  vignetteColor?: string
  vignetteAmount?: number
  vignetteSize?: number
  vignetteFade?: number
}

export function buildCssFilter(el: AdjustableElement): string {
  const parts: string[] = []
  const brightnessMult = ((el.brightness ?? 100) / 100) * Math.pow(2, (el.exposure ?? 0) / 100 * 2.5)
  const satMult = ((el.saturation ?? 100) / 100) * Math.max(0.01, 1 + (el.vibrance ?? 0) / 200)
  const contrast  = el.contrast  ?? 100
  const hueRotate = el.hueRotate ?? 0
  const blur      = el.blur      ?? 0
  if (Math.abs(brightnessMult - 1) > 0.001) parts.push(`brightness(${brightnessMult})`)
  if (contrast  !== 100) parts.push(`contrast(${contrast / 100})`)
  if (Math.abs(satMult - 1) > 0.001) parts.push(`saturate(${satMult})`)
  if (hueRotate !== 0)   parts.push(`hue-rotate(${hueRotate}deg)`)
  if (blur      !== 0)   parts.push(`blur(${blur}px)`)
  if (el.glass)          parts.push('blur(8px)')
  return parts.join(' ')
}

export function applyCanvasAdjustments(ctx: CanvasRenderingContext2D, el: AdjustableElement) {
  ctx.filter = 'none'
  const temp = el.temperature ?? 0
  const tint = el.tint        ?? 0
  const hl   = el.highlights  ?? 0
  const sh   = el.shadows     ?? 0
  const wh   = el.whites      ?? 0
  const bl   = el.blacks      ?? 0

  if (temp !== 0) {
    ctx.globalCompositeOperation = 'overlay'
    ctx.fillStyle = temp > 0 ? `rgba(255,160,50,${Math.abs(temp)/500})` : `rgba(50,120,255,${Math.abs(temp)/500})`
    ctx.fillRect(0, 0, el.width, el.height)
  }
  if (tint !== 0) {
    ctx.globalCompositeOperation = 'overlay'
    ctx.fillStyle = tint > 0 ? `rgba(255,0,200,${Math.abs(tint)/500})` : `rgba(0,200,0,${Math.abs(tint)/500})`
    ctx.fillRect(0, 0, el.width, el.height)
  }
  if (hl > 0) {
    ctx.globalCompositeOperation = 'screen'
    ctx.fillStyle = `rgba(255,255,255,${hl/500})`
    ctx.fillRect(0, 0, el.width, el.height)
  } else if (hl < 0) {
    ctx.globalCompositeOperation = 'multiply'
    ctx.fillStyle = `rgba(200,200,200,${-hl/500})`
    ctx.fillRect(0, 0, el.width, el.height)
  }
  if (wh > 0) {
    ctx.globalCompositeOperation = 'screen'
    ctx.fillStyle = `rgba(255,255,255,${wh/600})`
    ctx.fillRect(0, 0, el.width, el.height)
  } else if (wh < 0) {
    ctx.globalCompositeOperation = 'multiply'
    ctx.fillStyle = `rgba(220,220,220,${-wh/600})`
    ctx.fillRect(0, 0, el.width, el.height)
  }
  if (sh > 0) {
    ctx.globalCompositeOperation = 'screen'
    ctx.fillStyle = `rgba(80,80,80,${sh/500})`
    ctx.fillRect(0, 0, el.width, el.height)
  } else if (sh < 0) {
    ctx.globalCompositeOperation = 'multiply'
    ctx.fillStyle = `rgba(150,150,150,${-sh/500})`
    ctx.fillRect(0, 0, el.width, el.height)
  }
  if (bl > 0) {
    ctx.globalCompositeOperation = 'multiply'
    ctx.fillStyle = `rgba(0,0,0,${bl/500})`
    ctx.fillRect(0, 0, el.width, el.height)
  } else if (bl < 0) {
    ctx.globalCompositeOperation = 'screen'
    ctx.fillStyle = `rgba(50,50,50,${-bl/500})`
    ctx.fillRect(0, 0, el.width, el.height)
  }
  ctx.globalCompositeOperation = 'source-over'
}

export function getVignetteStops(size: number, fade: number) {
  return {
    inner: 0.18 + (1 - clamp01(size)) * 0.55,
    fadeStart: 0.98 - clamp01(fade) * 0.85,
  }
}

export function drawVignette(ctx: CanvasRenderingContext2D, el: AdjustableElement) {
  const amount = clamp01(el.vignetteAmount ?? 0.5)
  if (!el.vignetteEnabled || amount <= 0) return

  const [r, g, b] = hexToRgb(el.vignetteColor ?? '#000000')
  const { inner, fadeStart } = getVignetteStops(el.vignetteSize ?? 0.5, el.vignetteFade ?? 0.65)
  const cx = el.width / 2
  const cy = el.height / 2
  const outer = Math.hypot(cx, cy)
  const gradient = ctx.createRadialGradient(cx, cy, outer * inner, cx, cy, outer)

  gradient.addColorStop(0, `rgba(${r},${g},${b},0)`)
  gradient.addColorStop(fadeStart, `rgba(${r},${g},${b},0)`)
  gradient.addColorStop(1, `rgba(${r},${g},${b},${amount})`)

  ctx.save()
  ctx.filter = 'none'
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, el.width, el.height)
  ctx.restore()
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function hexToRgb(color: string): [number, number, number] {
  if (color.toLowerCase() === 'white') return [255, 255, 255]
  const hex = color.replace('#', '')
  const value = hex.length === 3
    ? hex.split('').map(char => char + char).join('')
    : hex.padEnd(6, '0').slice(0, 6)
  const parsed = Number.parseInt(value, 16)
  return Number.isFinite(parsed)
    ? [(parsed >> 16) & 255, (parsed >> 8) & 255, parsed & 255]
    : [0, 0, 0]
}
