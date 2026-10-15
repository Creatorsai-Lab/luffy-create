/** Colour words the parser understands. The first block keeps the editor's existing palette. */
const NAMED: Record<string, string> = {
  black: '#111111',
  white: '#ffffff',
  red: '#ef4444',
  green: '#22c55e',
  blue: '#3b82f6',
  yellow: '#f59e0b',
  purple: '#8b5cf6',
  pink: '#ec4899',
  orange: '#f97316',
  gray: '#6b7280',
  grey: '#6b7280',
  brown: '#92400e',
  navy: '#1e3a8a',
  teal: '#14b8a6',
  cyan: '#06b6d4',
  magenta: '#d946ef',
  violet: '#7c3aed',
  indigo: '#4f46e5',
  lime: '#84cc16',
  gold: '#eab308',
  silver: '#c0c0c0',
  maroon: '#7f1d1d',
  olive: '#4d7c0f',
  beige: '#f5f5dc',
  cream: '#fffdd0',
  coral: '#ff7f50',
  salmon: '#fa8072',
  turquoise: '#2dd4bf',
  crimson: '#dc143c',
  lavender: '#c4b5fd',
  mint: '#6ee7b7',
  'sky blue': '#38bdf8',
}

// Longest first so "sky blue" wins over "blue".
const NAMES = Object.keys(NAMED).sort((a, b) => b.length - a.length)
const COLOR_RE = new RegExp(
  `#[0-9a-f]{3}(?:[0-9a-f]{3})?(?:[0-9a-f]{2})?\\b|\\b(?:(dark|deep|light|pale|bright)\\s+)?(${NAMES.join('|')})\\b`,
  'gi'
)

export interface ColorMatch {
  hex: string
  /** Base colour word ("blue" for "dark blue"); undefined for hex input. */
  name?: string
  index: number
  end: number
}

/** All colours mentioned in `text`, in order. Matches whole words only ("centered" is not red). */
export function readColors(text: string): ColorMatch[] {
  const out: ColorMatch[] = []
  for (const match of text.matchAll(COLOR_RE)) {
    const index = match.index ?? 0
    const end = index + match[0].length
    if (match[0].startsWith('#')) {
      out.push({ hex: match[0].toLowerCase(), index, end })
      continue
    }
    const name = match[2].toLowerCase()
    const shade = match[1]?.toLowerCase()
    const base = NAMED[name]
    const hex = shade === 'dark' || shade === 'deep' ? mix(base, '#000000', 0.4)
      : shade === 'light' || shade === 'pale' ? mix(base, '#ffffff', 0.45)
      : base
    out.push({ hex, name: name === 'grey' ? 'gray' : name, index, end })
  }
  return out
}

/** A hex colour, or a colour word turned into hex. */
export function normalizeColorValue(value?: string): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  if (/^#[0-9a-f]{3}([0-9a-f]{3})?([0-9a-f]{2})?$/i.test(trimmed)) return trimmed
  const match = readColors(trimmed.toLowerCase())[0]
  return match && match.end - match.index === trimmed.length ? match.hex : undefined
}

/** The palette word closest to `hex`, used to match "the red circle" against element colours. */
export function nearestColorName(hex?: string): string | null {
  const rgb = hex ? toRgb(hex) : null
  if (!rgb) return null
  let best: string | null = null
  let bestDistance = Infinity
  for (const [name, value] of Object.entries(NAMED)) {
    if (name === 'grey') continue
    const other = toRgb(value)!
    const distance = (rgb[0] - other[0]) ** 2 + (rgb[1] - other[1]) ** 2 + (rgb[2] - other[2]) ** 2
    if (distance < bestDistance) {
      bestDistance = distance
      best = name
    }
  }
  return best
}

function toRgb(hex: string): [number, number, number] | null {
  let value = hex.trim().replace(/^#/, '')
  if (value.length === 3 || value.length === 4) value = value.slice(0, 3).split('').map(c => c + c).join('')
  if (value.length !== 6 && value.length !== 8) return null
  const n = Number.parseInt(value.slice(0, 6), 16)
  return Number.isNaN(n) ? null : [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function mix(a: string, b: string, amount: number) {
  const x = toRgb(a)!
  const y = toRgb(b)!
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * amount).toString(16).padStart(2, '0')).join('')
}
