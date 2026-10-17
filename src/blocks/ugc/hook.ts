/**
 * Hook / CTA: short punchy on-screen text, word by word, with chosen words
 * highlighted — "Stop scrolling, this changes EVERYTHING", "Follow for part 2".
 */
import type { EditorElement } from '../../types/editor'
import { normalizeFields, type BlockField } from '../fields'
import { isPortrait, textWidth, unit, wrapWords } from '../layout'
import type { SmartBlock } from '../registry'
import { anim, FONT_OPTIONS, rect, text } from './shared'

const FIELDS: BlockField[] = [
  { key: 'text', label: 'Text', type: 'text', maxWords: 24, multiline: true, quote: 'primary' },
  { key: 'emphasis', label: 'Highlight words (comma separated)', type: 'text', maxWords: 8, quote: 'secondary', words: ['highlight', 'highlighting', 'highlighted', 'emphasis', 'emphasise', 'emphasize', 'emphasising', 'emphasizing'] },
  { key: 'position', label: 'Position', type: 'select', options: [
    { value: 'top', label: 'Top', words: ['top', 'upper'] },
    { value: 'center', label: 'Centre', words: ['center', 'centre', 'middle'] },
    { value: 'bottom', label: 'Bottom', words: ['bottom', 'lower'] },
  ] },
  { key: 'style', label: 'Style', type: 'select', options: [
    { value: 'pill', label: 'Box behind', words: ['pill', 'box', 'boxed', 'background'] },
    { value: 'outline', label: 'Outlined', words: ['outline', 'outlined', 'stroke'] },
    { value: 'plain', label: 'Plain', words: ['plain', 'simple'] },
  ] },
  { key: 'textColor', label: 'Text colour', type: 'color', words: ['text colour', 'text color'] },
  { key: 'highlightColor', label: 'Highlight colour', type: 'color', words: ['highlight colour', 'highlight color', 'accent'] },
  { key: 'boxColor', label: 'Box colour', type: 'color', words: ['box colour', 'box color', 'background colour', 'background color'] },
  { key: 'font', label: 'Font', type: 'select', options: FONT_OPTIONS },
  { key: 'size', label: 'Size', type: 'number', min: 50, max: 200, step: 5, unit: '%', words: ['size', 'scale'] },
  { key: 'animation', label: 'Entrance', type: 'select', options: [
    { value: 'wordPop', label: 'Word by word', words: ['word by word', 'pop', 'one by one'] },
    { value: 'fade', label: 'Fade', words: ['fade'] },
    { value: 'none', label: 'None', words: ['no animation', 'static'] },
  ] },
  { key: 'wordStep', label: 'Time between words (s)', type: 'number', min: 0.03, max: 1, step: 0.01, words: ['between words', 'word step'] },
  { key: 'startAt', label: 'Starts at (s)', type: 'number', min: 0, max: 600, step: 0.1, words: ['starting at', 'start at', 'at'] },
]

const DEFAULTS = {
  text: 'Stop scrolling — this changes everything', emphasis: 'everything', position: 'top', style: 'pill',
  textColor: '#ffffff', highlightColor: '#facc15', boxColor: '#000000', font: 'Montserrat', size: 100,
  animation: 'wordPop', wordStep: 0.12, startAt: 0,
}
type Params = typeof DEFAULTS

const bare = (word: string) => word.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '')

export const hook: SmartBlock<Params> = {
  id: 'hook',
  title: 'Hook / CTA',
  description: 'Bold on-screen text that pops in word by word, with highlighted words — an opening hook or a call to action.',
  category: 'ugc',
  command: 'hook',
  phrases: /\bhooks?\b|\bcta\b|\bcall to action\b|\bcallouts?\b|\bpunch ?line\b/,
  fields: FIELDS,
  defaults: DEFAULTS,
  normalize: p => normalizeFields(FIELDS, DEFAULTS, p),
  build(p, frame) {
    const { width: W, height: H } = frame
    const u = unit(frame) * (p.size / 100)
    const size = Math.round(84 * u)
    const lineH = size * 1.3
    const space = size * 0.28
    const padX = 22 * u
    const maxW = W * 0.84
    const measure = (s: string) => textWidth(s, size, p.font, 'bold') * 1.06
    const words = p.text.split(/\s+/).filter(Boolean)
    const lines = wrapWords(words, maxW, measure)
    const emphasis = new Set(p.emphasis.split(/[,\s]+/).map(bare).filter(Boolean))
    const blockH = lines.length * lineH
    const top = p.position === 'center' ? H / 2 - blockH / 2
      : p.position === 'bottom' ? H * (isPortrait(frame) ? 0.72 : 0.78) - blockH
      : H * (isPortrait(frame) ? 0.14 : 0.1)
    const out: EditorElement[] = []
    let index = 0

    lines.forEach((line, row) => {
      const widths = line.map(w => measure(w) + 4)
      const lineW = widths.reduce((sum, w) => sum + w, 0) + space * (line.length - 1)
      let x = W / 2 - lineW / 2
      const y = top + row * lineH
      const firstWord = index
      if (p.style === 'pill') {
        const box = rect(`box-${row}`, { x: x - padX, y: y - size * 0.08, width: lineW + padX * 2, height: lineH * 0.98, fill: p.boxColor, radius: 14 * u, opacity: 0.82 })
        if (p.animation !== 'none') box.animations = [anim('fadeIn', p.startAt + firstWord * (p.animation === 'wordPop' ? p.wordStep : 0), 0.2)]
        out.push(box)
      }
      line.forEach((word, i) => {
        const highlighted = emphasis.has(bare(word))
        const el = text(`word-${index}`, word, {
          x, y: y + (lineH - size * 1.2) / 2, width: widths[i], height: size * 1.2, fontSize: size, fontFamily: p.font,
          color: highlighted ? p.highlightColor : p.textColor, align: 'left', lineHeight: 1.2,
        })
        if (p.style === 'outline') Object.assign(el, { textStroke: '#000000', textStrokeWidth: Math.max(2, Math.round(6 * u)) })
        if (p.style === 'plain') Object.assign(el, { shadowColor: '#000000', shadowBlur: 12 * u, shadowOffsetY: 3 * u })
        if (p.animation === 'wordPop') el.animations = [anim('scaleIn', p.startAt + index * p.wordStep, 0.25, { easing: 'bounce' })]
        else if (p.animation === 'fade') el.animations = [anim('fadeIn', p.startAt, 0.5)]
        out.push(el)
        x += widths[i] + space
        index++
      })
    })
    return out
  },
}
