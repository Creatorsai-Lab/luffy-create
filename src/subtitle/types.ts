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
    color: '#ffffff',
    backgroundColor: '#000000',
    backgroundOpacity: 0.72,
    position: 'bottom',
    align: 'center',
    maxWidthPct: 82,
    paddingX: 24,
    paddingY: 14,
    radius: 8,
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
