import { Plus, Trash2, Zap } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import type { AnimationType, EasingType, SlideDir, AnimationTiming, ElementAnimation } from '../../types/editor'
import { makeAnimation } from '../../utils/defaults'
import { PanelHeader, Row } from './TextPanel'
import { cn } from '../../utils/cn'

const ENTER_ANIMS: { label: string; value: AnimationType }[] = [
  { label: 'Draw On',      value: 'drawPath' },
  { label: 'Direction Slide', value: 'slideIn' },
  { label: 'Fade In',      value: 'fadeIn' },
  { label: 'Zoom In',      value: 'scaleIn' },
]

const LOOP_ANIMS: { label: string; value: AnimationType }[] = [
  { label: 'Pulse',        value: 'pulse' },
  { label: 'Infinite Flow', value: 'flowLoop' },
  { label: 'Fade In/Out',  value: 'fadeLoop' },
]

const EXIT_ANIMS: { label: string; value: AnimationType }[] = [
  { label: 'Draw Off',     value: 'drawOff' },
  { label: 'Direction Slide', value: 'slideOut' },
  { label: 'Fade Out',     value: 'fadeOut' },
  { label: 'Zoom Out',     value: 'scaleOut' },
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

function animsByTiming(timing: AnimationTiming) {
  if (timing === 'onEnter') return ENTER_ANIMS
  if (timing === 'loop')    return LOOP_ANIMS
  return EXIT_ANIMS
}

export default function ArrowAnimationPanel() {
  const { getSelectedEls, addAnimation } = useEditorStore()
  const els = getSelectedEls().filter(e => e.type === 'arrow')
  const el  = els[0]

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PanelHeader icon={<Zap size={12} />} title="Arrow Animations" />

      <div className="flex-1 overflow-y-auto">
        {!el && (
          <p className="text-xs text-[#f2f2f2] px-3 py-3">
            Select an arrow to add animations.
          </p>
        )}

        {el && (
          <div className="flex flex-col gap-0">
            <div className="px-3 py-2 border-b border-editor-border">
              <button
                onClick={() => addAnimation(el.id, { ...makeAnimation(), type: 'drawPath', timing: 'onEnter' })}
                className="flex items-center gap-1.5 w-full text-xs py-1.5 px-3 bg-editor-accent-dim text-editor-accent border border-editor-accent rounded hover:bg-editor-accent hover:text-white transition-colors"
              >
                <Plus size={11} /> Add Arrow Animation
              </button>
            </div>

            {el.animations.length === 0 && (
              <p className="text-xs text-[#f2f2f2] px-3 py-3">No animations yet.</p>
            )}

            {el.animations.filter(anim => anim.type !== 'move').map((anim, i) => (
              <AnimBlock key={anim.id} anim={anim} index={i} elId={el.id} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function AnimBlock({ anim, index, elId }: {
  anim: ElementAnimation; index: number; elId: string
}) {
  const { updateAnimation, removeAnimation } = useEditorStore()

  function upd(patch: Partial<ElementAnimation>) {
    updateAnimation(elId, anim.id, patch)
  }

  const isLoop = anim.timing === 'loop'
  const hasDir = anim.type === 'slideIn' || anim.type === 'slideOut'

  return (
    <div className="border-b border-editor-border px-3 py-2 flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-editor-secondary font-medium">Animation {index + 1}</span>
        <button onClick={() => removeAnimation(elId, anim.id)} className="text-[#f2f2f2] hover:text-red-400">
          <Trash2 size={11} />
        </button>
      </div>

      {/* Timing */}
      <Row label="Timing">
        <div className="flex gap-1">
          {(['onEnter', 'loop', 'onExit'] as AnimationTiming[]).map(t => (
            <button
              key={t}
              onClick={() => {
                const newType = animsByTiming(t)[0].value
                upd({ timing: t, type: newType })
              }}
              className={cn(
                'flex-1 text-xs px-2 py-1.5 rounded transition-colors',
                anim.timing === t
                  ? 'bg-editor-accent text-white'
                  : 'bg-editor-elevated text-[#f2f2f2] hover:text-editor-text'
              )}
            >
              {t === 'onEnter' ? 'Enter' : t === 'onExit' ? 'Exit' : 'Loop'}
            </button>
          ))}
        </div>
      </Row>

      {/* Type */}
      <Row label="Animation">
        <select
          value={anim.type}
          onChange={e => upd({ type: e.target.value as AnimationType })}
          className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1"
        >
          {animsByTiming(anim.timing).map(t =>
            <option key={t.value} value={t.value}>{t.label}</option>
          )}
        </select>
      </Row>

      {isLoop && (
        <div className="text-2xs text-editor-accent bg-editor-accent-dim rounded px-2 py-0.5 w-fit">
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

      <Row label="Start Time (s)">
        <input
          type="number" min={0} max={60} step={0.1}
          value={anim.startTime}
          onChange={e => upd({ startTime: Number(e.target.value) })}
          className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1 nodrag"
        />
      </Row>

      <Row label={isLoop ? 'Period (s)' : 'Duration (s)'}>
        <input
          type="number" min={0.1} max={30} step={0.1}
          value={anim.duration}
          onChange={e => upd({ duration: Number(e.target.value) })}
          className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1 nodrag"
        />
      </Row>

      <Row label="Delay (s)">
        <input
          type="number" min={0} max={30} step={0.1}
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
