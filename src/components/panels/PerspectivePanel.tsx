import { Focus, RotateCcw } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import type { EditorElement, PerspectiveControls } from '../../types/editor'
import { makePerspectiveControls, makePerspectivePts, makePerspectivePtsFromControls, type PerspectivePts } from '../../engine/perspectiveUtils'
import { elementsBox, groupPerspectivePts, selectedWholeGroup, toGroupPerspective } from '../../utils/groups'
import { PanelHeader, Row, Slider } from './TextPanel'
import { useShallow } from 'zustand/react/shallow'

type CornerKey = 'tl' | 'tr' | 'br' | 'bl'
type Axis = 0 | 1

/**
 * The perspective "target": one element, or a whole group (an add-on, any
 * group) treated as one plane. Both use the same sliders and corner fields.
 */
interface Target {
  name: string
  width: number
  height: number
  pts?: PerspectivePts
  controls?: PerspectiveControls
  set(pts: PerspectivePts | undefined, controls?: PerspectiveControls): void
}

export default function PerspectivePanel() {
  const { getSelectedEls, updateElement, setGroupPerspective, project, currentSceneId, selectedIds } = useEditorStore(useShallow(s => ({ getSelectedEls: s.getSelectedEls, updateElement: s.updateElement, setGroupPerspective: s.setGroupPerspective, project: s.project, currentSceneId: s.currentSceneId, selectedIds: s.selectedIds })))
  const selected = getSelectedEls()
  const selectedEl = selected[0]
  const scene = project?.scenes.find(sc => sc.id === currentSceneId)
  const groupId = scene ? selectedWholeGroup(scene, selectedIds) : null
  const group = groupId ? scene!.groups![groupId] : undefined
  const single = groupId ? undefined : selected.find(e => e.type !== 'arrow' && e.type !== 'audio')

  let target: Target | null = null
  if (group && scene) {
    const box = elementsBox(scene.elements.filter(e => e.groupId === group.id && e.type !== 'audio'))
    target = {
      name: `${group.smart ? '✦ ' : ''}${group.name} (whole ${group.smart ? 'add-on' : 'group'})`,
      width: box.width, height: box.height,
      pts: group.perspective ? groupPerspectivePts(group.perspective, box) : undefined,
      controls: group.perspective?.controls,
      set: (pts, controls) => setGroupPerspective(group.id, pts ? toGroupPerspective(pts, box, controls) : null),
    }
  } else if (single) {
    target = {
      name: single.name, width: single.width, height: single.height,
      pts: single.perspectivePts, controls: single.perspectiveControls,
      set: (pts, controls) => updateElement(single.id, { perspectivePts: pts, perspectiveControls: controls } as Partial<EditorElement>),
    }
  }
  const el = target
  const unsupported = selectedEl && !el

  function reset() {
    el?.set(undefined)
  }

  function controlsFor(target: Target): PerspectiveControls {
    return { ...makePerspectiveControls(), ...(target.controls ?? {}) }
  }

  function setControls(target: Target, patch: Partial<PerspectiveControls>) {
    const nextControls = { ...controlsFor(target), ...patch }
    target.set(makePerspectivePtsFromControls(target.width, target.height, nextControls), nextControls)
  }

  function resetControls(target: Target) {
    target.set(undefined)
  }

  function setCorner(target: Target, corner: CornerKey, axis: Axis, value: number) {
    const base = target.pts ?? makePerspectivePts(target.width, target.height)
    const next = {
      tl: [...base.tl] as [number, number],
      tr: [...base.tr] as [number, number],
      br: [...base.br] as [number, number],
      bl: [...base.bl] as [number, number],
    }
    next[corner][axis] = value
    target.set(next)
  }

  return (
    <div className="flex flex-col overflow-y-auto flex-1">
      <PanelHeader icon={<Focus size={12} />} title="Perspective" />

      <div className="px-3 py-3 flex flex-col gap-3">
        <p className="text-[10px] text-[#f2f2f2] leading-relaxed">
          Drag orange corner handles for individual corners. Drag red edge handles to move a full side. The fields below use the element's local pixels. Select a whole group or add-on to tilt it as one plane.
        </p>

        {!selectedEl && (
          <p className="text-xs text-[#d9d9d9] text-center py-4">
            Nothing is selected. Please select an item on the slide.
          </p>
        )}

        {unsupported && (
          <p className="text-xs text-[#d9d9d9] text-center py-4">
            Perspective works on every visual element except arrows — or select a whole group or add-on to tilt it as one.
          </p>
        )}

        {el && (
          <div className="flex flex-col gap-2">
            <div className="text-[10px] text-[#f2f2f2]">
              Selected item: <span className="text-editor-text">{el.name}</span>
            </div>

            {el.pts && (
              <div className="text-[10px] text-editor-accent bg-editor-accent-dim rounded px-2 py-1">
                Perspective active
              </div>
            )}

            <div className="rounded border border-editor-border bg-editor-elevated-highlight px-2 py-2">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-editor-text">Transform Sliders</span>
                <button
                  onClick={() => resetControls(el)}
                  className="flex items-center gap-1 text-[10px] text-[#f2f2f2] hover:text-editor-text transition-colors"
                  title="Reset slider-generated perspective"
                >
                  <RotateCcw size={10} />
                  Reset
                </button>
              </div>

              <p className="text-[10px] text-[#a99fc9] leading-relaxed mb-2">
                Use these for quick editor-style perspective angles, then refine corners on the scene if needed.
              </p>

              {(() => {
                const controls = controlsFor(el)
                return (
                  <>
                    <Row label="Y-Axis Tilt">
                      <Slider
                        value={controls.horizontalTilt}
                        min={-100}
                        max={100}
                        step={1}
                        onChange={v => setControls(el, { horizontalTilt: v })}
                        display={`${controls.horizontalTilt}`}
                      />
                    </Row>
                    <Row label="X-Axis Tilt">
                      <Slider
                        value={controls.verticalTilt}
                        min={-100}
                        max={100}
                        step={1}
                        onChange={v => setControls(el, { verticalTilt: v })}
                        display={`${controls.verticalTilt}`}
                      />
                    </Row>
                    <Row label="Skew X">
                      <Slider
                        value={controls.skewX}
                        min={-100}
                        max={100}
                        step={1}
                        onChange={v => setControls(el, { skewX: v })}
                        display={`${controls.skewX}`}
                      />
                    </Row>
                    <Row label="Skew Y">
                      <Slider
                        value={controls.skewY}
                        min={-100}
                        max={100}
                        step={1}
                        onChange={v => setControls(el, { skewY: v })}
                        display={`${controls.skewY}`}
                      />
                    </Row>
                    <Row label="Depth">
                      <Slider
                        value={controls.depth}
                        min={0}
                        max={100}
                        step={1}
                        onChange={v => setControls(el, { depth: v })}
                        display={`${controls.depth}%`}
                      />
                    </Row>
                  </>
                )
              })()}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {(['tl', 'tr', 'br', 'bl'] as CornerKey[]).map(corner => {
                const pts = el.pts ?? makePerspectivePts(el.width, el.height)
                return (
                  <div key={corner} className="rounded border border-editor-border bg-editor-elevated-highlight px-2 py-1.5">
                    <div className="text-[10px] uppercase text-editor-text-secondary mb-1">
                      {corner === 'tl' ? 'Top Left' : corner === 'tr' ? 'Top Right' : corner === 'br' ? 'Bottom Right' : 'Bottom Left'}
                    </div>
                    <Row label="X Position">
                      <input
                        type="number"
                        step={1}
                        value={Math.round(pts[corner][0])}
                        onChange={e => setCorner(el, corner, 0, Number(e.target.value))}
                        className="w-full bg-[#171717] border border-editor-border rounded text-xs text-editor-text px-2 py-1 nodrag"
                      />
                    </Row>
                    <Row label="Y Position">
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
              disabled={!el.pts}
              className="text-xs px-3 py-1.5 bg-editor-elevated-highlight border border-editor-border rounded text-[#f2f2f2] hover:text-editor-text transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Reset Perspective
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
