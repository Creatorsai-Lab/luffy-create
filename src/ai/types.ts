import type { AlignType, AnimationTiming, AnimationType, Background, EasingType, SceneTransition, ShapeType, SlideDir, TransitionType } from '../types/editor'

/** A scene by id (preferred: stable while a plan adds/removes scenes), 1-based index, or alias of a scene created earlier in the plan. */
export type AiSceneRef = {
  sceneId?: string
  sceneIndex?: number
  sceneAlias?: string
}

/** An element by id, name, alias of an element created earlier in the plan, or the current selection. */
export type AiElementRef = AiSceneRef & {
  elementId?: string
  elementName?: string
  elementAlias?: string
  selected?: boolean
  /** Human label for the plan preview, e.g. "the title". */
  targetLabel?: string
}

export type AiPoint = {
  x?: number
  y?: number
}

export type AiSize = {
  width?: number
  height?: number
}

export type AiAnimationSpec = {
  type: AnimationType
  duration?: number
  delay?: number
  easing?: EasingType
  timing?: AnimationTiming
  direction?: SlideDir
}

export type AiArrangeOrder = 'front' | 'back' | 'forward' | 'backward'

export type AiEditorCommand =
  | ({ type: 'addText'; text: string; name?: string; alias?: string; fontSize?: number; fontFamily?: string; fontWeight?: 'normal' | 'bold'; color?: string; align?: AlignType; animation?: AiAnimationSpec } & AiSceneRef & AiPoint & AiSize)
  | ({ type: 'addShape'; shapeType: ShapeType; name?: string; alias?: string; fill?: string; stroke?: string; strokeWidth?: number } & AiSceneRef & AiPoint & AiSize)
  | ({ type: 'addImageFromAsset'; assetId?: string; assetName?: string; name?: string; alias?: string } & AiSceneRef & AiPoint & AiSize)
  | ({ type: 'addVideoFromAsset'; assetId?: string; assetName?: string; name?: string; alias?: string; duration?: number } & AiSceneRef & AiPoint & AiSize)
  | ({ type: 'addAudioFromAsset'; assetId?: string; assetName?: string; name?: string; alias?: string; duration?: number; timelineX?: number } & AiSceneRef)
  | ({ type: 'setBackground'; background: Background } & AiSceneRef)
  | ({ type: 'updateElement'; patch: Record<string, unknown> } & AiElementRef)
  | ({ type: 'styleElement'; patch: Record<string, unknown> } & AiElementRef)
  | ({ type: 'applyMove'; direction: 'left' | 'right' | 'top' | 'bottom' | 'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft'; speed?: number; delay?: number; moveOutside?: boolean } & AiElementRef)
  | ({ type: 'addScene'; name?: string; duration?: number; alias?: string; afterSceneId?: string })
  | ({ type: 'setTransition'; transition: SceneTransition | {
      type: TransitionType
      duration?: number
      direction?: SlideDir
      speed?: number
      hardness?: number
    } } & AiSceneRef)
  | ({ type: 'generateStoryboard'; scenes: Array<{ name?: string; duration?: number; title?: string; subtitle?: string; backgroundColor?: string }> })
  | ({ type: 'removeScene' } & AiSceneRef)
  | ({ type: 'duplicateScene'; alias?: string } & AiSceneRef)
  /** `at` is seconds from the start of the scene; `alias` names the new second part. */
  | ({ type: 'splitScene'; at: number; alias?: string } & AiSceneRef)
  /** `toIndex` is the 1-based position the scene should end up at. */
  | ({ type: 'moveScene'; toIndex: number } & AiSceneRef)
  | ({ type: 'setSceneDuration'; duration: number } & AiSceneRef)
  | ({ type: 'removeElement' } & AiElementRef)
  | ({ type: 'duplicateElement'; alias?: string } & AiElementRef)
  | ({ type: 'arrangeElement'; order: AiArrangeOrder } & AiElementRef)
  | ({ type: 'alignElement'; horizontal?: 'left' | 'center' | 'right'; vertical?: 'top' | 'middle' | 'bottom'; margin?: number } & AiElementRef)
  | ({ type: 'addAnimation'; animation: AiAnimationSpec } & AiElementRef)
  | ({ type: 'removeAnimations' } & AiElementRef)
  /**
   * Arrows that stay attached. With `to`: every `from` item to every `to` item.
   * Without: `chain` (each to the next, left to right), `columns` (every item to
   * every item in the next column — a network layer) or `hub` (first to all).
   */
  | { type: 'connectElements'; from: AiElementRef[]; to?: AiElementRef[]; mode?: 'chain' | 'columns' | 'hub'; keepOrder?: boolean; color?: string; width?: number; heads?: boolean; behind?: boolean }
  /** Staggered waves played one after another ("pulse left to right, then flash red right to left, repeating"). */
  | { type: 'animateSequence'; waves: AiWave[]; start?: number | 'afterLast'; repeat?: boolean | number; repeatGap?: number }

export interface AiWave {
  targets: AiElementRef[]
  animation: AiAnimationSpec & { color?: string }
  order?: 'leftToRight' | 'rightToLeft' | 'topToBottom' | 'bottomToTop' | 'given'
  /** Seconds between one item (or row/column) and the next. */
  step?: number
  /** Items in the same row/column (along the order) start together. */
  together?: boolean
  gapBefore?: number
}

export type AiCommandType = AiEditorCommand['type']

/**
 * Edits that need media analysis first (src/ai/smart/). The parser emits them;
 * the planner analyses the media and expands each into ordinary commands, so
 * they are reviewed and undone like any other plan.
 */
export type AiSmartStep =
  | { type: 'removeSilences'; sceneIds?: string[]; minSilence?: number; padding?: number }
  | { type: 'removeFillers'; sceneIds?: string[] }
  | { type: 'cutToBeat'; beatsPerCut?: number }
  | { type: 'splitShots'; sceneIds?: string[] }

export type AiPlanStep = AiEditorCommand | AiSmartStep

export const SMART_STEP_TYPES = new Set<AiSmartStep['type']>(['removeSilences', 'removeFillers', 'cutToBeat', 'splitShots'])

export function isSmartStep(step: AiPlanStep): step is AiSmartStep {
  return SMART_STEP_TYPES.has(step.type as AiSmartStep['type'])
}

export interface AiPlan {
  summary: string
  commands: AiEditorCommand[]
  needsConfirmation?: boolean
}

export interface AiPlanIssue {
  level: 'warning' | 'error'
  message: string
  commandIndex?: number
}

export interface AiPreparedPlan {
  plan: AiPlan
  issues: AiPlanIssue[]
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
  /** Parts of the prompt the planner could not turn into commands. */
  issues?: AiPlanIssue[]
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
  /** Text/icon colour or shape fill. */
  color?: string
  shapeType?: string
  strokeWidth?: number
  fontSize?: number
  opacity?: number
  rotation?: number
  /** Media (video/audio): source file, where the clip starts in its scene (seconds), trim and playback. */
  src?: string
  timelineX?: number
  startTime?: number
  duration?: number
  sourceDuration?: number
  volume?: number
  playbackRate?: number
  muted?: boolean
  track?: 'background' | 'voiceover'
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
    sceneCount: number
    totalDuration: number
  }
  currentSceneIndex: number
  currentSceneId: string | null
  /** Timeline playhead, seconds from the start of the project. */
  playhead: number
  selectedIds: string[]
  selectedElements: AiElementSummary[]
  scenes: AiSceneSummary[]
  assets: Array<{
    id: string
    type: 'image' | 'video' | 'audio'
    name: string
    filename: string
  }>
}
