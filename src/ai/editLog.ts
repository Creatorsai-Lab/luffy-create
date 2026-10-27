/**
 * Applied AI edits, numbered per project (#1, #2, …), so any of them can be
 * undone later — "undo #3" — even after other changes (see revert.ts).
 * Kept for the session; the project before and after each edit is remembered.
 */
import { create } from 'zustand'
import { useEditorStore } from '../store/editorStore'
import type { Project } from '../types/editor'
import { executeAiPlan } from './executor'
import { revertEdit, type RevertResult } from './revert'
import type { AiCommandResult, AiPlan } from './types'

export interface AiEditRecord {
  id: number
  projectId: string
  prompt: string
  summary: string
  at: number
  before: Project
  after: Project
  undone: boolean
}

interface EditLogState {
  edits: AiEditRecord[]
  nextId: Record<string, number>
}

/** The newest edits per project are kept (snapshots can be large). */
const KEEP = 30

export const useAiEditLog = create<EditLogState>(() => ({ edits: [], nextId: {} }))

const clone = (project: Project): Project => JSON.parse(JSON.stringify(project))

/** Applies a plan and remembers it as the next numbered edit. */
export function applyAiPlan(plan: AiPlan, prompt: string): { results: AiCommandResult[]; edit: AiEditRecord | null } {
  const project = useEditorStore.getState().project
  if (!project) return { results: executeAiPlan(plan), edit: null }
  const before = clone(project)
  const results = executeAiPlan(plan)
  const afterProject = useEditorStore.getState().project
  if (!afterProject || !results.some(r => r.ok)) return { results, edit: null }
  const state = useAiEditLog.getState()
  const id = state.nextId[project.id] ?? 1
  const edit: AiEditRecord = {
    id, projectId: project.id, prompt, summary: plan.summary, at: Date.now(),
    before, after: clone(afterProject), undone: false,
  }
  const others = state.edits.filter(e => e.projectId !== project.id)
  const mine = [...state.edits.filter(e => e.projectId === project.id), edit].slice(-KEEP)
  useAiEditLog.setState({ edits: [...others, ...mine], nextId: { ...state.nextId, [project.id]: id + 1 } })
  return { results, edit }
}

export function findAiEdit(id: number | 'last'): AiEditRecord | undefined {
  const project = useEditorStore.getState().project
  if (!project) return undefined
  const mine = useAiEditLog.getState().edits.filter(e => e.projectId === project.id)
  return id === 'last' ? [...mine].reverse().find(e => !e.undone) : mine.find(e => e.id === id)
}

/**
 * Undoes AI edit #id: what it changed goes back, unless it changed since. The
 * undo is one step on the normal undo history, so Ctrl+Z brings the edit back.
 */
export function undoAiEdit(id: number | 'last'): { edit?: AiEditRecord; result?: RevertResult; error?: string } {
  const edit = findAiEdit(id)
  const project = useEditorStore.getState().project
  if (!project) return { error: 'No project is open.' }
  if (!edit) return { error: id === 'last' ? 'There is no AI edit to undo.' : `There is no AI edit #${id} in this session.` }
  if (edit.undone) return { edit, error: `AI edit #${edit.id} is already undone.` }
  const result = revertEdit(project, edit.before, edit.after)
  if (result.changes) useEditorStore.getState().replaceProject(result.project)
  useAiEditLog.setState(state => ({ edits: state.edits.map(e => (e === edit ? { ...e, undone: true } : e)) }))
  return { edit, result }
}

/** "/undo #3", "undo #3", "undo edit 3", "revert ai edit #3", "undo the last ai edit" → the edit meant, or null. */
export function readUndoRequest(prompt: string): number | 'last' | null {
  const text = prompt.trim().toLowerCase()
  // "/undo #3", "/undo 3", "/undo" (the last one)
  const slash = text.match(/^\/undo(?:\s+#?\s*(\d+))?\s*$/)
  if (slash) return slash[1] ? Number(slash[1]) : 'last'
  const m = text.match(/^(?:please\s+)?(?:undo|revert|roll\s*back)\s+(?:the\s+)?(?:(?:ai\s+)?(?:edit|change|plan)\s*#?\s*(\d+)|#\s*(\d+)|(?:last|previous|latest)\s+(?:ai\s+)?(?:edit|change|plan))\s*[.!]?$/)
  if (!m) return null
  const n = m[1] ?? m[2]
  return n ? Number(n) : 'last'
}
