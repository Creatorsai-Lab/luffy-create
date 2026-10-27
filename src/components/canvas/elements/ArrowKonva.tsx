import { useMemo } from 'react'
import { Arrow, Group, Line, Shape } from 'react-konva'
import type { ArrowElement } from '../../../types/editor'
import { getArrowPathPoints } from '../../../engine/arrowPath'
import { drawArrowHead, headAngle, headInset, trimPolyline } from '../../../engine/arrowHeads'

interface Props {
  el: ArrowElement
  konvaProps: Record<string, unknown>
  pathProgress?: number
  dashOffset?: number
}

export default function ArrowKonva({ el, konvaProps, pathProgress = 1, dashOffset = 0 }: Props) {
  // Only hide end pointer when a drawPath animation is actively drawing the line
  const hasDrawAnim = el.animations.some(a => a.type === 'drawPath')
  const pointerAtBeginning = el.arrowHead === 'start' || el.arrowHead === 'both'
  const pointerAtEnd       = (el.arrowHead === 'end' || el.arrowHead === 'both') && (!hasDrawAnim || pathProgress >= 1)

  // flowLoop forces dashes even if the arrow wasn't manually set to dashed
  const hasFlow = dashOffset !== 0
  const dash = el.dotted
    ? [el.strokeWidth, el.strokeWidth * 2.5]
    : (el.dashed || hasFlow)
    ? [el.strokeWidth * 4, el.strokeWidth * 3]
    : undefined

  // A new points array tells a selection box around the arrow to re-measure, so make one only when the shape changes.
  const points = useMemo(() => getArrowPathPoints(el, pathProgress),
    [el.x1, el.y1, el.x2, el.y2, el.curve, el.bendCount, el.bendDirection, el.bendCurve, pathProgress]) // eslint-disable-line react-hooks/exhaustive-deps

  const headColor = el.arrowHeadColor && el.arrowHeadColor !== '' ? el.arrowHeadColor : el.stroke
  // Points are absolute (x1..y2), so the node position must NOT add element.x/y again —
  // it carries only the animation offset (konvaProps.x already = element.x + anim delta).
  const animX = ((konvaProps.x as number) ?? 0) - el.x
  const animY = ((konvaProps.y as number) ?? 0) - el.y

  const commonProps = {
    ...konvaProps,
    x: animX,
    y: animY,
    points,
    stroke: el.stroke,
    strokeWidth: el.strokeWidth,
    dash,
    dashOffset,
    tension: 0,
    lineCap: 'round' as const,
    lineJoin: 'round' as const,
    hitStrokeWidth: Math.max(16, (el.strokeWidth ?? 2) + 8),
    perfectDrawEnabled: false,
  }

  if (el.arrowHead === 'none') {
    return <Line key={`none-${el.id}`} {...commonProps} />
  }

  // Other head styles: the line (stopping short under each head) and the heads, as one group.
  const style = el.headStyle ?? 'triangle'
  if (style !== 'triangle') {
    const length = el.pointerLength ?? 12
    const width = el.pointerWidth ?? 10
    const inset = headInset(style, length, width, el.strokeWidth)
    const shaft = trimPolyline(points, pointerAtBeginning ? inset : 0, pointerAtEnd ? inset : 0)
    // The group carries selection/drag; the line inside only draws (and gives the group its hit area).
    return (
      <Group key={`${style}-${el.id}`} {...konvaProps} x={animX} y={animY}>
        <Line points={shaft} stroke={el.stroke} strokeWidth={el.strokeWidth} dash={dash} dashOffset={dashOffset} tension={0}
          lineCap="round" lineJoin="round" hitStrokeWidth={commonProps.hitStrokeWidth} perfectDrawEnabled={false} />
        <Shape listening={false} perfectDrawEnabled={false} sceneFunc={ctx => {
          const raw = (ctx as unknown as { _context: CanvasRenderingContext2D })._context
          const n = points.length
          if (pointerAtEnd) drawArrowHead(raw, style, points[n - 2], points[n - 1], headAngle(points, true), length, width, el.strokeWidth, headColor)
          if (pointerAtBeginning) drawArrowHead(raw, style, points[0], points[1], headAngle(points, false), length, width, el.strokeWidth, headColor)
        }} />
      </Group>
    )
  }

  return (
    <Arrow
      {...commonProps}
      key={`${el.arrowHead}-${headColor}`}
      fill={headColor}
      pointerAtBeginning={pointerAtBeginning}
      pointerAtEnd={pointerAtEnd}
      pointerLength={el.pointerLength ?? 12}
      pointerWidth={el.pointerWidth ?? 10}
    />
  )
}
