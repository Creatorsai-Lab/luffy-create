import type { SubtitleCue, SubtitleLanguage } from '../types/editor'

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
