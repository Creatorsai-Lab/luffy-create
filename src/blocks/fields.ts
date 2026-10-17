/**
 * Block settings are declared once as fields. The same list drives input
 * clean-up (`normalizeFields` — never trusts AI output), the settings panel
 * (BlocksPanel), and how the AI parser edits a block (`words`).
 */

interface FieldBase {
  key: string
  label: string
  /** Extra words people use for this setting ("accent" → "highlight colour"). */
  words?: string[]
}

export type BlockField = FieldBase & (
  | { type: 'text'; maxWords?: number; multiline?: boolean; placeholder?: string
      /** The text a new block takes from the first quoted string ('primary') or the second ('secondary'). */
      quote?: 'primary' | 'secondary' }
  | { type: 'number'; min: number; max: number; step?: number; unit?: string }
  | { type: 'color' }
  | { type: 'select'; options: Array<{ value: string; label: string; words?: string[] }> }
  | { type: 'toggle' }
)

export type FieldValues = Record<string, unknown>

/** Fills defaults and coerces every value to its field's type and range. */
export function normalizeFields<P extends FieldValues>(fields: BlockField[], defaults: P, input: FieldValues): P {
  const out: FieldValues = { ...defaults }
  for (const field of fields) {
    const value = input[field.key]
    if (value === undefined || value === null) continue
    switch (field.type) {
      case 'text': {
        let text = String(value).replace(/\s+/g, field.multiline ? ' ' : ' ').trim()
        if (field.maxWords) text = text.split(' ').filter(Boolean).slice(0, field.maxWords).join(' ')
        out[field.key] = text.slice(0, 400)
        break
      }
      case 'number': {
        const n = Number(value)
        if (!Number.isFinite(n)) break
        const step = field.step ?? 1
        out[field.key] = Math.min(field.max, Math.max(field.min, Math.round(n / step) * step))
        break
      }
      case 'color':
        if (typeof value === 'string' && /^#[0-9a-f]{3}([0-9a-f]{3})?([0-9a-f]{2})?$/i.test(value.trim())) out[field.key] = value.trim()
        break
      case 'select':
        if (field.options.some(o => o.value === value)) out[field.key] = value
        break
      case 'toggle':
        out[field.key] = value === true || value === 'true' || value === 1
        break
    }
  }
  return out as P
}
