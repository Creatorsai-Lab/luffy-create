import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, FileText, Loader2, Scissors } from 'lucide-react'
import { buildAiProjectContext, planSmartSteps, prepareAiPlan } from '../../ai'
import { applyAiPlan } from '../../ai/editLog'
import { transcribeWords } from '../../ai/smart'
import { sourceLoudness } from '../../ai/smart/media'
import { autoThreshold, quietSnapper, speechFromLoudness } from '../../ai/smart/speech'
import { cutLength, DEFAULT_JUMP_CUT, jumpCutRanges, partsOfSource, type CutKind, type JumpCutSettings, type Word } from '../../ai/smart/jumpcut'
import { useEditorStore } from '../../store/editorStore'
import { clearCutPreview, CUT_COLORS, showCutPreview, type PreviewCut } from '../../store/cutPreviewStore'
import { useTranscriptView } from './TranscriptPanel'
import type { VideoElement } from '../../types/editor'
import { cn } from '../../utils/cn'
import { Slider } from './TextPanel'
import { toast } from '../ui/Toast'

const OWNER = 'jumpcut'
const SETTINGS_KEY = 'luffy.jumpcut.settings'
const OPEN_KEY = 'luffy.jumpcut.open'

function loadSettings(): JumpCutSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null')
    return saved && typeof saved === 'object' ? { ...DEFAULT_JUMP_CUT, ...saved } : DEFAULT_JUMP_CUT
  } catch {
    return DEFAULT_JUMP_CUT
  }
}

function remember(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* private window */ }
}

/**
 * Jump cuts for a talking clip: pauses, filler words and retakes are found on
 * this computer, shown on the timeline, and cut in one undoable AI edit —
 * across every part of the clip if it was cut before.
 */
export default function JumpCutControl({ element }: { element: VideoElement }) {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(OPEN_KEY) === 'true' } catch { return false }
  })
  const [settings, setSettings] = useState(loadSettings)
  const [loudness, setLoudness] = useState<{ src: string; db: Float32Array | null } | null>(null)
  const [words, setWords] = useState<{ src: string; words: Word[] } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const scenes = useEditorStore(s => s.project?.scenes)
  const src = element.src
  const needsWords = settings.fillers || settings.retakes

  const update = (patch: Partial<JumpCutSettings>) => setSettings(prev => {
    const next = { ...prev, ...patch }
    remember(SETTINGS_KEY, next)
    return next
  })

  // Measure the clip's loudness once it's opened (fast, and cached per file).
  useEffect(() => {
    if (!open || loudness?.src === src) return
    let cancelled = false
    setBusy('Listening to the clip…')
    sourceLoudness(src).then(db => {
      if (cancelled) return
      setLoudness({ src, db })
      setBusy(null)
    })
    return () => { cancelled = true }
  }, [open, src, loudness?.src])

  // Words (for fillers and retakes) come from local Whisper, once per file.
  useEffect(() => {
    if (!open || !needsWords || words?.src === src) return
    let cancelled = false
    setBusy('Transcribing on this computer… (once per clip)')
    transcribeWords(src)
      .then(list => { if (!cancelled) setWords({ src, words: list }) })
      .catch(error => {
        if (cancelled) return
        toast.error(error instanceof Error ? error.message : String(error))
        update({ fillers: false, retakes: false })
      })
      .finally(() => { if (!cancelled) setBusy(null) })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, needsWords, src, words?.src])

  const db = loudness?.src === src ? loudness.db : null
  const auto = useMemo(() => (db ? autoThreshold(db) : null), [db])
  const speech = useMemo(() => {
    if (!db || !settings.pauses) return undefined
    const found = speechFromLoudness(db, { minSilence: settings.minPause, threshold: settings.threshold })
    return found.length ? found : undefined
  }, [db, settings.pauses, settings.minPause, settings.threshold])
  const snap = useMemo(() => (db ? quietSnapper(db) : undefined), [db])
  const clipWords = words?.src === src ? words.words : undefined

  // What would be cut, per part of the clip, in scene time for the timeline.
  const preview = useMemo(() => {
    if (!open || !scenes || !db) return null
    const cuts: PreviewCut[] = []
    const counts: Record<CutKind, number> = { pause: 0, filler: 0, retake: 0, edit: 0 }
    let seconds = 0
    let length = 0
    for (const part of partsOfSource({ scenes }, src)) {
      const ranges = jumpCutRanges({ speech, words: needsWords ? clipWords : undefined, snap }, part, settings)
      seconds += cutLength(ranges)
      length += part.to - part.from
      for (const r of ranges) {
        counts[r.kind]++
        cuts.push({ sceneId: part.scene.id, from: part.toScene(r.from), to: part.toScene(r.to), kind: r.kind })
      }
    }
    return { cuts, counts, seconds, length }
  }, [open, scenes, db, src, speech, clipWords, needsWords, snap, settings])

  useEffect(() => {
    if (preview) showCutPreview(OWNER, preview.cuts)
    else clearCutPreview(OWNER)
  }, [preview])
  useEffect(() => () => clearCutPreview(OWNER), [])

  const toggleOpen = () => {
    setOpen(prev => {
      remember(OPEN_KEY, !prev)
      return !prev
    })
  }

  const apply = async () => {
    const context = buildAiProjectContext()
    if (!context || busy) return
    setBusy('Cutting…')
    try {
      const planned = await planSmartSteps([{ type: 'jumpCut', src, settings }], context, { onProgress: setBusy })
      const prepared = prepareAiPlan(planned.plan, context)
      const warnings = [...(planned.issues ?? []), ...prepared.issues]
      if (!prepared.plan.commands.length) {
        toast.info(warnings[0]?.message ?? 'Nothing to cut.')
        return
      }
      const { results, edit } = applyAiPlan(prepared.plan, `Jump cut: ${element.name}`)
      const failed = results.find(r => !r.ok)
      if (failed) toast.error(failed.message)
      else toast.success(`${planned.plan.summary}${edit ? ` Undo with /undo #${edit.id} or Ctrl+Z.` : ''}`)
      if (warnings.length) toast.info(warnings[0].message)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(null)
    }
  }

  const toggles: Array<{ key: 'pauses' | 'fillers' | 'retakes' | 'punchIn'; label: string; hint: string; color?: string }> = [
    { key: 'pauses', label: 'Pauses', hint: 'Silences between sentences', color: CUT_COLORS.pause },
    { key: 'fillers', label: 'Filler words', hint: '"um", "uh", "erm" — needs a transcript (local Whisper)', color: CUT_COLORS.filler },
    { key: 'retakes', label: 'Retakes', hint: 'A sentence started again: the earlier tries are cut, the last take stays — needs a transcript', color: CUT_COLORS.retake },
    { key: 'punchIn', label: 'Punch-in zoom', hint: 'Zoom every other part in a little so the cuts look intentional' },
  ]

  return (
    <div className="px-3 py-2 border-b border-editor-border flex flex-col gap-2">
      <button type="button" onClick={toggleOpen} className="flex items-center gap-2 text-left">
        <Scissors size={13} className="text-editor-accent flex-none" />
        <span className="text-xs font-medium text-editor-text">Jump cuts</span>
        <span className="ml-auto text-editor-text-secondary">{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</span>
      </button>

      {open && (
        <>
          <p className="text-[10px] leading-relaxed text-editor-text-secondary">
            Cuts pauses, filler words and retakes. Cuts show on the timeline before you apply them. Everything runs on this computer.
          </p>

          <div className="grid grid-cols-2 gap-1">
            {toggles.map(t => (
              <button key={t.key} type="button" title={t.hint} onClick={() => update({ [t.key]: !settings[t.key] })}
                className={cn('flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] text-left',
                  settings[t.key] ? 'border-editor-accent bg-editor-accent/15 text-editor-text' : 'border-editor-border text-editor-text-secondary hover:text-editor-text')}>
                <span className="h-2 w-2 flex-none rounded-full" style={{ background: settings[t.key] ? (t.color ?? '#60a5fa') : 'transparent', boxShadow: `inset 0 0 0 1px ${t.color ?? '#60a5fa'}` }} />
                {t.label}
              </button>
            ))}
          </div>

          {settings.pauses && (
            <div className="flex flex-col gap-1">
              <SliderRow label="Shortest pause to cut">
                <Slider value={settings.minPause} min={0.2} max={2} step={0.05} display={`${settings.minPause.toFixed(2)}s`} onChange={v => update({ minPause: v })} />
              </SliderRow>
              <SliderRow label="Breath kept by each cut">
                <Slider value={settings.padding} min={0} max={0.4} step={0.01} display={`${settings.padding.toFixed(2)}s`} onChange={v => update({ padding: v })} />
              </SliderRow>
              <SliderRow label="Silence level" extra={(
                <button type="button" onClick={() => update({ threshold: settings.threshold == null ? Math.round(auto ?? -40) : undefined })}
                  className={cn('rounded px-1.5 text-[10px]', settings.threshold == null ? 'bg-editor-accent text-white' : 'text-editor-text-secondary hover:text-editor-text')}
                  title="Work the level out from the clip">
                  Auto{auto != null && settings.threshold == null ? ` ${Math.round(auto)} dB` : ''}
                </button>
              )}>
                {settings.threshold != null && (
                  <Slider value={settings.threshold} min={-70} max={-10} step={1} display={`${settings.threshold} dB`} onChange={v => update({ threshold: v })} />
                )}
              </SliderRow>
            </div>
          )}

          {settings.punchIn && (
            <SliderRow label="Punch-in zoom">
              <Slider value={Math.round(settings.zoom * 100)} min={105} max={130} step={1} display={`${Math.round(settings.zoom * 100)}%`} onChange={v => update({ zoom: v / 100 })} />
            </SliderRow>
          )}

          {busy ? (
            <div className="flex items-center justify-center gap-1.5 rounded bg-editor-elevated-highlight py-1.5 text-[11px] text-editor-text">
              <Loader2 size={12} className="animate-spin" /> {busy}
            </div>
          ) : db === null && loudness?.src === src ? (
            <p className="text-[11px] text-amber-300">This clip has no sound to analyse.</p>
          ) : preview && (
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-editor-text">
                <span className="font-medium">{preview.cuts.length} cut{preview.cuts.length === 1 ? '' : 's'}</span>
                {preview.seconds > 0 && <span className="text-editor-text-secondary">−{preview.seconds.toFixed(1)}s of {fmt(preview.length)}</span>}
                {(['pause', 'filler', 'retake'] as const).filter(k => preview.counts[k]).map(k => (
                  <span key={k} className="flex items-center gap-1 text-editor-text-secondary">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: CUT_COLORS[k] }} />{preview.counts[k]} {k === 'filler' ? 'fillers' : `${k}s`}
                  </span>
                ))}
              </div>
              {needsWords && !clipWords && <p className="text-[10px] text-editor-text-secondary">Waiting for the transcript…</p>}
              <button type="button" onClick={apply} disabled={!preview.cuts.length && !settings.punchIn}
                className="rounded bg-editor-accent py-1.5 text-[11px] text-white hover:bg-editor-accent-hover disabled:opacity-40">
                {preview.cuts.length ? `Apply ${preview.cuts.length} cut${preview.cuts.length === 1 ? '' : 's'}` : 'Apply punch-in'}
              </button>
            </div>
          )}

          <button type="button" onClick={() => useTranscriptView.getState().openFor(element.id)}
            className="flex items-center justify-center gap-1.5 rounded border border-editor-border bg-editor-elevated-highlight py-1.5 text-[11px] text-editor-text hover:border-editor-accent hover:text-editor-accent">
            <FileText size={12} /> Edit by transcript
          </button>
        </>
      )}
    </div>
  )
}

function SliderRow({ label, extra, children }: { label: string; extra?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-editor-text-secondary">{label}</span>
        {extra}
      </div>
      {children}
    </div>
  )
}

function fmt(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
