import type { AlignType, Background, SceneTransition, ShapeType, SlideDir, TransitionType } from '../types/editor'

export type AiSceneRef = {
  sceneId?: string
  sceneIndex?: number
}

export type AiElementRef = AiSceneRef & {
  elementId?: string
  elementName?: string
  selected?: boolean
}

export type AiPoint = {
  x?: number
  y?: number
}

export type AiSize = {
  width?: number
  height?: number
}

export type AiEditorCommand =
  | ({ type: 'addText'; text: string; name?: string; fontSize?: number; color?: string; align?: AlignType } & AiSceneRef & AiPoint & AiSize)
  | ({ type: 'addShape'; shapeType: ShapeType; name?: string; fill?: string; stroke?: string; strokeWidth?: number } & AiSceneRef & AiPoint & AiSize)
  | ({ type: 'addImageFromAsset'; assetId?: string; assetName?: string; name?: string } & AiSceneRef & AiPoint & AiSize)
  | ({ type: 'setBackground'; background: Background } & AiSceneRef)
  | ({ type: 'updateElement'; patch: Record<string, unknown> } & AiElementRef)
  | ({ type: 'styleElement'; patch: Record<string, unknown> } & AiElementRef)
  | ({ type: 'applyMove'; direction: 'left' | 'right' | 'top' | 'bottom' | 'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft'; speed?: number; delay?: number; moveOutside?: boolean } & AiElementRef)
  | ({ type: 'addScene'; name?: string; duration?: number })
  | ({ type: 'setTransition'; transition: SceneTransition | { type: TransitionType; duration?: number; direction?: SlideDir } } & AiSceneRef)
  | ({ type: 'generateStoryboard'; scenes: Array<{ name?: string; duration?: number; title?: string; subtitle?: string; backgroundColor?: string }> })

export interface AiPlan {
  summary: string
  commands: AiEditorCommand[]
  needsConfirmation?: boolean
}

export interface AiCommandResult {
  ok: boolean
  message: string
  elementIds?: string[]
  sceneIds?: string[]
}

export interface AiPlanResult {
  plan: AiPlan
  source: 'model' | 'local'
  warning?: string
}

export interface AiElementSummary {
  id: string
  type: string
  name: string
  x: number
  y: number
  width?: number
  height?: number
  text?: string
}

export interface AiSceneSummary {
  id: string
  index: number
  name: string
  duration: number
  backgroundType: string
  elements: AiElementSummary[]
}

export interface AiProjectContext {
  project: {
    id: string
    name: string
    width: number
    height: number
    fps: number
  }
  currentSceneIndex: number
  currentSceneId: string | null
  selectedIds: string[]
  scenes: AiSceneSummary[]
  assets: Array<{
    id: string
    type: 'image' | 'video' | 'audio'
    name: string
    filename: string
  }>
}
