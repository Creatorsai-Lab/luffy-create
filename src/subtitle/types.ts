import type {
  SubtitleCue,
  SubtitleLanguage,
  SubtitleStyle,
  SubtitleTrack,
  SubtitleTranslationSettings,
} from '../types/editor'

export type { SubtitleCue, SubtitleStyle, SubtitleTrack }

type LegacySubtitleStyle = Omit<Partial<SubtitleStyle>, 'captionLook'> & {
  captionLook?: SubtitleStyle['captionLook'] | 'curveOut' | 'curveIn'
  curveIntensity?: number
}

export function makeCue(start: number, end: number, text = ''): SubtitleCue {
  return { id: crypto.randomUUID(), start, end, text }
}

export function defaultSubtitleStyle(): SubtitleStyle {
  return {
    fontFamily: 'Inter',
    fontSize: 38,
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
    positionY: 4,
    animation: 'wordPop',
    captionLook: 'normal',
    warpIntensity: 50,
  }
}

export function defaultSubtitleTranslationSettings(targetLanguage: SubtitleLanguage): SubtitleTranslationSettings {
  return {
    targetLanguage,
    visible: true,
    glossary: [],
    style: {
      fontFamily: targetLanguage === 'hi' ? 'Poppins' : undefined,
      sizePct: 90,
      rowGap: 8,
    },
  }
}

export function normalizeSubtitleTrack(track: SubtitleTrack): SubtitleTrack {
  const language: SubtitleLanguage = track.language === 'hi' ? 'hi' : 'en'
  const fallbackTarget: SubtitleLanguage = language === 'en' ? 'hi' : 'en'
  const requestedTarget = track.translation?.targetLanguage
  const targetLanguage = requestedTarget && requestedTarget !== language ? requestedTarget : fallbackTarget
  const defaults = defaultSubtitleTranslationSettings(targetLanguage)
  return {
    ...track,
    language,
    style: normalizeSubtitleStyle(track.style),
    translation: {
      ...defaults,
      ...track.translation,
      targetLanguage,
      glossary: track.translation?.glossary ?? [],
      style: { ...defaults.style, ...track.translation?.style },
    },
  }
}

export function normalizeSubtitleStyle(style?: LegacySubtitleStyle): SubtitleStyle {
  const { captionLook, curveIntensity, ...current } = style ?? {}
  const normalized = { ...defaultSubtitleStyle(), ...current }
  const animation = normalized.animation === 'pop'
    ? 'wordPop'
    : normalized.animation === 'fade' || normalized.animation === 'slideUp'
      ? 'smoothReveal'
      : normalized.animation
  const warp = captionLook === 'curveOut' ? 'bulge' : captionLook === 'curveIn' ? 'inflate' : captionLook
  return {
    ...normalized,
    animation,
    captionLook: warp ?? 'normal',
    maxWidthPct: Math.min(100, Math.max(20, normalized.maxWidthPct)),
    positionX: Math.min(100, Math.max(0, normalized.positionX)),
    positionY: Math.min(100, Math.max(0, normalized.positionY)),
    warpIntensity: Math.min(100, Math.max(0, current.warpIntensity ?? curveIntensity ?? 50)),
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
    translation: defaultSubtitleTranslationSettings('hi'),
  }
}
