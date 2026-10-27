import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CopyCheck, Play, Shuffle } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useEditorStore } from '../../store/editorStore'
import type { SceneTransition, SlideDir, TransitionEasing, TransitionType } from '../../types/editor'
import { PanelHeader, Row, Slider } from './TextPanel'
import { cn } from '../../utils/cn'
import { renderTransition } from '../../engine/transitionRenderer'
import { TRANSITION_DEFS, TRANSITION_DURATION, TRANSITION_GROUPS, transitionDef, withDefaults } from '../../engine/transitions/catalog'
import { sceneStartTimes } from '../../utils/sceneTiming'
import { toast } from '../ui/Toast'

const DIRECTIONS: Array<{ value: SlideDir; label: string; icon: React.ReactNode }> = [
  { value: 'left', label: 'From the left', icon: <ArrowRight size={12} /> },
  { value: 'right', label: 'From the right', icon: <ArrowLeft size={12} /> },
  { value: 'up', label: 'From the top', icon: <ArrowDown size={12} /> },
  { value: 'down', label: 'From the bottom', icon: <ArrowUp size={12} /> },
]

const EASINGS: Array<{ value: TransitionEasing; label: string; hint: string }> = [
  { value: 'smooth', label: 'Smooth', hint: 'Eases in and out' },
  { value: 'snappy', label: 'Snappy', hint: 'Rushes through the middle — good for whips and glitches' },
  { value: 'linear', label: 'Linear', hint: 'Even speed' },
]

export default function TransitionPanel() {
  const { project, currentSceneId, setTransition, setEndTransition } = useEditorStore(useShallow(s => ({
    project: s.project, currentSceneId: s.currentSceneId, setTransition: s.setTransition, setEndTransition: s.setEndTransition,
  })))
  const [hovered, setHovered] = useState<TransitionType | null>(null)
  const scene = project?.scenes.find(s => s.id === currentSceneId)
  if (!scene || !project) return null

  const sceneIndex = project.scenes.findIndex(s => s.id === scene.id)
  const isFirst = sceneIndex === 0
  const isLast = sceneIndex === project.scenes.length - 1
  const tr = scene.transition
  const def = transitionDef(tr.type)
  const set = (patch: Partial<SceneTransition>) => setTransition(scene.id, { ...tr, ...patch })
  const pick = (type: TransitionType) => setTransition(scene.id, withDefaults(type, tr))

  const applyToAll = () => {
    // Every cut between scenes; the first scene's intro is left as it is.
    project.scenes.slice(1).forEach(sc => setTransition(sc.id, { ...tr }))
    toast.success(`${def.label} on all ${project.scenes.length - 1} cuts.`)
  }

  const playHere = () => {
    const state = useEditorStore.getState()
    const start = sceneStartTimes(project.scenes)[sceneIndex]
    const from = Math.max(0, start - (isFirst ? 0 : 0.6))
    state.setPlayhead(from)
    state.play()
    const stopAt = start + Math.min(tr.duration, scene.duration) + 0.5
    const check = () => {
      const s = useEditorStore.getState()
      if (!s.isPlaying) return
      if (s.playhead >= stopAt) s.pause()
      else requestAnimationFrame(check)
    }
    requestAnimationFrame(check)
  }

  const previewType = hovered ?? (tr.type === 'none' ? null : tr.type)
  const preview = previewType ? (previewType === tr.type ? tr : withDefaults(previewType, tr)) : null

  return (
    <div className="flex flex-col overflow-y-auto flex-1">
      <PanelHeader icon={<Shuffle size={12} />} title="Scene Transition" />

      <div className="flex flex-col px-3 py-2 gap-2">
        <div className="flex items-center gap-2 bg-editor-elevated-highlight rounded px-2.5 py-2 border border-editor-border">
          <span className="w-3 h-3 rounded-sm flex-none" style={{ background: def.color }} />
          <div className="flex flex-col leading-tight">
            <span className="text-xs text-editor-text font-medium">Scene {sceneIndex + 1}: {scene.name}</span>
            <span className="text-[10px] text-editor-text-secondary">
              {isFirst ? <>Intro — plays from <strong>black</strong> as the video starts</> : <>Plays at the <strong>start</strong> of this scene, from the scene before</>}
            </span>
          </div>
        </div>

        <TransitionPreview transition={preview} />

        {TRANSITION_GROUPS.map(group => {
          const items = TRANSITION_DEFS.filter(t => t.group === group.id && !(isFirst && t.value === 'morph'))
          if (!items.length) return null
          return (
            <div key={group.id} className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-editor-text-secondary">{group.label}</span>
              <div className="grid grid-cols-2 gap-1" onMouseLeave={() => setHovered(null)}>
                {items.map(t => {
                  const active = tr.type === t.value
                  return (
                    <button
                      key={t.value}
                      onClick={() => pick(t.value)}
                      onMouseEnter={() => setHovered(t.value === 'none' || t.value === 'morph' ? null : t.value)}
                      title={t.desc}
                      className={cn(
                        'flex items-center gap-2 text-[11px] px-2 py-1.5 rounded border transition-colors text-left',
                        active ? 'text-editor-text' : 'bg-editor-elevated-highlight border-editor-border text-[#c1c1c1] hover:text-editor-text hover:border-editor-border-strong',
                      )}
                      style={active ? { background: t.color + '22', borderColor: t.color } : undefined}
                    >
                      <span className="w-2 h-2 rounded-full flex-none" style={{ background: t.color, boxShadow: '0 0 0 1px rgba(255,255,255,0.15)' }} />
                      <span className="truncate">{t.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}

        {tr.type !== 'none' && (
          <div className="flex flex-col gap-0.5 border-t border-editor-border pt-2">
            <p className="text-2xs text-[#c1c1c1] mb-1">{def.desc}</p>
            <TransitionSettings transition={tr} onChange={set} maxDuration={scene.duration} />
            <div className="grid grid-cols-2 gap-1 mt-1.5">
              <button type="button" onClick={playHere} title="Play the transition on the canvas"
                className="flex items-center justify-center gap-1.5 rounded bg-editor-accent py-1.5 text-[11px] text-white hover:bg-editor-accent-hover">
                <Play size={11} /> Play here
              </button>
              <button type="button" onClick={applyToAll} disabled={project.scenes.length < 2} title="Use this transition on every cut between scenes"
                className="flex items-center justify-center gap-1.5 rounded border border-editor-border bg-editor-elevated-highlight py-1.5 text-[11px] text-editor-text hover:border-editor-accent disabled:opacity-40">
                <CopyCheck size={11} /> Apply to all cuts
              </button>
            </div>
          </div>
        )}

        {isLast && (
          <EndingSection transition={project.endTransition} onChange={setEndTransition} sceneDuration={scene.duration} />
        )}
      </div>
    </div>
  )
}

/** The settings this transition has: length, direction, strength, softness, colour, easing. */
function TransitionSettings({ transition: tr, onChange, maxDuration }: { transition: SceneTransition; onChange: (patch: Partial<SceneTransition>) => void; maxDuration: number }) {
  const def = transitionDef(tr.type)
  const max = Math.max(TRANSITION_DURATION.min, Math.min(TRANSITION_DURATION.max, maxDuration))
  return (
    <>
      <Row label="Duration">
        <Slider value={Math.min(tr.duration, max)} min={TRANSITION_DURATION.min} max={max} step={0.05}
          onChange={duration => onChange({ duration })} display={`${tr.duration.toFixed(2)}s`} />
      </Row>
      {def.direction && (
        <Row label="New scene comes in">
          <div className="grid grid-cols-4 gap-1 rounded bg-editor-elevated-highlight p-0.5">
            {DIRECTIONS.map(d => (
              <button key={d.value} type="button" title={d.label} onClick={() => onChange({ direction: d.value })}
                className={cn('flex items-center justify-center rounded py-1', (tr.direction ?? 'right') === d.value ? 'bg-editor-accent text-white' : 'text-editor-text-secondary hover:text-editor-text')}>
                {d.icon}
              </button>
            ))}
          </div>
        </Row>
      )}
      {def.intensity != null && (
        <Row label="Strength">
          <Slider value={Math.round((tr.intensity ?? def.intensity) * 100)} min={0} max={100} step={1}
            onChange={v => onChange({ intensity: v / 100 })} display={`${Math.round((tr.intensity ?? def.intensity) * 100)}%`} />
        </Row>
      )}
      {def.softness != null && (
        <Row label="Edge softness">
          <Slider value={Math.round((tr.softness ?? def.softness) * 100)} min={0} max={100} step={1}
            onChange={v => onChange({ softness: v / 100 })} display={`${Math.round((tr.softness ?? def.softness) * 100)}%`} />
        </Row>
      )}
      {def.color0 && (
        <Row label="Colour">
          <input type="color" value={tr.color ?? def.color0} onChange={e => onChange({ color: e.target.value })}
            className="h-6 w-10 cursor-pointer rounded border border-editor-border bg-transparent" />
        </Row>
      )}
      {def.style && (
        <>
          <Row label="Speed">
            <Slider value={tr.speed ?? 1} min={0.25} max={3} step={0.05}
              onChange={speed => onChange({ speed })} display={`${(tr.speed ?? 1).toFixed(2)}×`} />
          </Row>
          <Row label="Hardness">
            <Slider value={tr.hardness ?? 50} min={0} max={100} step={1}
              onChange={hardness => onChange({ hardness })} display={`${Math.round(tr.hardness ?? 50)}%`} />
          </Row>
        </>
      )}
      {def.render === 'gl' && (
        <Row label="Motion">
          <div className="grid grid-cols-3 gap-1 rounded bg-editor-elevated-highlight p-0.5">
            {EASINGS.map(e => (
              <button key={e.value} type="button" title={e.hint} onClick={() => onChange({ easing: e.value })}
                className={cn('rounded py-1 text-[11px]', (tr.easing ?? 'smooth') === e.value ? 'bg-editor-accent text-white' : 'text-editor-text-secondary hover:text-editor-text')}>
                {e.label}
              </button>
            ))}
          </div>
        </Row>
      )}
    </>
  )
}

/** Fade out at the end of the video (shown on the last scene). */
function EndingSection({ transition, onChange, sceneDuration }: { transition: SceneTransition | undefined; onChange: (tr: SceneTransition | undefined) => void; sceneDuration: number }) {
  const choices = TRANSITION_DEFS.filter(t => t.value !== 'morph' && t.value !== 'push' && t.value !== 'slide' && t.value !== 'cube')
  return (
    <div className="flex flex-col gap-1 border-t border-editor-border pt-2 mt-1">
      <span className="text-xs font-medium text-editor-text">Ending</span>
      <span className="text-[10px] text-editor-text-secondary">How the video ends after this last scene — to black.</span>
      <select
        value={transition?.type ?? 'none'}
        onChange={e => {
          const type = e.target.value as TransitionType
          onChange(type === 'none' ? undefined : withDefaults(type, transition ?? { type: 'fade', duration: 1 }))
        }}
        className="w-full bg-editor-elevated-highlight border border-editor-border rounded text-xs text-editor-text px-2 py-1"
      >
        {choices.map(t => <option key={t.value} value={t.value}>{t.value === 'none' ? 'Just stop' : `${t.label} to black`}</option>)}
      </select>
      {transition && (
        <TransitionSettings transition={transition} maxDuration={sceneDuration} onChange={patch => onChange({ ...transition, ...patch })} />
      )}
    </div>
  )
}

/** A looping preview of a transition between two sample pictures. */
function TransitionPreview({ transition }: { transition: SceneTransition | null }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const samples = useRef<{ a: HTMLCanvasElement; b: HTMLCanvasElement } | null>(null)
  const latest = useRef(transition)
  latest.current = transition

  useEffect(() => {
    samples.current ??= { a: samplePicture('A', ['#f97316', '#db2777'], 'circle'), b: samplePicture('B', ['#0ea5e9', '#4338ca'], 'square') }
    let frame = 0
    const t0 = performance.now()
    const draw = (now: number) => {
      const ctx = canvas.current?.getContext('2d')
      const tr = latest.current
      if (ctx && samples.current) {
        const w = ctx.canvas.width
        const h = ctx.canvas.height
        if (!tr) {
          ctx.drawImage(samples.current.b, 0, 0, w, h)
        } else {
          // Hold, play, hold, play back to A — so the loop never jumps.
          const length = Math.max(0.3, tr.duration)
          const cycle = (length + 0.7) * 2
          const t = ((now - t0) / 1000) % cycle
          const half = cycle / 2
          const forward = t < half
          const local = (forward ? t : t - half) - 0.35
          const progress = Math.max(0, Math.min(1, local / length))
          renderTransition({
            ctx, width: w, height: h, progress, transition: tr,
            fromCanvas: forward ? samples.current.a : samples.current.b,
            toCanvas: forward ? samples.current.b : samples.current.a,
          })
        }
      }
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <canvas ref={canvas} width={384} height={216}
      className="w-full rounded border border-editor-border bg-black" style={{ aspectRatio: '16 / 9' }} />
  )
}

function samplePicture(label: string, colors: [string, string], shape: 'circle' | 'square') {
  const c = document.createElement('canvas')
  c.width = 384
  c.height = 216
  const ctx = c.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, 384, 216)
  g.addColorStop(0, colors[0])
  g.addColorStop(1, colors[1])
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 384, 216)
  ctx.fillStyle = 'rgba(255,255,255,0.18)'
  for (let i = 0; i < 6; i++) ctx.fillRect(0, 30 + i * 32, 384, 2)
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  if (shape === 'circle') {
    ctx.beginPath(); ctx.arc(290, 108, 46, 0, Math.PI * 2); ctx.fill()
  } else {
    ctx.fillRect(250, 66, 84, 84)
  }
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 96px system-ui, sans-serif'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, 70, 112)
  return c
}
