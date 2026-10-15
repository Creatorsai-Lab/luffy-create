import { Shapes } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import type { IconElement, AnimationType } from '../../types/editor'
import { PanelHeader, Row, ColorInput, AnimSection } from './TextPanel'
import { makeAnimation } from '../../utils/defaults'
import { isMotionAnimation } from '../../utils/moveAnimation'
import { isLoopAnimation } from '../../utils/animationTypes'
import { useShallow } from 'zustand/react/shallow'

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

export default function IconEditPanel() {
  const { getSelectedEls, updateElement, addAnimation } = useEditorStore(useShallow(s => ({ getSelectedEls: s.getSelectedEls, updateElement: s.updateElement, addAnimation: s.addAnimation, project: s.project, currentSceneId: s.currentSceneId, selectedIds: s.selectedIds })))
  const iconEl = getSelectedEls().find(e => e.type === 'icon') as IconElement | undefined

  function upd(patch: Partial<IconElement>) {
    if (iconEl) updateElement(iconEl.id, patch)
  }

  function updateSize(size: number) {
    if (!iconEl) return
    const next = Math.max(8, Math.min(1000, size))
    updateElement(iconEl.id, {
      x: iconEl.x + (iconEl.width - next) / 2,
      y: iconEl.y + (iconEl.height - next) / 2,
      width: next,
      height: next,
    })
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

          <Row label="Size">
            <div className="flex items-center gap-2">
              <input
                type="range" min={30} max={1000} step={1}
                value={Math.round(Math.max(iconEl.width, iconEl.height))}
                onChange={e => updateSize(Number(e.target.value))}
                className="flex-1 accent-editor-accent nodrag"
              />
              <input
                type="number" min={30} max={1000} step={1}
                value={Math.round(Math.max(iconEl.width, iconEl.height))}
                onChange={e => updateSize(Number(e.target.value))}
                className="w-16 bg-editor-elevated-highlight border border-editor-border rounded text-[10px] text-editor-text px-1.5 py-1 text-right nodrag"
              />
            </div>
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
          anims={iconEl.animations.filter(a => !isMotionAnimation(a) && !isLoopAnimation(a) && a.timing === 'onEnter')}
          types={ENTER_ANIMS}
          onAdd={() => addAnimation(iconEl.id, { ...makeAnimation(), type: 'fadeIn', timing: 'onEnter' })}
          elId={iconEl.id} isLoop={false}
        />
        <AnimSection
          label="Loop" color="text-editor-accent"
          anims={iconEl.animations.filter(a => !isMotionAnimation(a) && isLoopAnimation(a))}
          types={LOOP_ANIMS}
          onAdd={() => addAnimation(iconEl.id, { ...makeAnimation(), type: 'pulse', timing: 'loop', duration: 1 })}
          elId={iconEl.id} isLoop={true}
        />
        <AnimSection
          label="On Exit" color="text-red-400"
          anims={iconEl.animations.filter(a => !isMotionAnimation(a) && !isLoopAnimation(a) && a.timing === 'onExit')}
          types={EXIT_ANIMS}
          onAdd={() => addAnimation(iconEl.id, { ...makeAnimation(), type: 'fadeOut', timing: 'onExit' })}
          elId={iconEl.id} isLoop={false}
        />
      </div>
    </div>
  )
}

