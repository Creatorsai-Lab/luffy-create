import type { TextElement } from '../types/editor'

export function textFillProps(el: TextElement, width: number) {
  if ((el.fillMode ?? 'solid') !== 'linearGradient') return { fill: el.color }
  const { start, end } = linearPoints(width, Math.max(1, el.height || el.fontSize * el.lineHeight), 135)
  const stops: Array<number | string> = [0, el.gradientColor1 ?? el.color]
  if (el.gradientUseColor3) stops.push(0.5, el.gradientColor3 ?? '#22d3ee')
  stops.push(1, el.gradientColor2 ?? '#8b5cf6')
  return {
    fill: undefined,
    fillLinearGradientStartPoint: start,
    fillLinearGradientEndPoint: end,
    fillLinearGradientColorStops: stops,
  }
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
