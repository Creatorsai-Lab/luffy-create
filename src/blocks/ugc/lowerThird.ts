/**
 * Lower third / name tag: who is speaking, with their role, sliding in near
 * the bottom and (optionally) leaving after a few seconds.
 */
import type { EditorElement } from '../../types/editor'
import { normalizeFields, type BlockField } from '../fields'
import { isPortrait, textWidth, unit } from '../layout'
import type { SmartBlock } from '../registry'
import { anim, FONT_OPTIONS, rect, text } from './shared'

const FIELDS: BlockField[] = [
  { key: 'name', label: 'Name', type: 'text', maxWords: 6, quote: 'primary' },
  { key: 'role', label: 'Role / subtitle', type: 'text', maxWords: 10, quote: 'secondary', words: ['role', 'title', 'job', 'subtitle', 'handle'] },
  { key: 'side', label: 'Side', type: 'select', options: [
    { value: 'left', label: 'Left', words: ['left'] },
    { value: 'center', label: 'Centre', words: ['center', 'centre', 'middle'] },
    { value: 'right', label: 'Right', words: ['right'] },
  ] },
  { key: 'style', label: 'Style', type: 'select', options: [
    { value: 'bar', label: 'Bar', words: ['bar', 'panel'] },
    { value: 'pill', label: 'Pill', words: ['pill', 'badge', 'rounded'] },
    { value: 'minimal', label: 'Minimal', words: ['minimal', 'clean', 'simple'] },
  ] },
  { key: 'accent', label: 'Accent colour', type: 'color', words: ['accent', 'highlight'] },
  { key: 'nameColor', label: 'Name colour', type: 'color', words: ['name colour', 'name color'] },
  { key: 'font', label: 'Font', type: 'select', options: FONT_OPTIONS },
  { key: 'size', label: 'Size', type: 'number', min: 50, max: 200, step: 5, unit: '%', words: ['size', 'scale'] },
  { key: 'showAt', label: 'Appears at (s)', type: 'number', min: 0, max: 600, step: 0.1, words: ['appear at', 'show at', 'starting at', 'at'] },
  { key: 'hideAfter', label: 'Leaves after (s, 0 = stay)', type: 'number', min: 0, max: 60, step: 0.5, words: ['hide after', 'leave after', 'disappear after', 'for'] },
]

const DEFAULTS = {
  name: 'Your Name', role: 'Creator', side: 'left', style: 'bar', accent: '#8b5cf6', nameColor: '#ffffff',
  font: 'Montserrat', size: 100, showAt: 0.5, hideAfter: 5,
}
type Params = typeof DEFAULTS

export const lowerThird: SmartBlock<Params> = {
  id: 'lowerThird',
  title: 'Lower third',
  description: 'A name tag near the bottom — the speaker\'s name and role, for interviews, podcasts and talking-head videos.',
  category: 'ugc',
  phrases: /\blower[\s-]?thirds?\b|\bname (?:tag|plate|card|label)\b|\bspeaker (?:tag|name|label)\b/,
  fields: FIELDS,
  defaults: DEFAULTS,
  normalize: p => normalizeFields(FIELDS, DEFAULTS, p),
  build(p, frame) {
    const { width: W, height: H } = frame
    const u = unit(frame) * (p.size / 100)
    const nameSize = Math.round(52 * u)
    const roleSize = Math.round(32 * u)
    const padX = 28 * u
    const padY = 20 * u
    const gap = 8 * u
    const nameW = textWidth(p.name, nameSize, p.font, 'bold') * 1.08 + 4
    const roleW = p.role ? textWidth(p.role, roleSize, p.font, 'normal') * 1.08 + 4 : 0
    const barW = p.style === 'bar' ? 10 * u : 0
    const innerW = Math.max(nameW, roleW)
    const boxW = innerW + padX * 2 + barW
    const nameH = nameSize * 1.2
    const roleH = p.role ? roleSize * 1.3 : 0
    const boxH = padY * 2 + nameH + (p.role ? gap + roleH : 0)
    // Clear of the caption/UI zone at the bottom of vertical video.
    const bottomMargin = H * (isPortrait(frame) ? 0.2 : 0.1)
    const sideMargin = W * 0.06
    const boxX = p.side === 'right' ? W - sideMargin - boxW : p.side === 'center' ? W / 2 - boxW / 2 : sideMargin
    const boxY = H - bottomMargin - boxH
    const textX = boxX + barW + padX
    const enterFrom = p.side === 'right' ? 'left' as const : 'right' as const // slide toward its side's opposite
    const t0 = p.showAt
    const out: EditorElement[] = []

    if (p.style !== 'minimal') {
      const panel = rect('panel', { x: boxX, y: boxY, width: boxW, height: boxH, fill: p.style === 'pill' ? p.accent : '#0b0b12', radius: p.style === 'pill' ? boxH / 2 : 10 * u, opacity: p.style === 'pill' ? 1 : 0.78 })
      panel.animations = [anim('wipeIn', t0, 0.45, { params: { direction: p.side === 'right' ? 'left' : 'right' } })]
      out.push(panel)
    }
    if (p.style === 'bar') {
      const bar = rect('accent', { x: boxX, y: boxY, width: barW, height: boxH, fill: p.accent, radius: 3 * u })
      bar.animations = [anim('wipeIn', t0, 0.3, { params: { direction: 'down' } })]
      out.push(bar)
    }
    const name = text('name', p.name, { x: textX, y: boxY + padY, width: innerW, height: nameH, fontSize: nameSize, fontFamily: p.font, color: p.nameColor })
    name.animations = [anim('slideIn', t0 + 0.15, 0.45, { params: { direction: enterFrom, distance: 40 * u } })]
    out.push(name)
    if (p.role) {
      const role = text('role', p.role, { x: textX, y: boxY + padY + nameH + gap, width: innerW, height: roleH, fontSize: roleSize, fontFamily: p.font, weight: 'normal', color: p.style === 'pill' ? '#ffffff' : '#d1d5db', lineHeight: 1.3 })
      role.animations = [anim('fadeIn', t0 + 0.35, 0.4)]
      out.push(role)
    }
    if (p.style === 'minimal') {
      const line = rect('accent', { x: textX, y: boxY + padY + nameH + gap / 2 - 2 * u, width: Math.min(innerW, 120 * u), height: 4 * u, fill: p.accent, radius: 2 * u })
      line.animations = [anim('wipeIn', t0 + 0.25, 0.4, { params: { direction: 'right' } })]
      out.push(line)
    }
    if (p.hideAfter > 0) for (const el of out) el.animations = [...el.animations, anim('fadeOut', t0 + p.hideAfter, 0.4)]
    return out
  },
}
