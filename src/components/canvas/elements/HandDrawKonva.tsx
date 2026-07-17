import { Group, Shape } from 'react-konva'
import type Konva from 'konva'
import type { HandDrawElement, HandDrawStroke } from '../../../types/editor'

interface Props {
  el: HandDrawElement
  konvaProps: Konva.GroupConfig
}

function parseHexColor(color: string) {
  const hex = color.trim()
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return null
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  }
}

function colorWithAlpha(color: string, alpha: number) {
  const rgb = parseHexColor(color)
  if (rgb) {
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${Math.max(0, Math.min(1, alpha))})`
  }
  return color
}

function smoothStep(edge0: number, edge1: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function drawDot(raw: CanvasRenderingContext2D, stroke: HandDrawStroke) {
  if (stroke.points.length < 2) return
  const [x, y] = stroke.points
  raw.beginPath()
  raw.arc(x, y, Math.max(0.5, stroke.width / 2), 0, Math.PI * 2)
  if (stroke.tool === 'eraser') raw.fill()
  else {
    raw.fillStyle = stroke.color
    
    raw.fill()
  }
}

function seededNoise(seed: number) {
  const next = Math.sin(seed * 12.9898) * 43758.5453
  return next - Math.floor(next)
}

function traceSmoothPath(raw: CanvasRenderingContext2D, points: number[]) {
  if (points.length < 2) return
  raw.beginPath()
  raw.moveTo(points[0], points[1])
  if (points.length < 4) {
    raw.lineTo(points[0], points[1])
    return
  }
  for (let i = 2; i < points.length; i += 2) {
    const x = points[i]
    const y = points[i + 1]
    const prevX = points[i - 2]
    const prevY = points[i - 1]
    raw.quadraticCurveTo(prevX, prevY, (prevX + x) / 2, (prevY + y) / 2)
  }
}

function samplePathPoints(points: number[], spacing: number) {
  const samples: Array<{ x: number; y: number; index: number }> = []
  let index = 0
  for (let i = 2; i < points.length; i += 2) {
    const x1 = points[i - 2]
    const y1 = points[i - 1]
    const x2 = points[i]
    const y2 = points[i + 1]
    const distance = Math.max(1, Math.hypot(x2 - x1, y2 - y1))
    const count = Math.max(1, Math.ceil(distance / spacing))
    for (let j = 0; j < count; j++) {
      const t = j / count
      samples.push({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t, index: index++ })
    }
  }
  if (points.length >= 2) {
    samples.push({ x: points[points.length - 2], y: points[points.length - 1], index })
  }
  return samples
}

function drawPaintGrain(raw: CanvasRenderingContext2D, stroke: HandDrawStroke) {
  raw.save()
  raw.globalCompositeOperation = 'source-over'
  const grainColor = stroke.grainColor ?? '#ffffff'
  const samples = stroke.points.length < 4
    ? [{ x: stroke.points[0], y: stroke.points[1], index: 0 }]
    : samplePathPoints(stroke.points, Math.max(1.2, stroke.width * 0.18))
  const grainsPerSample = Math.max(1, Math.min(4, Math.round(stroke.width / 9)))

  for (const sample of samples) {
    for (let j = 0; j < grainsPerSample; j++) {
      const seed = (sample.index + 1) * 97 + j * 29
      const angle = seededNoise(seed) * Math.PI * 2
      const dist = Math.pow(seededNoise(seed + 3), 0.58) * stroke.width * 0.46
      const gx = sample.x + Math.cos(angle) * dist
      const gy = sample.y + Math.sin(angle) * dist
      const radius = Math.max(0.16, stroke.width * (0.005 + seededNoise(seed + 7) * 0.014))
      raw.fillStyle = colorWithAlpha(grainColor, stroke.opacity * (0.2 + seededNoise(seed + 11) * 0.28))
      raw.beginPath()
      raw.arc(gx, gy, radius, 0, Math.PI * 2)
      raw.fill()
    }
  }

  raw.restore()
}

function drawLineStroke(raw: CanvasRenderingContext2D, stroke: HandDrawStroke) {
  if (stroke.points.length < 2) return
  raw.save()
  raw.globalAlpha = stroke.opacity
  raw.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over'
  raw.strokeStyle = stroke.color
  raw.lineWidth = stroke.width
  raw.lineCap = 'round'
  raw.lineJoin = 'round'

  if (stroke.tool === 'paint') {
    raw.shadowColor = colorWithAlpha(stroke.color, Math.min(1, stroke.opacity * 2.2))
    raw.shadowBlur = Math.max(2, stroke.width * 0.25)
  }

  if (stroke.tool === 'eraser') {
    const hardness = Math.max(0.05, Math.min(1, stroke.hardness ?? 0.75))
    raw.globalAlpha = hardness
  }

  if (stroke.points.length < 4) {
    drawDot(raw, stroke)
    raw.restore()
    return
  }

  traceSmoothPath(raw, stroke.points)
  raw.stroke()
  raw.restore()

  if (stroke.tool === 'paint') {
    drawPaintGrain(raw, stroke)
  }
}

function drawSprayDot(raw: CanvasRenderingContext2D, x: number, y: number, stroke: HandDrawStroke) {
  const coreRadius = Math.max(0.75, stroke.width / 2)
  const feather = Math.max(0, stroke.spread ?? 24) * 1.65
  const radius = coreRadius + feather
  const centerAlpha = Math.max(0.05, Math.min(1, stroke.opacity))

  if (feather < 0.5) {
    raw.fillStyle = colorWithAlpha(stroke.color, centerAlpha)
    raw.beginPath()
    raw.arc(x, y, coreRadius, 0, Math.PI * 2)
    raw.fill()
    return
  }

  const coreStop = Math.max(0.03, Math.min(0.92, coreRadius / radius))
  const gradient = raw.createRadialGradient(x, y, 0, x, y, radius)
  gradient.addColorStop(0, colorWithAlpha(stroke.color, centerAlpha))
  gradient.addColorStop(coreStop, colorWithAlpha(stroke.color, centerAlpha))
  gradient.addColorStop(coreStop + (1 - coreStop) * 0.32, colorWithAlpha(stroke.color, centerAlpha * 0.58))
  gradient.addColorStop(coreStop + (1 - coreStop) * 0.62, colorWithAlpha(stroke.color, centerAlpha * 0.22))
  gradient.addColorStop(coreStop + (1 - coreStop) * 0.84, colorWithAlpha(stroke.color, centerAlpha * 0.07))
  gradient.addColorStop(1, colorWithAlpha(stroke.color, 0))
  raw.fillStyle = gradient
  raw.beginPath()
  raw.arc(x, y, radius, 0, Math.PI * 2)
  raw.fill()
}

function drawSprayStroke(raw: CanvasRenderingContext2D, stroke: HandDrawStroke) {
  if (stroke.points.length < 2) return
  raw.save()
  raw.globalCompositeOperation = 'source-over'

  const coreWidth = Math.max(1.5, stroke.width)
  const spread = Math.max(0, stroke.spread ?? 24)
  const centerAlpha = Math.max(0.05, Math.min(1, stroke.opacity))

  if (stroke.points.length < 4) {
    drawSprayDot(raw, stroke.points[0], stroke.points[1], stroke)
    raw.restore()
    return
  }

  raw.lineCap = 'round'
  raw.lineJoin = 'round'

  if (spread <= 0) {
    raw.globalAlpha = centerAlpha
    raw.strokeStyle = stroke.color
    raw.lineWidth = coreWidth
    traceSmoothPath(raw, stroke.points)
    raw.stroke()
    raw.restore()
    return
  }

  const coreRadius = coreWidth / 2
  const featherRadius = spread * 1.65
  const maxRadius = coreRadius + featherRadius
  const steps = Math.max(64, Math.min(150, Math.round(maxRadius * 1.45)))
  let accumulatedAlpha = 0

  raw.strokeStyle = stroke.color

  for (let step = steps; step >= 1; step--) {
    const radius = (maxRadius * step) / steps
    const featherT = radius <= coreRadius
      ? 0
      : smoothStep(coreRadius, maxRadius, radius)
    const falloff = radius <= coreRadius
      ? 1
      : Math.pow(1 - featherT, 1.08)
    const targetAlpha = centerAlpha * falloff
    const layerAlpha = (targetAlpha - accumulatedAlpha) / Math.max(0.001, 1 - accumulatedAlpha)

    if (layerAlpha > 0.001) {
      raw.globalAlpha = layerAlpha
      raw.lineWidth = Math.max(0.75, radius * 2)
      traceSmoothPath(raw, stroke.points)
      raw.stroke()
      accumulatedAlpha = targetAlpha
    }
  }

  raw.restore()
}

export function drawHandDrawStroke(raw: CanvasRenderingContext2D, stroke: HandDrawStroke) {
  if (stroke.tool === 'spray') drawSprayStroke(raw, stroke)
  else drawLineStroke(raw, stroke)
}

export default function HandDrawKonva({ el, konvaProps }: Props) {
  return (
    <Group {...konvaProps}>
      <Shape
        width={el.width}
        height={el.height}
        sceneFunc={(ctx) => {
          const raw = (ctx as unknown as { _context: CanvasRenderingContext2D })._context
          const offscreen = document.createElement('canvas')
          offscreen.width = Math.max(1, Math.ceil(el.width))
          offscreen.height = Math.max(1, Math.ceil(el.height))
          const drawCtx = offscreen.getContext('2d')
          if (!drawCtx) return

          for (const stroke of el.strokes) drawHandDrawStroke(drawCtx, stroke)
          raw.drawImage(offscreen, 0, 0)
        }}
      />
    </Group>
  )
}
