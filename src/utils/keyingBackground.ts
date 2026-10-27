/**
 * "Put an image or video behind": after a green screen or cut-out, a project
 * image or video is placed right behind the clip, filling the clip's box
 * (cropped to fit, never stretched).
 */
import { useEditorStore } from '../store/editorStore'
import type { AssetMeta, ImageElement, Project, VideoElement } from '../types/editor'
import { makeImage, makeVideo } from './defaults'
import { coverCrop } from './mediaLayout'
import { toFileUrl } from './pathUtils'

/**
 * The parts of a clip: every video (or image) in the project that shows the
 * same file — a clip cut into scenes by jump cuts or splits. Just the
 * element itself when it is the only one.
 */
export function clipParts(project: Project, element: VideoElement | ImageElement): Array<VideoElement | ImageElement> {
  const parts: Array<VideoElement | ImageElement> = []
  for (const scene of project.scenes) {
    for (const el of scene.elements) {
      if ((el.type === 'video' || el.type === 'image') && el.type === element.type && el.src === element.src) parts.push(el)
    }
  }
  return parts.length ? parts : [element]
}

/** Width / height of an image or video file, or null if it can't be read. */
function mediaAspect(asset: AssetMeta): Promise<number | null> {
  return new Promise(resolve => {
    const url = toFileUrl(asset.path)
    if (asset.type === 'image') {
      const img = new Image()
      img.onload = () => resolve(img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : null)
      img.onerror = () => resolve(null)
      img.src = url
    } else {
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.muted = true
      video.onloadedmetadata = () => {
        resolve(video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : null)
        video.removeAttribute('src')
        video.load()
      }
      video.onerror = () => resolve(null)
      video.src = url
    }
  })
}

/**
 * Adds `asset` right behind `clip` (one place below it in the layer order),
 * covering the clip's box — behind every part of the clip with `allParts`.
 * A background video carries on across the parts instead of restarting at
 * each cut. Returns the new elements' ids.
 */
export async function putMediaBehind(clip: VideoElement | ImageElement, asset: AssetMeta, allParts = false): Promise<string[]> {
  const aspect = await mediaAspect(asset)
  const project = useEditorStore.getState().project
  if (!project) return []
  const parts = allParts ? clipParts(project, clip) : [clip]
  const added: Array<{ sceneId: string; targetId: string; el: ImageElement | VideoElement }> = []
  let played = 0
  for (const part of parts) {
    const scene = project.scenes.find(sc => sc.elements.some(el => el.id === part.id))
    if (!scene) continue
    const box = { x: part.x, y: part.y, width: part.width, height: part.height }
    const crop = aspect ? coverCrop({ id: asset.id, ...box, aspect }, box.width / box.height) : undefined
    let el: ImageElement | VideoElement
    if (asset.type === 'image') {
      el = makeImage(box.x, box.y, asset.path, asset.id, box.width, box.height)
    } else {
      const length = part.type === 'video' ? part.duration ?? part.sourceDuration ?? 10 : scene.duration
      const source = asset.duration && asset.duration > 0 ? asset.duration : length
      el = makeVideo(box.x, box.y, asset.path, asset.id, box.width, box.height, source)
      el.startTime = source > length ? played % (source - length) : 0
      el.duration = length
      el.loop = source < length
      el.timelineX = part.type === 'video' ? part.timelineX ?? 0 : 0
      // The person's own sound stays; the background is usually silent.
      el.muted = true
      played += length
    }
    el.name = `${asset.name} (background)`
    el.rotation = part.rotation
    if (crop) el.crop = crop
    added.push({ sceneId: scene.id, targetId: part.id, el })
  }
  if (!added.length) return []

  useEditorStore.setState(s => {
    for (const { sceneId, targetId, el } of added) {
      const scene = s.project?.scenes.find(sc => sc.id === sceneId)
      if (!scene) continue
      const ordered = [...scene.elements].sort((a, b) => a.zIndex - b.zIndex).map(e => e.id)
      ordered.splice(Math.max(0, ordered.indexOf(targetId)), 0, el.id)
      scene.elements.push(el)
      ordered.forEach((id, i) => { const e = scene.elements.find(x => x.id === id); if (e) e.zIndex = i })
    }
    s.isDirty = true
  })
  return added.map(a => a.el.id)
}
