import type { TransitionType } from '../types/editor'
import { TRANSITION_DEFS, transitionDef, type TransitionDef } from '../engine/transitions/catalog'

// Labels, descriptions and fixed colours come from the transition catalogue,
// so the Transition panel and the timeline block always match.
export type { TransitionDef }
export const TRANSITIONS: TransitionDef[] = TRANSITION_DEFS

/** Map a transition type to its fixed color. */
export const TRANS_COLOR: Record<string, string> =
  Object.fromEntries(TRANSITION_DEFS.map(t => [t.value, t.color]))

export function getTransitionCapabilities(type: TransitionType) {
  const def = transitionDef(type)
  return {
    direction: Boolean(def.direction),
    style: Boolean(def.style),
    intensity: def.intensity != null,
    softness: def.softness != null,
    color: Boolean(def.color0),
  }
}
