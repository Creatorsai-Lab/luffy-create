import type { TextElement } from '../types/editor'
import { withOpacity } from './shapeFill'

export function textFillProps(el: TextElement, width: number) {
  if ((el.fillMode ?? 'solid') !== 'linearGradient') return { fill: el.color }
  const stops: Array<number | string> = [
    0,
    withOpacity(el.gradientColor1 ?? el.color, el.gradientOpacity1 ?? 1),
  ]
  if (el.gradientUseColor3) {
    stops.push(0.5, withOpacity(el.gradientColor3 ?? '#22d3ee', el.gradientOpacity3 ?? 1))
  }
  stops.push(1, withOpacity(el.gradientColor2 ?? '#8b5cf6', el.gradientOpacity2 ?? 1))
  return {
    fillPriority: 'linear-gradient' as const,
    fillLinearGradientStartPoint: { x: 0, y: 0 },
    fillLinearGradientEndPoint: { x: Math.max(1, width), y: 0 },
    fillLinearGradientColorStops: stops,
  }
}

export function textCanvasFill(ctx: CanvasRenderingContext2D, el: TextElement, width: number, height: number): string | CanvasGradient {
  if ((el.fillMode ?? 'solid') !== 'linearGradient') return el.color
  void height
  const gradient = ctx.createLinearGradient(0, 0, Math.max(1, width), 0)
  gradient.addColorStop(0, withOpacity(el.gradientColor1 ?? el.color, el.gradientOpacity1 ?? 1))
  if (el.gradientUseColor3) {
    gradient.addColorStop(0.5, withOpacity(el.gradientColor3 ?? '#22d3ee', el.gradientOpacity3 ?? 1))
  }
  gradient.addColorStop(1, withOpacity(el.gradientColor2 ?? '#8b5cf6', el.gradientOpacity2 ?? 1))
  return gradient
}
