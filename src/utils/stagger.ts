/**
 * Stagger and sequence: one animation applied to many elements, each a step
 * later than the last ("pulse every neuron, left to right, 0.1 s apart"), and
 * several such waves played one after another, optionally repeating
 * ("forward pass, then backward pass, every 4 s"). Pure: returns the
 * animations to add; callers write them to the store.
 */
import type { AnimationTiming, AnimationType, EasingType, ElementAnimation, EditorElement } from '../types/editor'
import { LOOP_ANIMATION_TYPES } from './animationTypes'
import { makeAnimation } from './defaults'

export type StaggerOrder = 'leftToRight' | 'rightToLeft' | 'topToBottom' | 'bottomToTop' | 'given'

export interface StaggerItem {
  id: string
  x: number
  y: number
  width?: number
  height?: number
}

export interface StaggerTiming {
  order: StaggerOrder
  /** Seconds between one item (or row/column) and the next. */
  step: number
  /**
   * Items whose centres are within this many pixels along the order direction
   * start together — one layer of a network, one row of a grid. 0 = one by one.
   */
  together?: number
}

export interface AnimationSpec {
  type: AnimationType
  duration: number
  timing?: AnimationTiming
  easing?: EasingType
  params?: ElementAnimation['params']
}

/** One wave of a sequence: the items, what they do, and how they are stepped. */
export interface Wave {
  items: StaggerItem[]
  animation: AnimationSpec
  timing: StaggerTiming
  /** Extra pause before this wave starts (after the previous one ends). */
  gapBefore?: number
}

export interface SequenceOptions {
  /** Scene time at which the first wave starts. */
  start: number
  /**
   * Repeat the whole sequence: `true` = as soon as it ends (plus `repeatGap`),
   * a number = every that many seconds. Only loop animations can repeat.
   */
  repeat?: boolean | number
  repeatGap?: number
}

export interface SequenceResult {
  /** New animations per element id (an element can appear in several waves). */
  animations: Array<{ elementId: string; animation: ElementAnimation }>
  /** Scene time when the last wave finishes (one pass). */
  end: number
  /** Seconds between repeats, if repeating. */
  period?: number
}

/** How close (px) items must be along the order to count as one row/column: a third of the smallest item. */
export function rowTolerance(items: StaggerItem[]) {
  const sizes = items.map(item => Math.min(item.width ?? 0, item.height ?? 0)).filter(size => size > 0)
  return Math.max(8, (sizes.length ? Math.min(...sizes) : 24) / 3)
}

export function isLoopType(type: AnimationType) {
  return LOOP_ANIMATION_TYPES.has(type)
}

/** Items in order, grouped into steps: items in the same group start together. */
export function staggerGroups(items: StaggerItem[], timing: StaggerTiming): StaggerItem[][] {
  const key = (item: StaggerItem) => {
    const cx = item.x + (item.width ?? 0) / 2
    const cy = item.y + (item.height ?? 0) / 2
    switch (timing.order) {
      case 'leftToRight': return cx
      case 'rightToLeft': return -cx
      case 'topToBottom': return cy
      case 'bottomToTop': return -cy
      default: return 0
    }
  }
  const cross = (item: StaggerItem) =>
    timing.order === 'topToBottom' || timing.order === 'bottomToTop'
      ? item.x + (item.width ?? 0) / 2
      : item.y + (item.height ?? 0) / 2

  if (timing.order === 'given') return items.map(item => [item])
  const sorted = items.slice().sort((a, b) => key(a) - key(b) || cross(a) - cross(b))
  const together = Math.max(0, timing.together ?? 0)
  const groups: StaggerItem[][] = []
  let groupKey = -Infinity
  for (const item of sorted) {
    if (groups.length && together > 0 && key(item) - groupKey <= together) groups[groups.length - 1].push(item)
    else {
      groups.push([item])
      groupKey = key(item)
    }
  }
  return groups
}

/** Plays the waves one after another, each staggered across its items. */
export function buildSequence(waves: Wave[], opts: SequenceOptions): SequenceResult {
  const planned: Array<{ elementId: string; animation: ElementAnimation; loop: boolean }> = []
  let cursor = Math.max(0, opts.start)
  waves.forEach((wave, index) => {
    if (index > 0) cursor += Math.max(0, wave.gapBefore ?? 0)
    const groups = staggerGroups(wave.items, wave.timing)
    const step = Math.max(0, wave.timing.step)
    const duration = Math.max(0.05, wave.animation.duration)
    const loop = isLoopType(wave.animation.type)
    groups.forEach((group, g) => {
      for (const item of group) {
        planned.push({
          elementId: item.id,
          loop,
          animation: {
            ...makeAnimation(),
            type: wave.animation.type,
            timing: wave.animation.timing ?? (loop ? 'loop' : 'onEnter'),
            duration,
            delay: round(cursor + g * step),
            easing: wave.animation.easing ?? (loop ? 'linear' : 'easeOut'),
            params: wave.animation.params,
          },
        })
      }
    })
    if (groups.length) cursor += (groups.length - 1) * step + playLength(wave.animation)
  })

  const end = round(cursor)
  let period: number | undefined
  if (opts.repeat) {
    period = typeof opts.repeat === 'number'
      ? Math.max(0.1, opts.repeat)
      : round(end - Math.max(0, opts.start) + Math.max(0, opts.repeatGap ?? 0.5))
    for (const p of planned) if (p.loop) p.animation.repeatEvery = period
  }
  return { animations: planned.map(({ elementId, animation }) => ({ elementId, animation })), end, period }
}

/** One staggered wave — the common case. */
export function buildStagger(items: StaggerItem[], animation: AnimationSpec, timing: StaggerTiming, opts: SequenceOptions) {
  return buildSequence([{ items, animation, timing }], opts)
}

/**
 * When the scene's animations have finished, so a new wave can start "after the
 * last animation". Endless loops don't count; repeating loops count one play.
 */
export function animationsEnd(elements: EditorElement[]): number {
  let end = 0
  for (const el of elements) {
    for (const anim of el.animations) {
      const loop = isLoopType(anim.type) || anim.timing === 'loop'
      if (loop && !anim.repeatEvery) continue
      end = Math.max(end, (anim.delay ?? 0) + (loop ? playLength(anim) : anim.duration ?? 0))
    }
  }
  return round(end)
}

/** How long one play of an animation lasts (a colour pulse plays `pulseCount` times). */
function playLength(animation: { type: AnimationType; duration: number; params?: ElementAnimation['params'] }) {
  if (animation.type === 'colorPulse') return Math.max(1, Math.round(animation.params?.pulseCount ?? 2)) * animation.duration
  return animation.duration
}

function round(n: number) {
  return Math.round(n * 1000) / 1000
}
