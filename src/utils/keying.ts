/**
 * Green screen / background removal settings (MediaKeying): defaults, and
 * cleaning values that come from prompts or old projects. Pure.
 */
import type { MediaKeying } from '../types/editor'

export const KEYING_DEFAULTS = {
  color: '#00b140',
  strength: 0.4,
  softness: 0.1,
  spill: 0.3,
  feather: 0.3,
  backgroundColor: '#101014',
  backgroundBlur: 0.5,
}

const unit = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback

const hex = (value: unknown, fallback: string) =>
  typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim().toLowerCase() : fallback

/** A valid keying, or undefined when the mode is unknown. Missing numbers get their defaults. */
export function normalizeKeying(value: Record<string, unknown>): MediaKeying | undefined {
  if (value.mode === 'chroma') {
    return {
      mode: 'chroma',
      color: hex(value.color, KEYING_DEFAULTS.color),
      strength: unit(value.strength, KEYING_DEFAULTS.strength),
      softness: unit(value.softness, KEYING_DEFAULTS.softness),
      spill: unit(value.spill, KEYING_DEFAULTS.spill),
    }
  }
  if (value.mode === 'person') {
    const background = value.background === 'blur' || value.background === 'color' ? value.background : 'none'
    return {
      mode: 'person',
      feather: unit(value.feather, KEYING_DEFAULTS.feather),
      background,
      ...(background === 'color' && { backgroundColor: hex(value.backgroundColor, KEYING_DEFAULTS.backgroundColor) }),
      ...(background === 'blur' && { backgroundBlur: unit(value.backgroundBlur, KEYING_DEFAULTS.backgroundBlur) }),
    }
  }
  return undefined
}

/** Hex colour → [r, g, b] in 0–1. */
export function hexToRgb(color: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color.trim())
  if (!m) return [0, 0.69, 0.25]
  return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255]
}

/**
 * The screen colour of a green/blue-screen frame, from its border pixels
 * (RGBA bytes of a small `width` × `height` copy): the average of the
 * strongly coloured border pixels whose hue is the most common one. Null
 * when the border has no clear screen colour.
 */
export function detectScreenColor(data: Uint8ClampedArray, width: number, height: number): string | null {
  const ring = Math.max(1, Math.round(Math.min(width, height) * 0.1))
  const buckets = new Map<number, { r: number; g: number; b: number; n: number }>()
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x >= ring && x < width - ring && y >= ring && y < height - ring) continue
      const i = (y * width + x) * 4
      const r = data[i], g = data[i + 1], b = data[i + 2]
      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)
      // Screens are saturated, and greens/blues dominate.
      if (max - min < 50 || max < 60 || (max !== g && max !== b)) continue
      const hue = rgbHue(r, g, b)
      const key = Math.round(hue / 20)
      const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 }
      bucket.r += r; bucket.g += g; bucket.b += b; bucket.n++
      buckets.set(key, bucket)
    }
  }
  const borderPixels = width * height - Math.max(0, width - 2 * ring) * Math.max(0, height - 2 * ring)
  const best = [...buckets.values()].sort((a, b) => b.n - a.n)[0]
  if (!best || best.n < borderPixels * 0.25) return null
  const to = (v: number) => Math.round(v / best.n).toString(16).padStart(2, '0')
  return `#${to(best.r)}${to(best.g)}${to(best.b)}`
}

function rgbHue(r: number, g: number, b: number) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min || 1
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return (h * 60 + 360) % 360
}
