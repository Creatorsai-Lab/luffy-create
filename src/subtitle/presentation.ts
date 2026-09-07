import type { SubtitleAnimationType, SubtitleCaptionLook } from '../types/editor'

export interface SubtitleLine {
  text: string
}

export interface SubtitleMotionState {
  opacity: number
  scale: number
  offsetY: number
  emphasis?: number
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0))
const easeOut = (value: number) => 1 - Math.pow(1 - clamp01(value), 3)

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

export function getSubtitleCurveOffset(
  look: SubtitleCaptionLook = 'normal',
  intensity = 50,
  index: number,
  wordCount: number,
  fontSize: number,
) {
  const strength = clamp01(intensity / 100)
  if (look === 'normal' || wordCount < 3 || strength === 0) return 0
  const x = index / (wordCount - 1) * 2 - 1
  const curve = (1 - x * x) * strength * fontSize * 0.28
  return look === 'curveOut' ? -curve : curve
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
