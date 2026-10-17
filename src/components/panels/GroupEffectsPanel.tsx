import { useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Blocks, ListOrdered, MousePointerClick, Trash2 } from 'lucide-react'
import { ConnectSelected } from './ArrowConnections'
import { useShallow } from 'zustand/react/shallow'
import { useEditorStore } from '../../store/editorStore'
import type { AnimationType, EditorElement } from '../../types/editor'
import { cn } from '../../utils/cn'
import { animationsEnd, buildStagger, isLoopType, rowTolerance, staggerGroups, type StaggerOrder } from '../../utils/stagger'
import { ColorInput, NumberInput, PanelHeader } from './TextPanel'

const ANIMATIONS: Array<{ group: string; items: Array<{ value: AnimationType; label: string }> }> = [
  { group: 'Enter', items: [
    { value: 'fadeIn', label: 'Fade' }, { value: 'scaleIn', label: 'Pop' },
    { value: 'slideIn', label: 'Slide up' }, { value: 'wipeIn', label: 'Wipe' },
  ] },
  { group: 'Exit', items: [{ value: 'fadeOut', label: 'Fade out' }, { value: 'scaleOut', label: 'Shrink' }] },
  { group: 'Loop', items: [
    { value: 'pulse', label: 'Pulse' }, { value: 'colorPulse', label: 'Flash' },
    { value: 'fadeLoop', label: 'Blink' }, { value: 'bounceLoop', label: 'Bounce' },
  ] },
]

const ORDERS: Array<{ value: StaggerOrder; label: string; icon: React.ReactNode }> = [
  { value: 'leftToRight', label: 'Left to right', icon: <ArrowRight size={13} /> },
  { value: 'rightToLeft', label: 'Right to left', icon: <ArrowLeft size={13} /> },
  { value: 'topToBottom', label: 'Top to bottom', icon: <ArrowDown size={13} /> },
  { value: 'bottomToTop', label: 'Bottom to top', icon: <ArrowUp size={13} /> },
  { value: 'given', label: 'Selection order', icon: <ListOrdered size={13} /> },
]

/** Animations for several items at once: staggered waves, chained and repeating. */
export default function GroupEffectsPanel() {
  const { project, currentSceneId, selectedIds, addAnimation, updateElement } = useEditorStore(useShallow(s => ({
    project: s.project, currentSceneId: s.currentSceneId, selectedIds: s.selectedIds,
    addAnimation: s.addAnimation, updateElement: s.updateElement,
  })))
  const sceneElements = project?.scenes.find(scene => scene.id === currentSceneId)?.elements ?? []
  const selected = selectedIds.map(id => sceneElements.find(el => el.id === id)).filter((el): el is EditorElement => Boolean(el) && el!.type !== 'audio')

  const [tab, setTab] = useState<'animate' | 'connect'>('animate')
  const [type, setType] = useState<AnimationType>('fadeIn')
  const [order, setOrder] = useState<StaggerOrder>('leftToRight')
  const [together, setTogether] = useState(false)
  const [step, setStep] = useState(0.15)
  const [duration, setDuration] = useState(0.5)
  const [start, setStart] = useState(0)
  const [repeat, setRepeat] = useState(true)
  const [repeatGap, setRepeatGap] = useState(0.5)
  const [flashColor, setFlashColor] = useState('#ffd400')
  const loop = isLoopType(type)

  const items = selected.map(el => ({ id: el.id, x: el.x, y: el.y, width: el.width, height: el.height }))
  const timing = { order, step, together: together ? rowTolerance(items) : 0 }
  const plan = items.length < 2 ? null : buildStagger(items, {
    type, duration,
    timing: type === 'fadeOut' || type === 'scaleOut' ? 'onExit' : undefined,
    params: type === 'colorPulse' ? { pulseColor: flashColor, pulseCount: 1 } : type === 'slideIn' ? { direction: 'up' } : undefined,
  }, timing, { start, repeat: loop && repeat, repeatGap })
  const steps = items.length >= 2 ? staggerGroups(items, timing).length : 0

  function apply() {
    if (!plan) return
    // Re-applying replaces the earlier group animation of this type instead of stacking.
    for (const el of selected) {
      if (el.animations.some(a => a.type === type)) {
        updateElement(el.id, { animations: el.animations.filter(a => a.type !== type) } as Partial<EditorElement>)
      }
    }
    for (const { elementId, animation } of plan.animations) addAnimation(elementId, animation)
  }

  function removeType() {
    for (const el of selected) {
      if (el.animations.some(a => a.type === type)) {
        updateElement(el.id, { animations: el.animations.filter(a => a.type !== type) } as Partial<EditorElement>)
      }
    }
  }

  // "Select all similar": every item of the same kind on this scene (all circles, all arrows…).
  const anchor = selected[0]
  const similar = anchor ? sceneElements.filter(el => el.type === anchor.type &&
    (el.type !== 'shape' || anchor.type !== 'shape' || el.shapeType === anchor.shapeType)) : []

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PanelHeader icon={<Blocks size={12} />} title="Group Effects" />
      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-3">
        <div className="rounded border border-editor-border bg-editor-elevated-highlight px-2.5 py-2">
          <div className="text-xs text-editor-text">
            {selected.length === 0 ? 'Nothing selected' : `${selected.length} item${selected.length === 1 ? '' : 's'} selected`}
          </div>
          <p className="mt-0.5 text-[10px] leading-relaxed text-editor-text-secondary">
            Shift-click items on the canvas to select several, then animate them one after another.
          </p>
          {anchor && similar.length > selected.length && (
            <button type="button" onClick={() => useEditorStore.setState({ selectedIds: similar.map(el => el.id) })}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded border border-editor-border py-1 text-[11px] text-editor-text hover:border-editor-accent hover:text-editor-accent">
              <MousePointerClick size={12} /> Select all similar ({similar.length})
            </button>
          )}
        </div>

        {selected.length >= 2 && (
          <div className="grid grid-cols-2 gap-1 rounded bg-editor-elevated-highlight p-0.5">
            {(['animate', 'connect'] as const).map(t => (
              <button key={t} type="button" onClick={() => setTab(t)}
                className={cn('rounded py-1 text-xs', tab === t ? 'bg-editor-accent text-white' : 'text-editor-text-secondary hover:text-editor-text')}>
                {t === 'animate' ? 'Animate' : 'Connect'}
              </button>
            ))}
          </div>
        )}

        {selected.length >= 2 && tab === 'connect' && (
          <ConnectSelected items={selected.filter(el => el.type !== 'arrow')} />
        )}

        {selected.length >= 2 && tab === 'animate' && (
          <>
            <Section title="Animation">
              {ANIMATIONS.map(group => (
                <div key={group.group}>
                  <div className="mb-1 text-[10px] uppercase tracking-wide text-editor-text-secondary">{group.group}</div>
                  <div className="grid grid-cols-4 gap-1">
                    {group.items.map(item => (
                      <Tile key={item.value} active={type === item.value} onClick={() => {
                        setType(item.value)
                        setDuration(isLoopType(item.value) ? 0.4 : 0.5)
                      }}>{item.label}</Tile>
                    ))}
                  </div>
                </div>
              ))}
              {type === 'colorPulse' && (
                <Field label="Flash colour"><ColorInput value={flashColor} onChange={setFlashColor} /></Field>
              )}
            </Section>

            <Section title="Order">
              <div className="grid grid-cols-5 gap-1">
                {ORDERS.map(o => (
                  <Tile key={o.value} active={order === o.value} onClick={() => setOrder(o.value)} title={o.label}>{o.icon}</Tile>
                ))}
              </div>
              <div className="text-[10px] text-editor-text-secondary">{ORDERS.find(o => o.value === order)?.label}</div>
              {order !== 'given' && (
                <Toggle label="Rows / columns together" hint="Items lined up start at once — one network layer, one row of a grid."
                  checked={together} onChange={setTogether} />
              )}
            </Section>

            <Section title="Timing">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Step between (s)"><NumberInput value={step} min={0} max={10} step={0.05} onChange={v => setStep(Math.max(0, v))} /></Field>
                <Field label={loop ? 'Play length (s)' : 'Duration (s)'}><NumberInput value={duration} min={0.05} max={30} step={0.05} onChange={v => setDuration(Math.max(0.05, v))} /></Field>
              </div>
              <Field label="Start at (s)">
                <div className="flex gap-1.5">
                  <NumberInput value={start} min={0} max={600} step={0.1} onChange={v => setStart(Math.max(0, v))} />
                  <button type="button" onClick={() => setStart(animationsEnd(sceneElements))}
                    title="Start when the scene's other animations have finished — chain waves this way"
                    className="flex-none rounded border border-editor-border px-2 text-[10px] text-editor-text hover:border-editor-accent hover:text-editor-accent">
                    After last
                  </button>
                </div>
              </Field>
              {loop && (
                <>
                  <Toggle label="Repeat the wave" hint="Plays the whole wave again and again." checked={repeat} onChange={setRepeat} />
                  {repeat && (
                    <Field label="Pause between waves (s)"><NumberInput value={repeatGap} min={0} max={30} step={0.1} onChange={v => setRepeatGap(Math.max(0, v))} /></Field>
                  )}
                </>
              )}
            </Section>

            {plan && (
              <p className="rounded bg-editor-accent/10 px-2.5 py-2 text-[11px] leading-relaxed text-editor-text">
                {selected.length} items in {steps} step{steps === 1 ? '' : 's'} · ends at {plan.end.toFixed(2)}s
                {plan.period ? ` · repeats every ${plan.period.toFixed(2)}s` : ''}
              </p>
            )}

            <div className="flex gap-1.5">
              <button type="button" onClick={apply}
                className="flex-1 rounded bg-editor-accent py-1.5 text-xs text-white hover:bg-editor-accent-hover">
                Apply to {selected.length} items
              </button>
              <button type="button" onClick={removeType} title="Remove this animation from the selected items"
                className="flex-none rounded border border-editor-border px-2.5 text-editor-text-secondary hover:border-red-400 hover:text-red-400">
                <Trash2 size={13} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-editor-border pt-2.5">
      <h3 className="text-[11px] font-medium text-editor-text">{title}</h3>
      {children}
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] text-editor-text-secondary">{label}</span>
      {children}
    </label>
  )
}

function Tile({ active, onClick, title, children }: { active: boolean; onClick: () => void; title?: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} title={title}
      className={cn('flex h-7 items-center justify-center rounded border text-[11px] transition-colors',
        active ? 'border-editor-accent bg-editor-accent/20 text-editor-accent' : 'border-editor-border text-editor-text hover:border-editor-accent/60')}>
      {children}
    </button>
  )
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-2 py-0.5">
      <span className="text-xs text-editor-text">
        {label}
        <span className="block text-[10px] text-editor-text-secondary">{hint}</span>
      </span>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="mt-0.5 h-3.5 w-3.5 flex-none accent-editor-accent" />
    </label>
  )
}
