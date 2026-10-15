// Shared hex color helpers.

/**
 * Parse `#rgb`, `#rrggbb` or `#rrggbbaa` (the `#` is optional and an alpha pair
 * is ignored) into `[r, g, b]`. Returns null for anything that isn't hex.
 */
export function parseHex(color: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(color.trim())
  if (!m) return null
  const h = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1].slice(0, 6)
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

/** `rgba(...)` of a hex color at `alpha` (clamped to 0–1); non-hex colors are returned unchanged. */
export function colorWithAlpha(color: string, alpha: number): string {
  const rgb = parseHex(color)
  return rgb ? `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${Math.max(0, Math.min(1, alpha))})` : color
}

/** Lighten (`pct` > 0) or darken (`pct` < 0) a hex color by a fraction; non-hex colors are returned unchanged. */
export function adjustHex(color: string, pct: number): string {
  const rgb = parseHex(color)
  if (!rgb) return color
  return '#' + rgb.map(v => {
    const out = pct > 0 ? v + (255 - v) * pct : v * (1 + pct)
    return Math.round(Math.max(0, Math.min(255, out))).toString(16).padStart(2, '0')
  }).join('')
}
