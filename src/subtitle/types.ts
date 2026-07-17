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
    backgroundEnabled: true,
    backgroundColor: '#000000',
    backgroundOpacity: 0.72,
    position: 'bottom',
    align: 'center',
    maxWidthPct: 82,
    paddingX: 24,
    paddingY: 14,
    radius: 8,
    marginTop: 80,
    marginRight: 120,
    marginBottom: 80,
    marginLeft: 120,
    animation: 'fade',
  }
}

export function normalizeSubtitleStyle(style?: Partial<SubtitleStyle>): SubtitleStyle {
  return { ...defaultSubtitleStyle(), ...(style ?? {}) }
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
