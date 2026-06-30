import type { VideoElement } from '../types/editor'

export interface VideoClipState {
  visible: boolean
  sourceTime: number
  clipLocalTime: number
}

export function sourceVideoClipDuration(el: VideoElement): number {
  const source = el.sourceDuration ?? 9999
  const start = el.startTime ?? 0
  const rate = el.playbackRate ?? 1
  return Math.max(0.1, (source - start) / rate)
}

/** Map scene-local time to source-file seek position for a video clip. */
export function getVideoClipState(el: VideoElement, sceneLocalTime: number): VideoClipState {
  const timelineX = el.timelineX ?? 0
  const rate = el.playbackRate ?? 1
  const startTime = el.startTime ?? 0
  const clipLocal = sceneLocalTime - timelineX

  // Legacy projects without clip fields: play from scene start using localTime
  if (el.duration == null && el.startTime == null && el.timelineX == null) {
    return { visible: true, sourceTime: sceneLocalTime * rate, clipLocalTime: sceneLocalTime }
  }

  const duration = el.duration ?? el.sourceDuration ?? 9999
  if (clipLocal < 0 || clipLocal >= duration) {
    return { visible: false, sourceTime: startTime, clipLocalTime: clipLocal }
  }

  const rawElapsed = clipLocal * rate
  if (el.loop) {
    const source = el.sourceDuration ?? duration * rate
    const sourceSpan = Math.max(0.05, source - startTime)
    return {
      visible: true,
      sourceTime: startTime + (rawElapsed % sourceSpan),
      clipLocalTime: clipLocal,
    }
  }

  return {
    visible: true,
    sourceTime: startTime + rawElapsed,
    clipLocalTime: clipLocal,
  }
}

/** Max clip duration on timeline given current trim + speed. */
export function maxVideoClipDuration(el: VideoElement): number {
  return el.loop ? Number.POSITIVE_INFINITY : sourceVideoClipDuration(el)
}
