import type { ShapeElement } from '../types/editor'

export function shapeFillProps(el: ShapeElement, width: number, height: number) {
  const from = el.gradientFrom ?? (el.fill === 'transparent' ? '#6366f1' : el.fill)
  const to = el.gradientTo ?? '#22d3ee'
  if ((el.fillMode ?? 'solid') === 'linearGradient') {
    const { start, end } = linearPoints(width, height, el.gradientAngle ?? 135)
    return {
      fill: undefined,
      fillLinearGradientStartPoint: start,
      fillLinearGradientEndPoint: end,
      fillLinearGradientColorStops: [
        0,
        withOpacity(from, el.gradientFromOpacity ?? 1),
        1,
        withOpacity(to, el.gradientToOpacity ?? 1),
      ],
    }
  }

  if ((el.fillMode ?? 'solid') === 'radialGradient') {
    return {
      fill: undefined,
      fillRadialGradientStartPoint: { x: width / 2, y: height / 2 },
      fillRadialGradientStartRadius: 0,
      fillRadialGradientEndPoint: { x: width / 2, y: height / 2 },
      fillRadialGradientEndRadius: Math.max(width, height) / 2,
      fillRadialGradientColorStops: [
        0,
        withOpacity(from, el.gradientFromOpacity ?? 1),
        1,
        withOpacity(to, el.gradientToOpacity ?? 1),
      ],
    }
  }

  return { fill: withOpacity(el.fill, el.fillOpacity ?? 1) }
}

export function shapeCanvasFill(ctx: CanvasRenderingContext2D, el: ShapeElement, width: number, height: number): string | CanvasGradient {
  const from = el.gradientFrom ?? (el.fill === 'transparent' ? '#6366f1' : el.fill)
  const to = el.gradientTo ?? '#22d3ee'
  if ((el.fillMode ?? 'solid') === 'linearGradient') {
    const { start, end } = linearPoints(width, height, el.gradientAngle ?? 135)
    const gradient = ctx.createLinearGradient(start.x, start.y, end.x, end.y)
    gradient.addColorStop(0, withOpacity(from, el.gradientFromOpacity ?? 1))
    gradient.addColorStop(1, withOpacity(to, el.gradientToOpacity ?? 1))
    return gradient
  }

  if ((el.fillMode ?? 'solid') === 'radialGradient') {
    const gradient = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height) / 2)
    gradient.addColorStop(0, withOpacity(from, el.gradientFromOpacity ?? 1))
    gradient.addColorStop(1, withOpacity(to, el.gradientToOpacity ?? 1))
    return gradient
  }

  return withOpacity(el.fill, el.fillOpacity ?? 1)
}

export function withOpacity(color: string, opacity: number) {
  if (color === 'transparent') return 'rgba(0,0,0,0)'
  const match = color.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!match) return color
  const hex = match[1].length === 3
    ? match[1].split('').map(ch => ch + ch).join('')
    : match[1]
  const alpha = Math.max(0, Math.min(1, opacity))
  return `rgba(${parseInt(hex.slice(0, 2), 16)},${parseInt(hex.slice(2, 4), 16)},${parseInt(hex.slice(4, 6), 16)},${alpha})`
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
