import type { EditorElement, Project } from '../types/editor'
import { useEditorStore } from '../store/editorStore'
import type { AiElementSummary, AiProjectContext } from './types'
import { effectStack } from '../engine/fx/stack'

// Local only (the parser); a future LLM gets a compact summary instead.
const MAX_ELEMENTS_PER_SCENE = 500

export function buildAiProjectContext(): AiProjectContext | null {
  const { project, currentSceneId, selectedIds, playhead } = useEditorStore.getState()
  if (!project) return null

  const currentSceneIndex = Math.max(1, project.scenes.findIndex(scene => scene.id === currentSceneId) + 1)
  // In the order they were selected (a chain of connectors follows it).
  const all = project.scenes.flatMap(scene => scene.elements)
  const selected = selectedIds.map(id => all.find(element => element.id === id)).filter((el): el is EditorElement => Boolean(el))

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
    captions: captionsSummary(project),
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
      groups: Object.values(scene.groups ?? {}).map(group => ({
        id: group.id, name: group.name, blockId: group.smart?.blockId, params: group.smart?.params,
      })),
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
    groupId: el.groupId,
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
        crop: el.crop,
        cropKeys: el.cropKeys?.length || undefined,
        punchIn: el.punchIn && el.punchIn > 1 ? el.punchIn : undefined,
        keying: el.keying?.mode,
        speedCurve: el.speedCurve,
        freeze: el.freeze,
        effects: effectNames(el),
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
        volumeKeys: el.volumeKeys?.length || undefined,
      }
    case 'image':
      return { ...summary, src: el.src, crop: el.crop, keying: el.keying?.mode, effects: effectNames(el) }
    default:
      return summary
  }
}

function effectNames(el: Parameters<typeof effectStack>[0]) {
  const names = effectStack(el).filter(fx => !fx.off).map(fx => fx.type)
  return names.length ? names : undefined
}

function captionsSummary(project: Project): AiProjectContext['captions'] {
  const track = project.subtitleTracks?.[0]
  if (!track) return undefined
  return { cues: track.cues.length, enabled: track.enabled, fontSize: track.style?.fontSize ?? 38 }
}
