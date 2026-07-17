import type { FontWeight } from '../types/editor'

export type LegacyFontWeight = FontWeight | 'medium' | string | undefined

export const FONT_WEIGHT_OPTIONS: { label: string; value: FontWeight }[] = [
  { label: 'Thin', value: 'thin' },
  { label: 'Normal', value: 'normal' },
  { label: 'Semibold', value: 'semibold' },
  { label: 'Bold', value: 'bold' },
]

export function normalizeFontWeightForControl(weight: LegacyFontWeight): FontWeight {
  if (weight === 'thin' || weight === 'semibold' || weight === 'bold') return weight
  return 'normal'
}

export function fontWeightToCssValue(weight: LegacyFontWeight): string {
  if (weight === 'thin') return '100'
  if (weight === 'medium') return '500'
  if (weight === 'semibold') return '600'
  if (weight === 'bold') return '700'
  return '400'
}

export function fontWeightToKonvaStyle(weight: LegacyFontWeight): string {
  if (weight === 'bold') return 'bold'
  return fontWeightToCssValue(weight)
}
