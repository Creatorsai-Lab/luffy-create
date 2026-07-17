import { useRef } from 'react'
import { Group, Circle, Line } from 'react-konva'
import type Konva from 'konva'
import type { EditorElement } from '../../types/editor'
import { makePerspectivePts } from '../../engine/perspectiveUtils'
import { useEditorStore } from '../../store/editorStore'

type Pt = [number, number]
type CornerKey = 'tl' | 'tr' | 'br' | 'bl'
type EdgeKey   = 'tc' | 'rc' | 'bc' | 'lc'

interface Props { el: EditorElement }

export default function PerspectiveHandles({ el }: Props) {
  const { updateElement } = useEditorStore()

  if (el.type === 'arrow' || el.type === 'audio') return null

  const w = (el as { width: number }).width
  const h = (el as { height: number }).height

  const pts = el.perspectivePts ?? makePerspectivePts(w, h)
  const { tl, tr, br, bl } = pts

  const tc: Pt = [(tl[0] + tr[0]) / 2, (tl[1] + tr[1]) / 2]
  const rc: Pt = [(tr[0] + br[0]) / 2, (tr[1] + br[1]) / 2]
  const bc: Pt = [(br[0] + bl[0]) / 2, (br[1] + bl[1]) / 2]
  const lc: Pt = [(bl[0] + tl[0]) / 2, (bl[1] + tl[1]) / 2]

  // Store initial state at drag start for edge handles
  const edgeStart = useRef<Record<string, { handlePt: Pt; corners: typeof pts }>>({})

  function updPts(newPts: typeof pts) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updateElement(el.id, { perspectivePts: newPts, perspectiveControls: undefined } as any)
  }

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
    <Group x={el.x} y={el.y} rotation={el.rotation}>
      <Line points={outline} closed stroke="rgba(99,102,241,0.9)" strokeWidth={1.5} listening={false} />

      {corners.map(({ key, pt }) => (
        <Circle
          key={key}
          x={pt[0]} y={pt[1]}
          radius={12}
          fill="#ff6600" stroke="#c0c0c0" strokeWidth={2}
          draggable
          onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => {
            updPts({ ...pts, [key]: [e.target.x(), e.target.y()] as Pt })
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
            updPts(np)
          }}
        />
      ))}
    </Group>
  )
}
