import { useState } from 'react'
import { AudioLines, Loader2 } from 'lucide-react'
import { buildAiProjectContext, executeAiPlan, planSmartSteps, prepareAiPlan } from '../../ai'
import { DEFAULT_DUCK_FADE, DEFAULT_DUCK_LEVEL } from '../../ai/smart/duck'
import { useEditorStore } from '../../store/editorStore'
import type { AudioElement } from '../../types/editor'
import { toast } from '../ui/Toast'

/** "Duck under voice": the music dips whenever the video or a voiceover talks. */
export default function DuckingControl({ element }: { element: AudioElement }) {
  const [level, setLevel] = useState(DEFAULT_DUCK_LEVEL)
  const [fade, setFade] = useState(DEFAULT_DUCK_FADE)
  const [busy, setBusy] = useState<string | null>(null)
  const keys = element.volumeKeys?.length ?? 0

  const duck = async () => {
    const context = buildAiProjectContext()
    if (!context || busy) return
    setBusy('Listening…')
    try {
      const planned = await planSmartSteps([{ type: 'duckMusic', musicIds: [element.id], level, fade }], context, { onProgress: setBusy })
      const prepared = prepareAiPlan(planned.plan, context)
      const warning = [...(planned.issues ?? []), ...prepared.issues][0]
      if (!prepared.plan.commands.length) {
        toast.info(warning?.message ?? planned.plan.summary)
        return
      }
      const failed = executeAiPlan(prepared.plan).find(r => !r.ok)
      if (failed) toast.error(failed.message)
      else toast.success(planned.plan.summary)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-2 border-t border-editor-border pt-2">
      <div className="flex items-center gap-2">
        <AudioLines size={13} className="text-editor-accent flex-none" />
        <label className="text-xs font-medium text-white">Duck under voice</label>
        {keys > 0 && <span className="ml-auto text-2xs text-sky-300">On</span>}
      </div>
      <p className="text-2xs text-[#888888] leading-snug">Lowers this clip while the video or a voiceover talks, and brings it back up in the pauses.</p>
      <Slider label="Volume while talking" value={Math.round(level * 100)} min={0} max={80} step={5} unit="%" onChange={v => setLevel(v / 100)} />
      <Slider label="Fade" value={fade} min={0.1} max={1.5} step={0.05} unit="s" onChange={setFade} />
      <div className="flex gap-2">
        <button onClick={duck} disabled={Boolean(busy)}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 rounded bg-editor-accent text-white hover:bg-editor-accent-hover disabled:opacity-60 transition-colors">
          {busy ? <><Loader2 size={12} className="animate-spin" /> {busy}</> : keys ? 'Duck again' : 'Duck under voice'}
        </button>
        {keys > 0 && !busy && (
          <button onClick={() => useEditorStore.getState().updateElement(element.id, { volumeKeys: undefined })}
            className="px-2.5 text-xs py-1.5 rounded bg-editor-elevated-highlight border border-editor-border text-editor-text hover:bg-editor-hover transition-colors">
            Remove
          </button>
        )}
      </div>
    </div>
  )
}

function Slider({ label, value, min, max, step, unit, onChange }: {
  label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (value: number) => void
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-2xs text-[#888888]">
        <span>{label}</span>
        <span className="text-white tabular-nums">{Number(value.toFixed(2))}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-editor-border rounded-lg appearance-none cursor-pointer" />
    </div>
  )
}
