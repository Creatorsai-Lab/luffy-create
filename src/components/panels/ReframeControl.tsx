import { useState } from 'react'
import { Loader2, ScanFace } from 'lucide-react'
import { buildAiProjectContext, executeAiPlan, planSmartSteps, prepareAiPlan } from '../../ai'
import { useEditorStore } from '../../store/editorStore'
import type { VideoElement } from '../../types/editor'
import { cn } from '../../utils/cn'
import { toast } from '../ui/Toast'

type Mode = 'auto' | 'steady' | 'follow'

const MODES: Array<{ value: Mode; label: string; hint: string }> = [
  { value: 'steady', label: 'Steady', hint: 'One still framing per shot' },
  { value: 'auto', label: 'Auto', hint: 'Still when they sit still, a smooth pan when they move' },
  { value: 'follow', label: 'Follow', hint: 'Always follows the face' },
]

/** Auto-reframe: crop the clip so it keeps the speaker's face in frame, finding faces on this computer. */
export default function ReframeControl({ element }: { element: VideoElement }) {
  const [mode, setMode] = useState<Mode>('auto')
  const [busy, setBusy] = useState<string | null>(null)
  const following = (element.cropKeys?.length ?? 0) > 0

  const run = async (fill: boolean) => {
    const context = buildAiProjectContext()
    if (!context || busy) return
    setBusy('Starting face detection…')
    try {
      const planned = await planSmartSteps([{ type: 'reframe', elementIds: [element.id], fill, mode }], context, { onProgress: setBusy })
      const prepared = prepareAiPlan(planned.plan, context)
      const warnings = [...(planned.issues ?? []), ...prepared.issues]
      if (!prepared.plan.commands.length) {
        toast.info(warnings[0]?.message ?? 'Nothing to reframe.')
        return
      }
      const failed = executeAiPlan(prepared.plan).find(r => !r.ok)
      if (failed) toast.error(failed.message)
      else toast.success(planned.plan.summary)
      if (warnings.length) toast.info(warnings[0].message)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="px-3 py-2 border-b border-editor-border flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <ScanFace size={13} className="text-editor-accent flex-none" />
        <span className="text-xs font-medium text-editor-text">Auto reframe</span>
        {following && <span className="ml-auto text-2xs text-sky-300">Following face</span>}
      </div>
      <p className="text-[10px] leading-relaxed text-editor-text-secondary">
        Crops the clip to keep the speaker's face in frame. Faces are found on this computer — nothing is uploaded.
      </p>
      <div className="grid grid-cols-3 gap-1 rounded bg-editor-elevated-highlight p-0.5">
        {MODES.map(m => (
          <button key={m.value} type="button" title={m.hint} onClick={() => setMode(m.value)}
            className={cn('rounded py-1 text-[11px]', mode === m.value ? 'bg-editor-accent text-white' : 'text-editor-text-secondary hover:text-editor-text')}>
            {m.label}
          </button>
        ))}
      </div>
      {busy ? (
        <div className="flex items-center justify-center gap-1.5 rounded bg-editor-elevated-highlight py-1.5 text-[11px] text-editor-text">
          <Loader2 size={12} className="animate-spin" /> {busy}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-1">
          <button type="button" onClick={() => run(true)} title="Fill the whole frame (e.g. landscape footage in a 9:16 video) and follow the face"
            className="rounded bg-editor-accent py-1.5 text-[11px] text-white hover:bg-editor-accent-hover">
            Fill frame
          </button>
          <button type="button" onClick={() => run(false)} title="Keep the clip's size and place; move the crop with the face"
            className="rounded border border-editor-border bg-editor-elevated-highlight py-1.5 text-[11px] text-editor-text hover:border-editor-accent hover:text-editor-accent">
            In place
          </button>
        </div>
      )}
      {following && !busy && (
        <button type="button" onClick={() => useEditorStore.getState().updateElement(element.id, { cropKeys: undefined })}
          className="rounded border border-editor-border py-1 text-[11px] text-editor-text-secondary hover:text-red-300">
          Stop following
        </button>
      )}
    </div>
  )
}
