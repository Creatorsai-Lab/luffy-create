import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { WandSparkles, Check, Copy, Eye, Loader2, Send, Settings2, Sparkles, Trash2, Undo2, X } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import {
  buildAiProjectContext,
  planAiEdit,
  prepareAiPlan,
  type AiCommandResult,
  type AiPlan,
  type AiPlanIssue,
} from '../../ai'
import { addonChoices, editChoices, getActiveToken, mediaChoices, snippet, type TokenChoice } from '../../ai/promptTokens'
import { cn } from '../../utils/cn'
import PromptText from './PromptText'
import { describeCommand } from '../../ai/describe'
import { applyAiPlan, readUndoRequest, undoAiEdit, useAiEditLog } from '../../ai/editLog'
import { previewAiPlan, type ScenePreview } from '../../ai/preview'

type ChatItem = {
  id: string
  role: 'user' | 'assistant' | 'system'
  text: string
  /** The applied AI edit this message reports (#1, #2, …), with an Undo button. */
  editId?: number
  /** A /history list (drawn live, so undone edits show as undone). */
  history?: boolean
}

const DEMO_API_KEY_STORAGE = 'luffy.ai.demoApiKey'

export default function AISidebar() {
  const project = useEditorStore(state => state.project)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [messages, setMessages] = useState<ChatItem[]>([])
  const [pendingPlan, setPendingPlan] = useState<AiPlan | null>(null)
  const [planIssues, setPlanIssues] = useState<AiPlanIssue[]>([])
  const [results, setResults] = useState<AiCommandResult[]>([])
  const [warning, setWarning] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [savedApiKey, setSavedApiKey] = useState(() => readDemoApiKey())
  const [apiKeyDraft, setApiKeyDraft] = useState(() => readDemoApiKey())
  const [caret, setCaret] = useState(0)
  const backdropRef = useRef<HTMLDivElement>(null)
  const choiceRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [activeChoice, setActiveChoice] = useState(0)
  // The "/" or "@" the user closed the list for (Esc); it stays closed for that token.
  const [dismissedAt, setDismissedAt] = useState<number | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [pendingPrompt, setPendingPrompt] = useState('')
  const [previews, setPreviews] = useState<ScenePreview[] | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const edits = useAiEditLog(state => state.edits)
  const projectEdits = useMemo(() => edits.filter(e => e.projectId === project?.id), [edits, project?.id])

  const commandLabels = useMemo(() => {
    if (!pendingPlan) return []
    return pendingPlan.commands.map((command, index) => `${index + 1}. ${describeCommand(command)}`)
  }, [pendingPlan])
  // "/" lists add-ons, "@" lists project media.
  const token = getActiveToken(input, caret)
  const choices = useMemo<TokenChoice[]>(() => {
    if (!token) return []
    if (token.kind === 'edit') return editChoices(projectEdits, token.query)
    return token.kind === 'addon' ? addonChoices(token.query) : mediaChoices(project?.assets ?? [], token.query)
  }, [token?.kind, token?.query, project?.assets, projectEdits]) // eslint-disable-line react-hooks/exhaustive-deps
  const listOpen = Boolean(token && choices.length > 0 && dismissedAt !== token.start)
  useEffect(() => setActiveChoice(0), [token?.kind, token?.query])
  useEffect(() => { choiceRefs.current[activeChoice]?.scrollIntoView({ block: 'nearest' }) }, [activeChoice])

  function syncCaret() {
    setCaret(inputRef.current?.selectionStart ?? input.length)
  }

  async function submit() {
    const prompt = input.trim()
    if (!prompt || busy) return
    const context = buildAiProjectContext()
    if (!context) {
      setWarning('Open a project before using AI commands.')
      return
    }

    setBusy(true)
    setWarning(null)
    setResults([])
    setPendingPlan(null)
    setPlanIssues([])
    setPreviews(null)
    setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'user', text: prompt }])
    setInput('')

    // "/history": the AI edits of this project, to undo one by its number.
    if (/^\/history\s*$/i.test(prompt)) {
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'system', text: '', history: true }])
      setBusy(false)
      return
    }

    // "/undo #3", "undo #3", "undo the last AI edit": no plan needed.
    const undo = readUndoRequest(prompt)
    if (undo != null) {
      runUndo(undo)
      setBusy(false)
      return
    }

    setPendingPrompt(prompt)
    try {
      const planned = await planAiEdit(prompt, context, { onProgress: setWarning })
      const prepared = prepareAiPlan(planned.plan, context)
      setPendingPlan(prepared.plan)
      setPlanIssues([...(planned.issues ?? []), ...prepared.issues])
      setWarning(planned.warning ?? null)
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', text: prepared.plan.summary }])
    } catch (error) {
      setWarning(error instanceof Error ? error.message : 'Could not plan the edit.')
    } finally {
      setBusy(false)
    }
  }

  function applyPlan() {
    if (!pendingPlan) return
    const { results: applied, edit } = applyAiPlan(pendingPlan, pendingPrompt)
    setResults(applied)
    setMessages(prev => [
      ...prev,
      { id: crypto.randomUUID(), role: 'system', text: `${applied.filter(item => item.ok).length}/${applied.length} Edits Done`, editId: edit?.id },
    ])
    setPendingPlan(null)
    setPlanIssues([])
    setPreviews(null)
  }

  function runUndo(id: number | 'last') {
    const { edit, result, error } = undoAiEdit(id)
    const text = error
      ? error
      : `Undid AI edit #${edit!.id}${result!.changes ? '' : ' — nothing left to undo'}.${result!.skipped.length ? ` ${result!.skipped.join(' ')}` : ''}`
    setResults([])
    setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'system', text }])
  }

  async function showPreview() {
    if (!pendingPlan || previewBusy) return
    setPreviewBusy(true)
    try {
      setPreviews(await previewAiPlan(pendingPlan))
    } catch (error) {
      setWarning(error instanceof Error ? error.message : 'Could not make a preview.')
    } finally {
      setPreviewBusy(false)
    }
  }

  function saveDemoApiKey() {
    const next = apiKeyDraft.trim()
    localStorage.setItem(DEMO_API_KEY_STORAGE, next)
    setSavedApiKey(next)
  }

  function deleteDemoApiKey() {
    localStorage.removeItem(DEMO_API_KEY_STORAGE)
    setSavedApiKey('')
    setApiKeyDraft('')
  }

  function choose(choice: TokenChoice) {
    if (!token) return
    const next = `${input.slice(0, token.start)}${choice.insert} ${input.slice(token.end)}`
    setInput(next)
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      const at = token.start + choice.insert.length + 1
      inputRef.current?.setSelectionRange(at, at)
      setCaret(at)
    })
  }

  /** ↑/↓ move through the list, Enter or Tab picks, Esc closes it. */
  function onPromptKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (!listOpen || !token) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActiveChoice(i => (i + step + choices.length) % choices.length)
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      choose(choices[Math.min(activeChoice, choices.length - 1)])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setDismissedAt(token.start)
    }
  }

  async function copyPrompt(item: ChatItem) {
    try {
      await navigator.clipboard.writeText(item.text)
      setCopiedId(item.id)
      setTimeout(() => setCopiedId(id => (id === item.id ? null : id)), 1200)
    } catch {
      setWarning('Could not copy to the clipboard.')
    }
  }

  return (
    <aside className="relative w-full flex-none bg-[#171717] flex flex-col h-full border-l border-editor-border">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-editor-border flex-none">
        <div className="flex items-center gap-2 min-w-0">
          <WandSparkles size={15} className="text-editor-accent" />
          <p className="text-xs font-medium text-editor-text truncate">AI Agents Edits </p>
        </div>
        <button
          type="button"
          onClick={() => setSettingsOpen(open => !open)}
          className="flex-none text-white"
          title="AI settings"
        >
          <Settings2 size={15} />
        </button>
      </div>

      {settingsOpen && (
        <div className="absolute right-3 top-10 z-20 w-72 rounded border border-editor-border bg-editor-elevated-highlight shadow-xl">
          <div className="flex items-center justify-between px-2.5 py-2 border-b border-editor-border">
            <span className="text-sm font-medium text-editor-text">AI API Settings</span>
            <button type="button" onClick={() => setSettingsOpen(false)} className="text-editor-text-secondary hover:text-editor-text">
              <X size={12} />
            </button>
          </div>
          <div className="p-2.5 space-y-2">
            <p className="text-xs text-editor-text-secondary">Demo only. This key is saved locally and is not used for planning yet.</p>
            <input
              type="password"
              value={apiKeyDraft}
              onChange={e => setApiKeyDraft(e.target.value)}
              placeholder="Enter API key"
              className="w-full rounded border border-editor-border bg-[#111] px-2 py-1.5 text-sm text-editor-text outline-none focus:border-editor-accent"
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-editor-text-secondary truncate">
                {savedApiKey ? 'Demo key saved' : 'No key saved'}
              </span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={saveDemoApiKey}
                  disabled={apiKeyDraft.trim().length === 0}
                  className="inline-flex items-center gap-1 rounded bg-editor-accent px-2 py-1 text-xs text-white disabled:opacity-40"
                >
                  <Check size={11} /> Save
                </button>
                <button
                  type="button"
                  onClick={deleteDemoApiKey}
                  disabled={!savedApiKey && !apiKeyDraft}
                  className="inline-flex items-center gap-1 rounded border border-editor-border px-2 py-1 text-xs text-editor-text disabled:opacity-40"
                >
                  <Trash2 size={11} /> Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {messages.length === 0 && !pendingPlan && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center text-sm text-editor-text-secondary leading-relaxed px-2">
              <Sparkles size={18} className="mx-auto mb-2 text-editor-accent" />
              Hey! What are you creating today? Use AI to complete it faster!
            </div>
          </div>
        )}

        {messages.map(item => item.role === 'user' ? (
          <div key={item.id} className="ml-10 flex flex-col items-end gap-0.5">
            <div className="w-full whitespace-pre-wrap break-words rounded-2xl rounded-br-none bg-editor-accent/20 border border-editor-accent/30 px-2 py-1 text-sm text-editor-text">
              <PromptText text={item.text} />
            </div>
            <button type="button" onClick={() => void copyPrompt(item)} title={copiedId === item.id ? 'Copied' : 'Copy prompt'}
              className="rounded p-1 text-editor-text-secondary hover:bg-white/5 hover:text-editor-text">
              {copiedId === item.id ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
            </button>
          </div>
        ) : item.history ? (
          <div key={item.id} className="mr-2 overflow-hidden rounded border border-editor-border bg-editor-elevated-highlight">
            <div className="flex items-center justify-between border-b border-editor-border px-2 py-1.5">
              <span className="text-xs font-medium text-editor-text">AI edits</span>
              <span className="text-[10px] text-editor-text-secondary">type <span className="font-mono text-amber-300">/undo #id</span></span>
            </div>
            {projectEdits.length === 0 && <p className="px-2 py-2 text-xs text-editor-text-secondary">No AI edits yet in this session.</p>}
            {projectEdits.map(e => (
              <div key={e.id} className="flex h-8 items-center gap-2 border-b border-editor-border/50 px-2 last:border-b-0">
                <span className={cn('min-w-0 flex-1 truncate text-xs', e.undone ? 'text-editor-text-secondary line-through' : 'text-editor-text')} title={e.prompt}>
                  {snippet(e.prompt, 48)}
                </span>
                <span className="flex-none text-[10px] text-editor-text-secondary">{new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <span className="w-9 flex-none text-right font-mono text-xs text-amber-300">#{e.id}</span>
                {e.undone
                  ? <span className="w-5 flex-none text-center text-[10px] text-editor-text-secondary" title="Undone">–</span>
                  : (
                    <button type="button" onClick={() => runUndo(e.id)} title={`Undo #${e.id}`}
                      className="flex h-5 w-5 flex-none items-center justify-center rounded text-editor-text-secondary hover:bg-white/10 hover:text-editor-text">
                      <Undo2 size={11} />
                    </button>
                  )}
              </div>
            ))}
          </div>
        ) : (
          <div key={item.id} className="mr-10 px-1.5 py-1 text-base text-editor-text">
            {item.editId != null && <span className="mr-1.5 rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs text-editor-text-secondary">#{item.editId}</span>}
            {item.text}
            {item.editId != null && (() => {
              const undone = edits.find(e => e.projectId === project?.id && e.id === item.editId)?.undone
              return undone
                ? <span className="ml-2 text-xs text-editor-text-secondary">Undone</span>
                : (
                  <button type="button" onClick={() => runUndo(item.editId!)} title={`Undo AI edit #${item.editId} (or type "undo #${item.editId}")`}
                    className="ml-2 inline-flex items-center gap-1 rounded border border-editor-border px-1.5 py-0.5 text-xs text-editor-text-secondary hover:border-editor-accent hover:text-editor-text">
                    <Undo2 size={11} /> Undo
                  </button>
                )
            })()}
          </div>
        ))}

        {warning && (
          <div className="px-2 py-1.5 text-sm text-[#7b6f7d] italic">
            {warning}
          </div>
        )}

        {pendingPlan && (
          <div className="rounded border border-editor-accent/40 bg-editor-elevated-highlight overflow-hidden">
            <div className="flex items-center justify-between px-2 py-1.5 border-b border-editor-border">
              <span className="text-sm text-editor-text font-medium">Pending Plan</span>
              <button onClick={() => setPendingPlan(null)} className="text-editor-text-secondary hover:text-editor-text">
                <X size={12} />
              </button>
            </div>
            <div className="px-2 py-2 space-y-1.5">
              {planIssues.length > 0 && (
                <div className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 space-y-1">
                  {planIssues.map((issue, index) => (
                    <p key={index} className={issue.level === 'error' ? 'text-sm text-red-200' : 'text-sm text-amber-200'}>
                      {issue.message}
                    </p>
                  ))}
                </div>
              )}
              {commandLabels.length === 0 ? (
                <p className="text-sm text-editor-text-secondary">No supported command was produced.</p>
              ) : (
                commandLabels.map(label => (
                  <p key={label} className="text-sm text-editor-text leading-relaxed">{label}</p>
                ))
              )}
            </div>
            {previews && (
              <div className="space-y-2 px-2 pb-2">
                {previews.length === 0 && <p className="text-xs text-editor-text-secondary">This plan does not change how any scene looks.</p>}
                {previews.map(p => (
                  <div key={p.sceneId}>
                    <div className="mb-1 text-[11px] text-editor-text-secondary">Scene {p.index}{p.before ? '' : ' (new)'}</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(['before', 'after'] as const).map(side => (
                        <figure key={side} className="min-w-0">
                          {p[side]
                            ? <img src={p[side]!} alt={`Scene ${p.index} ${side}`} className="w-full rounded border border-editor-border" />
                            : <div className="flex aspect-video w-full items-center justify-center rounded border border-dashed border-editor-border text-[10px] text-editor-text-secondary">—</div>}
                          <figcaption className="mt-0.5 text-center text-[10px] uppercase text-editor-text-secondary">{side}</figcaption>
                        </figure>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-1.5 px-2 pb-2">
              <button
                onClick={applyPlan}
                disabled={pendingPlan.commands.length === 0}
                className="flex-1 inline-flex items-center justify-center gap-1 rounded bg-editor-accent px-2 py-1.5 text-sm text-white disabled:opacity-40"
              >
                <Check size={12} /> Apply
              </button>
              <button
                onClick={() => void showPreview()}
                disabled={pendingPlan.commands.length === 0 || previewBusy}
                title="See the changed scenes before and after, without applying"
                className="inline-flex items-center gap-1 px-2 py-1.5 rounded border border-editor-border text-sm text-editor-text hover:border-editor-accent disabled:opacity-40"
              >
                {previewBusy ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />} Preview
              </button>
              <button
                onClick={() => { setPendingPlan(null); setPreviews(null) }}
                className="px-2 py-1.5 rounded border border-editor-border text-sm text-editor-text"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {results.length > 0 && (
          <div className="rounded-2xl rounded-bl-none border border-editor-border bg-editor-elevated-highlight px-2 py-2 space-y-1 mr-5">
            {results.map((item, index) => (
              <p key={index} className={item.ok ? 'text-sm text-white' : 'text-sm text-red-200'}>
                ✓ {item.message}
              </p>
            ))}
          </div>
        )}
      </div>

      <div className="p-3 border-t border-editor-border flex-none">
        {listOpen && token && (
          // Six rows tall; more scroll. The highlighted row follows ↑/↓.
          <div role="listbox" aria-label={token.kind === 'addon' ? 'Commands and add-ons' : token.kind === 'edit' ? 'AI edits' : 'Media'}
            className="mb-2 max-h-48 overflow-y-auto rounded border border-editor-border bg-editor-elevated-highlight shadow-xl">
            {choices.map((choice, i) => (
              <button
                key={choice.key}
                ref={el => { choiceRefs.current[i] = el }}
                type="button"
                role="option"
                aria-selected={i === activeChoice}
                onMouseDown={e => e.preventDefault()}
                onMouseEnter={() => setActiveChoice(i)}
                onClick={() => choose(choice)}
                className={cn('flex h-8 w-full items-center justify-between gap-2 px-2.5 text-left',
                  i === activeChoice ? 'bg-editor-accent/20' : 'hover:bg-white/5')}
              >
                <span className={cn('min-w-0 truncate text-sm', token.kind === 'addon' ? cn('font-mono', choice.key.startsWith('command-') ? 'text-amber-300' : 'text-violet-300') : token.kind === 'edit' ? 'font-mono text-editor-text' : 'text-editor-text')}>{choice.label}</span>
                <span className="flex-none text-xs uppercase text-editor-text-secondary">{choice.hint}</span>
              </button>
            ))}
          </div>
        )}
        <form
          className="flex items-center gap-1.5 bg-editor-elevated-highlight border border-editor-border rounded-xl px-2.5 py-2"
          onSubmit={e => { e.preventDefault(); void submit() }}
        >
          {/* The textarea's own text is transparent; the layer under it draws the same text with /add-ons and @media coloured. */}
          <div className="relative flex-1 min-w-0 h-[calc(4*1.5rem)]">
            <div ref={backdropRef} aria-hidden
              className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap [overflow-wrap:break-word] text-base leading-6 text-editor-text">
              <PromptText text={input} inInput />{'\n'}
            </div>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => {
                setInput(e.target.value)
                setCaret(e.target.selectionStart)
                setDismissedAt(null)
              }}
              onKeyDown={onPromptKeyDown}
              onClick={syncCaret}
              onKeyUp={syncCaret}
              onSelect={syncCaret}
              onScroll={e => { if (backdropRef.current) backdropRef.current.scrollTop = e.currentTarget.scrollTop }}
              placeholder="Describe an edit — type / for add-ons, @ for media"
              spellCheck={false}
              className="relative block h-full w-full resize-none bg-transparent text-base leading-6 text-transparent caret-editor-text placeholder:text-editor-text-secondary outline-none selection:bg-editor-accent/30 [overflow-wrap:break-word] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            />
          </div>
          <button
            type="submit"
            disabled={busy || input.trim().length === 0}
            className="flex-none text-editor-text disabled:text-editor-text-secondary disabled:cursor-not-allowed"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          </button>
        </form>
      </div>
    </aside>
  )
}

function readDemoApiKey() {
  try {
    return localStorage.getItem(DEMO_API_KEY_STORAGE) ?? ''
  } catch {
    return ''
  }
}
