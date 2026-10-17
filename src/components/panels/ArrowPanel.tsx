import { useEffect } from 'react'
import { ArrowRight, PenLine, Zap } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import type { ArrowElement, ArrowHeadType, ArrowBendDirection, AnimationType } from '../../types/editor'
import { PanelHeader, Row, ColorInput, Slider, NumberInput, AnimSection } from './TextPanel'
import { makeAnimation, makeCenteredArrow } from '../../utils/defaults'
import { cn } from '../../utils/cn'
import { isMotionAnimation } from '../../utils/moveAnimation'
import { isLoopAnimation } from '../../utils/animationTypes'
import { useShallow } from 'zustand/react/shallow'
import { ArrowAttachments } from './ArrowConnections'

const HEADS: { label: string; value: ArrowHeadType }[] = [
  { label: 'None', value: 'none' },
  { label: '→',    value: 'end' },
  { label: '←',    value: 'start' },
  { label: '↔',    value: 'both' }
]

const ENTER_ANIMS: { label: string; value: AnimationType }[] = [
  { label: 'Draw On',  value: 'drawPath' },
  { label: 'Slide In', value: 'slideIn'  },
  { label: 'Fade In',  value: 'fadeIn'   },
  { label: 'Scale In', value: 'scaleIn'  },
  { label: 'Scale Out',value: 'scaleOut' },
  { label: 'Wipe In',  value: 'wipeIn'   },
]

const LOOP_ANIMS: { label: string; value: AnimationType }[] = [
  { label: 'Pulse',     value: 'pulse'      },
  { label: 'Flow',      value: 'flowLoop'   },
  { label: 'Bounce',    value: 'bounceLoop' },
  { label: 'Fade Loop', value: 'fadeLoop'   },
]

const EXIT_ANIMS: { label: string; value: AnimationType }[] = [
  { label: 'Draw Off',  value: 'drawOff'  },
  { label: 'Slide Out', value: 'slideOut' },
  { label: 'Fade Out',  value: 'fadeOut'  },
  { label: 'Scale In',  value: 'scaleIn'  },
  { label: 'Scale Out', value: 'scaleOut' },
  { label: 'Wipe Out',  value: 'wipeOut'  },
]

export function BendCountInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const setValue = (next: number) => onChange(Math.min(8, Math.max(0, Math.round(next || 0))))
  const buttonClass = 'w-8 shrink-0 rounded border border-editor-border bg-editor-elevated-highlight text-editor-text hover:border-editor-accent disabled:opacity-40 disabled:cursor-not-allowed'

  return (
    <div className="flex h-7 gap-1">
      <button type="button" aria-label="Decrease bend count" disabled={value <= 0}
        onClick={() => setValue(value - 1)} className={buttonClass}>−</button>
      <input aria-label="Bend count" type="number" min={0} max={8} step={1} value={value}
        onChange={e => setValue(Number(e.target.value))}
        className="min-w-0 flex-1 rounded border border-editor-border bg-editor-elevated-highlight px-2 text-center text-xs text-editor-text nodrag" />
      <button type="button" aria-label="Increase bend count" disabled={value >= 8}
        onClick={() => setValue(value + 1)} className={buttonClass}>+</button>
    </div>
  )
}

export default function ArrowPanel() {
  const { getSelectedEls, updateElement, addAnimation, addElement, project, activeTool, setActiveTool } = useEditorStore(useShallow(s => ({ getSelectedEls: s.getSelectedEls, updateElement: s.updateElement, addAnimation: s.addAnimation, addElement: s.addElement, project: s.project, activeTool: s.activeTool, setActiveTool: s.setActiveTool, currentSceneId: s.currentSceneId, selectedIds: s.selectedIds })))
  const isDrawing = activeTool === 'arrow'

  // Leaving the arrow panel cancels draw mode so the crosshair doesn't linger.
  useEffect(() => () => {
    const { activeTool, setActiveTool } = useEditorStore.getState()
    if (activeTool === 'arrow') setActiveTool('select')
  }, [])
  const el = getSelectedEls().find(e => e.type === 'arrow') as ArrowElement | undefined

  function upd(patch: Partial<ArrowElement>) {
    if (el) updateElement(el.id, patch)
  }

  function applyAngle(angleDeg: number) {
    if (!el) return
    const cx = (el.x1 + el.x2) / 2, cy = (el.y1 + el.y2) / 2
    const len = Math.sqrt((el.x2 - el.x1) ** 2 + (el.y2 - el.y1) ** 2) / 2
    const rad = angleDeg * Math.PI / 180
    upd({
      x1: cx - Math.cos(rad) * len, y1: cy - Math.sin(rad) * len,
      x2: cx + Math.cos(rad) * len, y2: cy + Math.sin(rad) * len,
    })
  }

  const currentAngle = el
    ? Math.round(Math.atan2(el.y2 - el.y1, el.x2 - el.x1) * 180 / Math.PI)
    : 0

  return (
    <div className="flex flex-col overflow-y-auto flex-1">
      <PanelHeader icon={<ArrowRight size={12} />} title="Arrow / Line" />

      {/* Add arrow button — always visible */}
      <div className="px-3 py-2 border-b border-editor-border">
        <button
          disabled={!project}
          onClick={() => {
            if (!project) return
            addElement(makeCenteredArrow(project.width, project.height))
          }}
          className="w-full text-xs py-2 text-[#f2f2f2] bg-editor-accent rounded"
        >
          + Add Arrow
        </button>
        {/* Draw mode: drag on the canvas (crosshair) to draw one arrow */}
        <button
          disabled={!project}
          onClick={() => setActiveTool(isDrawing ? 'select' : 'arrow')}
          className={cn(
            'w-full mt-2 flex items-center justify-center gap-1.5 text-xs py-2 rounded border transition-colors',
            isDrawing
              ? 'border-editor-accent bg-editor-accent/20 text-editor-text'
              : 'border-editor-border text-[#f2f2f2] hover:border-editor-accent'
          )}
          title="Drag on the canvas to draw an arrow"
        >
          <PenLine size={12} />
          {isDrawing ? 'Drawing… drag on canvas (Esc to cancel)' : 'Draw Arrow'}
        </button>
      </div>

      {el && <ArrowAttachments arrow={el} />}

      {/* Properties */}
      {el && (
        <div className="flex flex-col px-3 py-2 gap-0.5">
          <Row label="Arrowhead">
            <div className="flex gap-1">
              {HEADS.map(h => (
                <button key={h.value} onClick={() => upd({ arrowHead: h.value })}
                  className={cn('flex-1 py-1 text-xs rounded border transition-colors',
                    el.arrowHead === h.value
                      ? 'bg-editor-accent-dim border-editor-accent text-editor-accent'
                      : 'bg-editor-elevated-highlight border-editor-border text-[#f2f2f2] hover:text-editor-text'
                  )}>
                  {h.label}
                </button>
              ))}
            </div>
          </Row>

          <Row label="Head Size">
            <div className="flex gap-2">
              <div className="flex-1">
                <span className="label block">Length</span>
                <NumberInput value={el.pointerLength ?? 12} min={4} max={60} onChange={v => upd({ pointerLength: v })} />
              </div>
              <div className="flex-1">
                <span className="label block">Width</span>
                <NumberInput value={el.pointerWidth ?? 10} min={4} max={60} onChange={v => upd({ pointerWidth: v })} />
              </div>
            </div>
          </Row>

          <Row label="Line Color">
            <ColorInput value={el.stroke} onChange={v => upd({ stroke: v })} />
          </Row>

          <Row label="Head Color">
            <ColorInput
              value={el.arrowHeadColor && el.arrowHeadColor !== '' ? el.arrowHeadColor : el.stroke}
              onChange={v => upd({ arrowHeadColor: v })}
            />
          </Row>

          <Row label="Width">
            <Slider value={el.strokeWidth} min={1} max={40} step={0.5}
              onChange={v => upd({ strokeWidth: v })} display={`${el.strokeWidth}px`} />
          </Row>

          <Row label="Style">
            <div className="flex gap-1">
              {([['Solid', false, false], ['Dashed', true, false], ['Dotted', false, true]] as [string, boolean, boolean][]).map(([label, dashed, dotted]) => (
                <button key={label}
                  onClick={() => upd({ dashed, dotted })}
                  className={cn('flex-1 py-1 text-xs rounded border transition-colors',
                    el.dashed === dashed && el.dotted === dotted
                      ? 'bg-editor-accent-dim border-editor-accent text-editor-accent'
                      : 'bg-editor-elevated-highlight border-editor-border text-[#f2f2f2] hover:text-editor-text'
                  )}>
                  {label}
                </button>
              ))}
            </div>
          </Row>

          <Row label="Bend Count">
            <BendCountInput value={el.bendCount ?? 0} onChange={bendCount => upd({ bendCount })} />
          </Row>

          {(el.bendCount ?? 0) === 0 && (
            <p className="pb-1 text-[10px] text-editor-text-secondary">Set Bend Count above 0 to enable routed corners.</p>
          )}

          <fieldset
            disabled={(el.bendCount ?? 0) === 0}
            className={cn('min-w-0 border-0 p-0 m-0', (el.bendCount ?? 0) === 0 && 'pointer-events-none opacity-40')}
          >
              <Row label="Bend Direction">
                <select
                  value={el.bendDirection ?? 'horizontal'}
                  onChange={e => upd({ bendDirection: e.target.value as ArrowBendDirection })}
                  className="w-full bg-editor-elevated-highlight border border-editor-border rounded text-xs text-editor-text px-2 py-1"
                >
                  <option value="horizontal">Horizontal first</option>
                  <option value="vertical">Vertical first</option>
                </select>
              </Row>
              <Row label="Corner Curve">
                <Slider value={el.bendCurve ?? 32} min={0} max={200} step={1}
                  onChange={v => upd({ bendCurve: v })} display={`${el.bendCurve ?? 32}px`} />
              </Row>
          </fieldset>

          {(el.bendCount ?? 0) === 0 && (
            <Row label="Curve">
              <Slider value={el.curve ?? 0} min={-800} max={800} step={5}
                onChange={v => upd({ curve: v })} display={`${el.curve ?? 0}`} />
            </Row>
          )}

          <Row label="Angle">
            <div className="flex items-center gap-2">
              <input type="number" min={-180} max={180} step={1}
                value={currentAngle}
                onChange={e => applyAngle(Number(e.target.value))}
                className="flex-1 bg-editor-elevated-highlight border border-editor-border rounded text-xs text-editor-text px-2 py-1 nodrag"
              />
              <span className="text-xs text-[#f2f2f2]">°</span>
              <button onClick={() => applyAngle(currentAngle + 90)}
                className="text-xs px-2 py-1 bg-editor-elevated-highlight border border-editor-border rounded text-[#f2f2f2] hover:text-editor-text transition-colors">
                +90°
              </button>
            </div>
          </Row>

          <Row label="Opacity">
            <Slider value={el.opacity} min={0} max={1} step={0.01}
              onChange={v => upd({ opacity: v })} display={`${Math.round(el.opacity * 100)}%`} />
          </Row>
        </div>
      )}

      {/* ── Animations ─────────────────────────────────────────────────────── */}
      {el && (
        <div className="border-t border-editor-border">
          <div className="px-3 py-2 flex items-center gap-1.5">
            <Zap size={11} className="text-editor-accent" />
            <span className="text-[10px] font-semibold text-[#f2f2f2] uppercase tracking-wider">Animations</span>
          </div>

          <AnimSection
            label="On Enter"
            color="text-green-400"
            anims={el.animations.filter(a => !isMotionAnimation(a) && !isLoopAnimation(a) && a.timing === 'onEnter')}
            types={ENTER_ANIMS}
            onAdd={() => addAnimation(el.id, { ...makeAnimation(), type: 'drawPath', timing: 'onEnter' })}
            elId={el.id}
            isLoop={false}
          />
          <AnimSection
            label="Loop"
            color="text-editor-accent"
            anims={el.animations.filter(a => !isMotionAnimation(a) && isLoopAnimation(a))}
            types={LOOP_ANIMS}
            onAdd={() => addAnimation(el.id, { ...makeAnimation(), type: 'flowLoop', timing: 'loop', duration: 1 })}
            elId={el.id}
            isLoop={true}
          />
          <AnimSection
            label="On Exit"
            color="text-red-400"
            anims={el.animations.filter(a => !isMotionAnimation(a) && !isLoopAnimation(a) && a.timing === 'onExit')}
            types={EXIT_ANIMS}
            onAdd={() => addAnimation(el.id, { ...makeAnimation(), type: 'drawOff', timing: 'onExit' })}
            elId={el.id}
            isLoop={false}
          />
        </div>
      )}
    </div>
  )
}

