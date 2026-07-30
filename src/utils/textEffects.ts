import type { TextEffectType } from '../types/editor'

export const TEXT_EFFECT_OPTIONS = [
  { label: 'Glow', value: 'glow', description: 'Glowing outline' },
  { label: 'Hollow', value: 'hollow', description: 'Hollow text' },
] as const satisfies readonly { label: string; value: TextEffectType; description: string }[]

const SUPPORTED = new Set<TextEffectType>(TEXT_EFFECT_OPTIONS.map(option => option.value))

export function normalizeTextEffects(values: readonly unknown[] = []): TextEffectType[] {
  return [...new Set(values.filter((value): value is TextEffectType =>
    typeof value === 'string' && SUPPORTED.has(value as TextEffectType),
  ))]
}

interface TextEffectSource {
  effects?: readonly unknown[]
  shadowColor: string
  shadowBlur: number
  shadowOffsetX: number
  shadowOffsetY: number
  textStroke: string
  textStrokeWidth: number
}

export function resolveTextEffectProps(el: TextEffectSource, effectiveColor: string) {
  const effects = normalizeTextEffects(el.effects)
  let shadowEnabled = el.shadowBlur > 0
  let shadowColor = el.shadowColor || 'rgba(0,0,0,0.5)'
  let shadowBlur = el.shadowBlur
  let shadowOffsetX = el.shadowOffsetX
  let shadowOffsetY = el.shadowOffsetY
  let stroke = el.textStroke || undefined
  let strokeWidth = el.textStrokeWidth || 0
  let strokeEnabled = !!(el.textStroke && el.textStrokeWidth > 0)
  let fillEnabled = true

  if (effects.includes('glow')) {
    shadowEnabled = true
    shadowColor = effectiveColor
    shadowBlur = 22
    shadowOffsetX = 0
    shadowOffsetY = 0
  }
  if (effects.includes('hollow')) {
    fillEnabled = false
    stroke = stroke || effectiveColor
    strokeWidth = Math.max(strokeWidth, 2)
    strokeEnabled = true
  }

  return {
    shadowEnabled, shadowColor, shadowBlur, shadowOffsetX, shadowOffsetY,
    stroke, strokeWidth, strokeEnabled, fillEnabled,
  }
}
