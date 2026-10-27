/**
 * Preview of an AI plan before it is applied: the plan is tried on the live
 * project with history off, each scene it changes is captured as a small
 * picture, and the project (and scene, playhead, selection) is put back
 * exactly as it was. Before/after pictures per changed scene.
 */
import { getStage } from '../engine/stageRegistry'
import { useEditorStore, withoutHistory } from '../store/editorStore'
import type { Project, Scene } from '../types/editor'
import { executeAiPlan } from './executor'
import type { AiPlan } from './types'

export interface ScenePreview {
  sceneId: string
  /** 1-based, after the plan. */
  index: number
  name: string
  /** JPEG data URLs; `before` is null for a scene the plan adds. */
  before: string | null
  after: string
}

const THUMB_WIDTH = 360
const MAX_SCENES = 4
const clone = (project: Project): Project => JSON.parse(JSON.stringify(project))
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const frames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))

/** Scenes the plan adds or changes (by content), in the order they end up in. */
export function changedScenes(before: Project, after: Project): Scene[] {
  const was = new Map(before.scenes.map(s => [s.id, JSON.stringify(s)]))
  return after.scenes.filter(s => was.get(s.id) !== JSON.stringify(s))
}

/** A moment of a scene where things have settled: past the entrances, before the end. */
function settledTime(project: Project, sceneId: string) {
  let start = 0
  for (const scene of project.scenes) {
    if (scene.id === sceneId) return start + Math.min(Math.max(0.05, scene.duration - 0.1), Math.max(1.5, scene.duration * 0.5))
    start += scene.duration
  }
  return 0
}

async function capture(project: Project, sceneId: string): Promise<string | null> {
  useEditorStore.setState({ currentSceneId: sceneId, playhead: settledTime(project, sceneId), selectedIds: [] })
  await frames()
  await wait(120) // video frames seek asynchronously
  await frames()
  const stage = getStage()
  if (!stage) return null
  stage.batchDraw()
  const ratio = THUMB_WIDTH / (project.width * stage.scaleX())
  return stage.toCanvas({ pixelRatio: ratio }).toDataURL('image/jpeg', 0.82)
}

export async function previewAiPlan(plan: AiPlan): Promise<ScenePreview[]> {
  const store = useEditorStore.getState()
  const original = store.project
  if (!original || !plan.commands.length) return []
  const saved = { currentSceneId: store.currentSceneId, playhead: store.playhead, selectedIds: store.selectedIds, isPlaying: store.isPlaying, isDirty: store.isDirty }
  if (saved.isPlaying) store.pause()
  const before = clone(original)
  const previews: ScenePreview[] = []
  try {
    // Try the plan, with nothing recorded.
    withoutHistory(() => executeAiPlan(plan, { recordHistory: false }))
    const after = clone(useEditorStore.getState().project!)
    const scenes = changedScenes(before, after).slice(0, MAX_SCENES)
    for (const scene of scenes) {
      const shot = await capture(after, scene.id)
      if (shot) previews.push({ sceneId: scene.id, index: after.scenes.indexOf(scene) + 1, name: scene.name, before: null, after: shot })
    }
    // Back to the project as it was, then the "before" pictures of the same scenes.
    withoutHistory(() => useEditorStore.setState({ project: before }))
    for (const preview of previews) {
      if (before.scenes.some(s => s.id === preview.sceneId)) preview.before = await capture(before, preview.sceneId)
    }
  } finally {
    withoutHistory(() => useEditorStore.setState({ project: before }))
    useEditorStore.setState({ currentSceneId: saved.currentSceneId, playhead: saved.playhead, selectedIds: saved.selectedIds, isDirty: saved.isDirty })
  }
  return previews
}
