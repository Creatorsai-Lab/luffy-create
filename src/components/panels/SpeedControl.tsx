import { useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Gauge, Snowflake, X } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import type { Scene, SpeedCurve, VideoElement } from '../../types/editor'
import { cleanCurve, footageSpan, presetCurve, SPEED_LIMITS, SPEED_PRESETS } from '../../utils/speedCurve'
import { retimeClip } from '../../utils/retime'
import { sceneStartTimes } from '../../utils/sceneTiming'
import { cn } from '../../utils/cn'
import { Slider } from './TextPanel'
import { toast } from '../ui/Toast'

const W = 240
const H = 80
const logY = (speed: number) => H - ((Math.log10(speed) - Math.log10(SPEED_LIMITS.min)) / (Math.log10(SPEED_LIMITS.max) - Math.log10(SPEED_LIMITS.min))) * H
const speedAtY = (y: number) => Math.pow(10, Math.log10(SPEED_LIMITS.min) + (1 - y / H) * (Math.log10(SPEED_LIMITS.max) - Math.log10(SPEED_LIMITS.min)))

/** Speed ramps (velocity), presets and a curve to drag, and freeze frames. */
export default function SpeedControl({ element, scene }: { element: VideoElement; scene?: Scene }) {
  const [open, setOpen] = useState(Boolean(element.speedCurve || element.freeze))
  const [hold, setHold] = useState(element.freeze?.hold ?? 1)
  const svg = useRef<SVGSVGElement>(null)
  const curve = element.speedCurve
  const active = curve?.preset ?? 'normal'

  const choose = (id: string) => {
    if (id === 'normal') return retimeClip(element, scene, { speedCurve: null })
    if (id === 'custom') return retimeClip(element, scene, { speedCurve: { preset: 'custom', points: curve?.points ?? [{ x: 0, speed: 1 }, { x: 0.5, speed: 0.4 }, { x: 1, speed: 1 }] } })
    retimeClip(element, scene, { speedCurve: presetCurve(id) })
  }

  const setPoints = (points: SpeedCurve['points']) => retimeClip(element, scene, { speedCurve: cleanCurve({ preset: 'custom', points }) })

  const dragPoint = (index: number) => (e: React.PointerEvent) => {
    e.preventDefault()
    const box = svg.current?.getBoundingClientRect()
    if (!box || !curve) return
    const start = curve.points.map(p => ({ ...p }))
    const move = (ev: PointerEvent) => {
      const x = Math.max(0, Math.min(1, (ev.clientX - box.left) / box.width))
      const y = Math.max(0, Math.min(H, ((ev.clientY - box.top) / box.height) * H))
      const pts = start.map((p, i) => (i === index ? { x: i === 0 ? 0 : i === start.length - 1 ? 1 : x, speed: Math.round(speedAtY(y) * 100) / 100 } : p))
      setPoints(pts)
    }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const freezeHere = () => {
    const { project, playhead } = useEditorStore.getState()
    if (!project || !scene) return
    const start = sceneStartTimes(project.scenes)[project.scenes.findIndex(s => s.id === scene.id)] ?? 0
    const at = playhead - start - (element.timelineX ?? 0)
    if (at < 0 || at > (element.duration ?? 0)) {
      toast.info('Move the playhead onto this clip first — the freeze holds the frame there.')
      return
    }
    retimeClip(element, scene, { freeze: { at, hold } })
  }

  const length = element.duration ?? 0
  const plain = footageSpan(element) / (element.playbackRate || 1)

  return (
    <div className="px-3 py-2 border-b border-editor-border flex flex-col gap-2">
      <button type="button" onClick={() => setOpen(o => !o)} className="flex items-center gap-2 text-left">
        <Gauge size={13} className="text-editor-accent flex-none" />
        <span className="text-xs font-medium text-editor-text">Speed ramp</span>
        {(curve || element.freeze) && <span className="text-2xs text-sky-300">{curve ? SPEED_PRESETS.find(p => p.id === curve.preset)?.label ?? 'Custom' : ''}{element.freeze ? `${curve ? ' + ' : ''}Freeze` : ''}</span>}
        <span className="ml-auto text-editor-text-secondary">{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</span>
      </button>
      {open && (
        <>
          <div className="grid grid-cols-3 gap-1">
            {[{ id: 'normal', label: 'Normal', hint: 'Constant speed' }, ...SPEED_PRESETS, { id: 'custom', label: 'Custom', hint: 'Drag the points on the curve' }].map(p => (
              <button key={p.id} type="button" title={p.hint} onClick={() => choose(p.id)}
                className={cn('rounded border px-1 py-1 text-[10px]', active === p.id ? 'border-editor-accent bg-editor-accent/20 text-editor-text' : 'border-editor-border text-editor-text-secondary hover:text-editor-text')}>
                {p.label}
              </button>
            ))}
          </div>
          {curve && (
            <div className="flex flex-col gap-1">
              <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="w-full rounded bg-black/30" style={{ height: H, touchAction: 'none' }}
                onDoubleClick={e => {
                  const box = svg.current!.getBoundingClientRect()
                  const x = (e.clientX - box.left) / box.width
                  const y = ((e.clientY - box.top) / box.height) * H
                  setPoints([...curve.points, { x, speed: speedAtY(y) }])
                }}>
                <line x1={0} x2={W} y1={logY(1)} y2={logY(1)} stroke="rgba(255,255,255,0.25)" strokeDasharray="3 3" />
                <text x={4} y={logY(1) - 3} fill="rgba(255,255,255,0.45)" fontSize={8}>1×</text>
                <text x={4} y={9} fill="rgba(255,255,255,0.35)" fontSize={8}>{SPEED_LIMITS.max}×</text>
                <text x={4} y={H - 3} fill="rgba(255,255,255,0.35)" fontSize={8}>{SPEED_LIMITS.min}×</text>
                <polyline fill="none" stroke="#38bdf8" strokeWidth={1.5} points={curve.points.map(p => `${p.x * W},${logY(p.speed)}`).join(' ')} />
                {curve.points.map((p, i) => (
                  <circle key={i} cx={p.x * W} cy={logY(p.speed)} r={4} fill="#0ea5e9" stroke="white" strokeWidth={1} style={{ cursor: 'grab' }}
                    onPointerDown={dragPoint(i)}
                    onContextMenu={e => { e.preventDefault(); if (i > 0 && i < curve.points.length - 1) setPoints(curve.points.filter((_, k) => k !== i)) }}>
                    <title>{p.speed.toFixed(2)}× — drag; right-click to remove</title>
                  </circle>
                ))}
              </svg>
              <p className="text-[10px] text-editor-text-secondary">Double-click to add a point. The sound follows the speed and keeps its pitch.</p>
            </div>
          )}
          <p className="text-[10px] text-editor-text-secondary">Clip length {length.toFixed(1)}s{Math.abs(length - plain) > 0.05 ? ` (${plain.toFixed(1)}s at normal speed)` : ''}</p>

          <div className="flex flex-col gap-1 rounded bg-black/20 p-1.5">
            <div className="flex items-center gap-1.5 text-[11px] text-editor-text">
              <Snowflake size={11} className="text-sky-300" /> Freeze frame
              {element.freeze && (
                <button type="button" onClick={() => retimeClip(element, scene, { freeze: null })} className="ml-auto flex items-center gap-0.5 text-[10px] text-editor-text-secondary hover:text-red-300">
                  <X size={10} /> Remove
                </button>
              )}
            </div>
            <Slider value={hold} min={0.2} max={5} step={0.1} display={`${hold.toFixed(1)}s`} onChange={v => { setHold(v); if (element.freeze) retimeClip(element, scene, { freeze: { at: element.freeze.at, hold: v } }) }} />
            <button type="button" onClick={freezeHere}
              className="rounded border border-editor-border bg-editor-elevated-highlight py-1 text-[11px] text-editor-text hover:border-editor-accent">
              {element.freeze ? `Frozen at ${element.freeze.at.toFixed(1)}s — move it to the playhead` : 'Freeze at the playhead'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
