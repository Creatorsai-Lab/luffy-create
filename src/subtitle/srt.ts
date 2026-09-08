import type { SubtitleCue } from './types'
import type { SubtitleLanguage } from '../types/editor'
import { getCueText } from './translation'

export type SubtitleSrtMode = 'source' | 'translated' | 'bilingual'

export interface SubtitleSrtOptions {
  sourceLanguage: SubtitleLanguage
  targetLanguage: SubtitleLanguage
  mode: SubtitleSrtMode
}

// Format seconds → SRT timestamp "HH:MM:SS,mmm"
function srtTime(s: number): string {
  const ms = Math.round((s % 1) * 1000)
  const total = Math.floor(s)
  const hh = String(Math.floor(total / 3600)).padStart(2, '0')
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, '0')
  const ss = String(total % 60).padStart(2, '0')
  return `${hh}:${mm}:${ss},${String(ms).padStart(3, '0')}`
}

/** Serialize cues to an .srt string. */
export function cuesToSrt(cues: SubtitleCue[], options?: SubtitleSrtOptions): string {
  return cues
    .slice()
    .sort((a, b) => a.start - b.start)
    .map(cue => ({ cue, text: resolveCueText(cue, options) }))
    .filter(item => item.text.length > 0)
    .map(({ cue, text }, index) => `${index + 1}\n${srtTime(cue.start)} --> ${srtTime(cue.end)}\n${text}\n`)
    .join('\n')
}

function resolveCueText(cue: SubtitleCue, options?: SubtitleSrtOptions) {
  if (!options || options.mode === 'source') return cue.text.trim()
  const source = cue.text.trim()
  const translated = getCueText(cue, options.sourceLanguage, options.targetLanguage).trim()
  if (options.mode === 'translated') return translated || source
  const rows = (['en', 'hi'] as const).map(language => getCueText(cue, options.sourceLanguage, language).trim()).filter(Boolean)
  return rows.join('\n') || source
}

/** Format seconds → "M:SS.s" for the UI. */
export function fmt(s: number): string {
  const m = Math.floor(s / 60)
  const sec = (s % 60).toFixed(1).padStart(4, '0')
  return `${m}:${sec}`
}
