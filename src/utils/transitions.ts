import type { TransitionType } from '../types/editor'

// Single source of truth for transitions: label, description, and a FIXED color.
// Used by both the Transition panel and the timeline block so they always match.
export interface TransitionDef {
  label: string
  value: TransitionType
  desc: string
  color: string
}

export const TRANSITIONS: TransitionDef[] = [
  { label: 'None',  value: 'none',  desc: 'Cut directly — no transition',     color: '#6b7280' },
  { label: 'Fade',  value: 'fade',  desc: 'Smooth crossfade between scenes',   color: '#6366f1' },
  { label: 'Push',  value: 'push',  desc: 'One scene smoothly pushes the other out', color: '#0891b2' },
  { label: 'Zoom',  value: 'zoom',  desc: 'Stable center zoom crossfade',      color: '#22c55e' },
  { label: 'Wipe',  value: 'wipe',  desc: 'Soft directional reveal',           color: '#f59e0b' },
  { label: 'Morph', value: 'morph', desc: 'Smart stable grow-and-blend between similar scenes', color: '#ec4899' },
]

/** Map a transition type to its fixed color. */
export const TRANS_COLOR: Record<string, string> =
  Object.fromEntries(TRANSITIONS.map(t => [t.value, t.color]))

export const TRANSITIONS_WITH_DIRECTION: TransitionType[] = ['push', 'wipe']
