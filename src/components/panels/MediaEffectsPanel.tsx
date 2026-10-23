import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Dices, Eye, EyeOff, Film, ImageIcon, Music2, Sparkles, X } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useEditorStore } from '../../store/editorStore'
import type { FxType, ImageElement, MediaFx, VideoElement } from '../../types/editor'
import { FX_DEFS, FX_GROUPS, fxDef, type FxDef, type FxGroup, type FxParam } from '../../engine/fx/catalog'
import { clipTimeOf, effectStack, fxParam, makeFx, stackPatch } from '../../engine/fx/stack'
import { renderFx } from '../../engine/fx/render'
import { videoRegistry } from '../../engine/videoRegistry'
import { clipParts } from '../../utils/keyingBackground'
import { cropAt, punchedCrop } from '../../utils/cropKeys'
import { sceneStartTimes } from '../../utils/sceneTiming'
import { toFileUrl } from '../../utils/pathUtils'
import { cn } from '../../utils/cn'
import { PanelHeader, Slider } from './TextPanel'
import { AllPartsToggle, useAllParts } from './KeyingControl'

type Media = VideoElement | ImageElement

const GROUP_COLOR: Record<FxGroup, string> = {
  body: '#22d3ee', retro: '#f59e0b', glitch: '#ec4899', warp: '#8b5cf6', light: '#fde047',
  energy: '#ef4444', motion: '#22c55e', weather: '#60a5fa', look: '#f97316',
}

/** Writes a new stack to the element — or, for every part of a cut clip, applies `change` to each part's own stack. */
function updateStacks(el: Media, allParts: boolean, change: (stack: MediaFx[], part: Media) => MediaFx[]) {
  const { project, updateElement } = useEditorStore.getState()
  const parts = allParts && project ? clipParts(project, el) : [el]
  for (const part of parts) updateElement(part.id, stackPatch(part, change(effectStack(part), part)))
}

/** The effects engine on images and videos: library, live preview, and the effects on the selected item. */
export default function MediaEffectsPanel() {
  const { project, currentSceneId, selectedIds } = useEditorStore(useShallow(s => ({ project: s.project, currentSceneId: s.currentSceneId, selectedIds: s.selectedIds })))
  const scene = project?.scenes.find(sc => sc.id === currentSceneId)
  const media = (scene?.elements.filter(e => e.type === 'video' || e.type === 'image') ?? []) as Media[]
  const el = media.find(e => selectedIds.includes(e.id))
  const [group, setGroup] = useState<FxGroup>('body')
  const [hovered, setHovered] = useState<FxType | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [allParts, setAllParts] = useAllParts()

  if (!el) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <PanelHeader icon={<Sparkles size={12} />} title="Effects" />
        <div className="flex flex-col gap-2 px-3 py-3">
          <p className="text-[11px] leading-relaxed text-editor-text-secondary">Effects for videos and images — neon, retro, glitch, warps, light, phonk, colour looks and more. Pick one on this scene:</p>
          {media.length ? media.map(m => (
            <button key={m.id} type="button" onClick={() => useEditorStore.getState().selectElement(m.id, false)}
              className="flex items-center gap-2 rounded border border-editor-border bg-editor-elevated-highlight px-2 py-1.5 text-left text-[11px] text-editor-text hover:border-editor-accent">
              {m.type === 'video' ? <Film size={12} className="text-sky-300" /> : <ImageIcon size={12} className="text-emerald-300" />}
              <span className="truncate">{m.name}</span>
              {effectStack(m).length > 0 && <span className="ml-auto text-[10px] text-editor-text-secondary">{effectStack(m).length} effect{effectStack(m).length === 1 ? '' : 's'}</span>}
            </button>
          )) : <p className="text-[11px] text-amber-300">There is no video or image on this scene.</p>}
        </div>
      </div>
    )
  }

  const stack = effectStack(el)
  const clipLength = el.type === 'video' ? el.duration ?? 0 : scene?.duration ?? 0

  const add = (type: FxType) => {
    updateStacks(el, allParts, current => {
      const fresh = makeFx(type)
      // One colour look per clip: a new look replaces the old.
      return type === 'look' ? [...current.filter(fx => fx.type !== 'look'), fresh] : [...current, fresh]
    })
    setOpen(null)
  }
  const patch = (fx: MediaFx, change: Partial<MediaFx>, sameTypeInParts = true) => {
    updateStacks(el, allParts && sameTypeInParts, (current, part) => current.map(item =>
      part.id === el.id ? (item.id === fx.id ? { ...item, ...change } : item) : (item.type === fx.type ? { ...item, ...change } : item)))
  }
  const setParam = (fx: MediaFx, key: string, value: number | string | boolean) => patch(fx, { params: { ...(fx.params ?? {}), [key]: value } })
  const remove = (fx: MediaFx) => updateStacks(el, allParts, (current, part) => current.filter(item => (part.id === el.id ? item.id !== fx.id : item.type !== fx.type)))

  const surprise = () => {
    const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)]
    const pool = FX_DEFS.filter(d => d.group !== 'motion' && d.group !== 'weather' && d.group !== 'look')
    const first = pick(pool)
    const second = pick(pool.filter(d => d.group !== first.group))
    const look = makeFx('look', { params: { look: pick(fxDef('look').params[0].options!).value } })
    const randomise = (def: FxDef) => makeFx(def.type, {
      intensity: 0.45 + Math.random() * 0.45,
      params: Object.fromEntries(def.params.map(p => [p.key, p.kind === 'slider' ? (p.min ?? 0) + Math.random() * ((p.max ?? 1) - (p.min ?? 0)) : p.kind === 'select' ? pick(p.options!).value : p.default])),
    })
    updateStacks(el, allParts, () => [look, randomise(first), randomise(second)])
  }

  const previewStack = hovered
    ? [...stack.filter(fx => fx.type !== hovered && !(hovered === 'look' && fx.type === 'look')), makeFx(hovered)]
    : stack

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PanelHeader icon={<Sparkles size={12} />} title="Effects" />
      <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-2">
        <div className="flex items-center gap-2 text-[11px] text-editor-text">
          {el.type === 'video' ? <Film size={12} className="text-sky-300" /> : <ImageIcon size={12} className="text-emerald-300" />}
          <span className="truncate font-medium">{el.name}</span>
          <button type="button" onClick={surprise} title="A random look and two effects — press again for another"
            className="ml-auto flex items-center gap-1 rounded border border-editor-border px-1.5 py-0.5 text-[10px] text-editor-text-secondary hover:border-editor-accent hover:text-editor-text">
            <Dices size={11} /> Surprise me
          </button>
        </div>
        <AllPartsToggle element={el} allParts={allParts} setAllParts={setAllParts} />

        <FxPreview el={el} stack={previewStack} />

        {/* Library */}
        <div className="flex flex-wrap gap-1">
          {FX_GROUPS.map(g => (
            <button key={g.id} type="button" onClick={() => setGroup(g.id)}
              className={cn('rounded-full border px-2 py-0.5 text-[10px]', group === g.id ? 'border-editor-accent bg-editor-accent/20 text-editor-text' : 'border-editor-border text-editor-text-secondary hover:text-editor-text')}>
              {g.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-1" onMouseLeave={() => setHovered(null)}>
          {FX_DEFS.filter(d => d.group === group).map(d => (
            <button key={d.type} type="button" title={`${d.desc} — click to add`} onClick={() => add(d.type)} onMouseEnter={() => setHovered(d.type)}
              className="flex items-center gap-1.5 rounded border border-editor-border bg-editor-elevated-highlight px-2 py-1.5 text-left text-[11px] text-editor-text-secondary hover:border-editor-accent hover:text-editor-text">
              <span className="h-2 w-2 flex-none rounded-full" style={{ background: GROUP_COLOR[d.group] }} />
              <span className="truncate">{d.label}</span>
              {d.beat && <Music2 size={9} className="ml-auto flex-none opacity-60" />}
            </button>
          ))}
        </div>
        {group === 'body' && <p className="text-[10px] leading-relaxed text-editor-text-secondary">Body effects find the person on this computer (the same AI as background removal).</p>}

        {/* On this item */}
        <div className="flex flex-col gap-1 border-t border-editor-border pt-2">
          <span className="text-[10px] uppercase tracking-wide text-editor-text-secondary">On this {el.type === 'video' ? 'clip' : 'image'} ({stack.length})</span>
          {!stack.length && <p className="text-[11px] text-editor-text-secondary">Hover an effect to preview it, click to add it.</p>}
          {stack.map(fx => {
            const def = fxDef(fx.type)
            const expanded = open === fx.id
            return (
              <div key={fx.id} className="rounded border border-editor-border bg-editor-elevated-highlight">
                <div className="flex items-center gap-1.5 px-2 py-1.5">
                  <button type="button" onClick={() => setOpen(expanded ? null : fx.id)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
                    {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                    <span className="h-2 w-2 flex-none rounded-full" style={{ background: GROUP_COLOR[def.group] }} />
                    <span className={cn('truncate text-[11px]', fx.off ? 'text-editor-text-secondary line-through' : 'text-editor-text')}>
                      {fx.type === 'look' ? `Look: ${fxDef('look').params[0].options!.find(o => o.value === fxParam(fx, 'look'))?.label ?? ''}` : def.label}
                    </span>
                    {fx.beatSync && <Music2 size={9} className="flex-none text-sky-300" />}
                  </button>
                  <button type="button" title={fx.off ? 'Show' : 'Hide'} onClick={() => patch(fx, { off: !fx.off }, false)} className="text-editor-text-secondary hover:text-editor-text">
                    {fx.off ? <EyeOff size={11} /> : <Eye size={11} />}
                  </button>
                  <button type="button" title="Remove" onClick={() => remove(fx)} className="text-editor-text-secondary hover:text-red-300"><X size={12} /></button>
                </div>
                {expanded && (
                  <div className="flex flex-col gap-1.5 border-t border-editor-border px-2 py-2">
                    <Labeled label="Strength">
                      <Slider value={Math.round(fx.intensity * 100)} min={0} max={100} step={1} display={`${Math.round(fx.intensity * 100)}%`} onChange={v => patch(fx, { intensity: v / 100 })} />
                    </Labeled>
                    {def.params.map(p => <ParamControl key={p.key} param={p} value={fxParam(fx, p.key)} onChange={v => setParam(fx, p.key, v)} />)}
                    {def.speed && (
                      <Labeled label="Speed">
                        <Slider value={Number(fx.params?.speed ?? 1)} min={0.25} max={3} step={0.05} display={`${Number(fx.params?.speed ?? 1).toFixed(2)}×`} onChange={v => setParam(fx, 'speed', v)} />
                      </Labeled>
                    )}
                    {def.beat && (
                      <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-editor-text-secondary" title="Hits on the beats of the project's music (120 BPM without music)">
                        <input type="checkbox" checked={fx.beatSync ?? false} onChange={e => patch(fx, { beatSync: e.target.checked })} />
                        <Music2 size={10} /> Sync to the music's beat
                      </label>
                    )}
                    <Timing fx={fx} clipLength={clipLength} onChange={change => patch(fx, change, false)} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** When the effect runs on the clip, and its fades. */
function Timing({ fx, clipLength, onChange }: { fx: MediaFx; clipLength: number; onChange: (change: Partial<MediaFx>) => void }) {
  const whole = fx.start <= 0 && fx.end == null
  const end = fx.end ?? clipLength
  return (
    <div className="flex flex-col gap-1 rounded bg-black/20 p-1.5">
      <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-editor-text-secondary">
        <input type="checkbox" checked={whole} onChange={e => onChange(e.target.checked ? { start: 0, end: undefined } : { start: 0, end: Math.max(0.5, clipLength) })} />
        The whole {clipLength ? 'clip' : 'scene'}
      </label>
      {!whole && (
        <div className="grid grid-cols-2 gap-1">
          <NumberField label="From (s)" value={Math.max(0, fx.start)} onChange={v => onChange({ start: Math.max(0, Math.min(v, end - 0.1)) })} />
          <NumberField label="To (s)" value={end} onChange={v => onChange({ end: Math.max(fx.start + 0.1, v) })} />
        </div>
      )}
      <div className="grid grid-cols-2 gap-1">
        <NumberField label="Fade in (s)" value={fx.fadeIn ?? 0} onChange={v => onChange({ fadeIn: Math.max(0, v) })} />
        <NumberField label="Fade out (s)" value={fx.fadeOut ?? 0} onChange={v => onChange({ fadeOut: Math.max(0, v) })} />
      </div>
    </div>
  )
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-0.5 text-[10px] text-editor-text-secondary">
      {label}
      <input type="number" step={0.1} min={0} value={Math.round(value * 100) / 100} onChange={e => { const v = Number(e.target.value); if (Number.isFinite(v)) onChange(v) }}
        className="w-full rounded border border-editor-border bg-editor-elevated-highlight px-1.5 py-0.5 text-[11px] text-editor-text" />
    </label>
  )
}

function ParamControl({ param, value, onChange }: { param: FxParam; value: number | string | boolean; onChange: (v: number | string | boolean) => void }) {
  if (param.kind === 'color') {
    return (
      <Labeled label={param.label}>
        <input type="color" value={String(value)} onChange={e => onChange(e.target.value)} className="h-6 w-10 cursor-pointer rounded border border-editor-border bg-transparent" />
      </Labeled>
    )
  }
  if (param.kind === 'toggle') {
    return (
      <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-editor-text-secondary">
        <input type="checkbox" checked={Boolean(value)} onChange={e => onChange(e.target.checked)} /> {param.label}
      </label>
    )
  }
  if (param.kind === 'select') {
    return (
      <Labeled label={param.label}>
        <select value={String(value)} onChange={e => onChange(e.target.value)}
          className="w-full rounded border border-editor-border bg-editor-elevated-highlight px-2 py-1 text-xs text-editor-text">
          {param.options!.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Labeled>
    )
  }
  const v = Number(value)
  return (
    <Labeled label={param.label}>
      <Slider value={param.percent ? Math.round(v * 100) : v} min={param.percent ? 0 : param.min ?? 0} max={param.percent ? 100 : param.max ?? 1} step={param.percent ? 1 : param.step ?? 0.01}
        display={param.percent ? `${Math.round(v * 100)}%` : String(Math.round(v * 100) / 100)} onChange={n => onChange(param.percent ? n / 100 : n)} />
    </Labeled>
  )
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-editor-text-secondary">{label}</span>
      {children}
    </div>
  )
}

const pictures = new Map<string, HTMLImageElement>()

/** The selected item's own picture, playing its effects (or the hovered one) in a loop. */
function FxPreview({ el, stack }: { el: Media; stack: MediaFx[] }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const latest = useRef({ el, stack })
  latest.current = { el, stack }
  const aspect = el.width / Math.max(1, el.height)
  const height = Math.round(Math.min(190, 256 / aspect))
  const width = Math.round(height * aspect)

  const base = useMemo(() => {
    const { project, playhead } = useEditorStore.getState()
    if (!project) return { clip: 0, global: playhead }
    const index = project.scenes.findIndex(sc => sc.elements.some(e => e.id === el.id))
    const start = index >= 0 ? sceneStartTimes(project.scenes)[index] : 0
    return { clip: Math.max(0, clipTimeOf(el, playhead - start)), global: playhead }
  }, [el])

  useEffect(() => {
    let frame = 0
    const t0 = performance.now()
    const draw = (now: number) => {
      const ctx = canvas.current?.getContext('2d')
      const { el: item, stack: fx } = latest.current
      let picture: HTMLVideoElement | HTMLImageElement | null = null
      let pw = 0
      let ph = 0
      let crop = item.crop
      if (item.type === 'video') {
        const v = videoRegistry.get(item.id)
        if (v?.videoWidth) { picture = v; pw = v.videoWidth; ph = v.videoHeight; crop = punchedCrop(cropAt(item.crop, item.cropKeys, v.currentTime), item.punchIn) }
      } else {
        let img = pictures.get(item.src)
        if (!img) { img = new Image(); img.crossOrigin = 'anonymous'; img.src = toFileUrl(item.src); pictures.set(item.src, img) }
        if (img.complete && img.naturalWidth) { picture = img; pw = img.naturalWidth; ph = img.naturalHeight }
      }
      if (ctx && picture) {
        const c = crop ?? { x: 0, y: 0, w: 1, h: 1 }
        const rect = { x: c.x * pw, y: c.y * ph, w: c.w * pw, h: c.h * ph }
        const loop = ((now - t0) / 1000) % 4
        const out = renderFx({
          key: `preview:${item.id}`, el: item, stack: fx, picture, pictureW: pw, pictureH: ph, rect, maskSource: picture, maskRect: rect,
          outW: ctx.canvas.width, outH: ctx.canvas.height, clipTime: base.clip + loop, clipDuration: base.clip + 1e6,
          globalTime: base.global + loop, frameTime: picture instanceof HTMLVideoElement ? picture.currentTime : 0,
        })
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
        if (out) ctx.drawImage(out, 0, 0, ctx.canvas.width, ctx.canvas.height)
        else ctx.drawImage(picture, rect.x, rect.y, rect.w, rect.h, 0, 0, ctx.canvas.width, ctx.canvas.height)
      }
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [base])

  return (
    <div className="flex justify-center rounded border border-editor-border bg-[repeating-conic-gradient(#222_0_25%,#2c2c2c_0_50%)] bg-[length:12px_12px]">
      <canvas ref={canvas} width={width * 2} height={height * 2} style={{ width, height }} />
    </div>
  )
}
