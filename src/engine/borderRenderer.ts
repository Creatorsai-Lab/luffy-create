import type { BorderFillMode, ImageElement, ShapeElement, VideoElement } from '../types/editor'
import { withOpacity } from './shapeFill'

export type BorderElement = ShapeElement | ImageElement | VideoElement

interface Point {
  x: number
  y: number
}

export function getElementBorderWidth(el: BorderElement): number {
  return el.type === 'shape' ? el.strokeWidth || 0 : el.borderWidth || 0
}

export function getElementBorderColor(el: BorderElement): string {
  return el.type === 'shape' ? (el.stroke || 'transparent') : (el.borderColor || 'transparent')
}

export function isGradientBorderActive(el: BorderElement): boolean {
  return (el.borderFillMode ?? 'solid') === 'linearGradient' || !!el.borderAnimate
}

export function hasElementBorder(el: BorderElement): boolean {
  const width = getElementBorderWidth(el)
  if (width <= 0) return false
  return isGradientBorderActive(el) || getElementBorderColor(el) !== 'transparent'
}

export function borderAnimationAngle(baseAngle: number, speed: number, time: number): number {
  const value = baseAngle + time * speed * 360
  return ((value % 360) + 360) % 360
}

export function borderLinearPoints(width: number, height: number, angle: number): { start: Point; end: Point } {
  const rad = (angle * Math.PI) / 180
  const dx = Math.cos(rad)
  const dy = Math.sin(rad)
  const len = Math.abs(width * dx) + Math.abs(height * dy)
  const cx = width / 2
  const cy = height / 2
  return {
    start: { x: cx - dx * len / 2, y: cy - dy * len / 2 },
    end: { x: cx + dx * len / 2, y: cy + dy * len / 2 },
  }
}

export function borderKonvaStrokeProps(el: BorderElement, width: number, height: number, time = 0) {
  const strokeWidth = getElementBorderWidth(el)
  if (strokeWidth <= 0) return { stroke: 'transparent', strokeWidth: 0 }

  if (!isGradientBorderActive(el)) {
    return { stroke: getElementBorderColor(el), strokeWidth }
  }

  const from = borderGradientFrom(el)
  const to = borderGradientTo(el)
  const angle = borderEffectiveAngle(el, time)
  const { start, end } = borderLinearPoints(width, height, angle)
  return {
    stroke: undefined,
    strokeWidth,
    strokeLinearGradientStartPoint: start,
    strokeLinearGradientEndPoint: end,
    strokeLinearGradientColorStops: el.borderAnimate
      ? [0, from, 0.35, to, 0.7, from, 1, to]
      : [0, from, 1, to],
  }
}

export function borderCanvasStrokeStyle(
  ctx: CanvasRenderingContext2D,
  el: BorderElement,
  width: number,
  height: number,
  time = 0,
): string | CanvasGradient {
  if (!isGradientBorderActive(el)) return getElementBorderColor(el)

  const from = borderGradientFrom(el)
  const to = borderGradientTo(el)

  if (el.borderAnimate && typeof ctx.createConicGradient === 'function') {
    const angle = ((borderEffectiveAngle(el, time) - 90) * Math.PI) / 180
    const gradient = ctx.createConicGradient(angle, width / 2, height / 2)
    gradient.addColorStop(0, from)
    gradient.addColorStop(0.25, to)
    gradient.addColorStop(0.5, from)
    gradient.addColorStop(0.75, to)
    gradient.addColorStop(1, from)
    return gradient
  }

  const { start, end } = borderLinearPoints(width, height, borderEffectiveAngle(el, time))
  const gradient = ctx.createLinearGradient(start.x, start.y, end.x, end.y)
  gradient.addColorStop(0, from)
  gradient.addColorStop(1, to)
  return gradient
}

export function drawMediaBorder(
  ctx: CanvasRenderingContext2D,
  el: ImageElement | VideoElement,
  width: number,
  height: number,
  time = 0,
  frame: 'none' | 'circle' | 'triangle' = 'none',
) {
  if (!hasElementBorder(el)) return
  const borderWidth = getElementBorderWidth(el)
  const inset = borderWidth / 2

  ctx.save()
  ctx.filter = 'none'
  ctx.globalCompositeOperation = 'source-over'
  ctx.strokeStyle = borderCanvasStrokeStyle(ctx, el, width, height, time)
  ctx.lineWidth = borderWidth
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  if (frame === 'circle') {
    ctx.beginPath()
    ctx.arc(width / 2, height / 2, Math.max(0, Math.min(width, height) / 2 - inset), 0, Math.PI * 2)
  } else if (frame === 'triangle') {
    ctx.beginPath()
    ctx.moveTo(width / 2, inset)
    ctx.lineTo(width - inset, height - inset)
    ctx.lineTo(inset, height - inset)
    ctx.closePath()
  } else {
    roundedRectPath(ctx, inset, inset, Math.max(0, width - borderWidth), Math.max(0, height - borderWidth), Math.max(0, el.cornerRadius - inset))
  }
  ctx.stroke()
  ctx.restore()
}

export function drawPerspectiveQuadBorder(
  ctx: CanvasRenderingContext2D,
  el: BorderElement,
  time = 0,
) {
  if (!el.perspectivePts || !hasElementBorder(el)) return
  const borderWidth = getElementBorderWidth(el)
  const pts = el.perspectivePts
  ctx.save()
  ctx.filter = 'none'
  ctx.strokeStyle = borderCanvasStrokeStyle(ctx, el, el.width, el.height, time)
  ctx.lineWidth = borderWidth
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(pts.tl[0], pts.tl[1])
  ctx.lineTo(pts.tr[0], pts.tr[1])
  ctx.lineTo(pts.br[0], pts.br[1])
  ctx.lineTo(pts.bl[0], pts.bl[1])
  ctx.closePath()
  ctx.stroke()
  ctx.restore()
}

function borderEffectiveAngle(el: BorderElement, time: number): number {
  const base = el.borderGradientAngle ?? 135
  if (!el.borderAnimate) return base
  return borderAnimationAngle(base, el.borderAnimationSpeed ?? 1, time)
}

function borderGradientFrom(el: BorderElement): string {
  return withOpacity(el.borderGradientFrom || getElementBorderColor(el) || '#ffffff', 1)
}

function borderGradientTo(el: BorderElement): string {
  return withOpacity(el.borderGradientTo || '#22d3ee', 1)
}

function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2))
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
}

export function borderFillModeOrDefault(value: BorderFillMode | undefined): BorderFillMode {
  return value ?? 'solid'
}
