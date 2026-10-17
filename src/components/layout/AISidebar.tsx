import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { BrainCircuit, Check, Copy, Loader2, Send, Settings, Sparkles, Trash2, X } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import {
  buildAiProjectContext,
  executeAiPlan,
  planAiEdit,
  prepareAiPlan,
  type AiCommandResult,
  type AiPlan,
  type AiPlanIssue,
} from '../../ai'
import { addonChoices, getActiveToken, mediaChoices, type TokenChoice } from '../../ai/promptTokens'
import { cn } from '../../utils/cn'
import PromptText from './PromptText'
import { describeCommand } from '../../ai/describe'

type ChatItem = {
  id: string
  role: 'user' | 'assistant' | 'system'
  text: string
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

  const commandLabels = useMemo(() => {
    if (!pendingPlan) return []
    return pendingPlan.commands.map((command, index) => `${index + 1}. ${describeCommand(command)}`)
  }, [pendingPlan])
  // "/" lists add-ons, "@" lists project media.
  const token = getActiveToken(input, caret)
  const choices = useMemo<TokenChoice[]>(() => {
    if (!token) return []
    return token.kind === 'addon' ? addonChoices(token.query) : mediaChoices(project?.assets ?? [], token.query)
  }, [token?.kind, token?.query, project?.assets]) // eslint-disable-line react-hooks/exhaustive-deps
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
    setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'user', text: prompt }])
    setInput('')

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
    const applied = executeAiPlan(pendingPlan)
    setResults(applied)
    setMessages(prev => [
      ...prev,
      { id: crypto.randomUUID(), role: 'system', text: `${applied.filter(item => item.ok).length}/${applied.length} Edits Done` },
    ])
    setPendingPlan(null)
    setPlanIssues([])
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
          <BrainCircuit size={15} className="text-editor-accent" />
          <p className="text-xs font-medium text-editor-text truncate">AI Agents Edits </p>
        </div>
        <button
          type="button"
          onClick={() => setSettingsOpen(open => !open)}
          className="flex-none text-white"
          title="AI settings"
        >
          <Settings size={15} />
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
              Describe an edit to prepare scene commands.
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
        ) : (
          <div key={item.id} className="mr-10 px-1.5 py-1 text-base text-editor-text">
            {item.text}
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
            <div className="flex gap-1.5 px-2 pb-2">
              <button
                onClick={applyPlan}
                disabled={pendingPlan.commands.length === 0}
                className="flex-1 inline-flex items-center justify-center gap-1 rounded bg-editor-accent px-2 py-1.5 text-sm text-white disabled:opacity-40"
              >
                <Check size={12} /> Apply
              </button>
              <button
                onClick={() => setPendingPlan(null)}
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
          <div role="listbox" aria-label={token.kind === 'addon' ? 'Add-ons' : 'Media'}
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
                <span className={cn('min-w-0 truncate text-sm', token.kind === 'addon' ? 'font-mono text-violet-300' : 'text-editor-text')}>{choice.label}</span>
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
              <PromptText text={input} sameWidth />{'\n'}
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
