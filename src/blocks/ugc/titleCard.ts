/**
 * Title card / chapter break: a big title with an optional subtitle, accent
 * line and background, animated in (and optionally out).
 */
import type { EditorElement } from '../../types/editor'
import { normalizeFields, type BlockField } from '../fields'
import { textWidth, unit, wrapWords } from '../layout'
import type { SmartBlock } from '../registry'
import { anim, entrance, FONT_OPTIONS, rect, text } from './shared'

const FIELDS: BlockField[] = [
  { key: 'title', label: 'Title', type: 'text', maxWords: 12, quote: 'primary', words: ['heading', 'headline'] },
  { key: 'subtitle', label: 'Subtitle', type: 'text', maxWords: 20, quote: 'secondary', words: ['subheading', 'tagline'] },
  { key: 'style', label: 'Style', type: 'select', options: [
    { value: 'centered', label: 'Centred', words: ['centered', 'centred', 'center', 'middle'] },
    { value: 'leftBar', label: 'Left bar', words: ['left'] },
    { value: 'boxed', label: 'Boxed', words: ['boxed', 'box', 'highlighted'] },
  ] },
  { key: 'accent', label: 'Accent colour', type: 'color', words: ['accent', 'highlight', 'bar', 'line'] },
  { key: 'textColor', label: 'Text colour', type: 'color', words: ['text', 'font colour', 'font color'] },
  { key: 'background', label: 'Background', type: 'select', options: [
    { value: 'none', label: 'None', words: ['no background', 'transparent'] },
    { value: 'dim', label: 'Dim the scene', words: ['dim', 'darken', 'dark overlay'] },
    { value: 'solid', label: 'Solid colour', words: ['solid'] },
  ] },
  { key: 'bgColor', label: 'Background colour', type: 'color', words: ['background colour', 'background color'] },
  { key: 'font', label: 'Font', type: 'select', options: FONT_OPTIONS },
  { key: 'size', label: 'Size', type: 'number', min: 50, max: 200, step: 5, unit: '%', words: ['size', 'scale'] },
  { key: 'animation', label: 'Entrance', type: 'select', options: [
    { value: 'rise', label: 'Rise', words: ['rise', 'slide up'] },
    { value: 'fade', label: 'Fade', words: ['fade'] },
    { value: 'pop', label: 'Pop', words: ['pop', 'bounce'] },
  ] },
  { key: 'holdFor', label: 'Leave after (s, 0 = stay)', type: 'number', min: 0, max: 60, step: 0.5, words: ['leave after', 'hide after', 'disappear after', 'exit after'] },
]

const DEFAULTS = {
  title: 'Chapter 1', subtitle: 'Getting started', style: 'centered', accent: '#8b5cf6', textColor: '#ffffff',
  background: 'dim', bgColor: '#0b0b12', font: 'Montserrat', size: 100, animation: 'rise', holdFor: 0,
}
type Params = typeof DEFAULTS

export const titleCard: SmartBlock<Params> = {
  id: 'titleCard',
  title: 'Title card',
  description: 'A big chapter or section title with an optional subtitle — use between segments or at the start.',
  category: 'ugc',
  phrases: /\b(?:title|chapter|section|intro) (?:card|screen|slide|break)\b|\bchapter break\b/,
  fields: FIELDS,
  defaults: DEFAULTS,
  normalize: p => normalizeFields(FIELDS, DEFAULTS, p),
  build(p, frame) {
    const { width: W, height: H } = frame
    const u = unit(frame) * (p.size / 100)
    const titleSize = Math.round(96 * u)
    const subSize = Math.round(42 * u)
    const left = p.style === 'leftBar'
    const maxW = W * (left ? 0.74 : 0.84)
    const measure = (size: number, weight: 'bold' | 'normal') => (s: string) => textWidth(s, size, p.font, weight)
    const titleLines = wrapWords(p.title.split(/\s+/).filter(Boolean), maxW, measure(titleSize, 'bold')).length || 1
    const subLines = p.subtitle ? wrapWords(p.subtitle.split(/\s+/).filter(Boolean), maxW, measure(subSize, 'normal')).length : 0
    const titleH = titleLines * titleSize * 1.15
    const subH = subLines * subSize * 1.3
    const gap = 26 * u
    const barGap = 30 * u
    const total = titleH + (subLines ? gap + subH : 0) + (p.style === 'centered' ? barGap + 8 * u : 0)
    const top = H / 2 - total / 2
    const x = left ? W * 0.13 : W * 0.08
    const align = left ? 'left' as const : 'center' as const
    const out: EditorElement[] = []
    const hold = p.holdFor > 0 ? p.holdFor : 0

    if (p.background !== 'none') {
      out.push(rect('background', { x: 0, y: 0, width: W, height: H, fill: p.background === 'solid' ? p.bgColor : '#000000', opacity: p.background === 'solid' ? 1 : 0.55 }))
    }

    const title = text('title', p.title, { x, y: top, width: maxW, height: titleH, fontSize: titleSize, fontFamily: p.font, color: p.textColor, align })
    if (p.style === 'boxed') Object.assign(title, { bgEnabled: true, bgColor: p.accent, bgOpacity: 1, bgPadX: 28 * u, bgPadY: 14 * u, bgRadius: 14 * u })
    title.animations = [entrance(p.animation, 0.1)]
    out.push(title)

    if (subLines) {
      const sub = text('subtitle', p.subtitle, { x, y: top + titleH + gap, width: maxW, height: subH, fontSize: subSize, fontFamily: p.font, weight: 'normal', color: p.textColor, align, lineHeight: 1.3 })
      sub.opacity = 0.85
      sub.animations = [entrance(p.animation, 0.35)]
      out.push(sub)
    }

    if (p.style === 'centered') {
      const barW = 140 * u
      const bar = rect('accent', { x: W / 2 - barW / 2, y: top + total - 8 * u, width: barW, height: 8 * u, fill: p.accent, radius: 4 * u })
      bar.animations = [anim('wipeIn', 0.55, 0.5, { params: { direction: 'right' } })]
      out.push(bar)
    } else if (left) {
      const bar = rect('accent', { x: W * 0.08, y: top, width: 12 * u, height: total, fill: p.accent, radius: 6 * u })
      bar.animations = [anim('wipeIn', 0, 0.45, { params: { direction: 'down' } })]
      out.push(bar)
    }

    if (hold) for (const el of out) el.animations = [...el.animations, anim('fadeOut', hold, 0.5)]
    return out
  },
}
