/**
 * Applying a speed curve or freeze frame to a clip: the footage stays the
 * same, the clip's length changes, and when the clip ended with its scene the
 * scene follows. Used by the Speed ramp panel and the AI.
 */
import { useEditorStore } from '../store/editorStore'
import type { Scene, SpeedCurve, VideoElement } from '../types/editor'
import { clipLengthFor, footageSpan } from './speedCurve'

export function retimeClip(el: VideoElement, scene: Scene | undefined, change: { speedCurve?: SpeedCurve | null; freeze?: { at: number; hold: number } | null }) {
  const span = footageSpan(el)
  const curve = change.speedCurve === undefined ? el.speedCurve : change.speedCurve ?? undefined
  const freeze = change.freeze === undefined ? el.freeze : change.freeze ?? undefined
  const duration = Math.max(0.1, clipLengthFor(span, el.playbackRate || 1, curve, freeze))
  const { updateElement, updateScene } = useEditorStore.getState()
  const endedWithScene = scene && (el.timelineX ?? 0) + (el.duration ?? 0) >= scene.duration - 0.05
  updateElement(el.id, { speedCurve: curve, freeze, duration })
  if (scene && endedWithScene) updateScene(scene.id, { duration: Math.max(0.1, (el.timelineX ?? 0) + duration) })
}
