import type { TextElement } from '../types/editor'
import { withOpacity } from './shapeFill'

export function textFillProps(el: TextElement, width: number) {
  if ((el.fillMode ?? 'solid') !== 'linearGradient') return { fill: el.color }
  const { start, end } = linearPoints(width, Math.max(1, el.height || el.fontSize * el.lineHeight), 135)
  const stops: Array<number | string> = [
    0,
    withOpacity(el.gradientColor1 ?? el.color, el.gradientOpacity1 ?? 1),
  ]
  if (el.gradientUseColor3) {
    stops.push(0.5, withOpacity(el.gradientColor3 ?? '#22d3ee', el.gradientOpacity3 ?? 1))
  }
  stops.push(1, withOpacity(el.gradientColor2 ?? '#8b5cf6', el.gradientOpacity2 ?? 1))
  return {
    fill: undefined,
    fillLinearGradientStartPoint: start,
    fillLinearGradientEndPoint: end,
    fillLinearGradientColorStops: stops,
  }
}

export function textCanvasFill(ctx: CanvasRenderingContext2D, el: TextElement, width: number, height: number): string | CanvasGradient {
  if ((el.fillMode ?? 'solid') !== 'linearGradient') return el.color
  const { start, end } = linearPoints(width, Math.max(1, height), 135)
  const gradient = ctx.createLinearGradient(start.x, start.y, end.x, end.y)
  gradient.addColorStop(0, withOpacity(el.gradientColor1 ?? el.color, el.gradientOpacity1 ?? 1))
  if (el.gradientUseColor3) {
    gradient.addColorStop(0.5, withOpacity(el.gradientColor3 ?? '#22d3ee', el.gradientOpacity3 ?? 1))
  }
  gradient.addColorStop(1, withOpacity(el.gradientColor2 ?? '#8b5cf6', el.gradientOpacity2 ?? 1))
  return gradient
}

function linearPoints(width: number, height: number, angle: number) {
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
