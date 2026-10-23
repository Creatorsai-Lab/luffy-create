// ─── Element subtypes ────────────────────────────────────────────────────────

export type ElementType   = 'text' | 'shape' | 'arrow' | 'code' | 'image' | 'table' | 'chart' | 'video' | 'audio' | 'icon' | 'latex' | 'counter' | 'handDraw'
export type ShapeType     = 'rect' | 'circle' | 'triangle' | 'star' | 'pentagon' | 'hexagon' | 'octagon' | 'diamond' | 'oval' | 'speechBubble' | 'roundedSpeech' | 'cone' | 'cube' | 'rect-hand' | 'circle-hand' | 'square-hand' | 'heart' | 'rect-sketch'
export type AnimationType = 'fadeIn' | 'fadeOut' | 'slideIn' | 'slideOut' | 'scaleIn' | 'scaleOut' | 'wipeIn' | 'wipeOut' | 'typewriter' | 'drawPath' | 'spin' | 'pulse' | 'bounceLoop' | 'rotateLoop' | 'move' | 'zoomIn' | 'zoomOut' |
  // Text-specific animations
  'typewriterChars' | 'typewriterWords' | 'textBounceIn' | 'textFade' | 'outlineRevealIn' | 'outlineRevealOut' | 'colorPulse' |
  // Arrow-specific animations
  'drawOff' | 'flowLoop' | 'fadeLoop' |
  // Chart-specific animations
  'chartBarsRise' | 'chartLineDraw' | 'chartAreaFlow' | 'chartPieSpin'

export type AnimationTiming = 'onEnter' | 'onExit' | 'loop'
export type TextEffectType = 'glow' | 'hollow'
export type EasingType    = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'bounce'
export type AlignType     = 'left' | 'center' | 'right'
export type ArrowHeadType = 'none' | 'end' | 'start' | 'both'
/** The shape of an arrow's head(s); 'triangle' is the classic filled point. */
export type ArrowHeadStyle = 'triangle' | 'open' | 'circle' | 'ring' | 'diamond' | 'square' | 'bar'
export type ArrowBendDirection = 'horizontal' | 'vertical'
export type SlideDir      = 'left' | 'right' | 'up' | 'down'
export type MoveDirection = 'left' | 'right' | 'top' | 'bottom' | 'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft'
export type MotionZoomPosition = 'center' | 'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft'
export type TransitionType =
  | 'none' | 'fade' | 'dipBlack' | 'dipWhite' | 'push' | 'slide' | 'wipe' | 'zoom' | 'zoomOut' | 'iris'
  | 'whip' | 'zoomBlur' | 'spin' | 'blurDissolve' | 'lightLeak' | 'filmBurn' | 'lumaFade' | 'flash'
  | 'glitch' | 'pixelate' | 'stretch' | 'slices' | 'cube'
  | 'morph' | 'flashBlur' | 'flickerShake'
/** How a transition's progress speeds up and slows down. */
export type TransitionEasing = 'smooth' | 'linear' | 'snappy'
export type BgType        = 'solid' | 'gradient' | 'grid' | 'dots' | 'animated' | 'transparent'
export type FontWeight    = 'thin' | 'normal' | 'semibold' | 'bold'
export type SubtitleAnimationType = 'none' | 'wordPop' | 'wordRise' | 'karaokePulse' | 'smoothReveal' | 'fade' | 'slideUp' | 'pop'
export type SubtitleCaptionLook = 'normal' | 'bulge' | 'inflate'
export const MEDIA_EFFECT_TYPES = ['none', 'subtleHover', 'wiggle', 'doodleDrift', 'shake', 'zoomIn', 'zoomOut', 'vibrationDistort', 'godRays', 'lightSweep', 'lightFlicker', 'glitch', 'rain', 'snow'] as const
export type MediaEffectType = typeof MEDIA_EFFECT_TYPES[number]
export type MediaEffectAxis = 'horizontal' | 'vertical'
export type MediaEffectDirection = 'left' | 'right' | 'up' | 'down' | 'diagonal'
export type MediaEffectTarget = 'wholeMedia' | 'centerSubject' | 'manualFocus'
export type MediaZoomPosition = 'center' | 'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft'
export type ActiveTool    = 'select' | 'shape-rect' | 'shape-circle' | 'shape-triangle' | 'shape-star' | 'shape-pentagon' | 'shape-hexagon' | 'shape-octagon' | 'shape-diamond' | 'shape-oval' | 'shape-speechBubble' | 'shape-roundedSpeech' | 'shape-cone' | 'shape-cube' | 'shape-rect-hand' | 'shape-circle-hand' | 'shape-square-hand' | 'shape-heart' | 'shape-rect-sketch' | 'arrow' | 'code' | 'image' | 'chart' | 'video' | 'latex' | 'counter'
  | 'handDraw'
export type ActivePanel   = 'text' | 'shapes' | 'arrows' | 'code' | 'table' | 'upload' | 'audio' | 'video' | 'icons' | 'textAnimations' | 'shapeAnimations' | 'arrowAnimations' | 'textEffects' | 'background' | 'layers' | 'transitions' | 'charts' | 'perspective' | 'motion' | 'groupEffects' | 'blocks' | 'effects' | 'latex' | 'counter' | 'handDraw' | 'editBg' | null
export type HandDrawTool = 'pen' | 'paint' | 'spray' | 'eraser'
export type ShapeFillMode = 'solid' | 'linearGradient' | 'radialGradient'
export type TextFillMode = 'solid' | 'linearGradient'
export type BorderFillMode = 'solid' | 'linearGradient'

export interface BoxShadow {
  enabled: boolean
  color: string
  opacity: number
  blur: number
  spread: number
  angle: number
  distance: number
}

export interface InnerShadow {
  enabled: boolean
  color: string
  opacity: number
  blur: number
  angle: number
  distance: number
}

export interface PerspectiveControls {
  horizontalTilt: number
  verticalTilt: number
  skewX: number
  skewY: number
  depth: number
}

export interface MediaEffectSettings {
  mediaEffectAxis?: MediaEffectAxis
  mediaEffectIntensity?: number
  mediaEffectSpeed?: number
  mediaEffectHardness?: number
  mediaEffectDirection?: MediaEffectDirection
  mediaEffectBlend?: number
  mediaEffectColor?: string
  mediaEffectColorOpacity?: number
  mediaEffectSize?: number
  mediaEffectTarget?: MediaEffectTarget
  mediaEffectFocusX?: number
  mediaEffectFocusY?: number
  mediaEffectZoomPosition?: MediaZoomPosition
}

export interface MediaEffectClip extends MediaEffectSettings {
  type: Exclude<MediaEffectType, 'none'>
  startAt: number
  endAt: number
}

export interface MediaEffectControls extends MediaEffectSettings {
  /** The effect stack. When missing, the older fields below are read and converted (src/engine/fx/stack.ts). */
  fx?: MediaFx[]
  /** Older single effect / timed effects — read only when `fx` is missing. */
  mediaEffect?: MediaEffectType
  mediaEffects?: MediaEffectClip[]
}

/** Every effect in the effects engine (src/engine/fx). */
export type FxType =
  // Body (AI person mask, on this computer)
  | 'neonOutline' | 'aura' | 'spotlight' | 'echo'
  // Retro & texture
  | 'vhs' | 'film8mm' | 'oldFilm' | 'dust' | 'paper' | 'halftone' | 'grain'
  // Glitch
  | 'glitch' | 'rgbSplit' | 'crt' | 'signalLoss'
  // Warp
  | 'wave' | 'swirl' | 'bulge' | 'ripple' | 'kaleidoscope' | 'heatHaze'
  // Light
  | 'glow' | 'halation' | 'lightLeak' | 'lightSweep' | 'godRays' | 'lensFlare' | 'defocus' | 'vignette'
  // Energy
  | 'phonk' | 'strobe' | 'zoomPulse' | 'shake' | 'flash' | 'flicker'
  // Motion
  | 'float' | 'wiggle' | 'drift' | 'kenBurnsIn' | 'kenBurnsOut'
  // Weather
  | 'rain' | 'snow'
  // Colour look (one per clip)
  | 'look'

/**
 * One effect on a video or image. Times are the clip's own seconds (for an
 * image, its scene's): it runs from `start` to `end` (the clip's end when
 * missing), fading in and out, and loops while it runs.
 */
export interface MediaFx {
  id: string
  type: FxType
  start: number
  end?: number
  fadeIn?: number
  fadeOut?: number
  /** Strength, 0–1. */
  intensity: number
  /** Effect-specific settings (see the catalogue in src/engine/fx/catalog.ts). */
  params?: Record<string, number | string | boolean>
  /** Hit on the music's beats (energy effects). */
  beatSync?: boolean
  /** Hidden without removing it. */
  off?: boolean
}

/** A speed curve: speed (multiplying the clip's speed) over the clip's footage, 0 = its first frame, 1 = its last. */
export interface SpeedCurve {
  preset: string
  points: Array<{ x: number; speed: number }>
}

export interface MediaVignetteControls {
  vignetteEnabled?: boolean
  vignetteColor?: string
  vignetteAmount?: number
  vignetteSize?: number
  vignetteFade?: number
}

export interface MediaGrainControls {
  grainColor?: string
  grainSize?: number
  grainOpacity?: number
}

// ─── Animation ───────────────────────────────────────────────────────────────

export interface ElementAnimation {
  id: string
  type: AnimationType
  timing: AnimationTiming  // onEnter, onExit, or loop
  duration: number    // seconds
  /** When the animation starts, in seconds from the scene start. */
  delay: number
  easing: EasingType
  /**
   * Loops only: play once every `repeatEvery` seconds instead of back to back
   * (e.g. a 0.4 s pulse every 3 s). Unset = continuous loop.
   */
  repeatEvery?: number
  params?: {
    direction?: SlideDir
    distance?: number
    moveDirection?: MoveDirection
    deltaX?: number
    deltaY?: number
    startOffsetX?: number
    startOffsetY?: number
    speed?: number
    moveOutside?: boolean
    moveMode?: 'direction' | 'coordinates'
    startCenterX?: number
    startCenterY?: number
    endCenterX?: number
    endCenterY?: number
    zoomPosition?: MotionZoomPosition
    zoomScale?: number
    pulseColor?: string
    pulseCount?: number
    scaleAmount?: number
  }
}

// ─── Base element ─────────────────────────────────────────────────────────────

export interface BaseElement {
  id: string
  type: ElementType
  x: number
  y: number
  width: number
  height: number
  rotation: number
  opacity: number
  zIndex: number
  locked: boolean
  visible: boolean
  name: string
  animations: ElementAnimation[]
  boxShadow?: BoxShadow
  innerShadow?: InnerShadow
  borderFillMode?: BorderFillMode
  borderGradientFrom?: string
  borderGradientTo?: string
  borderGradientAngle?: number
  borderAnimate?: boolean
  borderAnimationSpeed?: number
  perspectivePts?: { tl: [number, number]; tr: [number, number]; br: [number, number]; bl: [number, number] }
  perspectiveControls?: PerspectiveControls
  /** Members of a group share its id (see Scene.groups); clicking one selects all. */
  groupId?: string
  /** Stable part name inside a smart block ("neuron-1-3"), so a rebuild keeps ids. */
  blockKey?: string
  /** Lineage id shared by copies of one element across scenes (duplicate scene, paste) — lets Morph match them. */
  morphKey?: string
}

// ─── Concrete elements ────────────────────────────────────────────────────────

export interface TextElement extends BaseElement {
  type: 'text'
  content: string
  fontSize: number
  fontFamily: string
  fontWeight: FontWeight
  italic: boolean
  color: string
  fillMode?: TextFillMode
  gradientColor1?: string
  gradientColor2?: string
  gradientColor3?: string
  gradientOpacity1?: number
  gradientOpacity2?: number
  gradientOpacity3?: number
  gradientUseColor3?: boolean
  align: AlignType
  lineHeight: number
  letterSpacing: number
  underline: boolean
  shadowColor: string
  shadowBlur: number
  shadowOffsetX: number
  shadowOffsetY: number
  textStroke: string
  textStrokeWidth: number
  stretchX: number
  stretchY: number
  effects?: TextEffectType[]  // New: text effects
  // Text background box
  bgEnabled?: boolean
  bgColor?: string
  bgOpacity?: number          // 0-1
  bgPadX?: number             // horizontal padding px
  bgPadY?: number             // vertical padding px
  bgRadius?: number           // corner radius px
  bgShadowColor?: string
  bgShadowBlur?: number
  bgShadowOffsetX?: number
  bgShadowOffsetY?: number
}

export interface ShapeElement extends BaseElement {
  type: 'shape'
  shapeType: ShapeType
  fill: string
  fillOpacity?: number
  fillMode?: ShapeFillMode
  gradientFrom?: string
  gradientTo?: string
  gradientFromOpacity?: number
  gradientToOpacity?: number
  gradientAngle?: number
  stroke: string
  strokeWidth: number
  cornerRadius: number
  /** Legacy (1.4 and earlier) single face color for 3D shapes; tints the top/base face when no override is set. */
  faceColor?: string
  // 3D cube / cone: rotation of the solid in degrees, and per-face fills.
  /** Cuboid front-to-back size (width/height come from the box). Defaults to the smaller of width/height. */
  depth3d?: number
  rotateX?: number
  rotateY?: number
  rotateZ?: number
  faces3d?: Partial<Record<Face3D, { color?: string; opacity?: number }>>
}

export type Face3D = 'front' | 'back' | 'top' | 'bottom' | 'left' | 'right' | 'slant' | 'base'

export interface ArrowElement extends BaseElement {
  type: 'arrow'
  x1: number
  y1: number
  x2: number
  y2: number
  stroke: string
  strokeWidth: number
  arrowHead: ArrowHeadType
  /** Default triangle. */
  headStyle?: ArrowHeadStyle
  dashed: boolean
  dotted: boolean
  pointerLength: number
  pointerWidth: number
  arrowHeadColor: string
  curve: number
  bendCount?: number
  bendDirection?: ArrowBendDirection
  bendCurve?: number
  /** Attached ends follow their element (src/utils/connectors.ts); unset = a free point. */
  startAttach?: ArrowAttachment
  endAttach?: ArrowAttachment
}

/** Where an attached arrow end sits: 'auto' faces the other end. */
export type ConnectorAnchor = 'auto' | 'top' | 'right' | 'bottom' | 'left' | 'center'

export interface ArrowAttachment {
  elementId: string
  anchor?: ConnectorAnchor
}

export interface CodeElement extends BaseElement {
  type: 'code'
  code: string
  language: string
  fontSize: number
  showLineNumbers: boolean
  bgColor?: string
  /** Default 6. */
  cornerRadius?: number
  /** 0 / undefined = no border. */
  borderWidth?: number
  borderColor?: string
  /** Shown centred in the top bar when `showTitle` is on (max 6 words). */
  showTitle?: boolean
  title?: string
  fitSceneWidth?: boolean
  wrapLines?: boolean
  codeAnimation?: 'none' | 'characters' | 'lines' | 'blocks'
  codeAnimationDelay?: number
  codeAnimationDuration?: number
  codeAnimationBlocks?: CodeAnimationBlock[]
}

export interface CodeAnimationBlock {
  id: string
  fromLine: number
  toLine: number
  delay: number
  duration: number
}

/**
 * Removing a video's or image's background. `chroma`: a colour (green/blue
 * screen) becomes transparent. `person`: an on-device AI cut-out keeps the
 * person and removes the rest. Whatever is behind the clip shows through,
 * unless `background` replaces it (person mode).
 */
export interface MediaKeying {
  mode: 'chroma' | 'person'
  /** Chroma: the colour to remove. */
  color?: string
  /** Chroma: how far from the colour still counts as background, 0–1 (default 0.4). */
  strength?: number
  /** Chroma: width of the soft edge, 0–1 (default 0.1). */
  softness?: number
  /** Chroma: how much of the screen's colour cast is taken off the subject, 0–1 (default 0.3). */
  spill?: number
  /** Person: edge softness, 0–1 (default 0.3). */
  feather?: number
  /** Person: what replaces the removed background ('none' = see through). */
  background?: 'none' | 'blur' | 'color'
  backgroundColor?: string
  /** Person: blur strength for background 'blur', 0–1 (default 0.5). */
  backgroundBlur?: number
}

export interface ImageElement extends BaseElement, MediaEffectControls, MediaVignetteControls, MediaGrainControls {
  type: 'image'
  src: string
  assetId: string
  cornerRadius: number
  borderColor: string
  borderWidth: number
  lockRatio?: boolean
  crop?: { x: number; y: number; w: number; h: number }  // normalized 0-1
  /** Green screen / background removal. */
  keying?: MediaKeying
  // Basic
  brightness?: number   // 0-200, default 100
  contrast?: number     // 0-200, default 100
  saturation?: number   // 0-200, default 100
  hueRotate?: number    // 0-360
  blur?: number         // 0-20 px
  glass?: boolean
  // Light (all -100 to 100, default 0)
  exposure?: number
  highlights?: number
  shadows?: number
  whites?: number
  blacks?: number
  // Color
  temperature?: number
  tint?: number
  vibrance?: number
}

export interface TableElement extends BaseElement {
  type: 'table'
  rows: number
  cols: number
  cells: string[][]
  cellWidth: number
  cellHeight: number
  borderColor: string
  borderWidth: number
  borderRadius?: number
  cellBorderColor?: string
  cellBorderWidth?: number
  headerBg: string
  cellBg: string
  textColor: string
  textAlign?: AlignType
  fontSize: number
  showHeader: boolean
}

export interface ChartDataPoint {
  x: number
  y: number
}

export interface ChartElement extends BaseElement {
  type: 'chart'
  chartType: 'bar' | 'line' | 'pie' | 'doughnut' | 'area' | 'points'
  data: {
    labels: string[]
    datasets: {
      label: string
      data: number[]
      color: string
      points?: ChartDataPoint[]
    }[]
  }
  showLegend: boolean
  showGrid: boolean
  backgroundColor: string
  fontSize?: number        // label font size, default 10
  textColor?: string       // axis/label color, default '#999'
  cornerRadius?: number    // chart background corner radius, default 4
  fontFamily?: string      // label font family
  barWidth?: number        // 0.3-1.0, fraction of bar slot filled by bar
  barSpacing?: number      // 0.0-0.5, fraction of slot used as group gap
  lineWeight?: number      // stroke width for line/area charts, default 2
  xAxisMin?: number
  xAxisMax?: number
  xAxisStep?: number
  yAxisMin?: number
  yAxisMax?: number
  yAxisStep?: number
  pointSize?: number
  showPointLabels?: boolean
  regressionLineEnabled?: boolean
  regressionStartX?: number
  regressionStartY?: number
  regressionEndX?: number
  regressionEndY?: number
  regressionLineColor?: string
  regressionLineWidth?: number
}

export interface VideoElement extends BaseElement, MediaEffectControls, MediaVignetteControls, MediaGrainControls {
  type: 'video'
  src: string
  assetId: string
  cornerRadius: number
  borderColor: string
  borderWidth: number
  lockRatio?: boolean
  crop?: { x: number; y: number; w: number; h: number }
  /** A moving crop (auto-reframe): the crop's centre over time; its size stays `crop.w` × `crop.h`. */
  cropKeys?: CropKey[]
  /** Punch-in zoom from jump cuts: the picture is scaled up by this much (1.1 = 10%) about the crop's centre. */
  punchIn?: number
  /** Speed ramp over the clip (velocity edits); `playbackRate` still scales it. */
  speedCurve?: SpeedCurve
  /** A freeze frame: at `at` seconds into the clip the picture holds for `hold` seconds, then carries on. */
  freeze?: { at: number; hold: number }
  /** Green screen / background removal. */
  keying?: MediaKeying
  volume: number
  playbackRate: number
  loop: boolean
  muted: boolean
  /** Trim in-point in source file (seconds) */
  startTime?: number
  /** Clip length on scene timeline (seconds) */
  duration?: number
  /** When clip starts within the scene (seconds from scene start) */
  timelineX?: number
  /** Full source media length (seconds) — used for trim limits */
  sourceDuration?: number
  // Adjustments (same as ImageElement)
  brightness?: number
  contrast?: number
  saturation?: number
  hueRotate?: number
  blur?: number
  glass?: boolean
  exposure?: number
  highlights?: number
  shadows?: number
  whites?: number
  blacks?: number
  temperature?: number
  tint?: number
  vibrance?: number
  // Cinematic & Effects
  colorGrading?: 'none' | 'warm' | 'cool' | 'vintage' | 'cyberpunk' | 'cinematic' | 'monochrome' | 'noir' | 'sunset'
  videoEffect?: 'none' | 'lensBlur' | 'distortion' | 'shake' | 'comic' | 'retro' | 'flash'
  videoEffectIntensity?: number
  frameType?: 'none' | 'circle' | 'triangle'
}

export interface IconElement extends BaseElement {
  type: 'icon'
  iconName: string    // Lucide icon component name, e.g. 'ArrowRight'
  color: string
  strokeWidth: number
}

export interface LatexElement extends BaseElement {
  type: 'latex'
  latex: string       // raw LaTeX source
  color: string
  fontSize: number    // scale factor for the rendered equation
  fontFamily?: string // applied to \text{} runs where possible
  /** Draw the equation at its natural size inside the box (shrunk only to fit, never stretched). Set by blocks. */
  fitContent?: boolean
  contentAlign?: 'left' | 'center'
}

export interface CounterElement extends BaseElement {
  type: 'counter'
  mode: 'number' | 'english' | 'hindi'
  start: number | string
  end: number | string
  speedMs: number
  fontSize: number
  fontFamily: string
  fontWeight: FontWeight
  italic: boolean
  color: string
  lineHeight: number
  shadowColor: string
  shadowBlur: number
  shadowOffsetX: number
  shadowOffsetY: number
  bgEnabled?: boolean
  bgColor?: string
  bgOpacity?: number
  bgPadX?: number
  bgPadY?: number
  bgRadius?: number
  bgShadowColor?: string
  bgShadowBlur?: number
  bgShadowOffsetX?: number
  bgShadowOffsetY?: number
}

export interface HandDrawSprayParticle {
  x: number
  y: number
  radius: number
  alpha: number
}

export interface HandDrawStroke {
  id: string
  tool: HandDrawTool
  points: number[]
  color: string
  width: number
  opacity: number
  hardness?: number
  grainColor?: string
  spread?: number
  particles?: HandDrawSprayParticle[]
}

export interface HandDrawElement extends BaseElement {
  type: 'handDraw'
  strokes: HandDrawStroke[]
}

/** Where a moving crop is centred (0–1 of the source frame) at `t` seconds into the source file. */
export interface CropKey {
  t: number
  cx: number
  cy: number
}

/** A volume automation point: gain `v` (0–2) at `t` seconds into the source file. */
export interface VolumeKey {
  t: number
  v: number
}

export interface AudioMarker {
  id: string
  offset: number  // seconds from clip start (audio.x)
}

export interface AudioElement extends BaseElement {
  type: 'audio'
  src: string
  assetId: string
  volume: number
  speed?: number     // Playback speed multiplier, default 1
  voice?: number     // Voice tone -100..100, default 0
  pitch?: number     // Semitone shift -12..12, default 0
  bass?: number      // Bass gain in dB -12..12, default 0
  saturation?: number // Harmonic saturation -100..100, default 0
  fadeIn: number
  fadeOut: number
  fadeInVolume?: number
  fadeOutVolume?: number
  startTime: number  // Trim start (seconds)
  duration: number   // Trim duration (seconds)
  loop: boolean
  track: 'background' | 'voiceover'
  markers?: AudioMarker[]
  /** Volume automation (e.g. ducking under speech), on top of volume and fades. */
  volumeKeys?: VolumeKey[]
  lane?: number      // explicit vertical lane in the timeline (manual override)
}

export type EditorElement = TextElement | ShapeElement | ArrowElement | CodeElement | ImageElement | TableElement | ChartElement | VideoElement | AudioElement | IconElement | LatexElement | CounterElement | HandDrawElement

// ─── Background ───────────────────────────────────────────────────────────────

export type GradientKind = 'linear' | 'radial' | 'conic'
export interface SolidBg     { type: 'solid';    color: string }
export interface GradientBg  { type: 'gradient'; from: string; to: string; angle: number; fromStop: number; toStop: number; gradientType?: GradientKind; via?: string }
export interface GridBg      { type: 'grid';     bgColor: string; lineColor: string; cellSize: number }
export interface DotsBg      { type: 'dots';     bgColor: string; dotColor: string; spacing: number; radius: number }
export type AnimatedVariant = 'gradient-flow' | 'particles' | 'wave' | 'aurora' | 'conic-rotate' | 'gradient-shift' | 'three-color-drift' | 'sand-grain-gradient'
export interface AnimatedBg  { type: 'animated'; variant: AnimatedVariant; colors: string[]; speed: number }
export interface ImageBg {
  type: 'image'
  src: string
  fit: 'cover' | 'fill'
  opacity?: number
  brightness?: number
  contrast?: number
  saturation?: number
  hueRotate?: number
  blur?: number
  glass?: boolean
  exposure?: number
  highlights?: number
  shadows?: number
  whites?: number
  blacks?: number
  temperature?: number
  tint?: number
  vibrance?: number
}
export interface TransparentBg { type: 'transparent' }
export type Background = SolidBg | GradientBg | GridBg | DotsBg | AnimatedBg | ImageBg | TransparentBg

// ─── Scene ────────────────────────────────────────────────────────────────────

export interface SceneTransition {
  type: TransitionType
  duration: number
  /** The edge the new scene comes from (push, slide, wipe, whip, …). */
  direction?: SlideDir
  /** Flash Blur / Flicker Shake only. */
  speed?: number
  hardness?: number
  /** Strength of blur, zoom, glitch, light … 0–1. */
  intensity?: number
  /** Edge softness of wipes, iris and luma fades, 0–1. */
  softness?: number
  /** Dip and flash colour. */
  color?: string
  easing?: TransitionEasing
}

export interface Scene {
  id: string
  name: string
  duration: number
  background: Background
  elements: EditorElement[]
  transition: SceneTransition
  /** Groups on this scene by id; members carry the id in `groupId`. */
  groups?: Record<string, SceneGroup>
}

export interface SceneGroup {
  id: string
  name: string
  /** Set when the group was built by a smart block and can be rebuilt from new settings. */
  smart?: SmartGroupInfo
  /** The whole group drawn in perspective, as one plane (see GroupPerspective). */
  perspective?: GroupPerspective
}

/**
 * Corners as fractions of the group's bounding box (0,0 = its top-left, 1,1 = bottom-right),
 * so the warp keeps its shape when the group moves, grows or is rebuilt.
 */
export interface GroupPerspective {
  pts: { tl: [number, number]; tr: [number, number]; br: [number, number]; bl: [number, number] }
  controls?: PerspectiveControls
}

export interface SmartGroupInfo {
  blockId: string
  params: Record<string, unknown>
  /**
   * Top-left of the block as built. The difference to the members' current
   * top-left is how far the user moved it, kept when it is rebuilt.
   */
  origin: { x: number; y: number }
}

// ─── Project ──────────────────────────────────────────────────────────────────

export interface AssetMeta {
  id: string
  filename: string
  path: string
  type: 'image' | 'video' | 'audio'
  name: string
  duration?: number  // For audio/video
}

export interface TimeMarker {
  id: string
  time: number
}

export type SubtitleLanguage = 'en' | 'hi'

export interface SubtitleTranslation {
  text: string
  sourceHash: string
  warnings?: string[]
}

export interface SubtitleGlossaryEntry {
  id: string
  source: string
  target: string
}

export interface SubtitleTranslatedStyle {
  fontFamily?: string
  sizePct: number
  color?: string
  rowGap: number
}

export interface SubtitleTranslationSettings {
  targetLanguage: SubtitleLanguage
  visible: boolean
  glossary: SubtitleGlossaryEntry[]
  style: SubtitleTranslatedStyle
}

export interface SubtitleCue {
  id: string
  start: number   // seconds on the global project timeline
  end: number     // seconds on the global project timeline
  text: string
  translations?: Partial<Record<SubtitleLanguage, SubtitleTranslation>>
}

export interface SubtitleStyle {
  fontFamily: string
  fontSize: number
  fontWeight: FontWeight
  italic?: boolean
  fillMode?: TextFillMode
  color: string
  gradientColor1?: string
  gradientColor2?: string
  gradientColor3?: string
  gradientOpacity1?: number
  gradientOpacity2?: number
  gradientOpacity3?: number
  gradientUseColor3?: boolean
  maxWidthPct: number
  positionX: number
  positionY: number
  animation?: SubtitleAnimationType
  captionLook?: SubtitleCaptionLook
  warpIntensity?: number
  /** Show the words in capitals. */
  uppercase?: boolean
  /** Outline around the letters (px; 0 = none). */
  strokeColor?: string
  strokeWidth?: number
  /** Colour of the word being spoken (karaoke) or popping in; unset = same as the text. */
  activeColor?: string
  /** Box behind each row (opacity 0 = none). */
  boxColor?: string
  boxOpacity?: number
}

export interface SubtitleTrack {
  id: string
  name: string
  language: SubtitleLanguage
  enabled: boolean
  cues: SubtitleCue[]
  sourceAudioIds?: string[]
  style: SubtitleStyle
  translation?: SubtitleTranslationSettings
}

export interface Project {
  id: string
  name: string
  width: number
  height: number
  fps: number
  scenes: Scene[]
  assets: AssetMeta[]
  timeMarkers: TimeMarker[]
  subtitleTracks?: SubtitleTrack[]
  /** Fade out at the end: the last scene goes to black over its final `duration` seconds. */
  endTransition?: SceneTransition
  createdAt: number
  updatedAt: number
}

// ─── Canvas size presets ──────────────────────────────────────────────────────

export interface CanvasPreset {
  label: string
  width: number
  height: number
}

export const CANVAS_PRESETS: CanvasPreset[] = [
  { label: '16:9 Landscape HD', width: 1920, height: 1080 },
  { label: '9:16 Vertical HD',   width: 1080, height: 1920 },
  { label: '1:1 Square HD',     width: 1080, height: 1080 },
  { label: '4:5 Portrait HD', width: 1080, height: 1350 },
  { label: '16:9 Landscape 4K', width: 3840, height: 2160 },
  { label: '9:16 Vertical 4K', width: 2160, height: 3840}
]

export const FONT_FAMILIES = [
  'Arial',
  'Bangers',
  'Bebas Neue',
  'Caveat',
  'Caveat Brush',
  'Chewy',
  'Comic Sans MS',
  'Computer Modern Roman',
  'Consolas',
  'Courier New',
  'EB Garamond',
  'Garamond',
  'Georgia',
  'Handlee',
  'Impact',
  'Imperial Script',
  'Indie Flower',
  'Inter',
  'Kalam',
  'Montserrat',
  'Noto Serif',
  'Pacifico',
  'Playfair Display',
  'Poppins',
  'Quicksand',
  'Roboto',
  'Shadows Into Light',
  'Tahoma',
  'Times New Roman',
  'Trebuchet MS',
  'Verdana',
]

export const LANGUAGES = [
  'javascript', 'typescript', 'python', 'rust', 'go', 'java',
  'cpp', 'c', 'bash', 'sql', 'json', 'yaml', 'html', 'css', 'markdown'
]
