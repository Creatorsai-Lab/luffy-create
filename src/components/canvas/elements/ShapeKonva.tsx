import React, { useEffect, useState } from 'react'
import { Rect, Circle, RegularPolygon, Star, Line, Ellipse, Shape, Group } from 'react-konva'
import type Konva from 'konva'
import type { ShapeElement, SlideDir } from '../../../types/editor'
import { drawPerspectiveShapeStroke, drawPerspectiveWarp, perspectiveHitFunc, drawShapeToCtx, heartPath, drawSketchRect, type PathCtx } from '../../../engine/perspectiveUtils'
import { drawBoxShadow, drawInnerShadow, hasBoxShadow, hasInnerShadow } from '../../../engine/boxShadow'
import { borderCanvasStrokeStyle, borderKonvaStrokeProps, getElementBorderWidth } from '../../../engine/borderRenderer'
import { shapeCanvasFill, shapeFillProps } from '../../../engine/shapeFill'
import { draw3DShape, is3DShape } from '../../../engine/shape3d'

// ─── Flow helpers ─────────────────────────────────────────────────────────────

function flowStroke(el: ShapeElement, hasFlow: boolean): string {
  if (!hasFlow) return el.stroke
  return el.stroke && el.stroke !== 'transparent' && el.strokeWidth > 0 ? el.stroke : '#888888'
}

function flowStrokeWidth(el: ShapeElement, hasFlow: boolean): number {
  if (!hasFlow) return el.strokeWidth
  return el.strokeWidth > 0 ? el.strokeWidth : 3
}

function flowDash(sw: number): number[] {
  return [Math.max(4, sw * 3), Math.max(3, sw * 2)]
}

interface Props {
  el: ShapeElement
  konvaProps: Record<string, unknown>
  wipeProgress?: number
  wipeDir?: SlideDir
  dashOffset?: number
  localTime?: number
}

function addWave(x: number, y: number, seed: number = 0): [number, number] {
  const wave = Math.sin((x + seed) * 0.05) * 2 + Math.sin((y + seed) * 0.03) * 1.5
  return [x + wave * (0.5 + (seed % 10) * 0.05), y + wave * (0.3 + (seed % 7) * 0.05)]
}

export default function ShapeKonva({ el, konvaProps, wipeProgress = 1, wipeDir, dashOffset = 0, localTime = 0 }: Props) {
  const [offscreen, setOffscreen] = useState<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (!el.perspectivePts) return
    const canvas = document.createElement('canvas')
    canvas.width = el.width; canvas.height = el.height
    // 2D outlines are re-drawn crisply after the warp; a 3D solid's edges are
    // part of the solid, so they stay in the warped source.
    const sourceEl = (el.strokeWidth || 0) > 0 && !is3DShape(el)
      ? ({ ...el, stroke: 'transparent', strokeWidth: 0 } as ShapeElement)
      : el
    drawShapeToCtx(sourceEl, canvas.getContext('2d')!)
    setOffscreen(canvas)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el.width, el.height, el.fill, el.fillOpacity, el.cornerRadius, el.shapeType,
      el.fillMode, el.gradientFrom, el.gradientTo, el.gradientFromOpacity, el.gradientToOpacity, el.gradientAngle,
      el.stroke, el.strokeWidth, el.faceColor, el.rotateX, el.rotateY, el.rotateZ, el.faces3d, !!el.perspectivePts])

  if (el.perspectivePts && offscreen) {
    return (
      <>
        <ElementShadow el={el} konvaProps={konvaProps} />
        <Shape
          {...konvaProps}
          width={el.width}
          height={el.height}
          hitFunc={perspectiveHitFunc(el.perspectivePts)}
          sceneFunc={(ctx, _shape) => {
            const raw = (ctx as unknown as { _context: CanvasRenderingContext2D })._context
            drawPerspectiveWarp(raw, offscreen, el.perspectivePts!, el.width, el.height)
            drawPerspectiveShapeStroke(raw, el, localTime)
          }}
        />
      </>
    )
  }

  const w = el.width
  const h = el.height
  const radius = Math.min(w, h) / 2

  const hasFlow    = dashOffset !== 0
  const fStroke    = flowStroke(el, hasFlow)
  const fStrokeW   = flowStrokeWidth(el, hasFlow)
  const fDash      = hasFlow ? flowDash(fStrokeW) : undefined
  const strokeProps = borderKonvaStrokeProps(
    hasFlow ? { ...el, stroke: fStroke, strokeWidth: fStrokeW, borderAnimate: false } : el,
    w,
    h,
    localTime,
  )

  const wipeActive = wipeProgress < 1 && wipeDir != null

  // When wipe is active, Group owns konvaProps; inner shapes use only visual props
  const shared = {
    ...(wipeActive ? {} : konvaProps),
    ...strokeProps,
    ...shapeFillProps(el, w, h),
    ...(fDash ? { dash: fDash, dashOffset } : {}),
    perfectDrawEnabled: false,
  }

  function withShadow(node: React.ReactElement | null): React.ReactElement | null {
    if (!node || (!hasBoxShadow(el.boxShadow) && !hasInnerShadow(el.innerShadow))) return node
    return (
      <>
        <ElementShadow el={el} konvaProps={konvaProps} />
        {node}
        <ElementInnerShadow el={el} konvaProps={konvaProps} />
      </>
    )
  }

  function wipe(node: React.ReactElement | null): React.ReactElement | null {
    if (!node) return null
    if (!wipeActive || !wipeDir) return withShadow(node)
    const clipX = wipeDir === 'left' ? w * (1 - wipeProgress) : 0
    const clipY = wipeDir === 'up'   ? h * (1 - wipeProgress) : 0
    const clipW = (wipeDir === 'left' || wipeDir === 'right') ? w * wipeProgress : w
    const clipH = (wipeDir === 'up'   || wipeDir === 'down')  ? h * wipeProgress : h
    return withShadow(
      <Group
        {...konvaProps}
        clipX={clipX}
        clipY={clipY}
        clipWidth={Math.max(0, clipW)}
        clipHeight={Math.max(0, clipH)}
      >
        {node}
      </Group>
    )
  }

  // 3D shapes need konvaProps on the Shape only when not in wipe mode
  const shapeKonvaProps = wipeActive ? {} : konvaProps

  if (el.shapeType.includes('-hand')) {
    switch (el.shapeType) {
      case 'rect-hand': {
        const tl = addWave(0, 0, 1), tr = addWave(w, 0, 2)
        const br = addWave(w, h, 3), bl = addWave(0, h, 4)
        return wipe(
          <Line {...shared} points={[tl[0],tl[1],tr[0],tr[1],br[0],br[1],bl[0],bl[1]]}
            closed lineCap="round" lineJoin="round" />
        )
      }
      case 'circle-hand': {
        const sides = 32
        const pts: number[] = []
        for (let i = 0; i < sides; i++) {
          const angle = (i / sides) * Math.PI * 2
          const x = radius + Math.cos(angle) * radius
          const y = radius + Math.sin(angle) * radius
          const [wx, wy] = addWave(x, y, i)
          pts.push(wx - radius, wy - radius)
        }
        return wipe(<Line {...shared} points={pts} closed lineCap="round" lineJoin="round" />)
      }
      case 'square-hand': {
        const s = Math.min(w, h)
        const tl = addWave(0, 0, 1), tr = addWave(s, 0, 2)
        const br = addWave(s, s, 3), bl = addWave(0, s, 4)
        return wipe(
          <Line {...shared} points={[tl[0],tl[1],tr[0],tr[1],br[0],br[1],bl[0],bl[1]]}
            closed lineCap="round" lineJoin="round" />
        )
      }
    }
  }

  switch (el.shapeType) {
    case 'rect':
      return wipe(<Rect {...shared} width={w} height={h} cornerRadius={el.cornerRadius} />)

    case 'circle':
      return wipe(<Circle {...shared} radius={radius} offsetX={-w / 2} offsetY={-h / 2} />)

    case 'triangle':
      return wipe(<RegularPolygon {...shared} sides={3} radius={radius} offsetX={-w / 2} offsetY={-h / 2} />)

    case 'star':
      return wipe(<Star {...shared} numPoints={5} innerRadius={radius * 0.4} outerRadius={radius}
        offsetX={-w / 2} offsetY={-h / 2} />)

    case 'pentagon':
      return wipe(<RegularPolygon {...shared} sides={5} radius={radius} offsetX={-w / 2} offsetY={-h / 2} />)

    case 'hexagon':
      return wipe(<RegularPolygon {...shared} sides={6} radius={radius} offsetX={-w / 2} offsetY={-h / 2} />)

    case 'octagon':
      return wipe(<RegularPolygon {...shared} sides={8} radius={radius} offsetX={-w / 2} offsetY={-h / 2} />)

    case 'diamond':
      return wipe(<Line {...shared} points={[w / 2, 0, w, h / 2, w / 2, h, 0, h / 2]} closed />)

    case 'oval':
      return wipe(<Ellipse {...shared} radiusX={w / 2} radiusY={h / 2} offsetX={-w / 2} offsetY={-h / 2} />)

    case 'cone':
    case 'cube': {
      const sw = getElementBorderWidth(el)
      return wipe(
        <Shape
          {...shapeKonvaProps}
          width={w} height={h}
          hitFunc={(ctx, shape) => {
            ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.closePath(); ctx.fillStrokeShape(shape)
          }}
          sceneFunc={ctx => {
            const raw = (ctx as unknown as { _context: CanvasRenderingContext2D })._context
            draw3DShape(raw, el, w, h, hasFlow
              ? { style: fStroke, width: fStrokeW, dash: flowDash(fStrokeW), dashOffset }
              : sw > 0 ? { style: borderCanvasStrokeStyle(raw, el, w, h, localTime), width: sw } : undefined)
          }}
        />
      )
    }

    case 'speechBubble': {
      const r = Math.min(el.cornerRadius || 8, w * 0.15, h * 0.15)
      const bh = h * 0.78
      return wipe(
        <Shape
          {...shared}
          width={w}
          height={h}
          sceneFunc={(ctx: Konva.Context, shape: Konva.Shape) => {
            ctx.beginPath()
            ctx.moveTo(r, 0)
            ctx.lineTo(w - r, 0)
            ctx.quadraticCurveTo(w, 0, w, r)
            ctx.lineTo(w, bh - r)
            ctx.quadraticCurveTo(w, bh, w - r, bh)
            ctx.lineTo(w * 0.38, bh)
            ctx.lineTo(w * 0.22, h)
            ctx.lineTo(w * 0.14, bh)
            ctx.lineTo(r, bh)
            ctx.quadraticCurveTo(0, bh, 0, bh - r)
            ctx.lineTo(0, r)
            ctx.quadraticCurveTo(0, 0, r, 0)
            ctx.closePath()
            ctx.fillStrokeShape(shape)
          }}
        />
      )
    }

    case 'roundedSpeech': {
      const dotR1 = Math.max(w * 0.07, 4)
      const dotR2 = Math.max(w * 0.05, 3)
      return wipe(
        <Shape
          {...shared}
          width={w}
          height={h}
          sceneFunc={(ctx: Konva.Context, shape: Konva.Shape) => {
            ctx.beginPath()
            ctx.ellipse(w / 2, h * 0.40, w / 2, h * 0.40, 0, 0, Math.PI * 2)
            ctx.closePath()
            ctx.fillStrokeShape(shape)
            ctx.beginPath()
            ctx.arc(w * 0.22, h * 0.76, dotR1, 0, Math.PI * 2)
            ctx.closePath()
            ctx.fillStrokeShape(shape)
            ctx.beginPath()
            ctx.arc(w * 0.12, h * 0.92, dotR2, 0, Math.PI * 2)
            ctx.closePath()
            ctx.fillStrokeShape(shape)
          }}
        />
      )
    }

    case 'heart':
      return wipe(
        <Shape
          {...shared}
          width={w}
          height={h}
          sceneFunc={(ctx: Konva.Context, shape: Konva.Shape) => {
            heartPath(ctx as unknown as PathCtx, w, h)
            ctx.fillStrokeShape(shape)
          }}
        />
      )

    case 'rect-sketch':
      return wipe(
        <Shape
          {...shared}
          width={w}
          height={h}
          hitFunc={(ctx, shape) => {
            ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.closePath(); ctx.fillStrokeShape(shape)
          }}
          sceneFunc={(ctx: Konva.Context, _shape: Konva.Shape) => {
            const raw = (ctx as unknown as { _context: CanvasRenderingContext2D })._context
            drawSketchRect(raw, w, h, shapeCanvasFill(raw, el, w, h), el.stroke, el.strokeWidth || 0)
          }}
        />
      )

    default:
      return null
  }
}

function ElementShadow({ el, konvaProps }: { el: ShapeElement; konvaProps: Record<string, unknown> }) {
  if (!hasBoxShadow(el.boxShadow)) return null
  const radius = el.shapeType === 'rect' || el.shapeType === 'rect-sketch' ? el.cornerRadius : Math.min(el.width, el.height) * 0.08
  return (
    <Shape
      {...konvaProps}
      id={`${el.id}-box-shadow`}
      listening={false}
      draggable={false}
      width={el.width}
      height={el.height}
      sceneFunc={(ctx) => {
        const raw = (ctx as unknown as { _context: CanvasRenderingContext2D })._context
        drawBoxShadow(raw, el.boxShadow, el.width, el.height, radius)
      }}
    />
  )
}

function ElementInnerShadow({ el, konvaProps }: { el: ShapeElement; konvaProps: Record<string, unknown> }) {
  if (!hasInnerShadow(el.innerShadow)) return null
  const radius = el.shapeType === 'rect' || el.shapeType === 'rect-sketch' ? el.cornerRadius : Math.min(el.width, el.height) * 0.08
  return (
    <Shape
      {...konvaProps}
      id={`${el.id}-inner-shadow`}
      listening={false}
      draggable={false}
      width={el.width}
      height={el.height}
      sceneFunc={(ctx) => {
        const raw = (ctx as unknown as { _context: CanvasRenderingContext2D })._context
        drawInnerShadow(raw, el.innerShadow, el.width, el.height, radius)
      }}
    />
  )
}
