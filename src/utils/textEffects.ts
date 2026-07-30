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
