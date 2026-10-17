import { useRef, type ReactNode } from 'react'
import { Group, Shape } from 'react-konva'
import type Konva from 'konva'
import { drawPerspectiveWarp, perspectiveHitFunc, type PerspectivePts } from '../../engine/perspectiveUtils'
import type { Box } from '../../utils/groups'
import { captureNode } from './PerspectiveCapture'

const hideAll = () => {}   // empty clip path: the source copy never shows on screen

/**
 * A whole group (an add-on, any group) drawn in perspective as one plane.
 * Its members render, animated as usual, into a hidden copy; each draw the copy
 * is captured and warped onto the group's quad. The warped picture is what you
 * click (selects the group) and drag (moves every member).
 */
export default function GroupPerspective({ box, pts, nodeId, draggable, onPress, onMoved, children }: {
  box: Box
  pts: PerspectivePts
  /** Id of the group's first member, so menus and selection treat the picture as the group. */
  nodeId: string
  draggable: boolean
  onPress: (shift: boolean) => void
  onMoved: (dx: number, dy: number) => void
  children: ReactNode
}) {
  const sourceRef = useRef<Konva.Group>(null)
  return (
    <>
      <Group listening={false} clipFunc={hideAll}>
        <Group ref={sourceRef}>
          {/* Members at their scene positions, shifted so the group's box starts at 0,0. */}
          <Group x={-box.x} y={-box.y}>{children}</Group>
        </Group>
      </Group>
      <Shape
        id={nodeId}
        name="group-perspective"
        x={box.x}
        y={box.y}
        width={box.width}
        height={box.height}
        draggable={draggable}
        dragDistance={3}
        hitFunc={perspectiveHitFunc(pts)}
        onMouseDown={e => { if (e.evt.button === 0) onPress(e.evt.shiftKey) }}
        onDragEnd={e => {
          const dx = e.target.x() - box.x
          const dy = e.target.y() - box.y
          if (Math.abs(dx) + Math.abs(dy) > 0.01) onMoved(dx, dy)
        }}
        sceneFunc={ctx => {
          const raw = (ctx as unknown as { _context: CanvasRenderingContext2D })._context
          const source = sourceRef.current
          const captured = source && captureNode(source, box.width, box.height, raw)
          if (captured) drawPerspectiveWarp(raw, captured.canvas, pts, box.width, box.height, captured.rect)
        }}
      />
    </>
  )
}
