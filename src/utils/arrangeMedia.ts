/** Applies media geometry (src/utils/mediaLayout.ts) to videos and images on their scene. */
import { videoRegistry } from '../engine/videoRegistry'
import { useEditorStore } from '../store/editorStore'
import type { EditorElement, ImageElement, VideoElement } from '../types/editor'
import { layoutMedia, placeInRegion, type LayoutItem, type LayoutOptions, type LayoutPatch, type MediaLayout, type Placement } from './mediaLayout'

export type MediaItem = ImageElement | VideoElement

export const isMedia = (el: EditorElement): el is MediaItem => el.type === 'video' || el.type === 'image'

/** The clip with its true source shape when the video is loaded (AI-added clips start at a guessed 16:9). */
function layoutItem(el: MediaItem): LayoutItem {
  const video = el.type === 'video' ? videoRegistry.get(el.id) : undefined
  const aspect = video?.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : undefined
  return { id: el.id, width: el.width, height: el.height, crop: el.crop, aspect }
}

function sceneOf(ids: string[]) {
  const project = useEditorStore.getState().project
  const scene = project?.scenes.find(sc => sc.elements.some(el => ids.includes(el.id)))
  if (!project || !scene) return null
  if (useEditorStore.getState().currentSceneId !== scene.id) useEditorStore.getState().setCurrentScene(scene.id)
  return { project, scene }
}

function patch({ id, ...rest }: LayoutPatch) {
  useEditorStore.getState().updateElement(id, rest as Partial<EditorElement>)
}

/** Tiles clips (side by side, stacked, grid). Returns the ids that were arranged. */
export function applyMediaLayout(ids: string[], layout: MediaLayout, opts: LayoutOptions = {}): string[] {
  const found = sceneOf(ids)
  if (!found) return []
  // Keep the order the ids were given in (it decides left/right and top/bottom).
  const items = ids
    .map(id => found.scene.elements.find(el => el.id === id))
    .filter((el): el is MediaItem => Boolean(el) && isMedia(el!) && !el!.locked)
  const patches = layoutMedia(items.map(layoutItem), { width: found.project.width, height: found.project.height }, layout, opts)
  patches.forEach(patch)
  return patches.map(p => p.id)
}

/**
 * Puts one clip in an area of the frame. A clip that now fills the frame goes
 * behind everything (it is the backdrop); a smaller clip that sits on top of a
 * larger one comes to the front, so it stays visible.
 */
export function applyPlacement(id: string, placement: Placement): LayoutPatch | null {
  const found = sceneOf([id])
  const el = found?.scene.elements.find(e => e.id === id)
  if (!found || !el || !isMedia(el) || el.locked) return null
  const result = placeInRegion(layoutItem(el), placement)
  patch(result)

  const { width: W, height: H } = found.project
  const store = useEditorStore.getState()
  if (result.x <= 0.5 && result.y <= 0.5 && result.width >= W - 0.5 && result.height >= H - 0.5) {
    store.sendToBack(id)
  } else {
    const scene = store.project?.scenes.find(sc => sc.id === found.scene.id)
    const self = scene?.elements.find(e => e.id === id)
    const coveredBy = scene?.elements.some(other => other.id !== id && isMedia(other) && self && other.zIndex > self.zIndex &&
      other.x <= result.x + 0.5 && other.y <= result.y + 0.5 &&
      other.x + other.width >= result.x + result.width - 0.5 && other.y + other.height >= result.y + result.height - 0.5)
    if (coveredBy) store.bringToFront(id)
  }
  return result
}
