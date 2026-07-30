import { Sparkles } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import type { TextElement, TextEffectType } from '../../types/editor'
import { PanelHeader } from './TextPanel'
import { cn } from '../../utils/cn'
import { TEXT_EFFECT_OPTIONS, normalizeTextEffects } from '../../utils/textEffects'

export default function TextEffectsPanel() {
  const { getSelectedEls, updateElement } = useEditorStore()
  const els = getSelectedEls().filter(e => e.type === 'text')
  const el  = els[0] as TextElement | undefined
  const activeEffects = normalizeTextEffects(el?.effects)

  function toggleEffect(effect: TextEffectType) {
    if (!el) return
    const effects = normalizeTextEffects(el.effects)
    const hasEffect = effects.includes(effect)
    
    if (hasEffect) {
      updateElement(el.id, { effects: effects.filter(e => e !== effect) })
    } else {
      updateElement(el.id, { effects: [...effects, effect] })
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PanelHeader icon={<Sparkles size={12} />} title="Text Effects" />

      <div className="flex-1 overflow-y-auto">
        {!el && (
          <p className="text-xs text-[#f2f2f2] px-3 py-3">
            Select a text element to add effects.
          </p>
        )}

        {el && (
          <div className="flex flex-col gap-0 px-3 py-2">
            <p className="text-xs text-[#f2f2f2] mb-2">
              Click to toggle effects on/off
            </p>

            <div className="grid grid-cols-2 gap-2">
              {TEXT_EFFECT_OPTIONS.map(effect => {
                const isActive = activeEffects.includes(effect.value)
                
                return (
                  <button
                    key={effect.value}
                    onClick={() => toggleEffect(effect.value)}
                    className={cn(
                      'flex flex-col items-start gap-1 p-3 rounded-lg border-2 transition-all text-left',
                      isActive
                        ? 'bg-editor-accent-dim border-editor-accent'
                        : 'bg-editor-elevated border-editor-border hover:border-editor-border-strong'
                    )}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className={cn(
                        'text-xs font-medium',
                        isActive ? 'text-editor-accent' : 'text-editor-text'
                      )}>
                        {effect.label}
                      </span>
                      {isActive && (
                        <div className="w-2 h-2 rounded-full bg-editor-accent" />
                      )}
                    </div>
                    <span className="text-2xs text-[#f2f2f2]">
                      {effect.description}
                    </span>
                  </button>
                )
              })}
            </div>

            {activeEffects.length > 0 && (
              <div className="mt-3 p-2 bg-editor-accent-dim rounded text-xs text-editor-accent">
                <strong>Active:</strong> {activeEffects.join(', ')}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
