/**
 * Every scene transition: its name, group, colour, default length and which
 * settings it has. The single list behind the Transitions panel, the timeline,
 * the renderer and the AI. Pure — no browser APIs.
 */
import type { SceneTransition, TransitionEasing, TransitionType } from '../../types/editor'

export type TransitionGroup = 'basic' | 'cinematic' | 'energy' | '3d' | 'smart'

/** How a transition is drawn: a WebGL shader, the 2D directional renderer, or element-level morph. */
export type TransitionRender = 'gl' | 'directional' | 'morph' | 'none'

export interface TransitionDef {
  value: TransitionType
  label: string
  group: TransitionGroup
  desc: string
  /** Fixed colour for the panel chip and the timeline block. */
  color: string
  render: TransitionRender
  /** Seconds, used when the transition is picked. */
  duration: number
  /** Settings it has, with their defaults. */
  direction?: boolean
  intensity?: number
  softness?: number
  color0?: string
  /** Flash Blur / Flicker Shake keep their own speed and hardness. */
  style?: boolean
  /** Words people use for it ("crossfade", "whip pan") — for the AI. */
  words: RegExp
}

export const TRANSITION_GROUPS: Array<{ id: TransitionGroup; label: string }> = [
  { id: 'basic', label: 'Basic' },
  { id: 'cinematic', label: 'Cinematic' },
  { id: 'energy', label: 'Energy' },
  { id: '3d', label: '3D' },
  { id: 'smart', label: 'Smart' },
]

export const TRANSITION_DEFS: TransitionDef[] = [
  { value: 'none', label: 'None', group: 'basic', desc: 'Cut directly — no transition', color: '#6b7280', render: 'none', duration: 0.5, words: /\b(?:no|none|hard cuts?|straight cuts?|cuts? only)\b/ },
  { value: 'fade', label: 'Dissolve', group: 'basic', desc: 'The new scene fades in over the old one', color: '#6366f1', render: 'gl', duration: 0.6, words: /\b(?:cross\s?-?fades?|cross\s?-?dissolves?|dissolves?|fades?|blend)\b/ },
  { value: 'dipBlack', label: 'Dip to black', group: 'basic', desc: 'Fades to black, then into the new scene', color: '#1f2937', render: 'gl', duration: 0.8, color0: '#000000', words: /\b(?:dip|fade|fading)\s+(?:to|through|via)\s+black\b|\bblack\s+dip\b/ },
  { value: 'dipWhite', label: 'Dip to white', group: 'basic', desc: 'Fades to white, then into the new scene', color: '#e5e7eb', render: 'gl', duration: 0.8, color0: '#ffffff', words: /\b(?:dip|fade|fading)\s+(?:to|through|via)\s+white\b|\bwhite\s+dip\b/ },
  { value: 'push', label: 'Push', group: 'basic', desc: 'The new scene pushes the old one out', color: '#0891b2', render: 'gl', duration: 0.6, direction: true, words: /\bpush\w*/ },
  { value: 'slide', label: 'Slide', group: 'basic', desc: 'The new scene slides in over the old one', color: '#06b6d4', render: 'gl', duration: 0.6, direction: true, words: /\bslid(?:e|es|ing)\b|\bslide[\s-]?in\b/ },
  { value: 'wipe', label: 'Wipe', group: 'basic', desc: 'A soft edge sweeps the new scene in', color: '#f59e0b', render: 'gl', duration: 0.7, direction: true, softness: 0.2, words: /\bwipe\w*/ },
  { value: 'zoom', label: 'Zoom in', group: 'basic', desc: 'The camera pushes in through the old scene into the new one', color: '#22c55e', render: 'gl', duration: 0.6, intensity: 0.5, words: /\bzoom(?:[\s-]?in)?\b(?![\s-]?(?:out|blur))/ },
  { value: 'zoomOut', label: 'Zoom out', group: 'basic', desc: 'The old scene shrinks away as the new one opens out', color: '#16a34a', render: 'gl', duration: 0.6, intensity: 0.5, words: /\bzoom[\s-]?out\b/ },
  { value: 'iris', label: 'Iris', group: 'basic', desc: 'A circle opens from the centre to show the new scene', color: '#eab308', render: 'gl', duration: 0.8, softness: 0.15, words: /\b(?:iris|circle|circular|round)\b/ },

  { value: 'whip', label: 'Whip pan', group: 'cinematic', desc: 'A fast camera swing with motion blur hides the cut', color: '#f97316', render: 'gl', duration: 0.45, direction: true, intensity: 0.7, words: /\bwhip(?:[\s-]?pan)?s?\b|\bswish\w*|\bswipe\w*/ },
  { value: 'zoomBlur', label: 'Zoom blur', group: 'cinematic', desc: 'A punchy radial-blur zoom through the cut', color: '#84cc16', render: 'gl', duration: 0.5, intensity: 0.7, words: /\b(?:zoom[\s-]?blur|crash[\s-]?zoom|radial[\s-]?blur|punch[\s-]?zoom)\b/ },
  { value: 'spin', label: 'Spin', group: 'cinematic', desc: 'The picture spins out with rotation blur and spins the new scene in', color: '#14b8a6', render: 'gl', duration: 0.6, intensity: 0.6, words: /\b(?:spin\w*|rotat\w*|roll|twirl\w*)\b/ },
  { value: 'blurDissolve', label: 'Blur dissolve', group: 'cinematic', desc: 'Defocuses, dissolves, and comes back into focus', color: '#8b5cf6', render: 'gl', duration: 0.8, intensity: 0.6, words: /\b(?:blur(?:red)?\s+(?:dissolve|fade|transition)|defocus\w*|focus\s+pull|blur)\b/ },
  { value: 'lightLeak', label: 'Light leak', group: 'cinematic', desc: 'Warm film light flares across the cut', color: '#fb923c', render: 'gl', duration: 1, intensity: 0.7, words: /\blight[\s-]?leaks?\b|\blens\s+flare\b|\bflare\b/ },
  { value: 'filmBurn', label: 'Film burn', group: 'cinematic', desc: 'The film burns through to the new scene', color: '#dc2626', render: 'gl', duration: 1, intensity: 0.7, words: /\b(?:film[\s-]?burn|burn\w*)\b/ },
  { value: 'lumaFade', label: 'Luma fade', group: 'cinematic', desc: 'Bright parts change first, then the shadows', color: '#a3a3a3', render: 'gl', duration: 0.9, softness: 0.25, words: /\bluma\w*|\bluminance\b/ },
  { value: 'flash', label: 'Flash', group: 'cinematic', desc: 'A bright flash at the cut', color: '#fde047', render: 'gl', duration: 0.4, intensity: 0.8, color0: '#ffffff', words: /\b(?:flash|camera\s+flash|white\s+flash)\b(?![\s-]?blur)/ },

  { value: 'glitch', label: 'Glitch', group: 'energy', desc: 'RGB split, torn blocks and scanlines', color: '#ec4899', render: 'gl', duration: 0.45, intensity: 0.7, words: /\b(?:glitch\w*|rgb[\s-]?split|chromatic|digital\s+distortion|vhs)\b/ },
  { value: 'pixelate', label: 'Pixelate', group: 'energy', desc: 'Breaks into pixels and rebuilds as the new scene', color: '#3b82f6', render: 'gl', duration: 0.6, intensity: 0.6, words: /\b(?:pixel\w*|mosaic|blocky)\b/ },
  { value: 'stretch', label: 'Stretch', group: 'energy', desc: 'The picture stretches out and the new one snaps in', color: '#f43f5e', render: 'gl', duration: 0.5, direction: true, intensity: 0.6, words: /\b(?:stretch\w*|squash\w*|elastic)\b/ },
  { value: 'slices', label: 'Slices', group: 'energy', desc: 'Strips slide in one after another', color: '#0ea5e9', render: 'gl', duration: 0.7, direction: true, intensity: 0.5, words: /\b(?:slices?|strips?|stripes?|blinds?|shutters?)\b/ },
  { value: 'flashBlur', label: 'Flash Blur', group: 'energy', desc: 'Directional blur through a clean flash cut', color: '#f8fafc', render: 'directional', duration: 0.5, direction: true, style: true, words: /\bflash[\s-]?blur\b/ },
  { value: 'flickerShake', label: 'Flicker Shake', group: 'energy', desc: 'Hard-cut flicker with a directional shake', color: '#a855f7', render: 'directional', duration: 0.5, direction: true, style: true, words: /\b(?:flicker\w*|shake\w*|strobe)\b/ },

  { value: 'cube', label: 'Cube', group: '3d', desc: 'The scenes turn like the sides of a cube', color: '#10b981', render: 'gl', duration: 0.8, direction: true, intensity: 0.5, words: /\b(?:cube|3d|three[\s-]?d|box)\b/ },

  { value: 'morph', label: 'Morph', group: 'smart', desc: 'Matching objects move, resize and recolour into their new place', color: '#d946ef', render: 'morph', duration: 0.8, words: /\b(?:morph\w*|magic\s+move|smart\s+move)\b/ },
]

const BY_TYPE = new Map(TRANSITION_DEFS.map(d => [d.value, d]))

export function transitionDef(type: TransitionType | string | undefined): TransitionDef {
  return BY_TYPE.get(type as TransitionType) ?? BY_TYPE.get('fade')!
}

export function isTransitionType(type: unknown): type is TransitionType {
  return typeof type === 'string' && BY_TYPE.has(type as TransitionType)
}

export const TRANSITION_DURATION = { min: 0.1, max: 3 }

/**
 * A transition with this type's defaults filled in: picked from the panel or
 * the AI. Keeps the settings both share (duration, direction) unless they
 * don't fit; a duration of 0 (e.g. after "remove transitions") takes the default.
 */
export function withDefaults(type: TransitionType, previous?: Partial<SceneTransition>): SceneTransition {
  const def = transitionDef(type)
  const keepDuration = previous?.duration != null && previous.duration >= TRANSITION_DURATION.min && previous.type && previous.type !== 'none'
  return {
    type,
    duration: keepDuration ? Math.min(TRANSITION_DURATION.max, previous!.duration!) : def.duration,
    ...(def.direction && { direction: previous?.direction ?? 'right' }),
    ...(def.intensity != null && { intensity: def.intensity }),
    ...(def.softness != null && { softness: def.softness }),
    ...(def.color0 && { color: def.color0 }),
    ...(def.style && { speed: previous?.speed ?? 1, hardness: previous?.hardness ?? 50 }),
    easing: previous?.easing ?? 'smooth',
  }
}

/** Progress after easing. `snappy` hurries through the middle — good for whips and glitches. */
export function ease(progress: number, easing: TransitionEasing | undefined): number {
  const t = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0))
  if (easing === 'linear') return t
  if (easing === 'snappy') return t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/** The AI's reading of a transition name in plain words, or null. Checked most specific first. */
export function transitionFromWords(text: string): TransitionType | null {
  const order: TransitionType[] = [
    'flashBlur', 'flickerShake', 'morph', 'dipBlack', 'dipWhite', 'zoomBlur', 'zoomOut', 'blurDissolve', 'lightLeak',
    'filmBurn', 'lumaFade', 'whip', 'glitch', 'pixelate', 'stretch', 'slices', 'cube', 'spin', 'iris', 'flash',
    'wipe', 'zoom', 'push', 'slide', 'fade', 'none',
  ]
  for (const type of order) if (BY_TYPE.get(type)!.words.test(text)) return type
  return null
}
