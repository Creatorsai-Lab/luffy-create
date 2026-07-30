import { useState } from 'react'
import { useEditorStore } from '../../store/editorStore'
import { FONT_FAMILIES } from '../../types/editor'
import type { TextElement, TextFillMode, FontWeight, AlignType, AnimationType, EasingType, SlideDir, ElementAnimation, TextEffectType } from '../../types/editor'
import { AlignLeft, AlignCenter, AlignRight, Italic, Underline, Type, Plus, Trash2 } from 'lucide-react'
import { cn } from '../../utils/cn'
import { makeAnimation, makeText } from '../../utils/defaults'
import { InnerShadowControls } from './BoxShadowControls'
import { ScaleSizeControl } from './AnimationParamControls'
import { FONT_WEIGHT_OPTIONS, normalizeFontWeightForControl } from '../../utils/fontWeight'

const TEXT_EFFECTS: { label: string; value: TextEffectType }[] = [
  { label: 'Shadow',  value: 'shadow'  },
  { label: 'Glow',    value: 'glow'    },
  { label: 'Outline', value: 'outline' },
  { label: 'Hollow',  value: 'hollow'  },
  { label: 'Glitch',  value: 'glitch'  },
  { label: 'Bubble',  value: 'bubble'  },
]

export const ENTER_ANIMS: { label: string; value: AnimationType }[] = [
  { label: 'Slide In',           value: 'slideIn'        },
  { label: 'Fade In',            value: 'fadeIn'         },
  { label: 'Scale In',           value: 'scaleIn'        },
  { label: 'Scale Out',          value: 'scaleOut'       },
  { label: 'Wipe In',            value: 'wipeIn'         },
  { label: 'Typewriter (Chars)', value: 'typewriterChars'},
  { label: 'Typewriter (Words)', value: 'typewriterWords'},
  { label: 'Bounce Words',       value: 'textBounceIn'   },
]
export const TEXT_ENTER_ANIMS = [
  ...ENTER_ANIMS,
  { label: 'Outline Reveal In', value: 'outlineRevealIn' as const },
]

export const LOOP_ANIMS: { label: string; value: AnimationType }[] = [
  { label: 'Pulse',     value: 'pulse'      },
  { label: 'Bounce',    value: 'bounceLoop' },
  { label: 'Rotate',    value: 'rotateLoop' },
  { label: 'Fade Loop', value: 'fadeLoop'   },
]

const TEXT_LOOP_ANIMS: { label: string; value: AnimationType }[] = [
  ...LOOP_ANIMS,
  { label: 'Color Pulse', value: 'colorPulse' },
]

export const EXIT_ANIMS: { label: string; value: AnimationType }[] = [
  { label: 'Slide Out', value: 'slideOut' },
  { label: 'Fade Out',  value: 'fadeOut'  },
  { label: 'Scale In',  value: 'scaleIn'  },
  { label: 'Scale Out', value: 'scaleOut' },
  { label: 'Wipe Out',  value: 'wipeOut'  },
]
export const TEXT_EXIT_ANIMS = [
  ...EXIT_ANIMS,
  { label: 'Outline Reveal Out', value: 'outlineRevealOut' as const },
]

const DIRECTIONS: { label: string; value: SlideDir }[] = [
  { label: '← Left',  value: 'left'  },
  { label: '→ Right', value: 'right' },
  { label: '↑ Up',    value: 'up'    },
  { label: '↓ Down',  value: 'down'  },
]

const EASINGS: { label: string; value: EasingType }[] = [
  { label: 'Linear',     value: 'linear'   },
  { label: 'Ease In',    value: 'easeIn'   },
  { label: 'Ease Out',   value: 'easeOut'  },
  { label: 'Ease InOut', value: 'easeInOut'},
  { label: 'Bounce',     value: 'bounce'   },
]

const LOOP_TYPE_SET = new Set<string>(['pulse', 'bounceLoop', 'rotateLoop', 'flowLoop', 'fadeLoop', 'colorPulse'])
export const isLoopAnim = (a: ElementAnimation) => LOOP_TYPE_SET.has(a.type) || a.timing === 'loop'

export default function TextPanel() {
  const { getSelectedEls, updateElement, addAnimation, addElement, project } = useEditorStore()
  const selected = getSelectedEls()
  const el = selected.find(e => e.type === 'text') as TextElement | undefined

  function upd(patch: Partial<TextElement>) {
    if (el) updateElement(el.id, patch)
  }

  function toggleEffect(effect: TextEffectType) {
    if (!el) return
    const effects = el.effects || []
    updateElement(el.id, {
      effects: effects.includes(effect) ? effects.filter(e => e !== effect) : [...effects, effect],
    })
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PanelHeader icon={<Type size={12} />} title="Text" />

      {/* Add text button — always visible */}
      <div className="px-3 py-2 border-b border-editor-border">
        <button
          disabled={!project}
          onClick={() => {
            if (!project) return
            addElement(makeText(project.width / 2 - 250, project.height / 2 - 30))
          }}
          className="w-full text-xs py-2 text-[#f2f2f2] bg-editor-accent rounded"
        >
          + Add Text
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!el && (
          <p className="text-sn text-[#c1c1c1] px-3 py-4 text-center">
            Click on '+ Add Text' to add a text box in scene
          </p>
        )}

        {el && (
          <>
            <div className="flex flex-col gap-0.5 px-3 py-2">
              <Row label="Content">
                <textarea
                className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1.5 resize-y"
                rows={5}
                value={el.content}
                onChange={e => upd({ content: e.target.value })}
              />
              </Row>

              <Row label="Font">
                <select
                  value={el.fontFamily}
                  onChange={e => upd({ fontFamily: e.target.value })}
                  className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1"
                >
                  {FONT_FAMILIES.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </Row>

              <Row label="Size">
                <NumberInput value={el.fontSize} min={8} max={400} onChange={v => upd({ fontSize: v })} />
              </Row>

              <Row label="Weight">
                <select
                  value={normalizeFontWeightForControl(el.fontWeight)}
                  onChange={e => upd({ fontWeight: e.target.value as FontWeight })}
                  className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1"
                >
                  {FONT_WEIGHT_OPTIONS.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
                </select>
              </Row>

              <Row label="Style">
                <div className="flex gap-1">
                  <ToggleBtn active={el.italic}    onClick={() => upd({ italic:    !el.italic    })}><Italic    size={11} /></ToggleBtn>
                  <ToggleBtn active={el.underline} onClick={() => upd({ underline: !el.underline })}><Underline size={11} /></ToggleBtn>
                </div>
              </Row>

              <Row label="Align">
                <div className="flex gap-1">
                  {(['left','center','right'] as AlignType[]).map(a => (
                    <ToggleBtn key={a} active={el.align === a} onClick={() => upd({ align: a })}>
                      {a === 'left' ? <AlignLeft size={11} /> : a === 'center' ? <AlignCenter size={11} /> : <AlignRight size={11} />}
                    </ToggleBtn>
                  ))}
                </div>
              </Row>

              <Row label="Fill Mode">
                <select
                  value={el.fillMode ?? 'solid'}
                  onChange={e => upd({ fillMode: e.target.value as TextFillMode })}
                  className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1"
                >
                  <option value="solid">Solid</option>
                  <option value="linearGradient">Gradient</option>
                </select>
              </Row>

              {(el.fillMode ?? 'solid') === 'solid' ? (
                <Row label="Color">
                  <ColorInput value={el.color} onChange={v => upd({ color: v })} />
                </Row>
              ) : (
                <>
                  <Row label="Color 1">
                    <ColorInput value={el.gradientColor1 ?? el.color} onChange={v => upd({ gradientColor1: v })} />
                  </Row>
                  <Row label="Color 1 Opacity">
                    <Slider value={Math.round((el.gradientOpacity1 ?? 1) * 100)} min={0} max={100} step={1}
                      onChange={v => upd({ gradientOpacity1: v / 100 })} display={`${Math.round((el.gradientOpacity1 ?? 1) * 100)}%`} />
                  </Row>
                  <Row label="Color 2">
                    <ColorInput value={el.gradientColor2 ?? '#8b5cf6'} onChange={v => upd({ gradientColor2: v })} />
                  </Row>
                  <Row label="Color 2 Opacity">
                    <Slider value={Math.round((el.gradientOpacity2 ?? 1) * 100)} min={0} max={100} step={1}
                      onChange={v => upd({ gradientOpacity2: v / 100 })} display={`${Math.round((el.gradientOpacity2 ?? 1) * 100)}%`} />
                  </Row>
                  <Row label="Third Color">
                    <button
                      onClick={() => upd({ gradientUseColor3: !el.gradientUseColor3 })}
                      className={cn(
                        'px-2 py-1 rounded text-xs transition-colors',
                        el.gradientUseColor3
                          ? 'bg-editor-accent text-white'
                          : 'bg-editor-elevated text-[#f2f2f2] hover:text-editor-text border border-editor-border'
                      )}
                    >
                      {el.gradientUseColor3 ? 'On' : 'Off'}
                    </button>
                  </Row>
                  {el.gradientUseColor3 && (
                    <>
                      <Row label="Color 3">
                        <ColorInput value={el.gradientColor3 ?? '#22d3ee'} onChange={v => upd({ gradientColor3: v })} />
                      </Row>
                      <Row label="Color 3 Opacity">
                        <Slider value={Math.round((el.gradientOpacity3 ?? 1) * 100)} min={0} max={100} step={1}
                          onChange={v => upd({ gradientOpacity3: v / 100 })} display={`${Math.round((el.gradientOpacity3 ?? 1) * 100)}%`} />
                      </Row>
                    </>
                  )}
                </>
              )}

              <Row label="Line Height">
                <Slider value={el.lineHeight} min={0.8} max={5} step={0.05}
                  onChange={v => upd({ lineHeight: v })} display={el.lineHeight.toFixed(2)} />
              </Row>

              <Row label="Opacity">
                <Slider value={el.opacity} min={0} max={1} step={0.01}
                  onChange={v => upd({ opacity: v })} display={`${Math.round(el.opacity * 100)}%`} />
              </Row>

              <Row label="Stretch H">
                <Slider value={el.stretchX ?? 1} min={0.2} max={3} step={0.05}
                  onChange={v => upd({ stretchX: v })} display={`${((el.stretchX ?? 1) * 100).toFixed(0)}%`} />
              </Row>

              <Row label="Stretch V">
                <Slider value={el.stretchY ?? 1} min={0.2} max={3} step={0.05}
                  onChange={v => upd({ stretchY: v })} display={`${((el.stretchY ?? 1) * 100).toFixed(0)}%`} />
              </Row>

              <Row label="Border">
                <ColorInput value={el.textStroke || '#ffffff'} onChange={v => upd({ textStroke: v })} />
              </Row>

              <Row label="Border Width">
                <Slider value={el.textStrokeWidth ?? 0} min={0} max={10} step={0.5}
                  onChange={v => upd({ textStrokeWidth: v })} display={`${el.textStrokeWidth ?? 0}px`} />
              </Row>

              <Row label="Shadow Color">
                <ColorInput value={el.shadowColor || '#000000'} onChange={v => upd({ shadowColor: v })} />
              </Row>

              <Row label="Shadow Blur">
                <Slider value={el.shadowBlur ?? 0} min={0} max={80} step={1}
                  onChange={v => upd({ shadowBlur: v })} display={`${el.shadowBlur ?? 0}`} />
              </Row>

              <Row label="Shadow Offset">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <span className="label block">X</span>
                    <NumberInput value={el.shadowOffsetX ?? 0} min={-50} max={50} onChange={v => upd({ shadowOffsetX: v })} />
                  </div>
                  <div className="flex-1">
                    <span className="label block">Y</span>
                    <NumberInput value={el.shadowOffsetY ?? 0} min={-50} max={50} onChange={v => upd({ shadowOffsetY: v })} />
                  </div>
                </div>
              </Row>
              <InnerShadowControls value={el.innerShadow} onChange={innerShadow => upd({ innerShadow })} />
            </div>

            {/* ── Background ────────────────────────────────────────── */}
            <div className="border-t border-editor-border px-3 py-2 flex flex-col gap-0.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-ms font-medium text-editor-text">Add Text Background</span>
                <button
                  onClick={() => upd({ bgEnabled: !el.bgEnabled })}
                  className={cn(
                    'px-2 py-0.5 rounded text-[11px] transition-colors',
                    el.bgEnabled
                      ? 'bg-editor-accent text-white'
                      : 'bg-editor-elevated text-[#f2f2f2] border border-editor-border hover:text-editor-text'
                  )}
                >
                  {el.bgEnabled ? 'On' : 'Off'}
                </button>
              </div>

              {el.bgEnabled && (
                <>
                  <Row label="Color">
                    <ColorInput value={el.bgColor || '#000000'} onChange={v => upd({ bgColor: v })} />
                  </Row>
                  <Row label="Transparency">
                    <Slider value={el.bgOpacity ?? 1} min={0} max={1} step={0.01}
                      onChange={v => upd({ bgOpacity: v })} display={`${Math.round((el.bgOpacity ?? 1) * 100)}%`} />
                  </Row>
                  <Row label="Padding X">
                    <Slider value={el.bgPadX ?? 16} min={0} max={120} step={1}
                      onChange={v => upd({ bgPadX: v })} display={`${el.bgPadX ?? 16}px`} />
                  </Row>
                  <Row label="Padding Y">
                    <Slider value={el.bgPadY ?? 10} min={0} max={120} step={1}
                      onChange={v => upd({ bgPadY: v })} display={`${el.bgPadY ?? 10}px`} />
                  </Row>
                  <Row label="Corner Radius">
                    <Slider value={el.bgRadius ?? 0} min={0} max={200} step={1}
                      onChange={v => upd({ bgRadius: v })} display={`${el.bgRadius ?? 0}px`} />
                  </Row>
                  <Row label="Shadow Color">
                    <ColorInput value={el.bgShadowColor || '#000000'} onChange={v => upd({ bgShadowColor: v })} />
                  </Row>
                  <Row label="Shadow Blur">
                    <Slider value={el.bgShadowBlur ?? 0} min={0} max={80} step={1}
                      onChange={v => upd({ bgShadowBlur: v })} display={`${el.bgShadowBlur ?? 0}`} />
                  </Row>
                  <Row label="Shadow Offset">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <span className="label block">X</span>
                        <NumberInput value={el.bgShadowOffsetX ?? 0} min={-50} max={50} onChange={v => upd({ bgShadowOffsetX: v })} />
                      </div>
                      <div className="flex-1">
                        <span className="label block">Y</span>
                        <NumberInput value={el.bgShadowOffsetY ?? 0} min={-50} max={50} onChange={v => upd({ bgShadowOffsetY: v })} />
                      </div>
                    </div>
                  </Row>
                </>
              )}
            </div>

            {/* ── Effects ───────────────────────────────────────────── */}
            <div className="border-t border-editor-border px-3 py-2">
              <span className="text-xs font-medium text-editor-text block mb-2">Effects</span>
              <div className="grid grid-cols-2 gap-1.5">
                {TEXT_EFFECTS.map(effect => {
                  const isActive = (el.effects || []).includes(effect.value)
                  return (
                    <button
                      key={effect.value}
                      onClick={() => toggleEffect(effect.value)}
                      className={cn(
                        'px-2 py-1.5 rounded border text-xs transition-all text-left',
                        isActive
                          ? 'bg-editor-accent-dim border-editor-accent text-editor-accent'
                          : 'bg-editor-elevated border-editor-border text-editor-text hover:border-editor-border-strong'
                      )}
                    >
                      {effect.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* ── Animations ────────────────────────────────────────── */}
            <AnimSection
              label="On Enter" color="text-green-400"
              anims={el.animations.filter(a => a.type !== 'move' && !isLoopAnim(a) && a.timing === 'onEnter')}
              types={TEXT_ENTER_ANIMS}
              onAdd={() => addAnimation(el.id, { ...makeAnimation(), type: 'typewriterChars', timing: 'onEnter' })}
              elId={el.id} isLoop={false}
            />
            <AnimSection
              label="Loop" color="text-editor-accent"
              anims={el.animations.filter(a => a.type !== 'move' && isLoopAnim(a))}
              types={TEXT_LOOP_ANIMS}
              onAdd={() => addAnimation(el.id, { ...makeAnimation(), type: 'pulse', timing: 'loop', duration: 1 })}
              elId={el.id} isLoop={true}
            />
            <AnimSection
              label="On Exit" color="text-red-400"
              anims={el.animations.filter(a => a.type !== 'move' && !isLoopAnim(a) && a.timing === 'onExit')}
              types={TEXT_EXIT_ANIMS}
              onAdd={() => addAnimation(el.id, { ...makeAnimation(), type: 'textFade', timing: 'onExit' })}
              elId={el.id} isLoop={false}
            />
          </>
        )}
      </div>
    </div>
  )
}

// ── Shared sub-components ──────────────────────────────────────────────────────

export function PanelHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-editor-border">
      <span className="text-editor-accent">{icon}</span>
      <span className="text-xs font-medium text-editor-text">{title}</span>
    </div>
  )
}

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-1.5">
      <span className="label">{label}</span>
      {children}
    </div>
  )
}

export function NumberInput({ value, min, max, onChange, step = 1 }: {
  value: number; min: number; max: number; step?: number; onChange: (v: number) => void
}) {
  return (
    <input
      type="number" min={min} max={max} step={step}
      value={value}
      onChange={e => onChange(Number(e.target.value))}
      className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1 nodrag"
    />
  )
}

export function Slider({ value, min, max, step, onChange, display }: {
  value: number; min: number; max: number; step: number; display: string; onChange: (v: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [editVal, setEditVal] = useState('')

  function commit() {
    const n = parseFloat(editVal)
    if (!isNaN(n)) onChange(Math.min(max, Math.max(min, n)))
    setEditing(false)
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="range" min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="flex-1 accent-editor-accent h-1"
      />
      {editing ? (
        <input
          type="number" autoFocus
          value={editVal}
          step={step}
          onChange={e => setEditVal(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
          className="text-xs text-[#c1c1c1] w-12 text-right bg-editor-elevated border border-editor-accent rounded px-1 nodrag"
        />
      ) : (
        <span
          onClick={() => { setEditing(true); setEditVal(String(value)) }}
          className="text-xs text-[#c1c1c1] w-9 text-right tabular-nums cursor-text hover:text-white"
        >
          {display}
        </span>
      )}
    </div>
  )
}

export function ColorInput({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color" value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className="w-8 h-6 rounded cursor-pointer border border-editor-border disabled:opacity-50 disabled:cursor-not-allowed"
      />
      <input
        type="text" value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className="flex-1 bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1 nodrag disabled:opacity-50 disabled:cursor-not-allowed"
        maxLength={9}
      />
    </div>
  )
}

function ToggleBtn({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center justify-center w-7 h-7 rounded transition-colors',
        active ? 'bg-editor-accent text-white' : 'bg-editor-elevated text-[#c1c1c1] hover:text-editor-text'
      )}
    >
      {children}
    </button>
  )
}

export function AnimSection({
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
          className="flex items-center gap-1 text-[10px] px-2 py-0.5 bg-editor-elevated text-[#c1c1c1] border border-editor-border rounded hover:text-editor-text transition-colors"
        >
          <Plus size={8} /> Add
        </button>
      </div>
      {anims.length === 0 && (
        <p className="text-[10px] text-[#595959] px-3 pb-2">None — click Add to create one.</p>
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
  const isColorPulse = anim.type === 'colorPulse'
  const updateType = (type: AnimationType) => {
    if (type === 'colorPulse') {
      upd({
        type,
        timing: 'loop',
        duration: anim.duration > 0 ? Math.min(anim.duration, 1) : 0.4,
        params: {
          ...anim.params,
          pulseColor: anim.params?.pulseColor ?? '#ffea00',
          pulseCount: anim.params?.pulseCount ?? 2,
        },
      })
      return
    }
    upd({ type })
  }

  return (
    <div className="border-t border-editor-border px-3 py-2 flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-editor-secondary font-medium">#{index + 1}</span>
        <button onClick={() => removeAnimation(elId, anim.id)} className="text-[#595959] hover:text-red-400 transition-colors">
          <Trash2 size={10} />
        </button>
      </div>

      <Row label="Type">
        <select
          value={anim.type}
          onChange={e => updateType(e.target.value as AnimationType)}
          className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1"
        >
          {types.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </Row>

      {isLoop && !isColorPulse && (
        <div className="text-[10px] text-editor-accent bg-editor-accent-dim rounded px-2 py-0.5 w-fit">
          ∞ Loops continuously
        </div>
      )}

      {isColorPulse && (
        <>
          <Row label="Pulse Color">
            <ColorInput
              value={anim.params?.pulseColor ?? '#ffea00'}
              onChange={value => upd({ params: { ...anim.params, pulseColor: value } })}
            />
          </Row>
          <Row label="Pulse Count">
            <input type="number" min={1} max={20} step={1}
              value={anim.params?.pulseCount ?? 2}
              onChange={e => upd({ params: { ...anim.params, pulseCount: Math.max(1, Number(e.target.value) || 1) } })}
              className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1 nodrag"
            />
          </Row>
        </>
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

      <ScaleSizeControl anim={anim} onChange={upd} />

      {!isColorPulse && (
        <Row label="Start (s)">
          <input type="number" min={0} max={60} step={0.1}
            value={anim.startTime}
            onChange={e => upd({ startTime: Number(e.target.value) })}
            className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1 nodrag"
          />
        </Row>
      )}

      <Row label={isColorPulse ? 'Pulse Duration (s)' : isLoop ? 'Period (s)' : 'Duration (s)'}>
        <input type="number" min={0.1} max={30} step={0.1}
          value={anim.duration}
          onChange={e => upd({ duration: Number(e.target.value) })}
          className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1 nodrag"
        />
      </Row>

      <Row label="Delay (s)">
        <input type="number" min={0} max={60} step={0.1}
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
