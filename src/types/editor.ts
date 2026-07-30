// ─── Element subtypes ────────────────────────────────────────────────────────

export type ElementType   = 'text' | 'shape' | 'arrow' | 'code' | 'image' | 'table' | 'chart' | 'video' | 'audio' | 'icon' | 'latex' | 'counter' | 'handDraw'
export type ShapeType     = 'rect' | 'circle' | 'triangle' | 'star' | 'pentagon' | 'hexagon' | 'octagon' | 'diamond' | 'oval' | 'speechBubble' | 'roundedSpeech' | 'cone' | 'cube' | 'rect-hand' | 'circle-hand' | 'square-hand' | 'heart' | 'rect-sketch'
export type AnimationType = 'fadeIn' | 'fadeOut' | 'slideIn' | 'slideOut' | 'scaleIn' | 'scaleOut' | 'wipeIn' | 'wipeOut' | 'typewriter' | 'drawPath' | 'spin' | 'pulse' | 'bounceLoop' | 'rotateLoop' | 'move' |
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
export type SlideDir      = 'left' | 'right' | 'up' | 'down'
export type MoveDirection = 'left' | 'right' | 'top' | 'bottom' | 'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft'
export type TransitionType = 'none' | 'fade' | 'slide' | 'zoom' | 'wipe' | 'push' | 'morph' | 'flashBlur' | 'flickerShake'
export type BgType        = 'solid' | 'gradient' | 'grid' | 'dots' | 'animated' | 'transparent'
export type FontWeight    = 'thin' | 'normal' | 'semibold' | 'bold'
export const MEDIA_EFFECT_TYPES = ['none', 'subtleHover', 'wiggle', 'doodleDrift', 'shake', 'zoomIn', 'zoomOut', 'vibrationDistort', 'godRays', 'lightSweep', 'lightFlicker', 'glitch', 'rain', 'snow'] as const
export type MediaEffectType = typeof MEDIA_EFFECT_TYPES[number]
export type MediaEffectAxis = 'horizontal' | 'vertical'
export type MediaEffectDirection = 'left' | 'right' | 'up' | 'down' | 'diagonal'
export type MediaEffectTarget = 'wholeMedia' | 'centerSubject' | 'manualFocus'
export type MediaZoomPosition = 'center' | 'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft'
export type ActiveTool    = 'select' | 'text' | 'shape-rect' | 'shape-circle' | 'shape-triangle' | 'shape-star' | 'shape-pentagon' | 'shape-hexagon' | 'shape-octagon' | 'shape-diamond' | 'shape-oval' | 'shape-speechBubble' | 'shape-roundedSpeech' | 'shape-cone' | 'shape-cube' | 'shape-rect-hand' | 'shape-circle-hand' | 'shape-square-hand' | 'shape-heart' | 'shape-rect-sketch' | 'arrow' | 'code' | 'table' | 'image' | 'chart' | 'video' | 'latex' | 'counter'
  | 'handDraw'
export type ActivePanel   = 'text' | 'shapes' | 'arrows' | 'code' | 'table' | 'upload' | 'audio' | 'video' | 'icons' | 'textAnimations' | 'shapeAnimations' | 'arrowAnimations' | 'textEffects' | 'background' | 'layers' | 'transitions' | 'charts' | 'perspective' | 'move' | 'effects' | 'latex' | 'counter' | 'handDraw' | null
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
  mediaEffect?: MediaEffectType
  mediaEffects?: MediaEffectClip[]
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
  startTime: number   // seconds from scene start
  duration: number    // seconds
  delay: number       // seconds
  easing: EasingType
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
  groupId?: string   // elements sharing a groupId move together when group-locked
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
  depth?: number      // 3D extrusion depth in px (cube/cone)
  faceColor?: string  // side/top face color override for 3D shapes
}

export interface ArrowElement extends BaseElement {
  type: 'arrow'
  x1: number
  y1: number
  x2: number
  y2: number
  stroke: string
  strokeWidth: number
  arrowHead: ArrowHeadType
  dashed: boolean
  dotted: boolean
  pointerLength: number
  pointerWidth: number
  arrowHeadColor: string
  curve: number
}

export interface CodeElement extends BaseElement {
  type: 'code'
  code: string
  language: string
  fontSize: number
  showLineNumbers: boolean
  bgColor?: string
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
  direction?: SlideDir
  speed?: number
  hardness?: number
}

export interface Scene {
  id: string
  name: string
  duration: number
  background: Background
  elements: EditorElement[]
  transition: SceneTransition
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

export interface SubtitleCue {
  id: string
  start: number   // seconds on the global project timeline
  end: number     // seconds on the global project timeline
  text: string
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
  backgroundEnabled?: boolean
  backgroundColor: string
  backgroundOpacity: number
  position: 'bottom' | 'middle' | 'top'
  align: AlignType
  maxWidthPct: number
  paddingX: number
  paddingY: number
  radius: number
  marginTop?: number
  marginRight?: number
  marginBottom?: number
  marginLeft?: number
  animation?: 'none' | 'fade' | 'slideUp' | 'pop'
}

export interface SubtitleTrack {
  id: string
  name: string
  language: string
  enabled: boolean
  cues: SubtitleCue[]
  sourceAudioIds?: string[]
  style: SubtitleStyle
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
