import type { SubtitleCue, SubtitleStyle, SubtitleTrack } from '../types/editor'

export type { SubtitleCue, SubtitleStyle, SubtitleTrack }

export function makeCue(start: number, end: number, text = ''): SubtitleCue {
  return { id: crypto.randomUUID(), start, end, text }
}

export function defaultSubtitleStyle(): SubtitleStyle {
  return {
    fontFamily: 'Inter',
    fontSize: 54,
    fontWeight: 'semibold',
    italic: false,
    fillMode: 'solid',
    color: '#ffffff',
    gradientColor1: '#ffffff',
    gradientColor2: '#8b5cf6',
    gradientColor3: '#22d3ee',
    gradientOpacity1: 1,
    gradientOpacity2: 1,
    gradientOpacity3: 1,
    gradientUseColor3: false,
    maxWidthPct: 90,
    positionX: 50,
    positionY: 88,
    animation: 'wordPop',
    captionLook: 'normal',
    curveIntensity: 50,
  }
}

export function normalizeSubtitleStyle(style?: Partial<SubtitleStyle>): SubtitleStyle {
  const normalized = { ...defaultSubtitleStyle(), ...(style ?? {}) }
  const animation = normalized.animation === 'pop'
    ? 'wordPop'
    : normalized.animation === 'fade' || normalized.animation === 'slideUp'
      ? 'smoothReveal'
      : normalized.animation
  return {
    ...normalized,
    animation,
    maxWidthPct: Math.min(100, Math.max(20, normalized.maxWidthPct)),
    positionX: Math.min(100, Math.max(0, normalized.positionX)),
    positionY: Math.min(100, Math.max(0, normalized.positionY)),
    curveIntensity: Math.min(100, Math.max(0, normalized.curveIntensity ?? 50)),
  }
}

export function makeSubtitleTrack(name = 'Timeline Captions'): SubtitleTrack {
  return {
    id: crypto.randomUUID(),
    name,
    language: 'en',
    enabled: true,
    cues: [],
    style: defaultSubtitleStyle(),
  }
}
