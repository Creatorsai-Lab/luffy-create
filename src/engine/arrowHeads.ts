/**
 * Arrow head styles beyond Konva's filled triangle: open chevron, dot, ring,
 * diamond, square and bar. Heads follow the direction of the line at its ends
 * (curves and bends included); the line is shortened under a head so it never
 * shows through a ring or past a flat end.
 */
import type { ArrowHeadStyle } from '../types/editor'

export const ARROW_HEAD_STYLES: ArrowHeadStyle[] = ['triangle', 'open', 'circle', 'ring', 'diamond', 'square', 'bar']

/** Direction (radians) the line travels as it arrives at its end (or, for the start, as it leaves backwards). */
export function headAngle(points: number[], atEnd: boolean): number {
  const n = points.length / 2
  if (n < 2) return 0
  const tip = atEnd ? n - 1 : 0
  const tx = points[tip * 2]
  const ty = points[tip * 2 + 1]
  // The nearest point that is not on top of the tip.
  for (let k = 1; k < n; k++) {
    const i = atEnd ? n - 1 - k : k
    const dx = tx - points[i * 2]
    const dy = ty - points[i * 2 + 1]
    if (Math.hypot(dx, dy) > 0.5) return Math.atan2(dy, dx)
  }
  return 0
}

/** How far the line stops short of a head of this style. */
export function headInset(style: ArrowHeadStyle, length: number, width: number, strokeWidth: number): number {
  switch (style) {
    case 'circle': return width / 2
    case 'ring': return width
    case 'diamond': return length / 2
    case 'square': return width / 2
    case 'bar': return 0
    case 'open': return strokeWidth / 2
    default: return length * 0.6
  }
}

/** The polyline with `start` px cut from its beginning and `end` px from its end. */
export function trimPolyline(points: number[], start: number, end: number): number[] {
  const pts: Array<[number, number]> = []
  for (let i = 0; i < points.length; i += 2) pts.push([points[i], points[i + 1]])
  const cut = (list: Array<[number, number]>, amount: number) => {
    let left = amount
    while (left > 0 && list.length > 1) {
      const [ax, ay] = list[list.length - 1]
      const [bx, by] = list[list.length - 2]
      const seg = Math.hypot(ax - bx, ay - by)
      if (seg > left) {
        const k = (seg - left) / seg
        list[list.length - 1] = [bx + (ax - bx) * k, by + (ay - by) * k]
        return
      }
      list.pop()
      left -= seg
    }
  }
  if (end > 0) cut(pts, end)
  if (start > 0) { pts.reverse(); cut(pts, start); pts.reverse() }
  return pts.flat()
}

/** Draws one head with its tip at (x, y), pointing along `angle`. */
export function drawArrowHead(ctx: CanvasRenderingContext2D, style: ArrowHeadStyle, x: number, y: number, angle: number, length: number, width: number, strokeWidth: number, color: string) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.fillStyle = color
  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(1, strokeWidth)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.setLineDash([])
  const w = width / 2
  ctx.beginPath()
  switch (style) {
    case 'open':
      ctx.moveTo(-length, -w)
      ctx.lineTo(0, 0)
      ctx.lineTo(-length, w)
      ctx.stroke()
      break
    case 'circle':
      ctx.arc(-w, 0, w, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'ring':
      ctx.arc(-w, 0, Math.max(0.5, w - ctx.lineWidth / 2), 0, Math.PI * 2)
      ctx.stroke()
      break
    case 'diamond':
      ctx.moveTo(0, 0)
      ctx.lineTo(-length / 2, -w)
      ctx.lineTo(-length, 0)
      ctx.lineTo(-length / 2, w)
      ctx.closePath()
      ctx.fill()
      break
    case 'square':
      ctx.rect(-width, -w, width, width)
      ctx.fill()
      break
    case 'bar':
      ctx.moveTo(0, -w)
      ctx.lineTo(0, w)
      ctx.stroke()
      break
    default:
      ctx.moveTo(0, 0)
      ctx.lineTo(-length, -w)
      ctx.lineTo(-length, w)
      ctx.closePath()
      ctx.fill()
  }
  ctx.restore()
}
