import type { BoxShadow, InnerShadow } from '../types/editor'

export function boxShadowOrDefault(shadow?: BoxShadow): BoxShadow {
  return {
    enabled: shadow?.enabled ?? false,
    color: shadow?.color ?? '#000000',
    opacity: shadow?.opacity ?? 0.35,
    blur: shadow?.blur ?? 28,
    spread: shadow?.spread ?? 0,
    angle: shadow?.angle ?? 135,
    distance: shadow?.distance ?? 18,
  }
}

export function hasBoxShadow(shadow?: BoxShadow): boolean {
  const s = boxShadowOrDefault(shadow)
  return s.enabled && s.opacity > 0 && (s.blur > 0 || s.distance !== 0 || s.spread !== 0)
}

export function drawBoxShadow(
  ctx: CanvasRenderingContext2D,
  shadow: BoxShadow | undefined,
  width: number,
  height: number,
  cornerRadius = 0,
) {
  const s = boxShadowOrDefault(shadow)
  if (!hasBoxShadow(s)) return

  const { x: ox, y: oy } = shadowOffset(s.angle, s.distance)
  const color = toRgba(s.color, s.opacity)
  const maxInset = Math.max(0, Math.min(width, height) / 2 - 1)
  const spread = Math.max(-maxInset, s.spread)

  ctx.save()
  ctx.filter = 'none'
  ctx.globalCompositeOperation = 'source-over'

  ctx.shadowColor = color
  ctx.shadowBlur = s.blur
  ctx.shadowOffsetX = ox
  ctx.shadowOffsetY = oy
  ctx.fillStyle = color
  roundedRectPath(ctx, -spread, -spread, width + spread * 2, height + spread * 2, cornerRadius + spread)
  ctx.fill()

  ctx.restore()
}

export function innerShadowOrDefault(shadow?: InnerShadow): InnerShadow {
  return {
    enabled: shadow?.enabled ?? false,
    color: shadow?.color ?? '#000000',
    opacity: shadow?.opacity ?? 0.35,
    blur: shadow?.blur ?? 18,
    angle: shadow?.angle ?? 135,
    distance: shadow?.distance ?? 10,
  }
}

export function hasInnerShadow(shadow?: InnerShadow): boolean {
  const s = innerShadowOrDefault(shadow)
  return s.enabled && s.opacity > 0 && (s.blur > 0 || s.distance > 0)
}

export function drawInnerShadow(
  ctx: CanvasRenderingContext2D,
  shadow: InnerShadow | undefined,
  width: number,
  height: number,
  cornerRadius = 0,
) {
  const s = innerShadowOrDefault(shadow)
  if (!hasInnerShadow(s)) return

  const { x: ox, y: oy } = shadowOffset(s.angle, s.distance)
  const color = toRgba(s.color, s.opacity)
  const feather = Math.max(1, s.blur + s.distance)

  ctx.save()
  roundedRectPath(ctx, 0, 0, width, height, cornerRadius)
  ctx.clip()
  ctx.filter = 'none'
  ctx.globalCompositeOperation = 'source-over'

  drawEdgeGradient(ctx, 'left', Math.max(0, feather + Math.max(0, -ox)), color, width, height)
  drawEdgeGradient(ctx, 'right', Math.max(0, feather + Math.max(0, ox)), color, width, height)
  drawEdgeGradient(ctx, 'top', Math.max(0, feather + Math.max(0, -oy)), color, width, height)
  drawEdgeGradient(ctx, 'bottom', Math.max(0, feather + Math.max(0, oy)), color, width, height)

  ctx.restore()
}

function drawEdgeGradient(
  ctx: CanvasRenderingContext2D,
  edge: 'left' | 'right' | 'top' | 'bottom',
  size: number,
  color: string,
  width: number,
  height: number,
) {
  if (size <= 0) return
  if (edge === 'left') {
    const g = ctx.createLinearGradient(0, 0, size, 0)
    g.addColorStop(0, color)
    g.addColorStop(1, transparent(color))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, Math.min(size, width), height)
  } else if (edge === 'right') {
    const g = ctx.createLinearGradient(width, 0, width - size, 0)
    g.addColorStop(0, color)
    g.addColorStop(1, transparent(color))
    ctx.fillStyle = g
    ctx.fillRect(Math.max(0, width - size), 0, Math.min(size, width), height)
  } else if (edge === 'top') {
    const g = ctx.createLinearGradient(0, 0, 0, size)
    g.addColorStop(0, color)
    g.addColorStop(1, transparent(color))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, width, Math.min(size, height))
  } else {
    const g = ctx.createLinearGradient(0, height, 0, height - size)
    g.addColorStop(0, color)
    g.addColorStop(1, transparent(color))
    ctx.fillStyle = g
    ctx.fillRect(0, Math.max(0, height - size), width, Math.min(size, height))
  }
}

function transparent(rgba: string) {
  return rgba.replace(/rgba\((\d+),(\d+),(\d+),[^)]+\)/, 'rgba($1,$2,$3,0)')
}

function shadowOffset(angle: number, distance: number) {
  const rad = (angle * Math.PI) / 180
  return {
    x: Math.cos(rad) * distance,
    y: Math.sin(rad) * distance,
  }
}

function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.max(0, Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2))
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
}

function toRgba(color: string, alpha: number) {
  const a = Math.max(0, Math.min(1, alpha))
  const parsed = parseHex(color)
  if (!parsed) return `rgba(0,0,0,${a})`
  return `rgba(${parsed.r},${parsed.g},${parsed.b},${a})`
}

function parseHex(color: string) {
  const match = color.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!match) return null
  const hex = match[1].length === 3
    ? match[1].split('').map(ch => ch + ch).join('')
    : match[1]
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  }
}
