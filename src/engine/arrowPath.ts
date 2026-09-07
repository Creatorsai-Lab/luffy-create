import type { ArrowBendDirection } from '../types/editor'

interface ArrowPathInput {
  x1: number
  y1: number
  x2: number
  y2: number
  curve?: number
  bendCount?: number
  bendDirection?: ArrowBendDirection
  bendCurve?: number
}

type Point = [number, number]

const EPSILON = 0.001

function append(points: Point[], point: Point) {
  const last = points[points.length - 1]
  if (!last || Math.hypot(point[0] - last[0], point[1] - last[1]) > EPSILON) points.push(point)
}

function orthogonalPoints(el: ArrowPathInput, bends: number): Point[] {
  const horizontalFirst = (el.bendDirection ?? 'horizontal') === 'horizontal'
  const segmentCount = bends + 1
  const horizontalSegments = Math.ceil((segmentCount - (horizontalFirst ? 0 : 1)) / 2)
  const verticalSegments = segmentCount - horizontalSegments
  const points: Point[] = [[el.x1, el.y1]]
  let x = el.x1, y = el.y1, h = 0, v = 0

  for (let segment = 0; segment < segmentCount; segment++) {
    const horizontal = horizontalFirst ? segment % 2 === 0 : segment % 2 === 1
    if (horizontal) x = el.x1 + (el.x2 - el.x1) * ++h / horizontalSegments
    else y = el.y1 + (el.y2 - el.y1) * ++v / verticalSegments
    append(points, [x, y])
  }

  return points
}

function roundedPoints(points: Point[], radius: number): Point[] {
  if (radius <= 0 || points.length < 3) return points
  const rounded: Point[] = [points[0]]

  for (let i = 1; i < points.length - 1; i++) {
    const previous = points[i - 1], corner = points[i], next = points[i + 1]
    const incoming = Math.hypot(corner[0] - previous[0], corner[1] - previous[1])
    const outgoing = Math.hypot(next[0] - corner[0], next[1] - corner[1])
    const cornerRadius = Math.min(radius, incoming / 2, outgoing / 2)
    if (cornerRadius <= EPSILON) continue

    const before: Point = [
      corner[0] + (previous[0] - corner[0]) * cornerRadius / incoming,
      corner[1] + (previous[1] - corner[1]) * cornerRadius / incoming,
    ]
    const after: Point = [
      corner[0] + (next[0] - corner[0]) * cornerRadius / outgoing,
      corner[1] + (next[1] - corner[1]) * cornerRadius / outgoing,
    ]
    append(rounded, before)
    for (let step = 1; step <= 6; step++) {
      const t = step / 6, inverse = 1 - t
      append(rounded, [
        inverse * inverse * before[0] + 2 * inverse * t * corner[0] + t * t * after[0],
        inverse * inverse * before[1] + 2 * inverse * t * corner[1] + t * t * after[1],
      ])
    }
  }

  append(rounded, points[points.length - 1])
  return rounded
}

function bowedPoints(el: ArrowPathInput): Point[] {
  const dx = el.x2 - el.x1, dy = el.y2 - el.y1
  const length = Math.hypot(dx, dy)
  if (length < EPSILON || !el.curve) return [[el.x1, el.y1], [el.x2, el.y2]]
  const control: Point = [
    (el.x1 + el.x2) / 2 - dy / length * el.curve,
    (el.y1 + el.y2) / 2 + dx / length * el.curve,
  ]
  return Array.from({ length: 21 }, (_, index): Point => {
    const t = index / 20, inverse = 1 - t
    return [
      inverse * inverse * el.x1 + 2 * inverse * t * control[0] + t * t * el.x2,
      inverse * inverse * el.y1 + 2 * inverse * t * control[1] + t * t * el.y2,
    ]
  })
}

function trimPoints(points: Point[], progress: number): Point[] {
  const amount = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0
  if (amount >= 1) return points.length > 1 ? points : [points[0], [...points[0]]]
  const lengths = points.slice(1).map((point, index) =>
    Math.hypot(point[0] - points[index][0], point[1] - points[index][1]))
  const target = lengths.reduce((sum, length) => sum + length, 0) * amount
  const trimmed: Point[] = [points[0]]
  let travelled = 0

  for (let i = 1; i < points.length; i++) {
    const length = lengths[i - 1]
    if (travelled + length <= target) {
      append(trimmed, points[i])
      travelled += length
      continue
    }
    const ratio = length > 0 ? (target - travelled) / length : 0
    append(trimmed, [
      points[i - 1][0] + (points[i][0] - points[i - 1][0]) * ratio,
      points[i - 1][1] + (points[i][1] - points[i - 1][1]) * ratio,
    ])
    break
  }

  if (trimmed.length === 1) trimmed.push([...trimmed[0]])
  return trimmed
}

export function getArrowPathPoints(el: ArrowPathInput, progress = 1): number[] {
  const bends = Math.min(8, Math.max(0, Math.round(el.bendCount ?? 0)))
  const points = bends > 0
    ? roundedPoints(orthogonalPoints(el, bends), Math.min(200, Math.max(0, el.bendCurve ?? 32)))
    : bowedPoints(el)
  return trimPoints(points, progress).flat()
}
