import { ArrowRight, Plus, Trash2, Zap } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import type { ArrowElement, ArrowHeadType, AnimationType, EasingType, SlideDir, ElementAnimation } from '../../types/editor'
import { PanelHeader, Row, ColorInput, Slider, NumberInput } from './TextPanel'
import { makeAnimation } from '../../utils/defaults'
import { cn } from '../../utils/cn'

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

const EASINGS: { label: string; value: EasingType }[] = [
  { label: 'Linear',    value: 'linear' },
  { label: 'Ease In',   value: 'easeIn' },
  { label: 'Ease Out',  value: 'easeOut' },
  { label: 'Ease InOut',value: 'easeInOut' },
  { label: 'Bounce',    value: 'bounce' }
]

const DIRECTIONS: { label: string; value: SlideDir }[] = [
  { label: '← Left',  value: 'left' },
  { label: '→ Right', value: 'right' },
  { label: '↑ Up',    value: 'up' },
  { label: '↓ Down',  value: 'down' }
]

const LOOP_TYPE_SET = new Set<string>(['pulse', 'bounceLoop', 'rotateLoop', 'flowLoop', 'fadeLoop'])
const isLoopAnim = (a: ElementAnimation) => LOOP_TYPE_SET.has(a.type) || a.timing === 'loop'

export default function ArrowPanel() {
  const { getSelectedEls, updateElement, addAnimation, setActiveTool } = useEditorStore()
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

      {/* Draw button */}
      <div className="px-3 py-2 border-b border-editor-border">
        <button
          onClick={() => setActiveTool('arrow')}
          className="w-full text-xs py-2 text-[#f2f2f2] bg-editor-accent rounded"
        >
          Draw Arrow
        </button>
      </div>

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
                      : 'bg-editor-elevated border-editor-border text-[#f2f2f2] hover:text-editor-text'
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
                      : 'bg-editor-elevated border-editor-border text-[#f2f2f2] hover:text-editor-text'
                  )}>
                  {label}
                </button>
              ))}
            </div>
          </Row>

          <Row label="Curve">
            <Slider value={el.curve ?? 0} min={-800} max={800} step={5}
              onChange={v => upd({ curve: v })} display={`${el.curve ?? 0}`} />
          </Row>

          <Row label="Angle">
            <div className="flex items-center gap-2">
              <input type="number" min={-180} max={180} step={1}
                value={currentAngle}
                onChange={e => applyAngle(Number(e.target.value))}
                className="flex-1 bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1 nodrag"
              />
              <span className="text-xs text-[#f2f2f2]">°</span>
              <button onClick={() => applyAngle(currentAngle + 90)}
                className="text-xs px-2 py-1 bg-editor-elevated border border-editor-border rounded text-[#f2f2f2] hover:text-editor-text transition-colors">
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
            anims={el.animations.filter(a => a.type !== 'move' && !isLoopAnim(a) && a.timing === 'onEnter')}
            types={ENTER_ANIMS}
            onAdd={() => addAnimation(el.id, { ...makeAnimation(), type: 'drawPath', timing: 'onEnter' })}
            elId={el.id}
            isLoop={false}
          />
          <AnimSection
            label="Loop"
            color="text-editor-accent"
            anims={el.animations.filter(a => a.type !== 'move' && isLoopAnim(a))}
            types={LOOP_ANIMS}
            onAdd={() => addAnimation(el.id, { ...makeAnimation(), type: 'flowLoop', timing: 'loop', duration: 1 })}
            elId={el.id}
            isLoop={true}
          />
          <AnimSection
            label="On Exit"
            color="text-red-400"
            anims={el.animations.filter(a => a.type !== 'move' && !isLoopAnim(a) && a.timing === 'onExit')}
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

function AnimSection({
  label, color, anims, types, onAdd, elId, isLoop
}: {
  label: string
  color: string
  anims: ElementAnimation[]
  types: { label: string; value: AnimationType }[]
  onAdd: () => void
  elId: string
  isLoop: boolean
}) {
  return (
    <div className="border-t border-editor-border">
      <div className="px-3 py-1.5 flex items-center justify-between">
        <span className={cn('text-[10px] font-semibold uppercase tracking-wider', color)}>{label}</span>
        <button
          onClick={onAdd}
          className="flex items-center gap-1 text-[10px] px-2 py-0.5 bg-editor-elevated text-[#f2f2f2] border border-editor-border rounded hover:text-editor-text transition-colors"
        >
          <Plus size={8} /> Add
        </button>
      </div>

      {anims.length === 0 && (
        <p className="text-[10px] text-[#d9d9d9] px-3 pb-2">None — click Add to create one.</p>
      )}

      {anims.map((anim, i) => (
        <AnimBlock key={anim.id} anim={anim} index={i} elId={elId} types={types} isLoop={isLoop} />
      ))}
    </div>
  )
}

function AnimBlock({
  anim, index, elId, types, isLoop
}: {
  anim: ElementAnimation; index: number; elId: string
  types: { label: string; value: AnimationType }[]
  isLoop: boolean
}) {
  const { updateAnimation, removeAnimation } = useEditorStore()

  function upd(patch: Partial<ElementAnimation>) {
    updateAnimation(elId, anim.id, patch)
  }

  const hasDir  = ['slideIn', 'slideOut', 'wipeIn', 'wipeOut'].includes(anim.type)
  const hasDist = anim.type === 'bounceLoop'

  return (
    <div className="border-b border-editor-border px-3 py-2 flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-editor-secondary font-medium">#{index + 1}</span>
        <button onClick={() => removeAnimation(elId, anim.id)} className="text-[#d9d9d9] hover:text-red-400 transition-colors">
          <Trash2 size={10} />
        </button>
      </div>

      <Row label="Type">
        <select
          value={anim.type}
          onChange={e => upd({ type: e.target.value as AnimationType })}
          className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1"
        >
          {types.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </Row>

      {isLoop && (
        <div className="text-[10px] text-editor-accent bg-editor-accent-dim rounded px-2 py-0.5 w-fit">
          ∞ Loops continuously
        </div>
      )}

      {hasDir && (
        <Row label="Direction">
          <select
            value={anim.params?.direction ?? 'right'}
            onChange={e => upd({ params: { ...anim.params, direction: e.target.value as SlideDir } })}
            className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1"
          >
            {DIRECTIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </Row>
      )}

      {hasDist && (
        <Row label="Distance (px)">
          <input type="number" min={4} max={200} step={2}
            value={anim.params?.distance ?? 24}
            onChange={e => upd({ params: { ...anim.params, distance: Number(e.target.value) } })}
            className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1 nodrag"
          />
        </Row>
      )}

      <Row label="Start (s)">
        <input type="number" min={0} max={60} step={0.1}
          value={anim.startTime}
          onChange={e => upd({ startTime: Number(e.target.value) })}
          className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1 nodrag"
        />
      </Row>

      <Row label={isLoop ? 'Period (s)' : 'Duration (s)'}>
        <input type="number" min={0.1} max={30} step={0.1}
          value={anim.duration}
          onChange={e => upd({ duration: Number(e.target.value) })}
          className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1 nodrag"
        />
      </Row>

      <Row label="Delay (s)">
        <input type="number" min={0} max={30} step={0.1}
          value={anim.delay}
          onChange={e => upd({ delay: Number(e.target.value) })}
          className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1 nodrag"
        />
      </Row>

      {!isLoop && (
        <Row label="Easing">
          <select
            value={anim.easing}
            onChange={e => upd({ easing: e.target.value as EasingType })}
            className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1"
          >
            {EASINGS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
          </select>
        </Row>
      )}
    </div>
  )
}
