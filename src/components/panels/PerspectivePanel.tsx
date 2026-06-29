import { Focus } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import type { EditorElement } from '../../types/editor'
import { makePerspectivePts } from '../../engine/perspectiveUtils'
import { PanelHeader, Row } from './TextPanel'

type CornerKey = 'tl' | 'tr' | 'br' | 'bl'
type Axis = 0 | 1

export default function PerspectivePanel() {
  const { getSelectedEls, updateElement } = useEditorStore()
  const selected = getSelectedEls()
  const selectedEl = selected[0]
  const el = selected.find(e => e.type !== 'arrow' && e.type !== 'audio')
  const unsupported = selectedEl && !el

  function reset() {
    if (!el) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updateElement(el.id, { perspectivePts: undefined } as any)
  }

  function setCorner(target: EditorElement, corner: CornerKey, axis: Axis, value: number) {
    if (target.type === 'arrow' || target.type === 'audio') return
    const base = target.perspectivePts ?? makePerspectivePts(target.width, target.height)
    const next = {
      tl: [...base.tl] as [number, number],
      tr: [...base.tr] as [number, number],
      br: [...base.br] as [number, number],
      bl: [...base.bl] as [number, number],
    }
    next[corner][axis] = value
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updateElement(target.id, { perspectivePts: next } as any)
  }

  return (
    <div className="flex flex-col overflow-y-auto flex-1">
      <PanelHeader icon={<Focus size={12} />} title="Perspective" />

      <div className="px-3 py-3 flex flex-col gap-3">
        <p className="text-[10px] text-[#f2f2f2] leading-relaxed">
          Drag corner handles to distort the element. Edge handles move two corners simultaneously.
        </p>

        {!selectedEl && (
          <p className="text-xs text-[#d9d9d9] text-center py-4">
            Nothing is selected. Please select an item on the slide.
          </p>
        )}

        {unsupported && (
          <p className="text-xs text-[#d9d9d9] text-center py-4">
            Perspective works on visual elements such as text, shapes, images, icons, and LaTeX.
          </p>
        )}

        {el && (
          <div className="flex flex-col gap-2">
            <div className="text-[10px] text-[#f2f2f2]">
              Selected item: <span className="text-editor-text">{el.name}</span>
            </div>

            {el.perspectivePts && (
              <div className="text-[10px] text-editor-accent bg-editor-accent-dim rounded px-2 py-1">
                Perspective active
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              {(['tl', 'tr', 'br', 'bl'] as CornerKey[]).map(corner => {
                const pts = el.perspectivePts ?? makePerspectivePts(el.width, el.height)
                return (
                  <div key={corner} className="rounded border border-editor-border bg-editor-elevated px-2 py-1.5">
                    <div className="text-[10px] uppercase text-editor-secondary mb-1">{corner}</div>
                    <Row label="X">
                      <input
                        type="number"
                        step={1}
                        value={Math.round(pts[corner][0])}
                        onChange={e => setCorner(el, corner, 0, Number(e.target.value))}
                        className="w-full bg-[#171717] border border-editor-border rounded text-xs text-editor-text px-2 py-1 nodrag"
                      />
                    </Row>
                    <Row label="Y">
                      <input
                        type="number"
                        step={1}
                        value={Math.round(pts[corner][1])}
                        onChange={e => setCorner(el, corner, 1, Number(e.target.value))}
                        className="w-full bg-[#171717] border border-editor-border rounded text-xs text-editor-text px-2 py-1 nodrag"
                      />
                    </Row>
                  </div>
                )
              })}
            </div>

            <button
              onClick={reset}
              disabled={!el.perspectivePts}
              className="text-xs px-3 py-1.5 bg-editor-elevated border border-editor-border rounded text-[#f2f2f2] hover:text-editor-text transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Reset Perspective
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
