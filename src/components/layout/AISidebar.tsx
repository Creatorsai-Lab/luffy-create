import { useMemo, useState } from 'react'
import { BrainCircuit, Check, Loader2, Send, Settings, Sparkles, Trash2, X } from 'lucide-react'
import {
  buildAiProjectContext,
  executeAiPlan,
  planAiEdit,
  prepareAiPlan,
  type AiCommandResult,
  type AiPlan,
  type AiPlanIssue,
} from '../../ai'

type ChatItem = {
  id: string
  role: 'user' | 'assistant' | 'system'
  text: string
}

const DEMO_API_KEY_STORAGE = 'luffy.ai.demoApiKey'

export default function AISidebar() {
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

  const commandLabels = useMemo(() => {
    if (!pendingPlan) return []
    return pendingPlan.commands.map((command, index) => `${index + 1}. ${describeCommand(command)}`)
  }, [pendingPlan])

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
      const planned = await planAiEdit(prompt, context)
      const prepared = prepareAiPlan(planned.plan, context)
      setPendingPlan(prepared.plan)
      setPlanIssues(prepared.issues)
      setWarning(planned.warning ?? (planned.source === 'local' ? 'Local planner used. Configure the model planner for richer edits.' : null))
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

  return (
    <aside className="relative w-80 flex-none bg-[#171717] flex flex-col h-full border-l border-editor-border">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-editor-border flex-none">
        <div className="flex items-center gap-2 min-w-0">
          <BrainCircuit size={15} className="text-editor-accent" />
          <span className="text-xs font-medium text-editor-text truncate">AI Agents Edits <i className="text-orange-400">beta</i></span>
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
        <div className="absolute right-3 top-10 z-20 w-72 rounded border border-editor-border bg-editor-elevated shadow-xl">
          <div className="flex items-center justify-between px-2.5 py-2 border-b border-editor-border">
            <span className="text-sm font-medium text-editor-text">AI API Settings</span>
            <button type="button" onClick={() => setSettingsOpen(false)} className="text-editor-secondary hover:text-editor-text">
              <X size={12} />
            </button>
          </div>
          <div className="p-2.5 space-y-2">
            <p className="text-xs text-editor-secondary">Demo only. This key is saved locally and is not used for planning yet.</p>
            <input
              type="password"
              value={apiKeyDraft}
              onChange={e => setApiKeyDraft(e.target.value)}
              placeholder="Enter API key"
              className="w-full rounded border border-editor-border bg-[#111] px-2 py-1.5 text-sm text-editor-text outline-none focus:border-editor-accent"
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-editor-secondary truncate">
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
            <div className="text-center text-sm text-editor-secondary leading-relaxed px-2">
              <Sparkles size={18} className="mx-auto mb-2 text-editor-accent" />
              Describe an edit to prepare scene commands.
            </div>
          </div>
        )}

        {messages.map(item => (
          <div
            key={item.id}
            className={
              item.role === 'user'
                ? 'ml-10 rounded-2xl rounded-br-none bg-editor-accent/20 border border-editor-accent/30 px-2 py-1 text-sm text-editor-text'
                : 'mr-10 px-1.5 py-1 text-base text-editor-text'
            }
          >
            {item.text}
          </div>
        ))}

        {warning && (
          <div className="px-2 py-1.5 text-sm text-[#7b6f7d] italic">
            {warning}
          </div>
        )}

        {pendingPlan && (
          <div className="rounded border border-editor-accent/40 bg-editor-elevated overflow-hidden">
            <div className="flex items-center justify-between px-2 py-1.5 border-b border-editor-border">
              <span className="text-sm text-editor-text font-medium">Pending Plan</span>
              <button onClick={() => setPendingPlan(null)} className="text-editor-secondary hover:text-editor-text">
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
                <p className="text-sm text-editor-secondary">No supported command was produced.</p>
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
          <div className="rounded-2xl rounded-bl-none border border-editor-border bg-editor-elevated px-2 py-2 space-y-1 mr-5">
            {results.map((item, index) => (
              <p key={index} className={item.ok ? 'text-sm text-white' : 'text-sm text-red-200'}>
                ✓ {item.message}
              </p>
            ))}
          </div>
        )}
      </div>

      <div className="p-3 border-t border-editor-border flex-none">
        <form
          className="flex items-center gap-1.5 bg-editor-elevated border border-editor-border rounded-lg px-2.5 py-2"
          onSubmit={e => { e.preventDefault(); void submit() }}
        >
          <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Describe an edit with mentioning scene"
          className="flex-1 bg-transparent text-base text-editor-text placeholder:text-editor-secondary outline-none min-w-0 resize-none h-[calc(2*1.5rem)] leading-6"
        />  
          <button
            type="submit"
            disabled={busy || input.trim().length === 0}
            className="flex-none text-editor-text disabled:text-editor-secondary disabled:cursor-not-allowed"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          </button>
        </form>
      </div>
    </aside>
  )
}

function describeCommand(command: AiPlan['commands'][number]) {
  if (command.type === 'addText') return `Add text "${command.text}"${sceneSuffix(command.sceneIndex)}`
  if (command.type === 'addShape') return `Add ${command.shapeType}${sizeSuffix(command.width, command.height)}${sceneSuffix(command.sceneIndex)}`
  if (command.type === 'addImageFromAsset') return `Add image asset ${command.assetName ?? command.assetId ?? ''}${sceneSuffix(command.sceneIndex)}`
  if (command.type === 'addVideoFromAsset') return `Add video asset ${command.assetName ?? command.assetId ?? ''}${sizeSuffix(command.width, command.height)}${sceneSuffix(command.sceneIndex)}`
  if (command.type === 'setBackground') return `Set background${sceneSuffix(command.sceneIndex)}`
  if (command.type === 'updateElement') return `Update element ${command.elementName ?? command.elementId ?? 'selection'}`
  if (command.type === 'styleElement') return `Style element ${command.elementName ?? command.elementId ?? 'selection'}`
  if (command.type === 'applyMove') return `Apply move ${command.direction} to ${command.elementName ?? command.elementId ?? 'selection'}`
  if (command.type === 'addScene') return `Add scene${command.name ? ` "${command.name}"` : ''}`
  if (command.type === 'setTransition') return `Set ${command.transition.type} transition${sceneSuffix(command.sceneIndex)}`
  return `Generate ${command.scenes.length} storyboard scenes`
}

function sceneSuffix(sceneIndex?: number) {
  return sceneIndex ? ` on Scene ${sceneIndex}` : ''
}

function sizeSuffix(width?: number, height?: number) {
  return width && height ? ` ${width}x${height}` : ''
}

function readDemoApiKey() {
  try {
    return localStorage.getItem(DEMO_API_KEY_STORAGE) ?? ''
  } catch {
    return ''
  }
}
