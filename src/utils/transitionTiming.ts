import type { SceneTransition } from '../types/editor'

/**
 * When transitions play. A scene's transition runs over its first `duration`
 * seconds, from the scene before it — the first scene's runs from black (an
 * intro). The project's `endTransition` runs over the last scene's final
 * seconds, to black. The outgoing scene keeps playing during a transition: its
 * local time runs on past its end (videos continue into footage after the cut).
 */

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

export type TransitionTimeline = TransitionTimelineEntry[] & { end?: SceneTransition }

export type TransitionFrameState =
  | {
      kind: 'scene'
      sceneId: string
      sceneIndex: number
      sceneTime: number
    }
  | {
      kind: 'transition'
      /** 'cut' between two scenes, 'intro' from black into the first scene, 'outro' from the last scene to black. */
      phase: 'cut' | 'intro' | 'outro'
      /** Null / -1 means black. */
      fromSceneId: string | null
      fromSceneIndex: number
      /** The outgoing scene's local time (past its duration while it keeps playing). */
      fromLocalTime: number
      toSceneId: string | null
      toSceneIndex: number
      toLocalTime: number
      /** Global time of the frame. */
      time: number
      /** Linear 0–1. */
      progress: number
      transition: SceneTransition
    }

export function buildTransitionTimeline(scenes: TransitionTimelineScene[], endTransition?: SceneTransition): TransitionTimeline {
  const timeline: TransitionTimeline = []
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
  if (endTransition) timeline.end = endTransition
  return timeline
}

/** How long a scene's incoming transition really runs (0 for none, a first-scene morph, or no time). */
export function getEffectiveTransitionDuration(entry: TransitionTimelineEntry) {
  const type = entry.transition?.type ?? 'none'
  if (type === 'none' || (entry.sceneIndex === 0 && type === 'morph')) return 0
  return Math.max(0, Math.min(entry.transition.duration ?? 0, entry.duration))
}

/** How long the fade-out at the end runs: within the last scene, after its own incoming transition. */
export function getEndTransitionDuration(timeline: TransitionTimeline) {
  const end = timeline.end
  const last = timeline[timeline.length - 1]
  if (!end || !last || end.type === 'none' || end.type === 'morph') return 0
  return Math.max(0, Math.min(end.duration ?? 0, last.duration - getEffectiveTransitionDuration(last)))
}

export function getUpcomingTransitionEntry(
  timeline: TransitionTimelineEntry[],
  time: number,
  leadTime = 0.1,
) {
  if (!timeline.length) return null
  const safeTime = Math.max(0, Number.isFinite(time) ? time : 0)
  const current = findTimelineEntry(timeline, safeTime)
  const next = timeline[current.sceneIndex + 1]
  const lead = Math.max(0, Number.isFinite(leadTime) ? leadTime : 0)
  return next && getEffectiveTransitionDuration(next) > 0 &&
    safeTime < current.endTime && safeTime >= current.endTime - lead
    ? next
    : null
}

export function getTransitionFrameState(timeline: TransitionTimeline, time: number): TransitionFrameState {
  if (timeline.length === 0) {
    throw new Error('Cannot resolve transition frame without scenes')
  }

  const safeTime = Math.max(0, Number.isFinite(time) ? time : 0)
  const current = findTimelineEntry(timeline, safeTime)
  const localTime = Math.max(0, safeTime - current.startTime)
  const incoming = getEffectiveTransitionDuration(current)

  if (incoming > 0 && localTime < incoming) {
    const from = current.sceneIndex > 0 ? timeline[current.sceneIndex - 1] : null
    return {
      kind: 'transition',
      phase: from ? 'cut' : 'intro',
      fromSceneId: from?.sceneId ?? null,
      fromSceneIndex: from?.sceneIndex ?? -1,
      fromLocalTime: from ? safeTime - from.startTime : 0,
      toSceneId: current.sceneId,
      toSceneIndex: current.sceneIndex,
      toLocalTime: localTime,
      time: safeTime,
      progress: clamp01(localTime / incoming),
      transition: current.transition,
    }
  }

  const outro = getEndTransitionDuration(timeline)
  if (outro > 0 && current === timeline[timeline.length - 1] && safeTime >= current.endTime - outro) {
    return {
      kind: 'transition',
      phase: 'outro',
      fromSceneId: current.sceneId,
      fromSceneIndex: current.sceneIndex,
      fromLocalTime: localTime,
      toSceneId: null,
      toSceneIndex: -1,
      toLocalTime: 0,
      time: safeTime,
      progress: clamp01((safeTime - (current.endTime - outro)) / outro),
      transition: timeline.end!,
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
