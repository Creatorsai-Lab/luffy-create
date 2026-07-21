import type { SceneTransition } from '../types/editor'

export interface TransitionTimelineScene {
  id: string
  duration: number
  transition: SceneTransition
}

export interface TransitionTimelineEntry {
  sceneId: string
  sceneIndex: number
  startTime: number
  endTime: number
  duration: number
  transition: SceneTransition
}

export type TransitionFrameState =
  | {
      kind: 'scene'
      sceneId: string
      sceneIndex: number
      sceneTime: number
    }
  | {
      kind: 'transition'
      fromSceneId: string
      fromSceneIndex: number
      fromTime: number
      toSceneId: string
      toSceneIndex: number
      toTime: number
      progress: number
      transition: SceneTransition
    }

const HOLD_EPSILON = 0.001

export function buildTransitionTimeline(scenes: TransitionTimelineScene[]): TransitionTimelineEntry[] {
  const timeline: TransitionTimelineEntry[] = []
  let elapsed = 0
  scenes.forEach((scene, sceneIndex) => {
    const duration = Math.max(0, scene.duration)
    timeline.push({
      sceneId: scene.id,
      sceneIndex,
      startTime: elapsed,
      endTime: elapsed + duration,
      duration,
      transition: scene.transition,
    })
    elapsed += duration
  })
  return timeline
}

export function getTransitionFrameState(timeline: TransitionTimelineEntry[], time: number): TransitionFrameState {
  if (timeline.length === 0) {
    throw new Error('Cannot resolve transition frame without scenes')
  }

  const safeTime = Math.max(0, Number.isFinite(time) ? time : 0)
  const current = findTimelineEntry(timeline, safeTime)
  const localTime = Math.max(0, safeTime - current.startTime)
  const transitionDuration = current.sceneIndex > 0 && current.transition.type !== 'none'
    ? Math.max(0, Math.min(current.transition.duration ?? 0, current.duration))
    : 0

  if (transitionDuration > 0 && localTime < transitionDuration) {
    const from = timeline[current.sceneIndex - 1]
    return {
      kind: 'transition',
      fromSceneId: from.sceneId,
      fromSceneIndex: from.sceneIndex,
      fromTime: Math.max(from.startTime, current.startTime - HOLD_EPSILON),
      toSceneId: current.sceneId,
      toSceneIndex: current.sceneIndex,
      toTime: safeTime,
      progress: clamp01(localTime / transitionDuration),
      transition: current.transition,
    }
  }

  return {
    kind: 'scene',
    sceneId: current.sceneId,
    sceneIndex: current.sceneIndex,
    sceneTime: localTime,
  }
}

function findTimelineEntry(timeline: TransitionTimelineEntry[], time: number) {
  for (const entry of timeline) {
    if (time < entry.endTime || entry === timeline[timeline.length - 1]) return entry
  }
  return timeline[timeline.length - 1]
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
}
