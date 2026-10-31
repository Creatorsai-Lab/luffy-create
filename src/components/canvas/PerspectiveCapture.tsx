import { useRef, type ReactNode } from 'react'
import { Group, Shape } from 'react-konva'
import type Konva from 'konva'
import type { EditorElement } from '../../types/editor'
import { drawPerspectiveWarp, perspectiveHitFunc, type PerspectivePts } from '../../engine/perspectiveUtils'
import { scalePtsY } from '../../utils/textMeasure'

// Perspective for any element type, with its exact normal styling.
//
// The element's regular component renders a hidden copy at the origin (clipped
// to nothing, so it never shows). Each time the layer draws, the visible Shape
// captures that copy at the current pixel density and warps it onto the
// perspective quad. Text effects, LaTeX, code, tables, charts, counters and
// drawings all get perspective without a per-type re-implementation.

/** Props for the hidden source copy: at the origin, unrotated, opaque and inert. */
export const CAPTURE_SOURCE_PROPS: Record<string, unknown> = {
  x: 0, y: 0, offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, rotation: 0,
  opacity: 1, listening: false, draggable: false,
}

const hideAll = () => {}   // empty clip path: draws nothing on screen

export default function PerspectiveCapture({ el, konvaProps, children }: {
  el: EditorElement
  konvaProps: Record<string, unknown>
  children: ReactNode
}) {
  const sourceRef = useRef<Konva.Group>(null)
  const pts = el.perspectivePts as PerspectivePts

  return (
    <>
      <Group listening={false} clipFunc={hideAll}>
        <Group ref={sourceRef}>{children}</Group>
      </Group>
      <Shape
        {...konvaProps}
        width={el.width}
        height={el.height}
        hitFunc={perspectiveHitFunc(pts)}
        sceneFunc={ctx => {
          const raw = (ctx as unknown as { _context: CanvasRenderingContext2D })._context
          const source = sourceRef.current
          if (!source) return
          // A text taller than its stored box (lines added in an older project):
          // stretch the quad over all of it rather than cutting lines off.
          let h = el.height, quad = pts
          if (el.type === 'text') {
            const text = source.findOne('Text') as Konva.Text | undefined
            const bottom = text ? text.y() + text.height() : 0
            if (bottom > h + 0.5 && h > 0) { quad = scalePtsY(pts, bottom / h); h = bottom }
          }
          const captured = captureNode(source, el.width, h, raw)
          if (captured) drawPerspectiveWarp(raw, captured.canvas, quad, el.width, h, captured.rect)
        }}
      />
    </>
  )
}

/** Rasterize `node`'s content at `ctx`'s pixel density; returns the canvas and the local rect it covers. */
export function captureNode(node: Konva.Group, w: number, h: number, ctx: CanvasRenderingContext2D) {
  const content = node.getClientRect({ relativeTo: node })
  // Include overflow (text past its box, glow, shadow), but at most one box size per side.
  const lx0 = Math.max(content.x, -w), ly0 = Math.max(content.y, -h)
  const lx1 = Math.min(content.x + content.width, 2 * w), ly1 = Math.min(content.y + content.height, 2 * h)
  if (!(lx1 > lx0 && ly1 > ly0)) return null

  // Konva exports in absolute (stage) pixels; snap to whole pixels so the
  // captured rect maps back to local units exactly.
  const abs = node.getAbsoluteTransform()
  const origin = abs.point({ x: 0, y: 0 })
  const stageScale = abs.getMatrix()[0] || 1
  const ax0 = Math.floor(origin.x + lx0 * stageScale), ay0 = Math.floor(origin.y + ly0 * stageScale)
  const ax1 = Math.ceil(origin.x + lx1 * stageScale), ay1 = Math.ceil(origin.y + ly1 * stageScale)

  const m = ctx.getTransform()
  const density = Math.max(0.25, Math.hypot(m.a, m.b))
  const canvas = node.toCanvas({
    x: ax0, y: ay0, width: ax1 - ax0, height: ay1 - ay0,
    pixelRatio: density / stageScale,
  })
  const rect = {
    x: (ax0 - origin.x) / stageScale, y: (ay0 - origin.y) / stageScale,
    w: (ax1 - ax0) / stageScale, h: (ay1 - ay0) / stageScale,
  }
  return { canvas, rect }
}
