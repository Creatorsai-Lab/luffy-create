import type { SubtitleCue, SubtitleLanguage, SubtitleTrack } from '../types/editor'

export interface SubtitleTranslationCandidate {
  id: string
  text: string
  sourceHash: string
}

interface SubtitleTranslationResult {
  id: string
  text: string
  warnings: string[]
}

const SOURCE_CHANGED_WARNING = 'Source caption changed'

export function sourceTextHash(text: string) {
  let hash = 0x811c9dc5
  for (const ch of text.trim().replace(/\s+/g, ' ')) {
    hash ^= ch.codePointAt(0) ?? 0
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function getCueText(cue: SubtitleCue, sourceLanguage: SubtitleLanguage, requestedLanguage: SubtitleLanguage) {
  return requestedLanguage === sourceLanguage ? cue.text : cue.translations?.[requestedLanguage]?.text ?? ''
}

export function isCueTranslationCurrent(cue: SubtitleCue, language: SubtitleLanguage) {
  const translation = cue.translations?.[language]
  return Boolean(translation?.text.trim() && translation.sourceHash === sourceTextHash(cue.text))
}

export function updateCueSource(cue: SubtitleCue, text: string): SubtitleCue {
  if (cue.text === text) return cue
  const translations = cue.translations && Object.fromEntries(
    Object.entries(cue.translations).map(([language, translation]) => [
      language,
      translation && {
        ...translation,
        reviewed: false,
        warnings: Array.from(new Set([...(translation.warnings ?? []), SOURCE_CHANGED_WARNING])),
      },
    ]),
  ) as SubtitleCue['translations']
  return { ...cue, text, translations }
}

export function mergeCueTranslation(
  cue: SubtitleCue,
  language: SubtitleLanguage,
  text: string,
  warnings: string[] = [],
): SubtitleCue {
  return {
    ...cue,
    translations: {
      ...cue.translations,
      [language]: {
        text,
        reviewed: false,
        sourceHash: sourceTextHash(cue.text),
        warnings: [...warnings],
      },
    },
  }
}

export function setCueReviewed(cue: SubtitleCue, language: SubtitleLanguage, reviewed: boolean): SubtitleCue {
  const translation = cue.translations?.[language]
  if (!translation) return cue
  return {
    ...cue,
    translations: {
      ...cue.translations,
      [language]: { ...translation, reviewed: reviewed && isCueTranslationCurrent(cue, language) },
    },
  }
}

export function selectTranslationCandidates(track: SubtitleTrack, replaceReviewed = false): SubtitleTranslationCandidate[] {
  const target = track.translation?.targetLanguage ?? (track.language === 'en' ? 'hi' : 'en')
  return track.cues.flatMap(cue => {
    if (!cue.text.trim()) return []
    const translation = cue.translations?.[target]
    if (!replaceReviewed && translation?.reviewed && isCueTranslationCurrent(cue, target)) return []
    return [{ id: cue.id, text: cue.text, sourceHash: sourceTextHash(cue.text) }]
  })
}

export function mergeTranslationResults(
  track: SubtitleTrack,
  language: SubtitleLanguage,
  submitted: SubtitleTranslationCandidate[],
  results: SubtitleTranslationResult[],
): SubtitleTrack {
  const hashes = new Map(submitted.map(cue => [cue.id, cue.sourceHash]))
  const translations = new Map(results.map(result => [result.id, result]))
  return {
    ...track,
    cues: track.cues.map(cue => {
      const result = translations.get(cue.id)
      if (!result || hashes.get(cue.id) !== sourceTextHash(cue.text)) return cue
      return mergeCueTranslation(cue, language, result.text, result.warnings)
    }),
  }
}
