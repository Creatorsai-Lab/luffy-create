/**
 * Flowchart / pipeline: steps joined by arrows, laid out in levels (branches
 * sit side by side), wrapping into a snake when a long chain would not fit.
 * Steps ending in "?" are decisions (diamonds). Extra links add branches and
 * loops ("4>2 retry"). Reveals step by step; an optional pulse runs along it.
 */
import type { EditorElement, ShapeElement } from '../../types/editor'
import { normalizeFields, type BlockField } from '../fields'
import { isPortrait, textWidth, unit, wrapWords } from '../layout'
import type { SmartBlock } from '../registry'
import { anim, FONT_OPTIONS, text } from '../ugc/shared'
import { clamp, connector, placeConnectors, pulseWave, shape } from './shared'

const FIELDS: BlockField[] = [
  { key: 'steps', label: 'Steps', type: 'list', of: 'text', minItems: 1, maxItems: 16, maxChars: 48, joiner: ' → ',
    placeholder: 'Collect → Clean → Train → Deploy', words: ['steps', 'stages', 'nodes'] },
  { key: 'chain', label: 'Link the steps in order', type: 'toggle', words: ['in order', 'chain'] },
  { key: 'links', label: 'Extra links (from>to label)', type: 'text', maxChars: 200, placeholder: '4>2 retry, 3>5', words: ['links', 'branches', 'loops'] },
  { key: 'direction', label: 'Direction', type: 'select', options: [
    { value: 'auto', label: 'Auto', words: ['auto direction'] },
    { value: 'leftToRight', label: 'Left → right', words: ['left to right', 'horizontal', 'horizontally'] },
    { value: 'topToBottom', label: 'Top → bottom', words: ['top to bottom', 'vertical', 'vertically'] },
  ] },
  { key: 'shape', label: 'Step shape', type: 'select', options: [
    { value: 'rounded', label: 'Rounded', words: ['rounded'] },
    { value: 'pill', label: 'Pill', words: ['pill', 'pills', 'capsule'] },
    { value: 'box', label: 'Box', words: ['box', 'boxes', 'square corners', 'rectangles'] },
  ] },
  { key: 'reveal', label: 'Reveal', type: 'select', options: [
    { value: 'stepByStep', label: 'Step by step', words: ['step by step', 'one by one', 'one at a time'] },
    { value: 'all', label: 'All at once', words: ['all at once', 'together'] },
  ] },
  { key: 'stepTime', label: 'Time per step (s)', type: 'number', min: 0.2, max: 4, step: 0.1, words: ['per step', 'step time'] },
  { key: 'flow', label: 'Pulse along the flow', type: 'toggle', words: ['pulse', 'flow animation', 'signal'] },
  { key: 'nodeColor', label: 'Step colour', type: 'color', words: ['step colour', 'step color', 'node color', 'box color', 'fill'] },
  { key: 'borderColor', label: 'Border colour', type: 'color', words: ['border colour', 'border color', 'outline'] },
  { key: 'decisionColor', label: 'Decision colour', type: 'color', words: ['decision colour', 'decision color'] },
  { key: 'textColor', label: 'Text colour', type: 'color', words: ['text colour', 'text color'] },
  { key: 'arrowColor', label: 'Arrow colour', type: 'color', words: ['arrow colour', 'arrow color', 'line color'] },
  { key: 'flowColor', label: 'Pulse colour', type: 'color', words: ['pulse colour', 'pulse color', 'flow color'] },
  { key: 'font', label: 'Font', type: 'select', options: FONT_OPTIONS },
  { key: 'startAt', label: 'Starts at (s)', type: 'number', min: 0, max: 600, step: 0.1, words: ['starting at', 'start at'] },
  { key: 'size', label: 'Size', type: 'number', min: 40, max: 150, step: 5, unit: '%', words: ['size', 'scale'] },
]

const DEFAULTS = {
  steps: ['Collect data', 'Clean', 'Train model', 'Good enough?', 'Deploy'] as string[], chain: true, links: '4>3 no, 4>5 yes',
  direction: 'auto', shape: 'rounded', reveal: 'stepByStep', stepTime: 0.6, flow: false,
  nodeColor: '#1e293b', borderColor: '#38bdf8', decisionColor: '#f59e0b', textColor: '#f8fafc', arrowColor: '#94a3b8',
  flowColor: '#facc15', font: 'Inter', startAt: 0.3, size: 100,
}
type Params = typeof DEFAULTS

export interface FlowLink { from: number; to: number; label?: string }

/** "4>2 retry, 3>5" → links between 0-based steps. Unknown steps are dropped. */
export function parseLinks(value: string, count: number): FlowLink[] {
  return value.split(/\s*[,;\n]\s*/).flatMap(part => {
    const m = part.match(/^(\d+)\s*(?:->|→|>|-)\s*(\d+)\s*[:\s]?\s*(.*)$/)
    if (!m) return []
    const from = Number(m[1]) - 1
    const to = Number(m[2]) - 1
    if (from < 0 || to < 0 || from >= count || to >= count || from === to) return []
    return [{ from, to, label: m[3]?.trim().slice(0, 20) || undefined }]
  })
}

/** Each step's level: the longest path to it, ignoring links that go back (loops). */
export function levelsOf(count: number, edges: FlowLink[]): number[] {
  const level = new Array(count).fill(0)
  const forward = edges.filter(e => e.to > e.from)
  for (let i = 0; i < count; i++) {
    for (const e of forward) if (e.to === i) level[i] = Math.max(level[i], level[e.from] + 1)
  }
  return level
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'step'

export const flowchart: SmartBlock<Params> = {
  id: 'flowchart',
  title: 'Flowchart / pipeline',
  description: 'Steps joined by arrows — a process, a data pipeline, a decision flow. Steps ending in "?" become decisions; extra links add branches and loops.',
  category: 'technical',
  command: 'flowchart',
  phrases: /\bflow\s*charts?\b|\bpipelines?\b|\bflow diagrams?\b|\bprocess (?:diagram|flow)s?\b|\bworkflow diagrams?\b|\bdecision (?:tree|flow)\b/,
  refers: /\b(?:the|this|that|my)\s+(?:flow\s*chart|pipeline|diagram|workflow|flow|process)\b/,
  fields: FIELDS,
  defaults: DEFAULTS,
  normalize: p => normalizeFields(FIELDS, DEFAULTS, p),
  parse: (input, current) => parseFlowchart(input.text, input.quotes, current),
  build(p, frame) {
    const W = frame.width
    const H = frame.height
    const u = unit(frame) * (p.size / 100)
    const n = p.steps.length
    const across = p.direction === 'leftToRight' || (p.direction === 'auto' && !isPortrait(frame))
    const extra = parseLinks(p.links, n)
    const edges: FlowLink[] = [
      ...(p.chain ? Array.from({ length: n - 1 }, (_, i) => ({ from: i, to: i + 1 })) : []),
      ...extra.filter(e => !(p.chain && e.to === e.from + 1 && !e.label)),
    ]
    // A labelled link that repeats a chain link replaces it (e.g. "4>5 yes").
    const deduped = edges.filter((e, i) => !edges.some((o, j) => j > i && o.from === e.from && o.to === e.to))
    const level = levelsOf(n, deduped)
    const levels = Math.max(...level) + 1
    const byLevel = Array.from({ length: levels }, (_, l) => level.map((lv, i) => (lv === l ? i : -1)).filter(i => i >= 0))
    const widest = Math.max(...byLevel.map(l => l.length))

    // A long single chain wraps into a snake (left→right, then right→left, …).
    const maxLine = across ? 5 : 6
    const snake = widest === 1 && levels > maxLine
    const lines = snake ? Math.ceil(levels / maxLine) : 1
    const mainSlots = snake ? maxLine : levels
    const crossSlots = snake ? lines : widest

    const scale = p.size / 100
    const areaW = W * Math.min(0.94, 0.86 * scale)
    const areaH = H * Math.min(0.9, 0.7 * scale)
    const originX = (W - areaW) / 2
    const originY = (H - areaH) / 2
    const cellMain = (across ? areaW : areaH) / mainSlots
    const cellCross = (across ? areaH : areaW) / crossSlots
    const cellW = across ? cellMain : cellCross
    const cellH = across ? cellCross : cellMain
    const nodeW = Math.min(cellW * 0.78, 400 * u)
    const baseH = Math.min(cellH * 0.6, Math.max(nodeW * 0.42, 70 * u))

    // Text size: one size for every step, as large as fits the longest label.
    let fontSize = clamp(30 * u, 11, 42)
    const pad = () => fontSize * 0.7
    const fits = (label: string, w: number, h: number) => {
      const linesOf = wrapWords(label.split(/\s+/), w - pad() * 2, s => textWidth(s, fontSize, p.font, 'semibold'))
      return linesOf.length * fontSize * 1.25 <= h - pad() && linesOf.every(l => textWidth(l.join(' '), fontSize, p.font, 'semibold') <= w - pad() * 1.6)
    }
    const isDecision = (label: string) => /\?\s*$/.test(label)
    const boxOf = (label: string) => (isDecision(label)
      ? { w: Math.min(cellW * 0.9, nodeW * 1.25), h: Math.min(cellH * 0.86, baseH * 1.5), tw: 0.62, th: 0.6 }
      : { w: nodeW, h: baseH, tw: 1, th: 1 })
    while (fontSize > 11 && !p.steps.every(label => { const b = boxOf(label); return fits(label, b.w * b.tw, b.h * b.th) })) fontSize -= 1

    // Where each step goes.
    const centre = (i: number) => {
      const l = level[i]
      let mainIndex: number
      let crossIndex: number
      let crossCount: number
      if (snake) {
        const line = Math.floor(l / maxLine)
        const pos = l % maxLine
        mainIndex = line % 2 === 0 ? pos : maxLine - 1 - pos
        crossIndex = line
        crossCount = lines
      } else {
        mainIndex = l
        crossIndex = byLevel[l].indexOf(i)
        crossCount = byLevel[l].length
      }
      const main = (across ? originX : originY) + (mainIndex + 0.5) * cellMain
      // Steps of one level are centred across the area.
      const crossStart = (across ? originY : originX) + ((across ? areaH : areaW) - crossCount * cellCross) / 2
      const cross = crossStart + (crossIndex + 0.5) * cellCross
      return across ? { cx: main, cy: cross } : { cx: cross, cy: main }
    }

    const used = new Map<string, number>()
    const keyOf = (label: string) => {
      const base = slug(label)
      const k = used.get(base) ?? 0
      used.set(base, k + 1)
      return k ? `${base}-${k + 1}` : base
    }
    const out: EditorElement[] = []
    const nodes: ShapeElement[] = []
    const labelsOf: EditorElement[] = []
    p.steps.forEach((label, i) => {
      const { cx, cy } = centre(i)
      const b = boxOf(label)
      const key = keyOf(label)
      const decision = isDecision(label)
      const node = shape(`node-${key}`, decision ? 'diamond' : 'rect', {
        x: cx - b.w / 2, y: cy - b.h / 2, width: b.w, height: b.h, fill: p.nodeColor,
        stroke: decision ? p.decisionColor : p.borderColor, strokeWidth: Math.max(2, 3 * u),
        radius: decision ? 0 : p.shape === 'pill' ? b.h / 2 : p.shape === 'rounded' ? Math.min(18 * u, b.h / 4) : 0,
      })
      nodes.push(node)
      // Centred in the step: as tall as its wrapped lines.
      const tw = b.w * b.tw - pad()
      const rows = wrapWords(label.split(/\s+/), tw - pad(), s => textWidth(s, fontSize, p.font, 'semibold')).length
      const th = rows * fontSize * 1.2
      labelsOf.push(text(`text-${key}`, label, {
        x: cx - tw / 2, y: cy - th / 2, width: tw, height: th, fontSize: Math.round(fontSize),
        fontFamily: p.font, weight: 'semibold', color: p.textColor, align: 'center', lineHeight: 1.2,
      }))
    })

    // Arrows (under the steps), with labels at their middle.
    const arrowWidth = Math.max(2, 3 * u)
    // Loops back (to an earlier step) arc around the flow — over the top when it runs left → right,
    // round the right side when it runs top → bottom — so they never sit on a forward arrow.
    const isBack = (e: FlowLink) => e.to <= e.from
    const arrows = deduped.map(e => {
      const a = connector(`edge-${nodes[e.from].blockKey}-${nodes[e.to].blockKey}`, nodes[e.from], nodes[e.to], {
        stroke: p.arrowColor, width: arrowWidth, head: true, dashed: isBack(e),
      })
      if (isBack(e) && !snake) {
        const side = across ? 'top' as const : 'right' as const
        a.startAttach = { ...a.startAttach!, anchor: side }
        a.endAttach = { ...a.endAttach!, anchor: side }
      }
      return a
    })
    out.push(...arrows, ...nodes, ...labelsOf)
    placeConnectors(out)
    deduped.forEach((e, k) => {
      if (!isBack(e) || snake) return
      const a = arrows[k]
      const length = Math.hypot(a.x2 - a.x1, a.y2 - a.y1)
      // `curve` bends the line sideways (left of its direction): pick the sign that bends it outward.
      const outward = across ? Math.sign(a.x1 - a.x2) || 1 : Math.sign(a.y1 - a.y2) || 1
      a.curve = Math.round(outward * (length * 0.35 + 50 * u))
    })
    const edgeLabels: Array<{ edge: FlowLink; el: EditorElement }> = []
    deduped.forEach((e, k) => {
      if (!e.label) return
      const a = arrows[k]
      const lf = Math.round(fontSize * 0.8)
      const w = textWidth(e.label, lf, p.font, 'semibold') + lf
      // On a curved loop the label sits at the top of the arc (half way to the curve's control point).
      const len = Math.hypot(a.x2 - a.x1, a.y2 - a.y1) || 1
      const bend = (a.curve ?? 0) * 0.5
      const mx = (a.x1 + a.x2) / 2 - ((a.y2 - a.y1) / len) * bend
      const my = (a.y1 + a.y2) / 2 + ((a.x2 - a.x1) / len) * bend
      // Beside the line, not on it.
      const vertical = Math.abs(a.x2 - a.x1) < Math.abs(a.y2 - a.y1)
      const el = text(`edge-label-${a.blockKey}`, e.label, {
        x: vertical ? mx + lf * 0.5 : mx - w / 2, y: vertical ? my - lf * 0.7 : my - lf * 1.7, width: w, height: lf * 1.4,
        fontSize: lf, fontFamily: p.font, weight: 'semibold', color: p.arrowColor, align: vertical ? 'left' : 'center',
      })
      edgeLabels.push({ edge: e, el })
      out.push(el)
    })

    // Reveal: steps by level, each arrow after the step it leaves.
    const appear = (i: number) => p.startAt + (p.reveal === 'stepByStep' ? level[i] * p.stepTime : 0)
    nodes.forEach((node, i) => {
      node.animations = [anim(p.reveal === 'stepByStep' ? 'scaleIn' : 'fadeIn', appear(i), 0.4, { easing: 'easeOut' })]
      labelsOf[i].animations = [anim('fadeIn', appear(i) + 0.1, 0.35)]
    })
    deduped.forEach((e, k) => {
      const at = Math.max(appear(e.from), p.reveal === 'stepByStep' ? appear(e.to) - p.stepTime * 0.45 : appear(e.from))
      arrows[k].animations = [anim('fadeIn', at, 0.35)]
    })
    for (const { edge, el } of edgeLabels) el.animations = [anim('fadeIn', Math.max(appear(edge.from), appear(edge.to)) , 0.35)]

    if (p.flow) {
      const revealEnd = p.startAt + (p.reveal === 'stepByStep' ? (levels - 1) * p.stepTime : 0) + 0.6
      const slots: EditorElement[][] = []
      for (let l = 0; l < levels; l++) {
        slots.push(byLevel[l].map(i => nodes[i]))
        const leaving = deduped.map((e, k) => (level[e.from] === l && e.to > e.from ? arrows[k] : null)).filter((a): a is typeof arrows[number] => Boolean(a))
        if (leaving.length) slots.push(leaving)
      }
      const step = Math.max(0.15, p.stepTime * 0.5)
      const duration = Math.max(0.25, step * 1.4)
      const period = (slots.length - 1) * step + duration + 0.8
      for (const { element, animation } of pulseWave(slots, { start: revealEnd, step, color: p.flowColor, duration, period })) {
        element.animations = [...element.animations, animation]
      }
    }
    return out
  },
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Flowchart phrasing → settings: steps from quotes or "a -> b -> c", and step edits. */
export function parseFlowchart(text: string, quotes: string[], current: Params | null): Partial<Params> {
  const steps = (current?.steps ?? []).slice()
  const indexOf = (q: string) => steps.findIndex(s => s.toLowerCase() === q.trim().toLowerCase())
  const quoteAt = (i: number) => quotes[i]
  const q = (re: RegExp) => { const m = text.match(re); return m ? m.slice(1).map(x => (x == null ? x : /^\d+$/.test(x) ? quoteAt(Number(x)) : x)) : null }

  if (current) {
    // "add a step 'Test' after 'Train'" / "before 'Deploy'" / at the end
    const add = q(/\b(?:add|insert)\s+(?:a\s+|another\s+|new\s+)?(?:step|stage|node|box)?\s*⟦(\d+)⟧(?:\s+(after|before|between)\s+⟦(\d+)⟧)?/)
    if (add) {
      const [name, where, ref] = add
      const at = ref != null ? indexOf(ref) : -1
      const pos = at < 0 ? steps.length : where === 'before' ? at : at + 1
      steps.splice(pos, 0, name!)
      return { steps, ...shiftLinks(current.links, pos, 1) }
    }
    const remove = q(/\b(?:remove|delete|drop)\s+(?:the\s+)?(?:step\s+)?⟦(\d+)⟧/)
    if (remove) {
      const at = indexOf(remove[0]!)
      if (at >= 0 && steps.length > 1) {
        steps.splice(at, 1)
        return { steps, ...shiftLinks(current.links, at, -1) }
      }
    }
    const rename = q(/\b(?:rename|change|call)\s+(?:the\s+)?(?:step\s+)?⟦(\d+)⟧\s+(?:to|into|as)\s+⟦(\d+)⟧/)
    if (rename) {
      const at = indexOf(rename[0]!)
      if (at >= 0) { steps[at] = rename[1]!; return { steps } }
    }
    // "connect 'Evaluate' back to 'Train' labelled 'retry'" / "add a link from 'A' to 'B'"
    const link = q(/\b(?:connect|link|loop|add a link from|arrow from)\s+⟦(\d+)⟧\s+(?:back\s+)?to\s+⟦(\d+)⟧(?:.*?\b(?:labell?ed|called|saying|with (?:the )?label)\s+⟦(\d+)⟧)?/)
    if (link) {
      const from = indexOf(link[0]!)
      const to = indexOf(link[1]!)
      if (from >= 0 && to >= 0) {
        const entry = `${from + 1}>${to + 1}${link[2] ? ` ${link[2]}` : ''}`
        return { links: [current.links, entry].filter(Boolean).join(', ') }
      }
    }
    const decision = q(/\bmake\s+⟦(\d+)⟧\s+a\s+(?:decision|question|choice)\b/)
    if (decision) {
      const at = indexOf(decision[0]!)
      if (at >= 0 && !steps[at].endsWith('?')) { steps[at] = `${steps[at]}?`; return { steps } }
    }
  }

  // New steps: several quotes, or "load data -> clean -> train".
  if (quotes.length >= 2 && !current) return { steps: quotes.map(s => s.trim()).filter(Boolean) }
  const arrowList = text.split(/:\s*/).pop()!
  if (/(?:->|→|=>)/.test(arrowList)) {
    const parts = arrowList.split(/\s*(?:->|→|=>)\s*/).map(s => s.replace(/⟦(\d+)⟧/g, (_m, i) => quotes[Number(i)] ?? '').trim())
    // The first part may still hold the request ("add a flowchart load data") — keep only what follows the block word.
    parts[0] = parts[0].replace(/^.*\b(?:flow\s*chart|pipeline|diagram|workflow|steps|stages)\b\s*(?:of|with|for|from)?\s*/, '')
    // The last step may run into the rest of the request ("ship after 2s", "deploy on scene 3").
    const last = parts.length - 1
    parts[last] = parts[last].replace(/\s+(?:(?:after|at|from|starting(?:\s+at)?|with(?:\s+an?)?)\s+\d+(?:\.\d+)?\s*(?:s|sec|secs|seconds?)\b|(?:in|on|to)\s+scene\s+\d+).*$/, '')
    const clean = parts.map(s => cap(s.replace(/^(?:then|and|to)\s+/, '').trim())).filter(Boolean)
    if (clean.length >= 2) return { steps: clean, ...(current ? {} : { links: '' }) }
  }
  if (quotes.length >= 2 && current && /\b(?:steps?|stages?)\b/.test(text)) return { steps: quotes.map(s => s.trim()).filter(Boolean) }
  return {}
}

/** Keeps "4>2" style links pointing at the same steps after one is inserted (+1) or removed (-1) at `at`. */
function shiftLinks(links: string, at: number, delta: 1 | -1): { links?: string } {
  if (!links.trim()) return {}
  const shifted = links.split(/\s*,\s*/).flatMap(part => {
    const m = part.match(/^(\d+)\s*(?:->|→|>|-)\s*(\d+)(.*)$/)
    if (!m) return [part]
    const move = (n: number) => {
      const i = n - 1
      if (delta < 0 && i === at) return null
      return (i >= at ? i + delta : i) + 1
    }
    const a = move(Number(m[1]))
    const b = move(Number(m[2]))
    return a == null || b == null ? [] : [`${a}>${b}${m[3]}`]
  })
  return { links: shifted.join(', ') }
}
