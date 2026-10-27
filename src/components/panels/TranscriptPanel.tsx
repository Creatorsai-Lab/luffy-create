import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { create } from 'zustand'
import { ArrowLeft, Loader2, Pause, RotateCcw } from 'lucide-react'
import { buildAiProjectContext, prepareAiPlan } from '../../ai'
import { applyAiPlan } from '../../ai/editLog'
import { transcribeWords } from '../../ai/smart'
import { sourceLoudness } from '../../ai/smart/media'
import { quietSnapper } from '../../ai/smart/speech'
import { cutCommands, describeCuts, isFiller, partsOfSource, transcriptCuts, wordsIn, type ClipPart, type CutRange, type Word } from '../../ai/smart/jumpcut'
import { useEditorStore } from '../../store/editorStore'
import { clearCutPreview, CUT_COLORS, showCutPreview, type PreviewCut } from '../../store/cutPreviewStore'
import { sceneStartTimes } from '../../utils/sceneTiming'
import { cn } from '../../utils/cn'
import { toast } from '../ui/Toast'

const OWNER = 'transcript'
/** Gaps between words at least this long show as pause chips. */
const PAUSE_CHIP = 0.5

interface TranscriptViewState {
  /** The source file being edited (it stays the same while its clip is cut into parts). */
  src: string | null
  name: string
  openFor: (elementId: string) => void
  close: () => void
}

/** Which clip's transcript the properties panel shows (instead of the selection's panel). */
export const useTranscriptView = create<TranscriptViewState>(set => ({
  src: null,
  name: '',
  openFor: elementId => {
    const project = useEditorStore.getState().project
    const video = project?.scenes.flatMap(s => s.elements).find(el => el.id === elementId)
    if (video?.type === 'video') set({ src: video.src, name: video.name })
  },
  close: () => set({ src: null, name: '' }),
}))

/** One thing in the transcript: a word, or a pause between words (or at a part's edge). */
type Token =
  | { kind: 'word'; key: string; part: number; index: number; word: Word }
  | { kind: 'pause'; key: string; part: number; from: number; to: number }

/**
 * Transcript editing: the clip's words as text. Deleting words (or pause and
 * filler chips) cuts the video there — previewed on the timeline, applied as
 * one undoable AI edit. Spans every part of the clip if it was cut before.
 */
export default function TranscriptPanel() {
  const { src, name, close } = useTranscriptView()
  const scenes = useEditorStore(s => s.project?.scenes)
  const [words, setWords] = useState<Word[] | null>(null)
  const [db, setDb] = useState<Float32Array | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deleted, setDeleted] = useState<Set<string>>(new Set())
  const [selection, setSelection] = useState<{ anchor: number; focus: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const dragging = useRef(false)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!src) return
    let cancelled = false
    setWords(null)
    setError(null)
    setDeleted(new Set())
    setSelection(null)
    transcribeWords(src)
      .then(list => { if (!cancelled) setWords(list) })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
    sourceLoudness(src).then(found => { if (!cancelled) setDb(found) })
    return () => { cancelled = true }
  }, [src])

  const parts = useMemo(() => (scenes && src ? partsOfSource({ scenes }, src) : []), [scenes, src])

  // Words and pauses of each part, in timeline order.
  const tokens = useMemo(() => {
    const out: Token[] = []
    if (!words) return out
    parts.forEach((part, p) => {
      const list = wordsIn(words, part)
      let cursor = part.from
      list.forEach((word, index) => {
        if (word.start - cursor >= PAUSE_CHIP) out.push({ kind: 'pause', key: `${p}:gap:${index}`, part: p, from: cursor, to: word.start })
        out.push({ kind: 'word', key: `${p}:${index}`, part: p, index, word })
        cursor = Math.max(cursor, word.end)
      })
      if (part.to - cursor >= PAUSE_CHIP) out.push({ kind: 'pause', key: `${p}:gap:end`, part: p, from: cursor, to: part.to })
    })
    return out
  }, [words, parts])

  // Edits refer to the parts as they were; when the clip is cut or trimmed underneath, start over.
  const partsKey = parts.map(p => `${p.scene.id}:${p.from.toFixed(3)}:${p.to.toFixed(3)}`).join('|')
  useEffect(() => {
    setDeleted(new Set())
    setSelection(null)
  }, [partsKey])

  const cuts = useMemo(() => {
    if (!words) return [] as Array<{ part: ClipPart; ranges: CutRange[] }>
    const snap = db ? quietSnapper(db) : undefined
    return parts.map((part, p) => {
      const list = wordsIn(words, part)
      const gone = new Set<number>()
      const pauses: Array<{ from: number; to: number }> = []
      for (const token of tokens) {
        if (token.part !== p || !deleted.has(token.key)) continue
        if (token.kind === 'word') gone.add(token.index)
        else pauses.push(token)
      }
      return { part, ranges: gone.size || pauses.length ? transcriptCuts(list, gone, pauses, snap) : [] }
    })
  }, [words, db, parts, tokens, deleted])

  const cutCount = cuts.reduce((n, c) => n + c.ranges.length, 0)

  useEffect(() => {
    const preview: PreviewCut[] = cuts.flatMap(({ part, ranges }) =>
      ranges.map(r => ({ sceneId: part.scene.id, from: part.toScene(r.from), to: part.toScene(r.to), kind: r.kind })))
    if (preview.length) showCutPreview(OWNER, preview)
    else clearCutPreview(OWNER)
  }, [cuts])
  useEffect(() => () => clearCutPreview(OWNER), [])

  // The word under the playhead is highlighted without re-rendering the list.
  useEffect(() => {
    let last: Element | null = null
    const highlight = () => {
      const { playhead, project } = useEditorStore.getState()
      if (!project || !words) return
      const starts = sceneStartTimes(project.scenes)
      let key: string | null = null
      parts.forEach((part, p) => {
        if (key) return
        const start = starts[project.scenes.findIndex(s => s.id === part.scene.id)]
        const sourceTime = part.fromScene(playhead - start)
        if (start == null || sourceTime < part.from || sourceTime > part.to) return
        const hit = tokens.find(t => t.kind === 'word' && t.part === p && t.word.start <= sourceTime && sourceTime < t.word.end)
        if (hit) key = hit.key
      })
      const el = key ? listRef.current?.querySelector(`[data-key="${key}"]`) ?? null : null
      if (el === last) return
      last?.classList.remove('transcript-now')
      el?.classList.add('transcript-now')
      last = el
    }
    highlight()
    return useEditorStore.subscribe((state, prev) => { if (state.playhead !== prev.playhead) highlight() })
  }, [parts, tokens, words])

  if (!src) return null

  const range = selection ? [Math.min(selection.anchor, selection.focus), Math.max(selection.anchor, selection.focus)] as const : null
  const inSelection = (i: number) => range != null && i >= range[0] && i <= range[1]

  const seek = (token: Token) => {
    const project = useEditorStore.getState().project
    if (!project) return
    const part = parts[token.part]
    const index = project.scenes.findIndex(s => s.id === part.scene.id)
    if (index < 0) return
    const at = token.kind === 'word' ? token.word.start : token.from
    useEditorStore.getState().setPlayhead(sceneStartTimes(project.scenes)[index] + part.toScene(at) + 0.001)
  }

  const toggle = (keys: string[]) => setDeleted(prev => {
    const next = new Set(prev)
    // Deleting a selection that is already all deleted brings it back.
    const restore = keys.every(k => next.has(k))
    for (const k of keys) restore ? next.delete(k) : next.add(k)
    return next
  })

  const deleteSelection = () => {
    if (!range) return
    toggle(tokens.slice(range[0], range[1] + 1).map(t => t.key))
  }

  const fillerKeys = tokens.filter(t => t.kind === 'word' && isFiller(t.word.text)).map(t => t.key)
  const pauseKeys = tokens.filter(t => t.kind === 'pause').map(t => t.key)

  const apply = () => {
    const context = buildAiProjectContext()
    if (!context || busy || !cutCount) return
    setBusy(true)
    try {
      let aliases = 0
      const result = cutCommands(cuts, {}, { canRemoveScene: context.scenes.length > 1, nextAlias: () => `edit${++aliases}` })
      const prepared = prepareAiPlan({ summary: describeCuts(result), commands: result.commands }, context)
      const { results, edit } = applyAiPlan(prepared.plan, `Transcript edit: ${name}`)
      const failed = results.find(r => !r.ok)
      if (failed) toast.error(failed.message)
      else toast.success(`${prepared.plan.summary}${edit ? ` Undo with /undo #${edit.id} or Ctrl+Z.` : ''}`)
      setDeleted(new Set())
      setSelection(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-editor-border px-3 py-2">
        <button type="button" onClick={close} title="Back to the properties" className="text-editor-text-secondary hover:text-editor-text">
          <ArrowLeft size={13} />
        </button>
        <span className="text-xs font-medium text-editor-text">Transcript</span>
        <span className="truncate text-[11px] text-editor-text-secondary">{name}</span>
      </div>

      {words && (
        <div className="flex flex-wrap items-center gap-1 border-b border-editor-border px-3 py-2">
          <button type="button" disabled={!cutCount || busy} onClick={apply}
            className="rounded bg-editor-accent px-2 py-1 text-[11px] text-white hover:bg-editor-accent-hover disabled:opacity-40">
            {cutCount ? `Apply ${cutCount} cut${cutCount === 1 ? '' : 's'}` : 'Apply'}
          </button>
          {fillerKeys.length > 0 && (
            <button type="button" onClick={() => toggle(fillerKeys)} className="rounded border border-editor-border px-2 py-1 text-[11px] text-editor-text-secondary hover:text-editor-text">
              <span style={{ color: CUT_COLORS.filler }}>●</span> {fillerKeys.every(k => deleted.has(k)) ? 'Keep' : 'Cut'} {fillerKeys.length} filler{fillerKeys.length === 1 ? '' : 's'}
            </button>
          )}
          {pauseKeys.length > 0 && (
            <button type="button" onClick={() => toggle(pauseKeys)} className="rounded border border-editor-border px-2 py-1 text-[11px] text-editor-text-secondary hover:text-editor-text">
              <span style={{ color: CUT_COLORS.pause }}>●</span> {pauseKeys.every(k => deleted.has(k)) ? 'Keep' : 'Cut'} {pauseKeys.length} pause{pauseKeys.length === 1 ? '' : 's'}
            </button>
          )}
          {deleted.size > 0 && (
            <button type="button" onClick={() => setDeleted(new Set())} title="Restore everything" className="ml-auto text-editor-text-secondary hover:text-editor-text">
              <RotateCcw size={12} />
            </button>
          )}
        </div>
      )}

      <div
        ref={listRef}
        tabIndex={0}
        className="flex-1 overflow-y-auto px-3 py-2 text-[13px] leading-7 text-editor-text outline-none select-none"
        onMouseUp={() => { dragging.current = false }}
        onMouseLeave={() => { dragging.current = false }}
        onKeyDown={e => {
          if ((e.key === 'Delete' || e.key === 'Backspace') && range) {
            e.preventDefault()
            e.stopPropagation()
            deleteSelection()
          } else if (e.key === 'Escape' && selection) {
            e.stopPropagation()
            setSelection(null)
          }
        }}
      >
        {error ? (
          <p className="text-[11px] leading-relaxed text-amber-300">{error}</p>
        ) : !words ? (
          <div className="flex items-center gap-1.5 text-[11px] text-editor-text-secondary">
            <Loader2 size={12} className="animate-spin" /> Transcribing on this computer… (once per clip)
          </div>
        ) : !tokens.length ? (
          <p className="text-[11px] text-editor-text-secondary">No words were found in this clip.</p>
        ) : (
          tokens.map((token, i) => {
            const isDeleted = deleted.has(token.key)
            const selected = inSelection(i)
            const newPart = i > 0 && tokens[i - 1].part !== token.part
            const common = {
              'data-key': token.key,
              onMouseDown: (e: React.MouseEvent) => {
                if (e.button !== 0) return
                if (e.shiftKey && selection) setSelection({ anchor: selection.anchor, focus: i })
                else {
                  setSelection({ anchor: i, focus: i })
                  seek(token)
                }
                dragging.current = true
              },
              onMouseEnter: () => {
                if (dragging.current) setSelection(prev => (prev ? { anchor: prev.anchor, focus: i } : prev))
              },
            }
            return (
              <Fragment key={token.key}>
                {newPart && <span className="mx-1 inline-block h-3 w-px translate-y-0.5 bg-editor-border-strong" title="Next part of the clip" />}
                {token.kind === 'pause' ? (
                  <span {...common} title={`Pause ${(token.to - token.from).toFixed(1)}s — select and press Delete to cut`}
                    className={cn('mx-0.5 inline-flex cursor-pointer items-center rounded px-1 font-mono text-[10px] leading-4 align-middle',
                      isDeleted ? 'line-through opacity-60' : '', selected ? 'ring-1 ring-editor-accent' : '')}
                    style={{ background: `${CUT_COLORS.pause}26`, color: CUT_COLORS.pause }}>
                    <Pause size={8} className="mr-0.5" />{(token.to - token.from).toFixed(1)}s
                  </span>
                ) : (
                  <span {...common}
                    className={cn('cursor-pointer rounded-sm px-[1px] [&.transcript-now]:bg-sky-500/30',
                      isFiller(token.word.text) && 'italic',
                      isDeleted ? 'text-red-300/60 line-through' : 'hover:bg-white/10',
                      selected && 'bg-editor-accent/35')}
                    style={isFiller(token.word.text) && !isDeleted ? { color: CUT_COLORS.filler } : undefined}>
                    {token.word.text}
                  </span>
                )}{' '}
              </Fragment>
            )
          })
        )}
      </div>

      <p className="border-t border-editor-border px-3 py-1.5 text-[10px] leading-relaxed text-editor-text-secondary">
        Click a word to jump there. Drag or Shift+click to select, then Delete to cut it (Delete again restores). Cuts show on the timeline until you apply them.
      </p>
    </div>
  )
}
