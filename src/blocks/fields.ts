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
      quote?: 'primary' | 'secondary'
      /** Keep line breaks and indentation (code, one LaTeX line per row). */
      keepLines?: boolean
      maxChars?: number
      /** Shown in a monospace box. */
      code?: boolean }
  | { type: 'number'; min: number; max: number; step?: number; unit?: string }
  | { type: 'color' }
  | { type: 'select'; options: Array<{ value: string; label: string; words?: string[] }> }
  | { type: 'toggle' }
  /** A list of numbers (layer sizes) or short texts (step names). Typed as text, split on `joiner`-like separators. */
  | { type: 'list'; of: 'number' | 'text'; min?: number; max?: number; minItems?: number; maxItems?: number; maxChars?: number
      placeholder?: string
      /** How the panel joins the items for editing (", " for numbers, " → " for steps, "\n" for one per line). */
      joiner?: string
      /** Split typed text on new lines only (LaTeX and code use commas, "|" and arrows themselves). */
      splitOn?: 'lines' }
)

export type FieldValues = Record<string, unknown>

/** Splits typed text into list items: numbers on anything that isn't part of a number; texts on new lines, ";", arrows or "|" (commas only when nothing else separates them). */
export function splitList(value: string, of: 'number' | 'text', splitOn?: 'lines'): string[] {
  if (of === 'number') return value.split(/[^\d.]+/).filter(Boolean)
  if (splitOn === 'lines') return value.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
  const strong = /\s*(?:\r?\n|;|→|->|=>|\|)\s*/
  return (strong.test(value) ? value.split(strong) : value.split(/\s*,\s*/)).map(s => s.trim()).filter(Boolean)
}

/** Fills defaults and coerces every value to its field's type and range. */
export function normalizeFields<P extends FieldValues>(fields: BlockField[], defaults: P, input: FieldValues): P {
  const out: FieldValues = { ...defaults }
  for (const field of fields) {
    const value = input[field.key]
    if (value === undefined || value === null) continue
    switch (field.type) {
      case 'text': {
        if (field.keepLines) {
          // Line breaks and indentation matter (code); trailing spaces and blank edges don't.
          const lines = String(value).replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n').map(line => line.trimEnd())
          while (lines.length && !lines[0].trim()) lines.shift()
          while (lines.length && !lines[lines.length - 1].trim()) lines.pop()
          out[field.key] = lines.join('\n').slice(0, field.maxChars ?? 4000)
          break
        }
        let text = String(value).replace(/\s+/g, ' ').trim()
        if (field.maxWords) text = text.split(' ').filter(Boolean).slice(0, field.maxWords).join(' ')
        out[field.key] = text.slice(0, field.maxChars ?? 400)
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
      case 'list': {
        const raw = Array.isArray(value) ? value : splitList(String(value), field.of, field.splitOn)
        const items = field.of === 'number'
          ? raw.map(Number).filter(Number.isFinite).map(n => Math.round(Math.min(field.max ?? Infinity, Math.max(field.min ?? -Infinity, n))))
          : raw.map(item => String(item).replace(/\s+/g, ' ').trim().slice(0, field.maxChars ?? 80)).filter(Boolean)
        const limited = items.slice(0, field.maxItems ?? 50)
        // Too few items (e.g. a network with one layer) keeps what was there.
        if (limited.length >= (field.minItems ?? 0)) out[field.key] = limited
        break
      }
    }
  }
  return out as P
}
