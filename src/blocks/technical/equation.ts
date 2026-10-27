/**
 * Equation reveal: a derivation shown one step at a time — each step a LaTeX
 * line, stacked under the last or replacing it in place — with a soft marker
 * on the newest step. Steps are drawn at their natural size (never stretched).
 */
import type { EditorElement } from '../../types/editor'
import { normalizeFields, type BlockField } from '../fields'
import { unit } from '../layout'
import type { SmartBlock } from '../registry'
import { anim, FONT_OPTIONS, text } from '../ugc/shared'
import { clamp, latex, shape } from './shared'

const FIELDS: BlockField[] = [
  { key: 'steps', label: 'Steps (LaTeX, one per line)', type: 'list', of: 'text', minItems: 1, maxItems: 8, maxChars: 240, joiner: '\n', splitOn: 'lines',
    placeholder: '(a+b)^2 = (a+b)(a+b)', words: ['steps', 'lines', 'derivation'] },
  { key: 'title', label: 'Title (optional)', type: 'text', maxWords: 10, placeholder: 'Expanding a square', words: ['title', 'titled', 'heading', 'called'] },
  { key: 'mode', label: 'Layout', type: 'select', options: [
    { value: 'stack', label: 'Stack', words: ['stack', 'stacked', 'one under another', 'derivation'] },
    { value: 'replace', label: 'Replace', words: ['replace', 'in place', 'one at a time', 'transform'] },
  ] },
  { key: 'align', label: 'Align', type: 'select', options: [
    { value: 'center', label: 'Centre', words: ['centered', 'centred', 'center aligned'] },
    { value: 'left', label: 'Left', words: ['left aligned', 'align left'] },
  ] },
  { key: 'reveal', label: 'Reveal', type: 'select', options: [
    { value: 'fade', label: 'Fade', words: ['fade'] },
    { value: 'wipe', label: 'Write on', words: ['wipe', 'write on', 'write', 'handwriting'] },
    { value: 'rise', label: 'Rise', words: ['rise', 'slide up'] },
  ] },
  { key: 'marker', label: 'Mark the newest step', type: 'toggle', words: ['marker', 'highlight the step', 'highlight newest'] },
  { key: 'color', label: 'Equation colour', type: 'color', words: ['equation colour', 'equation color', 'text color', 'colour', 'color'] },
  { key: 'accent', label: 'Marker colour', type: 'color', words: ['marker colour', 'marker color', 'highlight colour', 'highlight color', 'accent'] },
  { key: 'font', label: 'Title font', type: 'select', options: FONT_OPTIONS },
  { key: 'fontSize', label: 'Size', type: 'number', min: 20, max: 120, step: 2, words: ['font size', 'size'] },
  { key: 'stepTime', label: 'Time per step (s)', type: 'number', min: 0.4, max: 10, step: 0.1, words: ['per step', 'step time', 'between steps'] },
  { key: 'startAt', label: 'Starts at (s)', type: 'number', min: 0, max: 600, step: 0.1, words: ['starting at', 'start at'] },
]

const DEFAULTS = {
  steps: ['(a+b)^2 = (a+b)(a+b)', '= a^2 + ab + ba + b^2', '= a^2 + 2ab + b^2'] as string[],
  title: '', mode: 'stack', align: 'center', reveal: 'fade', marker: true,
  color: '#f8fafc', accent: '#38bdf8', font: 'Inter', fontSize: 56, stepTime: 1.6, startAt: 0.3,
}
type Params = typeof DEFAULTS

export const equationReveal: SmartBlock<Params> = {
  id: 'equationReveal',
  title: 'Equation reveal',
  description: 'A derivation shown step by step: each step a LaTeX line, stacked or replacing the last, with the newest step marked.',
  category: 'technical',
  command: 'equation',
  phrases: /\bequation (?:reveal|steps?|derivation|walk-?through)\b|\bderivations?\b|\bstep[\s-]by[\s-]step (?:equation|math|proof|derivation|solution)\b|\b(?:math|maths) (?:steps|walk-?through|derivation)\b/,
  refers: /\b(?:the|this|that)\s+(?:equation|derivation|proof|math|maths)\b/,
  fields: FIELDS,
  defaults: DEFAULTS,
  normalize: p => normalizeFields(FIELDS, DEFAULTS, p),
  parse: (input, current) => parseEquation(input.text, input.quotes, current),
  build(p, frame) {
    const W = frame.width
    const H = frame.height
    const u = unit(frame)
    const n = p.steps.length
    const titleSize = p.title ? Math.round(clamp(40 * u, 16, 64)) : 0
    const areaW = W * 0.86
    const areaH = H * 0.74 - (p.title ? titleSize * 2 : 0)
    // Rows tall enough for fractions; smaller steps when many don't fit.
    let fontSize = p.fontSize * u
    const rowsShown = p.mode === 'stack' ? n : 1
    fontSize = Math.max(16, Math.min(fontSize, areaH / (rowsShown * 2.3)))
    const rowH = fontSize * 2.3
    const blockH = rowsShown * rowH + (p.title ? titleSize * 2 : 0)
    const top = (H - blockH) / 2
    const x = (W - areaW) / 2
    const firstRowY = top + (p.title ? titleSize * 2 : 0)
    const times = p.steps.map((_, i) => p.startAt + (p.title ? 0.5 : 0) + i * p.stepTime)
    const reveal = (delay: number) => p.reveal === 'wipe'
      ? anim('wipeIn', delay, Math.min(1, p.stepTime * 0.6), { params: { direction: 'right' }, easing: 'easeInOut' })
      : p.reveal === 'rise'
        ? anim('slideIn', delay, 0.5, { params: { direction: 'up', distance: Math.round(fontSize * 0.6) } })
        : anim('fadeIn', delay, 0.5)
    const out: EditorElement[] = []

    if (p.title) {
      const t = text('title', p.title, { x, y: top, width: areaW, height: titleSize * 1.3, fontSize: titleSize, fontFamily: p.font,
        weight: 'bold', color: p.color, align: p.align === 'left' ? 'left' : 'center' })
      t.animations = [anim('fadeIn', p.startAt, 0.5)]
      out.push(t)
    }

    p.steps.forEach((source, i) => {
      const y = firstRowY + (p.mode === 'stack' ? i : 0) * rowH
      const next = times[i + 1]
      if (p.marker) {
        const pad = fontSize * 0.35
        const mark = shape(`mark-${i}`, 'rect', { x: x - pad, y: y + rowH * 0.06, width: areaW + pad * 2, height: rowH * 0.88, fill: p.accent, radius: fontSize * 0.3, opacity: 0.14 })
        // The newest step is marked until the next one arrives; the last stays marked.
        mark.animations = [anim('fadeIn', times[i], 0.3), ...(next != null ? [anim('fadeOut', next, 0.3)] : [])]
        out.push(mark)
      }
      const step = latex(`step-${i}`, source, { x, y, width: areaW, height: rowH, color: p.color, fontSize: Math.round(fontSize), align: p.align === 'left' ? 'left' : 'center' })
      step.animations = [reveal(times[i]), ...(p.mode === 'replace' && next != null ? [anim('fadeOut', next - 0.05, 0.3)] : [])]
      out.push(step)
    })
    return out
  },
}

/** Equation phrasing: quotes are steps; "add a step '…'", "remove the last step". */
export function parseEquation(text: string, quotes: string[], current: Params | null): Partial<Params> {
  const titleQuote = text.match(/\b(?:title|heading|called|titled)\s+⟦(\d+)⟧/)?.[1]
  const latexQuotes = quotes.filter((_, i) => String(i) !== titleQuote)
  if (!current) return latexQuotes.length ? { steps: latexQuotes.map(q => q.trim()).filter(Boolean) } : {}
  const steps = current.steps.slice()
  const add = text.match(/\b(?:add|append)\s+(?:a\s+|another\s+|one more\s+)?(?:step|line)\s+⟦(\d+)⟧/)
  if (add) return { steps: [...steps, quotes[Number(add[1])].trim()] }
  if (/\b(?:remove|delete|drop)\s+the\s+last\s+(?:step|line)\b/.test(text) && steps.length > 1) return { steps: steps.slice(0, -1) }
  const remove = text.match(/\b(?:remove|delete|drop)\s+(?:step|line)\s+(\d+)\b/)
  if (remove && steps.length > 1) {
    steps.splice(Number(remove[1]) - 1, 1)
    return { steps }
  }
  return {}
}
