import type { SubtitleAnimationType, SubtitleCaptionLook, SubtitleCue, SubtitleLanguage, SubtitleTrack } from '../types/editor'
import { isCueTranslationCurrent } from './translation'

export interface SubtitleRenderRow {
  language: SubtitleLanguage
  text: string
  translated: boolean
}

export interface FittedSubtitleRow {
  text: string
  fontSize: number
  width: number
  height: number
  scaleX: number
  lines: 1
}

export interface SubtitleLine {
  text: string
}

export interface MeasuredSubtitleWord {
  text: string
  x: number
  width: number
  characters: Array<{ text: string; x: number; width: number; index: number }>
}

export interface SubtitleMotionState {
  opacity: number
  scale: number
  offsetY: number
  emphasis?: number
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0))
const easeOut = (value: number) => 1 - Math.pow(1 - clamp01(value), 3)

export function getSubtitleRenderRows(track: SubtitleTrack, cue: SubtitleCue): SubtitleRenderRow[] {
  const source = { language: track.language, text: cue.text.trim(), translated: false }
  const target = track.translation?.targetLanguage
  const translated = target && track.translation?.visible && isCueTranslationCurrent(cue, target)
    ? { language: target, text: cue.translations?.[target]?.text.trim() ?? '', translated: true }
    : null
  return [source, translated]
    .filter((row): row is SubtitleRenderRow => Boolean(row?.text))
    .sort((a, b) => (a.language === 'en' ? 0 : 1) - (b.language === 'en' ? 0 : 1))
}

export function fitSubtitleRow(
  text: string,
  requestedSize: number,
  maxWidth: number,
  measureAtSize: (text: string, size: number) => number,
): FittedSubtitleRow {
  const compact = text.replace(/\s+/g, ' ').trim()
  const upper = Math.max(12, requestedSize)
  let low = 12, high = upper, fontSize = 12
  while (low <= high) {
    const candidate = Math.floor((low + high) / 2)
    if (measureAtSize(compact, candidate) <= maxWidth) { fontSize = candidate; low = candidate + 1 }
    else high = candidate - 1
  }
  const width = Math.max(0, measureAtSize(compact, fontSize))
  return { text: compact, fontSize, width, height: fontSize * 1.08, scaleX: Math.min(1, maxWidth / Math.max(1, width)), lines: 1 }
}

export function layoutSubtitleStack(rows: Array<{ width: number; height: number }>, rowGap: number) {
  let y = 0
  const positioned = rows.map((row, index) => {
    const result = { ...row, y }
    y += row.height + (index < rows.length - 1 ? rowGap : 0)
    return result
  })
  return { width: Math.max(0, ...rows.map(row => row.width)), height: y, rows: positioned }
}

function compactLines(words: string[], maxChars: number) {
  const text = words.join(' ')
  if (text.length <= maxChars || words.length < 2) return [text]
  let split = 1
  let smallestDifference = Infinity
  for (let index = 1; index < words.length; index++) {
    const difference = Math.abs(words.slice(0, index).join(' ').length - words.slice(index).join(' ').length)
    if (difference < smallestDifference) {
      split = index
      smallestDifference = difference
    }
  }
  return [words.slice(0, split).join(' '), words.slice(split).join(' ')]
}

export function layoutSubtitleLines(text: string, maxChars: number): SubtitleLine[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  if (!words.length) return []
  return compactLines(words, Math.max(1, maxChars)).map(line => ({ text: line }))
}

export function layoutMeasuredSubtitleWords(text: string, measure: (text: string) => number) {
  const source = text.trim().split(/\s+/).filter(Boolean)
  const spaceWidth = Math.max(0, measure(' '))
  const words: MeasuredSubtitleWord[] = []
  let x = 0
  let startIndex = 0

  source.forEach((word, wordIndex) => {
    let prefix = ''
    let previousWidth = 0
    const characters = Array.from(word).map((character, index) => {
      prefix += character
      const nextWidth = Math.max(previousWidth, measure(prefix))
      const metric = { text: character, x: previousWidth, width: nextWidth - previousWidth, index: startIndex + index }
      previousWidth = nextWidth
      return metric
    })
    const width = Math.max(0, measure(word))
    words.push({ text: word, x, width, characters })
    x += width
    startIndex += characters.length
    if (wordIndex < source.length - 1) {
      x += spaceWidth
      startIndex += 1
    }
  })

  return { words, naturalWidth: x, characterCount: startIndex }
}

export function getSubtitleWarpScale(
  look: SubtitleCaptionLook = 'normal',
  intensity = 50,
  index: number,
  itemCount: number,
) {
  const strength = clamp01(intensity / 100)
  if (look === 'normal' || itemCount < 2 || strength === 0) return 1
  const x = index / (itemCount - 1) * 2 - 1
  const center = (1 + Math.cos(Math.PI * x)) / 2
  const profile = look === 'bulge' ? center : 1 - center
  return 1 + strength * (1.15 * profile - 0.3)
}

export function getCaptionOrigin(
  frameWidth: number,
  frameHeight: number,
  captionWidth: number,
  captionHeight: number,
  positionX: number,
  positionY: number,
) {
  const x = frameWidth * clamp01(positionX / 100) - captionWidth / 2
  const y = frameHeight * clamp01(positionY / 100) - captionHeight / 2
  return {
    x: Math.min(Math.max(0, frameWidth - captionWidth), Math.max(0, x)),
    y: Math.min(Math.max(0, frameHeight - captionHeight), Math.max(0, y)),
  }
}

export function getSubtitleBlockState(animation: SubtitleAnimationType = 'wordPop', progress: number): SubtitleMotionState {
  const p = clamp01(progress)
  const eased = easeOut(p)
  if (animation === 'smoothReveal' || animation === 'slideUp') {
    return { opacity: eased, scale: 0.94 + eased * 0.06, offsetY: (1 - eased) * 24 }
  }
  if (animation === 'fade') return { opacity: eased, scale: 1, offsetY: 0 }
  if (animation === 'pop') return { opacity: 1, scale: 0.82 + eased * 0.18, offsetY: 0 }
  return { opacity: 1, scale: 1, offsetY: 0 }
}

export function getSubtitleWordState(
  animation: SubtitleAnimationType = 'wordPop',
  progress: number,
  index: number,
  wordCount: number,
): Required<SubtitleMotionState> {
  const stable = { opacity: 1, scale: 1, offsetY: 0, emphasis: 0 }
  if (animation !== 'wordPop' && animation !== 'wordRise' && animation !== 'karaokePulse') return stable

  const p = clamp01(progress)
  if (animation === 'karaokePulse') {
    if (p >= 1) return stable
    const position = p * Math.max(1, wordCount)
    const active = Math.min(wordCount - 1, Math.floor(position))
    if (index < active) return stable
    if (index > active) return { ...stable, opacity: 0.35 }
    return { ...stable, scale: 1 + Math.sin((position - active) * Math.PI) * 0.14, emphasis: 1 }
  }

  const local = clamp01(p * (Math.max(1, wordCount) + 0.5) - index)
  if (animation === 'wordRise') {
    const eased = easeOut(local)
    return { opacity: eased, scale: 1, offsetY: (1 - eased) * 22, emphasis: 0 }
  }

  const scale = local < 0.7
    ? 0.72 + easeOut(local / 0.7) * 0.4
    : 1.12 - easeOut((local - 0.7) / 0.3) * 0.12
  return { opacity: easeOut(local), scale, offsetY: (1 - easeOut(local)) * 10, emphasis: local > 0 && local < 1 ? 1 : 0 }
}
