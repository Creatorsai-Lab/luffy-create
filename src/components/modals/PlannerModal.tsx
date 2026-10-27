import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Check, Loader2, NotebookPen, Pin, PinOff, Plus, Search, Trash2, X } from 'lucide-react'
import { searchPlans, sortPlans, usePlannerStore } from '../../planner/plannerStore'
import type { Plan } from '../../planner/types'
import { cn } from '../../utils/cn'

const COLORS = ['#8b5cf6', '#38bdf8', '#34d399', '#facc15', '#fb923c', '#f87171']

/**
 * The Planner: ideas and notes for any project, kept by the app (not in a
 * project). Cards show each plan; clicking one opens it in a full editor.
 */
export default function PlannerModal({ onClose }: { onClose: () => void }) {
  const { plans, loaded, error, load, create, remove, flush } = usePlannerStore()
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => { if (!loaded) void load() }, [loaded, load])

  const close = () => { void flush(); onClose() }
  // A plan left empty when its editor closes is not kept.
  const closePlan = () => {
    const plan = plans.find(p => p.id === openId)
    if (plan && !plan.title.trim() && !plan.body.trim()) remove(plan.id)
    setOpenId(null)
    void flush()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      if (openId) closePlan()
      else close()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }) // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => sortPlans(searchPlans(plans, query)), [plans, query])
  const open = plans.find(p => p.id === openId)

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm" onMouseDown={e => { if (e.target === e.currentTarget) close() }}>
      <div className="flex flex-col overflow-hidden border border-editor-border bg-editor-panel rounded-2xl" style={{ width: '92vw', height: '90vh' }}>
        <header className="flex flex-none items-center gap-2 border-b border-editor-border px-4 py-2.5">
          <NotebookPen size={15} className="text-editor-accent" />
          <h2 className="text-base font-semibold text-editor-text">Content Planner</h2>
          <span className="text-base text-editor-text-secondary">{plans.length ? `${plans.length} plan${plans.length === 1 ? '' : 's'}` : ''}</span>
          <div className="ml-4 flex min-w-0 max-w-xs flex-1 items-center gap-1.5 rounded border border-editor-border bg-editor-elevated-highlight px-2 py-1">
            <Search size={12} className="flex-none text-editor-text-secondary" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search plans"
              className="min-w-0 flex-1 bg-transparent text-sm text-editor-text outline-none placeholder:text-editor-text-secondary" />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <SaveBadge />
            <button type="button" onClick={() => setOpenId(create().id)}
              className="flex items-center gap-1 rounded bg-editor-accent px-2.5 py-1 text-sm text-white hover:bg-editor-accent-hover">
              <Plus size={13} /> New plan
            </button>
            <button type="button" onClick={close} title="Close (Esc)" className="rounded p-1 text-editor-text-secondary hover:bg-white/5 hover:text-editor-text">
              <X size={15} />
            </button>
          </div>
        </header>

        {error && <p className="flex-none border-b border-red-500/30 bg-red-500/10 px-4 py-1.5 text-sm text-red-200">{error}</p>}

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {!loaded ? (
            <div className="flex h-full items-center justify-center text-editor-text-secondary"><Loader2 size={16} className="animate-spin" /></div>
          ) : shown.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-base text-editor-text-secondary">
              <NotebookPen size={22} className="text-editor-accent" />
              {query ? 'No plan matches your search.' : <>Keep your video ideas, scripts and to-dos here.<br />They are there in every project.</>}
              {!query && (
                <button type="button" onClick={() => setOpenId(create().id)} className="mt-1 flex items-center gap-1 rounded bg-editor-accent px-3 py-1.5 text-sm text-white hover:bg-editor-accent-hover">
                  <Plus size={13} /> New plan
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
              {shown.map(plan => <PlanCard key={plan.id} plan={plan} onOpen={() => setOpenId(plan.id)} />)}
            </div>
          )}
        </div>
      </div>

      {open && <PlanEditor plan={open} onClose={closePlan} />}
    </div>
  )
}

function PlanCard({ plan, onOpen }: { plan: Plan; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen}
      className="group flex h-40 flex-col rounded-lg border border-editor-border bg-editor-elevated-highlight p-3 text-left transition-colors hover:border-editor-accent/70"
      style={plan.color ? { borderTopColor: plan.color, borderTopWidth: 3 } : undefined}>
      <div className="flex w-full items-start gap-1.5">
        <span className={cn('min-w-0 flex-1 truncate text-base font-semibold', plan.title ? 'text-editor-text' : 'italic text-editor-text-secondary')}>
          {plan.title || 'Untitled'}
        </span>
        {plan.pinned && <Pin size={12} className="mt-0.5 flex-none text-editor-accent" />}
      </div>
      <p className="mt-1.5 line-clamp-4 w-full whitespace-pre-line break-words text-base leading-relaxed text-editor-text-secondary">
        {plan.body || 'No notes yet.'}
      </p>
      <span className="mt-auto pt-2 text-[10px] text-editor-text-secondary/80">Edited {timeAgo(plan.updatedAt)}</span>
    </button>
  )
}

/** The full plan: title, notes, pin, colour and delete. Saves as you type. */
function PlanEditor({ plan, onClose }: { plan: Plan; onClose: () => void }) {
  const { update, remove } = usePlannerStore()
  const titleRef = useRef<HTMLInputElement>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => { if (!plan.title && !plan.body) titleRef.current?.focus() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="flex h-[min(820px,90vh)] w-[min(920px,92vw)] flex-col overflow-hidden rounded-2xl border border-editor-border bg-[#141414] shadow-2xl"
        style={plan.color ? { borderTopColor: plan.color, borderTopWidth: 3 } : undefined}>
        <header className="flex flex-none items-center gap-2 border-b border-editor-border px-3 py-2">
          <button type="button" onClick={onClose} title="Back to all plans (Esc)" className="flex items-center gap-1 rounded px-1.5 py-1 text-sm text-editor-text-secondary hover:bg-white/5 hover:text-editor-text">
            <ArrowLeft size={13} /> All plans
          </button>
          <div className="ml-auto flex items-center gap-1.5">
            <SaveBadge />
            <div className="flex items-center gap-1 px-1">
              {COLORS.map(color => (
                <button key={color} type="button" title="Card colour" onClick={() => update(plan.id, { color: plan.color === color ? undefined : color })}
                  className={cn('h-3.5 w-3.5 rounded-full border', plan.color === color ? 'border-white' : 'border-transparent opacity-70 hover:opacity-100')}
                  style={{ background: color }} />
              ))}
            </div>
            <button type="button" onClick={() => update(plan.id, { pinned: !plan.pinned })} title={plan.pinned ? 'Unpin' : 'Pin to the top'}
              className={cn('rounded p-1.5 hover:bg-white/5', plan.pinned ? 'text-editor-accent' : 'text-editor-text-secondary hover:text-editor-text')}>
              {plan.pinned ? <PinOff size={14} /> : <Pin size={14} />}
            </button>
            {confirmDelete ? (
              <span className="flex items-center gap-1 text-sm text-red-200">
                Delete this plan?
                <button type="button" onClick={() => { remove(plan.id); onClose() }} className="rounded bg-red-600 px-2 py-0.5 text-white hover:bg-red-500">Delete</button>
                <button type="button" onClick={() => setConfirmDelete(false)} className="rounded px-2 py-0.5 text-editor-text-secondary hover:text-editor-text">Keep</button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} title="Delete plan" className="rounded p-1.5 text-editor-text-secondary hover:bg-white/5 hover:text-red-300">
                <Trash2 size={14} />
              </button>
            )}
            <button type="button" onClick={onClose} title="Close" className="rounded p-1.5 text-editor-text-secondary hover:bg-white/5 hover:text-editor-text">
              <X size={14} />
            </button>
          </div>
        </header>
        <div className="flex min-h-0 flex-1 flex-col px-6 py-4">
          <input ref={titleRef} value={plan.title} onChange={e => update(plan.id, { title: e.target.value })} placeholder="Title"
            maxLength={200} className="w-full bg-transparent text-xl font-semibold text-editor-text outline-none placeholder:text-editor-text-secondary/60" />
          <textarea value={plan.body} onChange={e => update(plan.id, { body: e.target.value })}
            placeholder="Write your idea, script, shot list or to-dos…"
            className="mt-3 min-h-0 w-full flex-1 resize-none bg-transparent text-base leading-relaxed text-editor-text outline-none placeholder:text-editor-text-secondary/60" />
          <p className="flex-none pt-2 text-[10px] text-editor-text-secondary">
            Created {new Date(plan.createdAt).toLocaleString()} · edited {timeAgo(plan.updatedAt)}
          </p>
        </div>
      </div>
    </div>
  )
}

function SaveBadge() {
  const saveState = usePlannerStore(s => s.saveState)
  if (saveState === 'saved') return <span className="flex items-center gap-1 text-sm text-editor-text-secondary"><Check size={11} /> Saved</span>
  if (saveState === 'error') return <span className="text-[10px] text-red-300">Not saved</span>
  return <span className="flex items-center gap-1 text-sm text-editor-text-secondary"><Loader2 size={11} className="animate-spin" /> Saving</span>
}

export function timeAgo(time: number, now = Date.now()) {
  const s = Math.max(0, Math.round((now - time) / 1000))
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  if (d < 7) return `${d} day${d === 1 ? '' : 's'} ago`
  return new Date(time).toLocaleDateString()
}
