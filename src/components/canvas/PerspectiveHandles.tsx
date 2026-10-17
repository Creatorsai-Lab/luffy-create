import { useRef } from 'react'
import { Group, Circle, Line } from 'react-konva'
import type Konva from 'konva'
import type { EditorElement } from '../../types/editor'
import { makePerspectivePts, type PerspectivePts } from '../../engine/perspectiveUtils'
import { useEditorStore } from '../../store/editorStore'
import { useShallow } from 'zustand/react/shallow'

type Pt = [number, number]
type CornerKey = 'tl' | 'tr' | 'br' | 'bl'
type EdgeKey   = 'tc' | 'rc' | 'bc' | 'lc'

/** Perspective handles for one element. */
export default function PerspectiveHandles({ el }: { el: EditorElement }) {
  const { updateElement } = useEditorStore(useShallow(s => ({ updateElement: s.updateElement })))
  if (el.type === 'arrow' || el.type === 'audio') return null
  return (
    <QuadHandles x={el.x} y={el.y} rotation={el.rotation} width={el.width} height={el.height} pts={el.perspectivePts}
      onChange={pts => updateElement(el.id, { perspectivePts: pts, perspectiveControls: undefined } as Partial<EditorElement>)} />
  )
}

/**
 * Orange corner handles (move one corner) and red edge handles (move a whole
 * side) over a box at (x, y). `pts` are local to the box; unset = the plain box.
 */
export function QuadHandles({ x, y, rotation = 0, width, height, pts: current, onChange }: {
  x: number; y: number; rotation?: number; width: number; height: number
  pts?: PerspectivePts
  onChange: (pts: PerspectivePts) => void
}) {
  const pts = current ?? makePerspectivePts(width, height)
  const { tl, tr, br, bl } = pts

  const tc: Pt = [(tl[0] + tr[0]) / 2, (tl[1] + tr[1]) / 2]
  const rc: Pt = [(tr[0] + br[0]) / 2, (tr[1] + br[1]) / 2]
  const bc: Pt = [(br[0] + bl[0]) / 2, (br[1] + bl[1]) / 2]
  const lc: Pt = [(bl[0] + tl[0]) / 2, (bl[1] + tl[1]) / 2]

  // Store initial state at drag start for edge handles
  const edgeStart = useRef<Record<string, { handlePt: Pt; corners: PerspectivePts }>>({})

  const corners: { key: CornerKey; pt: Pt }[] = [
    { key: 'tl', pt: tl }, { key: 'tr', pt: tr },
    { key: 'br', pt: br }, { key: 'bl', pt: bl },
  ]

  const edges: { key: EdgeKey; pt: Pt }[] = [
    { key: 'tc', pt: tc }, { key: 'rc', pt: rc },
    { key: 'bc', pt: bc }, { key: 'lc', pt: lc },
  ]

  const outline = [tl[0],tl[1], tr[0],tr[1], br[0],br[1], bl[0],bl[1]]

  return (
    <Group x={x} y={y} rotation={rotation}>
      <Line points={outline} closed stroke="rgba(99,102,241,0.9)" strokeWidth={1.5} listening={false} />

      {corners.map(({ key, pt }) => (
        <Circle
          key={key}
          x={pt[0]} y={pt[1]}
          radius={12}
          fill="#ff6600" stroke="#c0c0c0" strokeWidth={2}
          draggable
          onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => {
            onChange({ ...pts, [key]: [e.target.x(), e.target.y()] as Pt })
          }}
        />
      ))}

      {edges.map(({ key, pt }) => (
        <Circle
          key={key}
          x={pt[0]} y={pt[1]}
          radius={12}
          fill="#ff0015" stroke="#c0c0c0" strokeWidth={1.5}
          draggable
          onDragStart={(e: Konva.KonvaEventObject<DragEvent>) => {
            edgeStart.current[key] = {
              handlePt: [e.target.x(), e.target.y()],
              corners: { tl: [...tl] as Pt, tr: [...tr] as Pt, br: [...br] as Pt, bl: [...bl] as Pt },
            }
          }}
          onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => {
            const start = edgeStart.current[key]
            if (!start) return
            const dx = e.target.x() - start.handlePt[0]
            const dy = e.target.y() - start.handlePt[1]
            const c = start.corners
            const np = { ...c }
            if (key === 'tc') { np.tl = [c.tl[0]+dx, c.tl[1]+dy]; np.tr = [c.tr[0]+dx, c.tr[1]+dy] }
            if (key === 'rc') { np.tr = [c.tr[0]+dx, c.tr[1]+dy]; np.br = [c.br[0]+dx, c.br[1]+dy] }
            if (key === 'bc') { np.br = [c.br[0]+dx, c.br[1]+dy]; np.bl = [c.bl[0]+dx, c.bl[1]+dy] }
            if (key === 'lc') { np.bl = [c.bl[0]+dx, c.bl[1]+dy]; np.tl = [c.tl[0]+dx, c.tl[1]+dy] }
            onChange(np)
          }}
        />
      ))}
    </Group>
  )
}
