import { Plus, Trash2, Shapes } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import type { IconElement, AnimationType, EasingType, SlideDir, ElementAnimation } from '../../types/editor'
import { PanelHeader, Row, ColorInput } from './TextPanel'
import { cn } from '../../utils/cn'
import { makeAnimation } from '../../utils/defaults'

const ENTER_ANIMS: { label: string; value: AnimationType }[] = [
  { label: 'Slide In',  value: 'slideIn'  },
  { label: 'Fade In',   value: 'fadeIn'   },
  { label: 'Scale In',  value: 'scaleIn'  },
  { label: 'Scale Out', value: 'scaleOut' },
  { label: 'Wipe In',   value: 'wipeIn'   },
]

const LOOP_ANIMS: { label: string; value: AnimationType }[] = [
  { label: 'Pulse',     value: 'pulse'      },
  { label: 'Bounce',    value: 'bounceLoop' },
  { label: 'Rotate',    value: 'rotateLoop' },
  { label: 'Fade Loop', value: 'fadeLoop'   },
]

const EXIT_ANIMS: { label: string; value: AnimationType }[] = [
  { label: 'Slide Out', value: 'slideOut' },
  { label: 'Fade Out',  value: 'fadeOut'  },
  { label: 'Scale In',  value: 'scaleIn'  },
  { label: 'Scale Out', value: 'scaleOut' },
  { label: 'Wipe Out',  value: 'wipeOut'  },
]

const EASINGS: { label: string; value: EasingType }[] = [
  { label: 'Linear',     value: 'linear'   },
  { label: 'Ease In',    value: 'easeIn'   },
  { label: 'Ease Out',   value: 'easeOut'  },
  { label: 'Ease InOut', value: 'easeInOut'},
  { label: 'Bounce',     value: 'bounce'   },
]

const DIRECTIONS: { label: string; value: SlideDir }[] = [
  { label: '← Left',  value: 'left'  },
  { label: '→ Right', value: 'right' },
  { label: '↑ Up',    value: 'up'    },
  { label: '↓ Down',  value: 'down'  },
]

const LOOP_TYPE_SET = new Set<string>(['pulse', 'bounceLoop', 'rotateLoop', 'flowLoop', 'fadeLoop'])
const isLoopAnim = (a: ElementAnimation) => LOOP_TYPE_SET.has(a.type) || a.timing === 'loop'

export default function IconEditPanel() {
  const { getSelectedEls, updateElement, addAnimation } = useEditorStore()
  const iconEl = getSelectedEls().find(e => e.type === 'icon') as IconElement | undefined

  function upd(patch: Partial<IconElement>) {
    if (iconEl) updateElement(iconEl.id, patch)
  }

  if (!iconEl) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <PanelHeader icon={<Shapes size={12} />} title="Icon" />
        <p className="text-xs text-[#f2f2f2] px-3 py-3">Select an icon to edit its properties.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PanelHeader icon={<Shapes size={12} />} title="Icon" />

      <div className="flex-1 overflow-y-auto">
        <div className="px-3 py-3 flex flex-col gap-2">
          <div className="text-[10px] text-[#f2f2f2] uppercase tracking-wider font-medium">
            {iconEl.iconName}
          </div>

          <Row label="Color">
            <ColorInput value={iconEl.color} onChange={v => upd({ color: v })} />
          </Row>

          <Row label="Stroke Width">
            <div className="flex items-center gap-2">
              <input
                type="range" min={0.5} max={4} step={0.5}
                value={iconEl.strokeWidth}
                onChange={e => upd({ strokeWidth: parseFloat(e.target.value) })}
                className="flex-1 accent-editor-accent nodrag"
              />
              <span className="text-[10px] text-[#f2f2f2] w-5 text-right">{iconEl.strokeWidth}</span>
            </div>
          </Row>

          <Row label="Opacity">
            <div className="flex items-center gap-2">
              <input
                type="range" min={0} max={1} step={0.01}
                value={iconEl.opacity}
                onChange={e => upd({ opacity: parseFloat(e.target.value) })}
                className="flex-1 accent-editor-accent nodrag"
              />
              <span className="text-[10px] text-[#f2f2f2] w-8 text-right">
                {Math.round(iconEl.opacity * 100)}%
              </span>
            </div>
          </Row>
        </div>

        {/* ── Animations ──────────────────────────────────────────── */}
        <AnimSection
          label="On Enter" color="text-green-400"
          anims={iconEl.animations.filter(a => a.type !== 'move' && !isLoopAnim(a) && a.timing === 'onEnter')}
          types={ENTER_ANIMS}
          onAdd={() => addAnimation(iconEl.id, { ...makeAnimation(), type: 'fadeIn', timing: 'onEnter' })}
          elId={iconEl.id} isLoop={false}
        />
        <AnimSection
          label="Loop" color="text-editor-accent"
          anims={iconEl.animations.filter(a => a.type !== 'move' && isLoopAnim(a))}
          types={LOOP_ANIMS}
          onAdd={() => addAnimation(iconEl.id, { ...makeAnimation(), type: 'pulse', timing: 'loop', duration: 1 })}
          elId={iconEl.id} isLoop={true}
        />
        <AnimSection
          label="On Exit" color="text-red-400"
          anims={iconEl.animations.filter(a => a.type !== 'move' && !isLoopAnim(a) && a.timing === 'onExit')}
          types={EXIT_ANIMS}
          onAdd={() => addAnimation(iconEl.id, { ...makeAnimation(), type: 'fadeOut', timing: 'onExit' })}
          elId={iconEl.id} isLoop={false}
        />
      </div>
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
    <div className="border-t border-editor-border px-3 py-2 flex flex-col gap-1.5">
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
            value={anim.params?.direction ?? 'left'}
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
