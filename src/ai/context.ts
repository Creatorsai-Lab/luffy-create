import type { EditorElement } from '../types/editor'
import { useEditorStore } from '../store/editorStore'
import type { AiElementSummary, AiProjectContext } from './types'

const MAX_ELEMENTS_PER_SCENE = 40

export function buildAiProjectContext(): AiProjectContext | null {
  const { project, currentSceneId, selectedIds, playhead } = useEditorStore.getState()
  if (!project) return null

  const currentSceneIndex = Math.max(1, project.scenes.findIndex(scene => scene.id === currentSceneId) + 1)
  const selected = project.scenes
    .flatMap(scene => scene.elements)
    .filter(element => selectedIds.includes(element.id))

  return {
    project: {
      id: project.id,
      name: project.name,
      width: project.width,
      height: project.height,
      fps: project.fps,
      sceneCount: project.scenes.length,
      totalDuration: project.scenes.reduce((sum, scene) => sum + scene.duration, 0),
    },
    currentSceneIndex,
    currentSceneId,
    playhead,
    selectedIds: [...selectedIds],
    selectedElements: selected.map(summarizeElement),
    scenes: project.scenes.map((scene, index) => ({
      id: scene.id,
      index: index + 1,
      name: scene.name,
      duration: scene.duration,
      backgroundType: scene.background.type,
      elements: scene.elements
        .slice()
        .sort((a, b) => a.zIndex - b.zIndex)
        .slice(0, MAX_ELEMENTS_PER_SCENE)
        .map(summarizeElement),
    })),
    assets: project.assets.map(asset => ({
      id: asset.id,
      type: asset.type,
      name: asset.name,
      filename: asset.filename,
    })),
  }
}

export function summarizeElement(el: EditorElement): AiElementSummary {
  const summary: AiElementSummary = {
    id: el.id,
    type: el.type,
    name: el.name,
    x: Math.round(el.x),
    y: Math.round(el.y),
    width: Number.isFinite(el.width) ? Math.round(el.width) : undefined,
    height: Number.isFinite(el.height) ? Math.round(el.height) : undefined,
    opacity: el.opacity,
    rotation: el.rotation,
  }
  switch (el.type) {
    case 'text':
      return { ...summary, text: el.content, color: el.color, fontSize: el.fontSize }
    case 'shape':
      return { ...summary, color: el.fill, shapeType: el.shapeType, strokeWidth: el.strokeWidth }
    case 'icon':
      return { ...summary, color: el.color }
    case 'video':
      return {
        ...summary,
        src: el.src,
        timelineX: el.timelineX ?? 0,
        startTime: el.startTime ?? 0,
        duration: el.duration,
        sourceDuration: el.sourceDuration,
        volume: el.volume,
        playbackRate: el.playbackRate,
        muted: el.muted,
      }
    case 'audio':
      return {
        ...summary,
        src: el.src,
        // An audio clip's x is its start in seconds on the scene timeline.
        timelineX: el.x,
        startTime: el.startTime,
        duration: el.duration,
        volume: el.volume,
        playbackRate: el.speed ?? 1,
        track: el.track,
      }
    default:
      return summary
  }
}
