import type { SubtitleStyle } from '../types/editor'
import type { JumpCutSettings } from './smart/jumpcut'
import type { AlignType, AnimationTiming, AnimationType, Background, EasingType, FxType, ShapeType, SlideDir, SpeedCurve, TransitionEasing, TransitionType } from '../types/editor'

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

export type AiTransitionSpec = {
  type: TransitionType
  duration?: number
  direction?: SlideDir
  speed?: number
  hardness?: number
  intensity?: number
  softness?: number
  color?: string
  easing?: TransitionEasing
}

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
  /** A scene's transition (it plays at the scene's start; on the first scene, from black). Missing settings take the transition's defaults. */
  | ({ type: 'setTransition'; transition: AiTransitionSpec } & AiSceneRef)
  /** The fade-out at the end of the video, to black; type 'none' removes it. */
  | { type: 'setEndTransition'; transition: AiTransitionSpec }
  /**
   * Adds an effect (src/engine/fx/catalog.ts) to a video or image; 'look' sets its colour look (replacing
   * one it has). `start`/`end` are clip seconds (missing = the whole clip); missing settings take defaults.
   */
  | ({ type: 'addEffect'; effect: FxType; params?: Record<string, number | string | boolean>; intensity?: number; beatSync?: boolean; start?: number; end?: number } & AiElementRef)
  /** Removes a video's or image's effects — all of them, or one kind. */
  | ({ type: 'removeEffects'; effect?: FxType } & AiElementRef)
  /** A speed ramp preset (src/utils/speedCurve.ts) on a video; 'none' goes back to constant speed. */
  | ({ type: 'setSpeedCurve'; preset: string } & AiElementRef)
  /** Holds a video's picture for `hold` seconds, `at` seconds into the clip; hold 0 removes the freeze. */
  | ({ type: 'freezeFrame'; at: number; hold: number } & AiElementRef)
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
  | { type: 'groupElements'; targets: AiElementRef[]; name?: string }
  | { type: 'ungroupElements'; targets: AiElementRef[] }
  /** Builds a smart block (src/blocks) as a group that remembers its settings. */
  | ({ type: 'insertBlock'; blockId: string; params?: Record<string, unknown>; alias?: string } & AiSceneRef)
  /** Changes a smart group's settings; it rebuilds in place. */
  | { type: 'updateBlock'; groupId: string; params: Record<string, unknown> }
  /** Tiles videos/images: `split` (side by side, or stacked in portrait), `sideBySide`, `stacked` or `grid`. Clips are cropped to fill, never stretched. */
  | { type: 'arrangeMedia'; targets: AiElementRef[]; layout: 'split' | 'sideBySide' | 'stacked' | 'grid'; gap?: number }
  /**
   * Puts one video/image in an area of the frame (scene pixels): `region` is the area ("upper half" of
   * 1080×1920 = {0, 0, 1080, 960}); `width`/`height` the clip's own size in it (a missing side follows
   * the clip's shape); `horizontal`/`vertical` where it sits in the area. `cover` fills the box and crops,
   * `contain` shows the whole clip as large as fits, `stretch` fills the box and distorts.
   */
  | ({ type: 'placeMedia'; region: { x: number; y: number; width: number; height: number }; regionLabel?: string; width?: number; height?: number; horizontal?: 'left' | 'center' | 'right'; vertical?: 'top' | 'middle' | 'bottom'; fit?: 'cover' | 'contain' | 'stretch' } & AiElementRef)
  /** Caption look for the whole project: a preset (src/subtitle/presets.ts), then any style fields on top; `enabled` shows/hides them. */
  | { type: 'setCaptionStyle'; preset?: string; style?: Partial<SubtitleStyle>; enabled?: boolean }
  /**
   * A moving crop that follows the speaker's face (from the `reframe` smart step). `box` moves/resizes the clip first
   * (e.g. to fill a vertical frame); `crop` is the crop size (and its first position); `keys` the crop centre over source time.
   * Empty `keys` stops following (the crop stays where it is).
   */
  | ({ type: 'setCropTrack'; box?: { x: number; y: number; width: number; height: number }; crop?: { x: number; y: number; w: number; h: number }; keys: Array<{ t: number; cx: number; cy: number }> } & AiElementRef)
  /** Volume automation of an audio clip: gain `v` at `t` seconds into its source file; [] removes it. */
  | ({ type: 'setVolumeKeys'; keys: Array<{ t: number; v: number }> } & AiElementRef)
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
  /**
   * Jump cuts on talking clips (smart/jumpcut.ts): pauses, filler words and retakes, with optional
   * punch-in zooms on every other part. `src`: every part of that file; otherwise each scene's main clip.
   */
  | { type: 'jumpCut'; sceneIds?: string[]; src?: string; settings?: Partial<JumpCutSettings> }
  | { type: 'cutToBeat'; beatsPerCut?: number }
  | { type: 'splitShots'; sceneIds?: string[] }
  /** Crop video clips to follow the speaker's face. `fill`: first make each clip fill the frame (e.g. landscape → 9:16). */
  | { type: 'reframe'; elementIds?: string[]; fill?: boolean; mode?: 'auto' | 'follow' | 'steady' }
  /** Lower the music while someone talks (video sound or voiceover). `level` is the music gain while talking. */
  | { type: 'duckMusic'; level?: number; fade?: number; musicIds?: string[] }

export type AiPlanStep = AiEditorCommand | AiSmartStep

export const SMART_STEP_TYPES = new Set<AiSmartStep['type']>(['removeSilences', 'removeFillers', 'jumpCut', 'cutToBeat', 'splitShots', 'duckMusic', 'reframe'])

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
  groupId?: string
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
  /** Video/image: the current crop (0–1 of the source); video: how many face-following crop keys it has. */
  crop?: { x: number; y: number; w: number; h: number }
  cropKeys?: number
  /** Video: punch-in zoom from jump cuts (1.1 = 10%), when zoomed. */
  punchIn?: number
  /** Video: its speed ramp and freeze frame, when it has them. */
  speedCurve?: SpeedCurve
  freeze?: { at: number; hold: number }
  /** Video/image: the effects on it, in order (e.g. ['glitch', 'look']). */
  effects?: FxType[]
  /** Video/image: how its background is removed, if it is ('chroma' = green screen, 'person' = AI cut-out). */
  keying?: 'chroma' | 'person'
  /** Audio: how many volume automation keys the clip has. */
  volumeKeys?: number
  groupId?: string
}

export interface AiSceneSummary {
  id: string
  index: number
  name: string
  duration: number
  backgroundType: string
  elements: AiElementSummary[]
  groups?: Array<{ id: string; name: string; blockId?: string; params?: Record<string, unknown> }>
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
  /** The project's captions, when it has a caption track. */
  captions?: { cues: number; enabled: boolean; fontSize: number }
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
