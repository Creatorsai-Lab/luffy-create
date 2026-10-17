/**
 * The Planner in the renderer: the plans in memory, edited instantly and saved
 * to the app's planner file a moment after the last change (and on close).
 * Not part of any project, so every project sees the same plans.
 */
import { create } from 'zustand'
import type { Plan, PlannerData } from './types'

type SaveState = 'saved' | 'saving' | 'unsaved' | 'error'

interface PlannerState {
  plans: Plan[]
  loaded: boolean
  saveState: SaveState
  error: string | null
  load: () => Promise<void>
  create: () => Plan
  update: (id: string, patch: Partial<Pick<Plan, 'title' | 'body' | 'color' | 'pinned'>>) => void
  remove: (id: string) => void
  /** Saves now if anything is waiting (closing the app, closing the Planner). */
  flush: () => Promise<void>
}

const SAVE_DELAY = 500
let timer: ReturnType<typeof setTimeout> | null = null

const planner = () => (typeof window !== 'undefined' ? window.api?.planner : undefined)
const newId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `plan-${Date.now()}-${Math.random().toString(36).slice(2)}`)

/** Pinned first, then the most recently edited. */
export function sortPlans(plans: Plan[]): Plan[] {
  return plans.slice().sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.updatedAt - a.updatedAt)
}

/** Plans whose title or note contains every word of the query. */
export function searchPlans(plans: Plan[], query: string): Plan[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return plans
  return plans.filter(p => {
    const text = `${p.title}\n${p.body}`.toLowerCase()
    return words.every(w => text.includes(w))
  })
}

export const usePlannerStore = create<PlannerState>((set, get) => {
  const scheduleSave = () => {
    set({ saveState: 'unsaved' })
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { void get().flush() }, SAVE_DELAY)
  }
  return {
    plans: [],
    loaded: false,
    saveState: 'saved',
    error: null,

    async load() {
      const api = planner()
      if (!api) { set({ loaded: true }); return }
      try {
        const data = await api.load()
        // Edits made while loading are kept on top of what was on disk.
        const local = new Map(get().plans.map(p => [p.id, p]))
        const merged = [...data.plans.filter(p => !local.has(p.id)), ...local.values()]
        set({ plans: merged, loaded: true, error: null })
      } catch (error) {
        set({ loaded: true, error: `Could not open the Planner: ${error instanceof Error ? error.message : String(error)}` })
      }
    },

    create() {
      const now = Date.now()
      const plan: Plan = { id: newId(), title: '', body: '', createdAt: now, updatedAt: now }
      set(s => ({ plans: [plan, ...s.plans] }))
      scheduleSave()
      return plan
    },

    update(id, patch) {
      set(s => ({ plans: s.plans.map(p => (p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p)) }))
      scheduleSave()
    },

    remove(id) {
      set(s => ({ plans: s.plans.filter(p => p.id !== id) }))
      scheduleSave()
    },

    async flush() {
      if (timer) { clearTimeout(timer); timer = null }
      if (get().saveState === 'saved') return
      const api = planner()
      if (!api) return
      set({ saveState: 'saving' })
      const data: PlannerData = { version: 1, plans: get().plans }
      try {
        await api.save(data)
        // Something changed while saving: it saves again shortly.
        if (get().plans === data.plans) set({ saveState: 'saved', error: null })
        else scheduleSave()
      } catch (error) {
        set({ saveState: 'error', error: `Could not save the Planner: ${error instanceof Error ? error.message : String(error)}` })
      }
    },
  }
})
