/**
 * Neural network: any number of layers of any size, laid out to fit the frame
 * (left → right in landscape, top → bottom in portrait). Large layers switch
 * to a compact form — the first and last neurons with "⋮" between and the size
 * in the label — instead of refusing. Connections are attached arrows, and an
 * optional forward/backward pass pulses through the layers.
 */
import type { EditorElement, ShapeElement } from '../../types/editor'
import { normalizeFields, type BlockField } from '../fields'
import { isPortrait, textWidth, unit } from '../layout'
import type { SmartBlock } from '../registry'
import { anim, FONT_OPTIONS, text } from '../ugc/shared'
import { clamp, connector, placeConnectors, pulseWave, shape } from './shared'

const FIELDS: BlockField[] = [
  { key: 'layers', label: 'Neurons per layer', type: 'list', of: 'number', min: 1, max: 4096, minItems: 2, maxItems: 12, joiner: ', ',
    placeholder: '3, 4, 4, 2', words: ['layers', 'layer sizes', 'neurons', 'architecture'] },
  { key: 'labels', label: 'Layer labels (optional)', type: 'list', of: 'text', maxItems: 12, maxChars: 24, joiner: ', ', placeholder: 'Input, Hidden, Output' },
  { key: 'showLabels', label: 'Show layer labels', type: 'toggle', words: ['labels'] },
  { key: 'direction', label: 'Direction', type: 'select', options: [
    { value: 'auto', label: 'Auto', words: ['auto direction'] },
    { value: 'leftToRight', label: 'Left → right', words: ['left to right', 'horizontal', 'horizontally', 'sideways'] },
    { value: 'topToBottom', label: 'Top → bottom', words: ['top to bottom', 'vertical', 'vertically', 'downwards'] },
  ] },
  { key: 'connections', label: 'Connections', type: 'select', options: [
    { value: 'full', label: 'Full', words: ['fully connected', 'dense', 'all connections'] },
    { value: 'sparse', label: 'Sparse', words: ['sparse', 'fewer connections', 'less lines'] },
    { value: 'none', label: 'None', words: ['no connections', 'no lines', 'without connections'] },
  ] },
  { key: 'pass', label: 'Signal pass', type: 'select', options: [
    { value: 'none', label: 'None', words: ['no pass', 'no animation', 'static'] },
    { value: 'forward', label: 'Forward', words: ['forward pass', 'forward propagation', 'feedforward', 'feed forward', 'inference'] },
    { value: 'forwardBackward', label: 'Fwd + back', words: ['forward and backward', 'backward pass', 'backprop', 'backpropagation', 'training'] },
  ] },
  { key: 'repeat', label: 'Repeat the pass', type: 'toggle', words: ['repeat', 'loop', 'repeating'] },
  { key: 'stepTime', label: 'Time per layer (s)', type: 'number', min: 0.1, max: 2, step: 0.05, words: ['per layer', 'step time'] },
  { key: 'inputColor', label: 'Input colour', type: 'color', words: ['input colour', 'input color'] },
  { key: 'hiddenColor', label: 'Hidden colour', type: 'color', words: ['hidden colour', 'hidden color', 'neuron colour', 'neuron color', 'node color'] },
  { key: 'outputColor', label: 'Output colour', type: 'color', words: ['output colour', 'output color'] },
  { key: 'lineColor', label: 'Connection colour', type: 'color', words: ['connection colour', 'connection color', 'line colour', 'line color', 'edge color'] },
  { key: 'forwardColor', label: 'Forward pass colour', type: 'color', words: ['forward colour', 'forward color', 'pulse color', 'signal color'] },
  { key: 'backwardColor', label: 'Backward pass colour', type: 'color', words: ['backward colour', 'backward color', 'gradient color'] },
  { key: 'labelColor', label: 'Label colour', type: 'color', words: ['label colour', 'label color', 'text color'] },
  { key: 'font', label: 'Font', type: 'select', options: FONT_OPTIONS },
  { key: 'entrance', label: 'Entrance', type: 'select', options: [
    { value: 'build', label: 'Layer by layer', words: ['layer by layer', 'build up', 'one layer at a time'] },
    { value: 'fade', label: 'Fade', words: ['fade in'] },
    { value: 'none', label: 'None', words: ['no entrance', 'appear at once'] },
  ] },
  { key: 'startAt', label: 'Starts at (s)', type: 'number', min: 0, max: 600, step: 0.1, words: ['starting at', 'start at'] },
  { key: 'size', label: 'Size', type: 'number', min: 40, max: 150, step: 5, unit: '%', words: ['size', 'scale'] },
]

const DEFAULTS = {
  layers: [3, 4, 4, 2] as number[], labels: [] as string[], showLabels: true, direction: 'auto', connections: 'full',
  pass: 'forward', repeat: true, stepTime: 0.35,
  inputColor: '#38bdf8', hiddenColor: '#a78bfa', outputColor: '#34d399', lineColor: '#64748b',
  forwardColor: '#facc15', backwardColor: '#f87171', labelColor: '#cbd5e1', font: 'Inter',
  entrance: 'build', startAt: 0.3, size: 100,
}
type Params = typeof DEFAULTS

/**
 * Which neurons of a layer are drawn: all of them when they fit (`max`, from the
 * space available), else the first and last few around a gap (-1) shown as "⋮".
 */
export function shownNeurons(count: number, max = 9): number[] {
  if (count <= max) return Array.from({ length: count }, (_, i) => i)
  const edge = Math.max(2, Math.floor((max - 1) / 2))
  return [...Array.from({ length: edge }, (_, i) => i), -1, ...Array.from({ length: edge }, (_, i) => count - edge + i)]
}

export function defaultLayerLabel(index: number, count: number) {
  if (index === 0) return 'Input'
  if (index === count - 1) return 'Output'
  return count > 3 ? `Hidden ${index}` : 'Hidden'
}

export const neuralNetwork: SmartBlock<Params> = {
  id: 'neuralNetwork',
  title: 'Neural network',
  description: 'Layers of neurons joined by connections, any size, with an optional forward or forward-and-backward pass. Big layers are drawn compactly.',
  category: 'technical',
  command: 'neural-network',
  phrases: /\bneural\s+net(?:work)?s?\b|\bmlp\b|\bmulti[\s-]?layer perceptron\b|\bperceptron\b|\b(?:dense|fully[\s-]connected|feed[\s-]?forward)\s+(?:neural\s+)?net(?:work)?s?\b|\b\d+[\s-]layer\s+(?:neural\s+)?net(?:work)?s?\b|\bnn diagram\b/,
  refers: /\b(?:the|this|that|my)\s+(?:neural\s+)?(?:net(?:work)?|nn|mlp|model)\b/,
  fields: FIELDS,
  defaults: DEFAULTS,
  normalize: p => normalizeFields(FIELDS, DEFAULTS, p),
  parse: (input, current) => parseNetwork(input.text, current),
  build(p, frame) {
    const W = frame.width
    const H = frame.height
    const u = unit(frame) * (p.size / 100)
    const across = p.direction === 'leftToRight' || (p.direction === 'auto' && !isPortrait(frame))
    const L = p.layers.length
    const fontSize = Math.round(clamp(26 * u, 12, 40))
    const labelSpace = p.showLabels ? fontSize * 2.2 : 0

    // The area the network fills: main axis = along the layers, cross = within a layer.
    // Landscape: labels under the layers. Portrait: labels in a column on the left.
    const scale = p.size / 100
    const areaW = W * Math.min(0.94, 0.84 * scale)
    const areaH = H * Math.min(0.9, 0.72 * scale)
    // As many neurons per layer as fit at a readable size (at most 16); bigger layers go compact.
    const maxShown = clamp(Math.floor((across ? areaH - labelSpace : areaW * 0.72) / (26 * u * 1.5)), 5, 16)
    const shown = (n: number) => shownNeurons(n, maxShown)
    const labels = p.layers.map((n, i) => {
      const name = p.labels[i] ?? defaultLayerLabel(i, L)
      return n > maxShown ? `${name} (${n})` : name
    })
    const originX = (W - areaW) / 2
    const originY = (H - areaH) / 2
    const labelW = !across && p.showLabels
      ? Math.min(areaW * 0.34, Math.max(...labels.map(l => textWidth(l, fontSize, p.font, 'semibold'))) + fontSize)
      : 0
    const mainLen = across ? areaW : areaH
    const crossLen = across ? areaH - labelSpace : areaW - labelW
    const slots = Math.max(...p.layers.map(n => shown(n).length))
    const gap = L > 1 ? mainLen / (L - 1) : 0
    const dia = Math.max(8, Math.min(gap * 0.4 || Infinity, crossLen / (slots * 1.45), 96 * u))
    const pitch = Math.min(dia * 1.6, (crossLen - dia) / Math.max(1, slots - 1))
    const mainStart = (across ? originX : originY) + dia / 2
    const step = L > 1 ? (mainLen - dia) / (L - 1) : 0
    const crossCenter = across ? originY + crossLen / 2 : originX + labelW + crossLen / 2

    const out: EditorElement[] = []
    const layerNodes: ShapeElement[][] = []
    const at = (main: number, cross: number) => (across ? { cx: main, cy: cross } : { cx: cross, cy: main })
    const colorOf = (i: number) => (i === 0 ? p.inputColor : i === L - 1 ? p.outputColor : p.hiddenColor)

    p.layers.forEach((count, i) => {
      const main = mainStart + i * step
      const visible = shown(count)
      const nodes: ShapeElement[] = []
      visible.forEach((neuron, k) => {
        const { cx, cy } = at(main, crossCenter + (k - (visible.length - 1) / 2) * pitch)
        if (neuron < 0) {
          out.push(text(`dots-${i}`, across ? '⋮' : '⋯', {
            x: cx - dia, y: cy - dia / 2, width: dia * 2, height: dia, fontSize: Math.round(dia * 0.9),
            fontFamily: p.font, color: p.labelColor, align: 'center', lineHeight: 1,
          }))
          return
        }
        const node = shape(`n-${i}-${neuron}`, 'circle', {
          x: cx - dia / 2, y: cy - dia / 2, width: dia, height: dia, fill: colorOf(i),
          stroke: '#0f172a', strokeWidth: Math.max(1, dia * 0.05),
        })
        nodes.push(node)
        out.push(node)
      })
      layerNodes.push(nodes)
      if (p.showLabels) {
        const label = labels[i]
        if (across) {
          // Wide enough for the text, but never wider than the frame allows.
          // Centred under its layer: as wide as the text needs, and no wider than the room to the frame edge.
          const room = 2 * Math.min(main - 4, W - 4 - main)
          const width = Math.min(W - 8, Math.max(textWidth(label, fontSize, p.font, 'semibold') + 8, Math.min(step * 0.95, room)))
          const x = clamp(main - width / 2, 4, W - 4 - width)
          out.push(text(`label-${i}`, label, { x, y: originY + crossLen + labelSpace * 0.55 - fontSize * 0.6, width, height: fontSize * 1.3,
            fontSize, fontFamily: p.font, weight: 'semibold', color: p.labelColor, align: 'center' }))
        } else {
          out.push(text(`label-${i}`, label, { x: originX, y: main - fontSize * 0.65, width: Math.max(10, labelW - fontSize * 0.6), height: fontSize * 1.3,
            fontSize, fontFamily: p.font, weight: 'semibold', color: p.labelColor, align: 'right' }))
        }
      }
    })

    // Connections between neighbouring layers.
    const lines: EditorElement[][] = []
    const lineWidth = Math.max(1, Math.min(3, dia * 0.06))
    for (let i = 0; i < L - 1 && p.connections !== 'none'; i++) {
      const from = layerNodes[i]
      const to = layerNodes[i + 1]
      const pairs: Array<[ShapeElement, ShapeElement]> = []
      if (p.connections === 'full') {
        for (const a of from) for (const b of to) pairs.push([a, b])
      } else {
        // Sparse: each neuron to the two nearest in the next layer (by position along the layer).
        const crossOf = (n: ShapeElement) => (across ? n.y : n.x)
        for (const a of from) {
          to.slice().sort((x, y) => Math.abs(crossOf(x) - crossOf(a)) - Math.abs(crossOf(y) - crossOf(a))).slice(0, 2).forEach(b => pairs.push([a, b]))
        }
      }
      const layerLines = pairs.map(([a, b]) => connector(`c-${a.blockKey}-${b.blockKey}`, a, b, { stroke: p.lineColor, width: lineWidth, opacity: 0.55 }))
      lines.push(layerLines)
      // Lines go under the neurons.
      out.unshift(...layerLines)
    }
    placeConnectors(out)

    // Entrance: layer by layer (neurons pop, then their outgoing lines), or all together.
    const layerDelay = 0.28
    if (p.entrance !== 'none') {
      layerNodes.forEach((nodes, i) => {
        const delay = p.startAt + (p.entrance === 'build' ? i * layerDelay : 0)
        for (const node of nodes) node.animations = [anim(p.entrance === 'build' ? 'scaleIn' : 'fadeIn', delay, 0.35, { easing: 'easeOut' })]
        for (const el of out) {
          if (el.blockKey === `label-${i}` || el.blockKey === `dots-${i}`) el.animations = [anim('fadeIn', delay, 0.35)]
        }
        for (const line of lines[i] ?? []) line.animations = [anim('fadeIn', delay + (p.entrance === 'build' ? layerDelay * 0.6 : 0), 0.35)]
      })
    }

    // The pass: a pulse through each layer and the lines after it, then (optionally) back.
    if (p.pass !== 'none') {
      const entranceEnd = p.entrance === 'none' ? p.startAt : p.startAt + (p.entrance === 'build' ? L * layerDelay : 0) + 0.45
      const forward: EditorElement[][] = []
      layerNodes.forEach((nodes, i) => {
        forward.push(nodes)
        if (lines[i]?.length) forward.push(lines[i])
      })
      const half = p.stepTime / 2
      const pulse = Math.max(0.2, p.stepTime * 1.2)
      const forwardLength = (forward.length - 1) * half + pulse
      const backward = p.pass === 'forwardBackward' ? forward.slice().reverse() : []
      const backStart = entranceEnd + forwardLength + 0.25
      const total = p.pass === 'forwardBackward' ? backStart - entranceEnd + (backward.length - 1) * half + pulse : forwardLength
      const period = p.repeat ? total + 0.8 : undefined
      const planned = [
        ...pulseWave(forward, { start: entranceEnd, step: half, color: p.forwardColor, duration: pulse, period }),
        ...pulseWave(backward, { start: backStart, step: half, color: p.backwardColor, duration: pulse, period }),
      ]
      for (const { element, animation } of planned) element.animations = [...element.animations, animation]
    }
    return out
  },
}

const WORD_NUMBERS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 }
const num = (word: string | undefined) => (word == null ? NaN : WORD_NUMBERS[word] ?? Number(word))
const NUM = '(\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)'

/** A shape that rises from `first` to `peak` in the middle and falls to `last` ("seven layers with 12 in the middle"). */
export function peakedLayers(count: number, first: number, peak: number, last: number): number[] {
  if (count <= 2) return [first, last].slice(0, Math.max(2, count))
  const mid = (count - 1) / 2
  return Array.from({ length: count }, (_, i) => {
    if (i === 0) return first
    if (i === count - 1) return last
    const t = i <= mid ? i / mid : (count - 1 - i) / (count - 1 - mid)
    const edge = i <= mid ? first : last
    return Math.max(1, Math.round(edge + (peak - edge) * t))
  })
}

/** Network-specific phrasing → settings. */
export function parseNetwork(text: string, current: Params | null): Partial<Params> {
  const layers = (current?.layers ?? DEFAULTS.layers).slice()
  const out: Partial<Params> = {}

  // An explicit architecture: "layers 3, 4, 2", "[784, 128, 10]", "a 3-5-5-2 network", "3x4x2".
  const list = text.match(/\[\s*(\d+(?:\s*,\s*\d+)+)\s*\]|\b(\d+(?:\s*(?:-|–|x|×)\s*\d+){1,11})\b(?!\s*(?:px|s\b|sec|%))|\b(?:layers?|sizes?|neurons?|architecture|shape)\s*(?:of|=|:|are|is|with)?\s*(\d+(?:\s*,\s*\d+){1,11})/)
  if (list) {
    const values = (list[1] ?? list[2] ?? list[3]).split(/[^\d]+/).filter(Boolean).map(Number)
    if (values.length >= 2) return { layers: values }
  }

  // "784 inputs, two hidden layers of 128 and 64, 10 outputs"
  const inputs = text.match(new RegExp(`\\b${NUM}\\s+(?:inputs?|input (?:neurons|nodes|features))\\b`))
  const outputs = text.match(new RegExp(`\\b${NUM}\\s+(?:outputs?|output (?:neurons|nodes)|classes)\\b`))
  // (A number followed by "outputs"/"classes" is the output layer, not another hidden one.)
  const hiddenList = text.match(/\bhidden layers?\s+(?:of|with|sized?)\s+(\d+(?:\s*(?:,|and)\s*\d+\b(?!\s*(?:outputs?|classes|inputs?|output)))*)/)
  const hiddenCount = text.match(new RegExp(`\\b${NUM}\\s+hidden layers?(?:\\s+(?:of|with)\\s+(\\d+)(?:\\s+(?:neurons|nodes|units))?(?:\\s+each)?)?`))
  const adding = /\b(?:add|insert)\s+(?:a|an|one|another|\d+|two|three)?\s*(?:more\s+)?(?:hidden\s+)?layers?\b/.test(text)
  if (!adding && (inputs || outputs || hiddenList || hiddenCount)) {
    const first = inputs ? num(inputs[1]) : layers[0]
    const last = outputs ? num(outputs[1]) : layers[layers.length - 1]
    let hidden = layers.slice(1, -1)
    if (hiddenList) {
      hidden = hiddenList[1].split(/[^\d]+/).filter(Boolean).map(Number)
      // "two hidden layers of 128": one size for each.
      if (hiddenCount && hidden.length === 1) hidden = Array.from({ length: num(hiddenCount[1]) }, () => hidden[0])
    } else if (hiddenCount) {
      const count = num(hiddenCount[1])
      const size = hiddenCount[2] ? Number(hiddenCount[2]) : hidden[0] ?? 4
      hidden = Array.from({ length: count }, (_, i) => hidden[i] ?? size).map(n => (hiddenCount[2] ? size : n))
    }
    return { layers: [first, ...hidden, last].filter(Number.isFinite) }
  }

  // "seven layers with 12 neurons in the middle", "make it 5 layers"
  const total = text.match(new RegExp(`\\b${NUM}[\\s-]+layers?\\b`))
  const middle = text.match(new RegExp(`\\b${NUM}\\s+(?:neurons?|nodes?|units?)?\\s*(?:in the middle|at the centre|at the center|in the widest layer|at the widest)|\\bmiddle layer (?:of|with|has|to)\\s+${NUM}`))
  if (total && !/\bhidden\b/.test(text)) {
    const count = clamp(num(total[1]), 2, 12)
    const peak = middle ? num(middle[1] ?? middle[2]) : Math.max(...layers.slice(1, -1), layers[0], layers[layers.length - 1])
    out.layers = middle || count !== layers.length
      ? (middle ? peakedLayers(count, layers[0], peak, layers[layers.length - 1]) : resize(layers, count))
      : layers
    return out
  }

  // "add a hidden layer (of 8)", "remove a layer"
  const addLayer = text.match(new RegExp(`\\b(?:add|insert)\\s+(?:a|an|one|another|${NUM})?\\s*(?:more\\s+)?(?:hidden\\s+)?layers?(?:\\s+(?:of|with)\\s+(\\d+))?`))
  if (addLayer) {
    const howMany = addLayer[1] ? num(addLayer[1]) : 1
    const size = addLayer[2] ? Number(addLayer[2]) : layers[layers.length - 2] ?? 4
    for (let k = 0; k < (Number.isFinite(howMany) ? howMany : 1) && layers.length < 12; k++) layers.splice(layers.length - 1, 0, size)
    return { layers }
  }
  if (/\b(?:remove|delete|drop)\s+(?:a|one|the last)?\s*(?:hidden\s+)?layer\b/.test(text) && layers.length > 2) {
    layers.splice(layers.length - 2, 1)
    return { layers }
  }

  // "make the middle layer 12 neurons", "the input layer to 784", "set layer 2 to 6"
  const which = text.match(new RegExp(`\\b(?:the\\s+)?(input|first|output|last|middle|hidden|second|third|fourth|layer\\s+(\\d+))\\s*(?:layer)?\\s+(?:to|of|has|with|=|:)?\\s*(\\d+)\\s*(?:neurons?|nodes?|units?)?`))
  if (which && current) {
    const name = which[1]
    const size = Number(which[3])
    const index = name === 'input' || name === 'first' ? 0
      : name === 'output' || name === 'last' ? layers.length - 1
      : name === 'middle' || name === 'hidden' ? Math.floor((layers.length - 1) / 2) || 1
      : name === 'second' ? 1 : name === 'third' ? 2 : name === 'fourth' ? 3
      : which[2] ? Number(which[2]) - 1 : -1
    if (index >= 0 && index < layers.length) {
      layers[index] = size
      return { layers }
    }
  }
  // "bigger"/"smaller" neurons → scale the block.
  if (current && /\b(?:bigger|larger)\b/.test(text)) out.size = clamp(current.size * 1.2, 40, 150)
  if (current && /\bsmaller\b/.test(text)) out.size = clamp(current.size / 1.2, 40, 150)
  return out
}

/** Keeps the first and last layer and stretches/shrinks the hidden ones to `count` layers. */
function resize(layers: number[], count: number): number[] {
  const hidden = layers.slice(1, -1)
  const want = count - 2
  const next = Array.from({ length: want }, (_, i) => hidden.length ? hidden[Math.min(hidden.length - 1, Math.floor((i * hidden.length) / Math.max(1, want)))] : 4)
  return [layers[0], ...next, layers[layers.length - 1]]
}
