/**
 * Code walkthrough: a code block that explains itself — line ranges are
 * highlighted one after another, each with a short note beside (landscape) or
 * below (portrait) the code. Steps are typed as "1-3: Load the data".
 */
import type { CodeElement, EditorElement } from '../../types/editor'
import { LANGUAGES } from '../../types/editor'
import { codeBlockHeight, codeBlockWidth, codeLineHeight, codeLineTop } from '../../utils/codeLayout'
import { makeCode } from '../../utils/defaults'
import { normalizeFields, type BlockField } from '../fields'
import { isPortrait, textWidth, unit, wrapWords } from '../layout'
import type { SmartBlock } from '../registry'
import { anim, FONT_OPTIONS, text } from '../ugc/shared'
import { clamp, shape } from './shared'

const LANGUAGE_LABELS: Record<string, string> = { javascript: 'JavaScript', typescript: 'TypeScript', python: 'Python', rust: 'Rust', go: 'Go', java: 'Java', cpp: 'C++', c: 'C', bash: 'Bash', sql: 'SQL', json: 'JSON', yaml: 'YAML', html: 'HTML', css: 'CSS', markdown: 'Markdown' }

const FIELDS: BlockField[] = [
  { key: 'code', label: 'Code', type: 'text', keepLines: true, code: true, maxChars: 4000, words: ['code'] },
  { key: 'language', label: 'Language', type: 'select', options: LANGUAGES.map(l => ({ value: l, label: LANGUAGE_LABELS[l] ?? l, words: [l, (LANGUAGE_LABELS[l] ?? l).toLowerCase()] })) },
  { key: 'steps', label: 'Steps (lines: note, one per line)', type: 'text', keepLines: true, maxChars: 1500, placeholder: '1-3: Load the data\n5: Train', words: ['steps', 'notes'] },
  { key: 'title', label: 'Window title (optional)', type: 'text', maxWords: 6, placeholder: 'train.py', words: ['title', 'file name', 'filename'] },
  { key: 'notes', label: 'Notes', type: 'select', options: [
    { value: 'auto', label: 'Auto', words: ['auto notes'] },
    { value: 'right', label: 'Right', words: ['notes on the right', 'beside'] },
    { value: 'below', label: 'Below', words: ['notes below', 'under the code'] },
    { value: 'none', label: 'None', words: ['no notes', 'without notes'] },
  ] },
  { key: 'typing', label: 'Type the code first', type: 'select', options: [
    { value: 'none', label: 'No', words: ['no typing', 'without typing'] },
    { value: 'lines', label: 'Lines', words: ['type it line by line', 'line by line', 'typing'] },
    { value: 'characters', label: 'Letters', words: ['letter by letter', 'character by character', 'typewriter'] },
  ] },
  { key: 'accent', label: 'Highlight colour', type: 'color', words: ['highlight colour', 'highlight color', 'accent'] },
  { key: 'noteColor', label: 'Note colour', type: 'color', words: ['note colour', 'note color'] },
  { key: 'bgColor', label: 'Code background', type: 'color', words: ['background colour', 'background color', 'code background'] },
  { key: 'font', label: 'Note font', type: 'select', options: FONT_OPTIONS },
  { key: 'fontSize', label: 'Code size', type: 'number', min: 12, max: 48, step: 1, words: ['font size', 'code size', 'size'] },
  { key: 'stepTime', label: 'Time per step (s)', type: 'number', min: 0.5, max: 20, step: 0.1, words: ['per step', 'step time', 'between steps'] },
  { key: 'startAt', label: 'Starts at (s)', type: 'number', min: 0, max: 600, step: 0.1, words: ['starting at', 'start at'] },
]

const DEFAULTS = {
  code: [
    'import torch',
    'from torch import nn',
    '',
    'model = nn.Sequential(',
    '    nn.Linear(784, 128), nn.ReLU(),',
    '    nn.Linear(128, 10),',
    ')',
    'loss_fn = nn.CrossEntropyLoss()',
    'opt = torch.optim.Adam(model.parameters())',
    '',
    'for x, y in loader:',
    '    loss = loss_fn(model(x), y)',
    '    opt.zero_grad(); loss.backward(); opt.step()',
  ].join('\n'),
  language: 'python',
  steps: '4-7: A small network: 784 inputs → 128 → 10 classes\n8-9: Loss and optimiser\n11-13: The training loop: predict, measure, step',
  title: 'train.py', notes: 'auto', typing: 'none',
  accent: '#facc15', noteColor: '#e2e8f0', bgColor: '#0d1117', font: 'Inter', fontSize: 26, stepTime: 3, startAt: 0.4,
}
type Params = typeof DEFAULTS

export interface WalkStep { from: number; to: number; note: string }

/** "1-3: Load data" / "line 5 — Train" / "lines 7 to 9: …", one per line. Ranges are clamped to the code. */
export function parseSteps(value: string, lineCount: number): WalkStep[] {
  return value.split(/\r?\n/).flatMap(line => {
    const m = line.match(/^\s*(?:lines?\s*)?(\d+)\s*(?:(?:-|–|to|\.\.)\s*(\d+))?\s*(?:[:\-–—)]\s*)?(.*)$/i)
    if (!m) return []
    const a = clamp(Number(m[1]), 1, lineCount)
    const b = clamp(Number(m[2] ?? m[1]), 1, lineCount)
    return [{ from: Math.min(a, b), to: Math.max(a, b), note: m[3].trim() }]
  })
}

export const codeWalkthrough: SmartBlock<Params> = {
  id: 'codeWalkthrough',
  title: 'Code walkthrough',
  description: 'A code block that explains itself: line ranges are highlighted one after another, each with a short note.',
  category: 'technical',
  command: 'code-walkthrough',
  phrases: /\bcode\s+(?:walk-?through|explainer|tour|explanation)s?\b|\bwalk(?:ing)?\s+through\s+(?:the\s+|this\s+|my\s+)?code\b|\bexplain\s+(?:the\s+|this\s+|my\s+)?code\b/,
  refers: /\b(?:the|this|that)\s+(?:code\s+)?walk-?through\b/,
  fields: FIELDS,
  defaults: DEFAULTS,
  normalize: p => normalizeFields(FIELDS, DEFAULTS, p),
  parse: (input, current) => parseWalkthrough(input.text, input.quotes, current),
  build(p, frame) {
    const W = frame.width
    const H = frame.height
    const u = unit(frame)
    const lines = p.code.split('\n')
    const n = Math.max(1, lines.length)
    const longest = Math.max(8, ...lines.map(l => l.length))
    const steps = parseSteps(p.steps, n)
    const side = p.notes === 'auto' ? (isPortrait(frame) ? 'below' : 'right') : p.notes
    const withNotes = side !== 'none' && steps.some(s => s.note)

    // Code size: the chosen size, made smaller until the code fits its share of the frame.
    const maxW = W * (withNotes && side === 'right' ? 0.6 : 0.9)
    const maxH = H * (withNotes && side === 'below' ? 0.58 : 0.86)
    let fontSize = p.fontSize * u
    while (fontSize > 10 && (codeBlockWidth(fontSize, longest, true) > maxW || codeBlockHeight(fontSize, n) > maxH)) fontSize -= 1
    fontSize = Math.round(fontSize)
    const codeW = Math.max(Math.min(maxW, 360 * u), codeBlockWidth(fontSize, longest, true))
    const codeH = codeBlockHeight(fontSize, n)

    const noteSize = Math.round(clamp(fontSize * 1.05, 14, 40))
    const gap = 40 * u
    const noteW = !withNotes ? 0 : side === 'right' ? Math.min(W * 0.3, W * 0.94 - codeW - gap) : codeW
    const totalW = side === 'right' && withNotes ? codeW + gap + noteW : codeW
    const noteH = side === 'below' && withNotes ? Math.max(...steps.map(s => noteHeight(s.note, noteW, noteSize, p.font))) : 0
    const totalH = codeH + (noteH ? gap * 0.6 + noteH : 0)
    const codeX = (W - totalW) / 2
    const codeY = (H - totalH) / 2

    const code = Object.assign(makeCode(codeX, codeY), {
      name: 'code', blockKey: 'code',
      code: p.code, language: p.language, fontSize, width: codeW, height: codeH,
      showLineNumbers: true, wrapLines: false, fitSceneWidth: false,
      showTitle: Boolean(p.title.trim()), title: p.title, bgColor: p.bgColor, cornerRadius: 12,
      codeAnimation: p.typing as CodeElement['codeAnimation'],
      codeAnimationDelay: p.startAt + 0.3,
      codeAnimationDuration: Math.min(8, Math.max(1, n * (p.typing === 'characters' ? 0.5 : 0.22))),
    }) satisfies CodeElement
    code.animations = [anim('fadeIn', p.startAt, 0.4)]
    const out: EditorElement[] = [code]

    const typed = p.typing === 'none' ? 0.4 : 0.3 + code.codeAnimationDuration!
    const times = steps.map((_, k) => p.startAt + typed + 0.3 + k * p.stepTime)
    const lineH = codeLineHeight(fontSize)
    steps.forEach((step, k) => {
      const next = times[k + 1]
      const fade = (el: EditorElement) => { el.animations = [anim('fadeIn', times[k], 0.3), ...(next != null ? [anim('fadeOut', next, 0.3)] : [])] }
      const y = codeY + codeLineTop(fontSize, step.from - 1)
      const h = (step.to - step.from + 1) * lineH
      const band = shape(`hl-${k}`, 'rect', { x: codeX + 6, y, width: codeW - 12, height: h, fill: p.accent, radius: 4, opacity: 0.16 })
      const bar = shape(`bar-${k}`, 'rect', { x: codeX + 4, y, width: Math.max(3, 4 * u), height: h, fill: p.accent, radius: 2 })
      fade(band)
      fade(bar)
      out.push(band, bar)
      if (withNotes && step.note) {
        const h2 = noteHeight(step.note, noteW, noteSize, p.font)
        const note = side === 'right'
          // Beside the highlighted lines, kept inside the code's height.
          ? text(`note-${k}`, step.note, { x: codeX + codeW + gap, y: clamp(y + h / 2 - h2 / 2, codeY, codeY + codeH - h2), width: noteW, height: h2,
              fontSize: noteSize, fontFamily: p.font, weight: 'semibold', color: p.noteColor, lineHeight: 1.3 })
          : text(`note-${k}`, step.note, { x: codeX, y: codeY + codeH + gap * 0.6, width: noteW, height: h2,
              fontSize: noteSize, fontFamily: p.font, weight: 'semibold', color: p.noteColor, align: 'center', lineHeight: 1.3 })
        fade(note)
        out.push(note)
      }
    })
    return out
  },
}

function noteHeight(note: string, width: number, size: number, font: string) {
  const rows = wrapWords(note.split(/\s+/).filter(Boolean), Math.max(40, width - 4), s => textWidth(s, size, font, 'semibold')).length
  return Math.max(1, rows) * size * 1.3
}

/** Walkthrough phrasing: code from a quote, steps like "lines 1-3: load", "highlight lines 5-6 with note '…'". */
export function parseWalkthrough(text: string, quotes: string[], current: Params | null): Partial<Params> {
  const out: Partial<Params> = {}
  // "lines 1-3 'Load the data'", "line 5: train" (until the next comma / "and line…").
  const found: string[] = []
  const re = /\blines?\s+(\d+)(?:\s*(?:-|–|to)\s*(\d+))?\s*(?:with (?:the )?note|saying|:|-|—)?\s*(?:⟦(\d+)⟧|([^,;⟦]*?))(?=\s*(?:,|;|\band\s+lines?\b|$))/g
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const note = m[3] != null ? quotes[Number(m[3])] : (m[4] ?? '').trim()
    found.push(`${m[1]}${m[2] ? `-${m[2]}` : ''}: ${note.charAt(0).toUpperCase()}${note.slice(1)}`)
  }
  if (found.length) out.steps = current && /\b(?:add|also|another|then)\b/.test(text) ? [current.steps, ...found].filter(Boolean).join('\n') : found.join('\n')
  if (!current) {
    // The code: a quote that looks like code (several lines, or brackets/operators).
    const code = quotes.find(q => /\n|[(){}=;:]/.test(q))
    if (code) out.code = code
  } else {
    const replace = text.match(/\b(?:change|set|replace|use)\s+(?:the\s+)?code\s+(?:to|with)\s+⟦(\d+)⟧/)
    if (replace) out.code = quotes[Number(replace[1])]
    if (/\b(?:remove|delete|drop)\s+the\s+last\s+step\b/.test(text)) out.steps = current.steps.split('\n').slice(0, -1).join('\n')
    const remove = text.match(/\b(?:remove|delete|drop)\s+step\s+(\d+)\b/)
    if (remove) out.steps = current.steps.split('\n').filter((_, i) => i !== Number(remove[1]) - 1).join('\n')
  }
  return out
}
