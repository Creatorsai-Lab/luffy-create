import type { EditorElement, Project } from '../types/editor'
import { useEditorStore } from '../store/editorStore'
import type { AiElementSummary, AiProjectContext } from './types'

const MAX_ELEMENTS_PER_SCENE = 40

export function buildAiProjectContext(): AiProjectContext | null {
  const { project, currentSceneId, selectedIds } = useEditorStore.getState()
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

export function findSceneByRef(project: Project, sceneId?: string, sceneIndex?: number) {
  if (sceneId) return project.scenes.find(scene => scene.id === sceneId) ?? null
  if (sceneIndex != null) return project.scenes[Math.max(0, sceneIndex - 1)] ?? null
  return null
}

function summarizeElement(el: EditorElement): AiElementSummary {
  const sized = el as EditorElement & { width?: number; height?: number; content?: string }
  return {
    id: el.id,
    type: el.type,
    name: el.name,
    x: Math.round(el.x),
    y: Math.round(el.y),
    width: typeof sized.width === 'number' ? Math.round(sized.width) : undefined,
    height: typeof sized.height === 'number' ? Math.round(sized.height) : undefined,
    text: el.type === 'text' ? sized.content : undefined,
  }
}
