/**
 * Cuts waiting to be applied (jump-cut panel, transcript editing), drawn on
 * the timeline so they can be checked before anything changes.
 */
import { create } from 'zustand'
import type { CutKind } from '../ai/smart/jumpcut'

/** A stretch of a scene that would be cut, in scene seconds. */
export interface PreviewCut {
  sceneId: string
  from: number
  to: number
  kind: CutKind
}

interface CutPreviewState {
  /** Which panel is showing cuts; only it clears them. */
  owner: string | null
  cuts: PreviewCut[]
}

export const useCutPreview = create<CutPreviewState>(() => ({ owner: null, cuts: [] }))

export function showCutPreview(owner: string, cuts: PreviewCut[]) {
  useCutPreview.setState({ owner, cuts })
}

export function clearCutPreview(owner: string) {
  if (useCutPreview.getState().owner === owner) useCutPreview.setState({ owner: null, cuts: [] })
}

export const CUT_COLORS: Record<CutKind, string> = {
  pause: '#ef4444',
  filler: '#f59e0b',
  retake: '#a78bfa',
  edit: '#f43f5e',
}

export const CUT_LABELS: Record<CutKind, string> = {
  pause: 'Pause',
  filler: 'Filler word',
  retake: 'Retake',
  edit: 'Deleted words',
}
