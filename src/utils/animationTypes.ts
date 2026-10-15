import type { AnimationType, ElementAnimation } from '../types/editor'

/** Animation types that repeat while the element is visible. */
export const LOOP_ANIMATION_TYPES: ReadonlySet<AnimationType> = new Set<AnimationType>([
  'pulse', 'bounceLoop', 'rotateLoop', 'flowLoop', 'fadeLoop', 'colorPulse',
])

/**
 * Loop animations are identified by type OR by timing. The type check also
 * catches old saved projects that stored loop types with timing 'onEnter'.
 */
export function isLoopAnimation(a: ElementAnimation): boolean {
  return LOOP_ANIMATION_TYPES.has(a.type) || a.timing === 'loop'
}
