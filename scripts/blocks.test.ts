// UGC smart blocks: they fit the frame in 16:9 and 9:16 (even with long
// text), clean up bad input, give every part a stable key, and time their
// animations as configured.
import assert from 'node:assert/strict'
import { getBlock, listBlocks } from '../src/blocks/registry'
import { useEditorStore } from '../src/store/editorStore'
import type { CodeElement, EditorElement, LatexElement, TextElement } from '../src/types/editor'
import { parseNetwork, peakedLayers, shownNeurons } from '../src/blocks/technical/neuralNetwork'
import { levelsOf, parseFlowchart, parseLinks } from '../src/blocks/technical/flowchart'
import { parseEquation } from '../src/blocks/technical/equation'
import { parseSteps, parseWalkthrough } from '../src/blocks/technical/codeWalkthrough'
import { codeLineHeight, codeLineTop } from '../src/utils/codeLayout'
import { makeProject } from '../src/utils/defaults'

const frames = [{ width: 1920, height: 1080 }, { width: 1080, height: 1920 }]
const LONG = 'This is a deliberately long piece of text that has to wrap onto several lines without leaving the frame'

function inside(el: EditorElement, frame: { width: number; height: number }) {
  const [x1, y1, x2, y2] = el.type === 'arrow'
    ? [Math.min(el.x1, el.x2), Math.min(el.y1, el.y2), Math.max(el.x1, el.x2), Math.max(el.y1, el.y2)]
    : [el.x, el.y, el.x + el.width, el.y + el.height]
  return x1 >= -0.5 && y1 >= -0.5 && x2 <= frame.width + 0.5 && y2 <= frame.height + 0.5
}

assert.deepEqual(listBlocks('ugc').map(b => b.id), ['titleCard', 'lowerThird', 'hook'])

for (const block of listBlocks('ugc')) {
  for (const frame of frames) {
    for (const params of [{}, { title: LONG, subtitle: LONG, name: 'Alexandria Montgomery-Smith', role: 'Head of Product Design', text: LONG }]) {
      const els = block.build(block.normalize(params), frame)
      assert.ok(els.length > 0, `${block.id} builds something`)
      const outside = els.filter(el => !inside(el, frame))
      assert.deepEqual(outside.map(el => el.blockKey), [], `${block.id} ${frame.width}x${frame.height}: parts outside the frame`)
      const keys = els.map(el => el.blockKey)
      assert.ok(keys.every(Boolean), `${block.id}: every part has a blockKey`)
      assert.equal(new Set(keys).size, keys.length, `${block.id}: blockKeys are unique`)
    }
  }
  // Bad input never breaks a block.
  const messy = block.normalize({ size: 99999, style: 'nonsense', accent: 'red', holdFor: -4, showAt: 'soon', title: 42 })
  assert.equal(messy.size, 200)
  assert.equal(messy.style, block.defaults.style)
  assert.equal((messy as { accent?: string }).accent, (block.defaults as { accent?: string }).accent)
}

{ // hook: one element per word, highlighted words coloured, popping in order
  const hook = getBlock('hook')!
  const p = hook.normalize({ text: 'Stop scrolling, this changes EVERYTHING!', emphasis: 'everything, stop', animation: 'wordPop', wordStep: 0.1, startAt: 1 })
  const words = hook.build(p, frames[1]).filter(el => el.type === 'text') as TextElement[]
  assert.deepEqual(words.map(w => w.content), ['Stop', 'scrolling,', 'this', 'changes', 'EVERYTHING!'])
  assert.deepEqual(words.map(w => w.color === p.highlightColor), [true, false, false, false, true])
  assert.deepEqual(words.map(w => w.animations[0].delay), [1, 1.1, 1.2, 1.3, 1.4])
}

{ // lower third: right side hugs the right margin; it leaves after hideAfter
  const block = getBlock('lowerThird')!
  const p = block.normalize({ side: 'right', showAt: 2, hideAfter: 3 })
  const els = block.build(p, frames[0])
  const right = Math.max(...els.map(el => el.x + el.width))
  assert.ok(Math.abs(right - 1920 * 0.94) < 1, `right edge ${right}`)
  assert.ok(els.every(el => el.animations.some(a => a.type === 'fadeOut' && a.delay === 5)))
  assert.ok(els.every(el => el.animations.filter(a => a.timing === 'onEnter').every(a => a.delay >= 2)))
}

{ // title card: no background when asked; leaves after holdFor
  const block = getBlock('titleCard')!
  const plain = block.build(block.normalize({ background: 'none' }), frames[0])
  assert.ok(!plain.some(el => el.blockKey === 'background'))
  const timed = block.build(block.normalize({ holdFor: 4 }), frames[0])
  assert.ok(timed.every(el => el.animations.some(a => a.type === 'fadeOut' && a.delay === 4)))
}

{ // rebuilding a placed title card with a new style keeps the title's id
  const project = makeProject('p', 'blocks')
  useEditorStore.getState().loadProject(project)
  const groupId = useEditorStore.getState().insertBlock('titleCard', { title: 'Intro' })!
  const titleId = () => useEditorStore.getState().project!.scenes[0].elements.find(el => el.blockKey === 'title')!.id
  const before = titleId()
  useEditorStore.getState().rebuildBlock(groupId, { style: 'boxed' })
  assert.equal(titleId(), before)
  const title = useEditorStore.getState().project!.scenes[0].elements.find(el => el.id === before) as TextElement
  assert.equal(title.bgEnabled, true)
  assert.equal(title.content, 'Intro')
}

// ── Technical blocks ─────────────────────────────────────────────────────────
const STRESS: Record<string, Record<string, unknown>> = {
  neuralNetwork: { layers: [784, 512, 256, 128, 64, 32, 16, 10], labels: ['Pixels', 'Very long hidden layer name'] },
  flowchart: { steps: Array.from({ length: 14 }, (_, i) => `Step number ${i + 1} with a longer name`), links: '14>2 retry, 7>3' },
  equationReveal: { steps: Array.from({ length: 8 }, (_, i) => `x_${i} = \\frac{a+b}{c+d} + \\sum_{k=0}^{n} k^${i}`), title: 'A long derivation' },
  codeWalkthrough: { code: Array.from({ length: 40 }, (_, i) => `result_${i} = compute_something_long(alpha, beta, gamma, delta_${i})`).join('\n'), steps: '1-5: Setup\n30-40: The end of a long file with a long note to wrap' },
}
assert.deepEqual(listBlocks('technical').map(b => b.id), ['neuralNetwork', 'flowchart', 'equationReveal', 'codeWalkthrough'])
for (const block of listBlocks('technical')) {
  for (const frame of frames) {
    for (const params of [{}, STRESS[block.id]]) {
      const els = block.build(block.normalize(params), frame)
      assert.ok(els.length > 0, `${block.id} builds something`)
      const outside = els.filter(el => !inside(el, frame))
      assert.deepEqual(outside.map(el => el.blockKey), [], `${block.id} ${frame.width}x${frame.height}: parts outside the frame`)
      const keys = els.map(el => el.blockKey)
      assert.ok(keys.every(Boolean), `${block.id}: every part has a blockKey`)
      assert.equal(new Set(keys).size, keys.length, `${block.id}: blockKeys are unique`)
      // Connectors attach to parts of the same block.
      const ids = new Set(els.map(el => el.id))
      for (const el of els) if (el.type === 'arrow') assert.ok(ids.has(el.startAttach!.elementId) && ids.has(el.endAttach!.elementId), `${block.id}: ${el.blockKey} is attached`)
    }
  }
}

{ // network: compact big layers, connection counts, forward/backward pass timing
  const net = getBlock('neuralNetwork')!
  assert.deepEqual(shownNeurons(5), [0, 1, 2, 3, 4])
  assert.deepEqual(shownNeurons(784), [0, 1, 2, 3, -1, 780, 781, 782, 783])
  const big = net.build(net.normalize({ layers: [784, 128, 10] }), frames[0])
  // As many as fit (here 7 + ⋮ + 7), with the first and last neurons kept.
  const shownBig = big.filter(el => el.blockKey?.startsWith('n-0-')).map(el => el.blockKey)
  assert.ok(shownBig.length >= 8 && shownBig.length <= 16 && shownBig.includes('n-0-0') && shownBig.includes('n-0-783'), String(shownBig))
  assert.deepEqual(shownNeurons(20, 9), [0, 1, 2, 3, -1, 16, 17, 18, 19])
  // A 12-neuron layer fits in full on 16:9.
  const twelve = net.build(net.normalize({ layers: [3, 12, 2] }), frames[0])
  assert.equal(twelve.filter(el => el.blockKey?.startsWith('n-1-')).length, 12)
  assert.ok(!twelve.some(el => el.blockKey === 'dots-1'))
  assert.ok(big.some(el => el.blockKey === 'dots-0'))
  assert.match((big.find(el => el.blockKey === 'label-0') as TextElement).content, /Input \(784\)/)
  const count = (layers: number[], connections: string) => net.build(net.normalize({ layers, connections }), frames[0]).filter(el => el.type === 'arrow').length
  assert.equal(count([3, 4, 2], 'full'), 3 * 4 + 4 * 2)
  assert.equal(count([3, 4, 2], 'sparse'), 3 * 2 + 4 * 2)
  assert.equal(count([3, 4, 2], 'none'), 0)
  const els = net.build(net.normalize({ layers: [2, 3, 2], pass: 'forwardBackward', stepTime: 0.4 }), frames[0])
  const pulses = (key: string) => els.find(el => el.blockKey === key)!.animations.filter(a => a.type === 'colorPulse')
  const [f0, b0] = pulses('n-0-0')
  const [f2, b2] = pulses('n-2-0')
  assert.ok(f0.delay < f2.delay, 'forward: input before output')
  assert.ok(b2.delay < b0.delay, 'backward: output before input')
  assert.equal(f0.params?.pulseColor, '#facc15')
  assert.equal(b0.params?.pulseColor, '#f87171')
  assert.ok(f0.repeatEvery! > 0 && f0.repeatEvery === b0.repeatEvery, 'repeats as one sequence')
  // Lines start pulsing between their layers.
  const line = pulses('c-n-0-0-n-1-0')[0]
  assert.ok(line.delay > f0.delay && line.delay < pulses('n-1-0')[0].delay)
  // Portrait runs top to bottom.
  const tall = net.build(net.normalize({ layers: [2, 2] }), frames[1])
  const [a, b] = ['n-0-0', 'n-1-0'].map(k => tall.find(el => el.blockKey === k)!)
  assert.ok(b.y > a.y + 50 && Math.abs(a.x - b.x) < 1)
}

{ // network phrasing
  const cur = getBlock('neuralNetwork')!.normalize({ layers: [3, 4, 2] }) as Record<string, unknown> & { layers: number[] }
  const seven = parseNetwork('make it seven layers with 12 neurons in the middle', cur as never).layers!
  assert.equal(seven.length, 7)
  assert.deepEqual([seven[0], seven[3], seven[6]], [3, 12, 2])
  assert.ok(seven.slice(0, 4).every((n, i) => i === 0 || n >= seven[i - 1]) && seven.slice(3).every((n, i, a) => i === 0 || n <= a[i - 1]), `rises then falls: ${seven}`)
  assert.deepEqual(parseNetwork('784 inputs, two hidden layers of 128 and 10 outputs', null).layers, [784, 128, 128, 10])
  assert.deepEqual(parseNetwork('a 3-5-5-2 network', null).layers, [3, 5, 5, 2])
  assert.deepEqual(parseNetwork('layers 784, 128, 10', null).layers, [784, 128, 10])
  assert.deepEqual(parseNetwork('a 3-layer neural network', null).layers, [3, 4, 2])
  assert.deepEqual(parseNetwork('add a hidden layer of 8', cur as never).layers, [3, 4, 8, 2])
  assert.deepEqual(parseNetwork('remove a layer', { ...cur, layers: [3, 4, 4, 2] } as never).layers, [3, 4, 2])
  assert.deepEqual(parseNetwork('make the input layer 10 neurons', cur as never).layers, [10, 4, 2])
  assert.deepEqual(parseNetwork('set layer 2 to 6', cur as never).layers, [3, 6, 2])
  assert.deepEqual(peakedLayers(2, 3, 9, 1), [3, 1])
}

{ // flowchart: links, levels, decisions, snake, phrasing
  assert.deepEqual(parseLinks('4>2 retry, 3->5, 9>1, 2>2', 5), [{ from: 3, to: 1, label: 'retry' }, { from: 2, to: 4, label: undefined }])
  assert.deepEqual(levelsOf(4, [{ from: 0, to: 1 }, { from: 0, to: 2 }, { from: 1, to: 3 }, { from: 2, to: 3 }, { from: 3, to: 0 }]), [0, 1, 1, 2])
  const flow = getBlock('flowchart')!
  const els = flow.build(flow.normalize({}), frames[0])
  assert.equal((els.find(el => el.blockKey === 'node-good-enough') as { shapeType: string }).shapeType, 'diamond')
  assert.ok(els.some(el => el.blockKey?.startsWith('edge-label-') && (el as TextElement).content === 'no'))
  const back = els.find(el => el.blockKey === 'edge-node-good-enough-node-train-model') as { dashed: boolean }
  assert.equal(back.dashed, true, 'loops back are dashed')
  // Steps reveal in order.
  const t = (k: string) => els.find(el => el.blockKey === k)!.animations[0].delay
  assert.ok(t('node-collect-data') < t('node-clean') && t('node-clean') < t('node-train-model'))
  // A long chain wraps: 12 steps in landscape use more than one row.
  const long = flow.build(flow.normalize({ steps: Array.from({ length: 12 }, (_, i) => `S${i + 1}`), links: '' }), frames[0])
  const rows = new Set(long.filter(el => el.blockKey?.startsWith('node-')).map(el => Math.round(el.y)))
  assert.ok(rows.size >= 3, `snake rows: ${rows.size}`)

  const cur = flow.normalize({}) as never as { steps: string[]; links: string }
  assert.deepEqual(parseFlowchart('add a flowchart: load data -> clean -> train', [], null).steps, ['Load data', 'Clean', 'Train'])
  assert.deepEqual(parseFlowchart('add a pipeline ⟦0⟧ ⟦1⟧ ⟦2⟧', ['Ingest', 'Embed', 'Index'], null).steps, ['Ingest', 'Embed', 'Index'])
  const added = parseFlowchart('add a step ⟦0⟧ after ⟦1⟧ in the flowchart', ['Test', 'Train model'], cur as never)
  assert.deepEqual(added.steps, ['Collect data', 'Clean', 'Train model', 'Test', 'Good enough?', 'Deploy'])
  assert.equal(added.links, '5>3 no, 5>6 yes', 'links follow the steps they point at')
  const removed = parseFlowchart('remove the step ⟦0⟧ from the flowchart', ['Clean'], cur as never)
  assert.deepEqual(removed.steps, ['Collect data', 'Train model', 'Good enough?', 'Deploy'])
  assert.equal(removed.links, '3>2 no, 3>4 yes')
  assert.deepEqual(parseFlowchart('rename ⟦0⟧ to ⟦1⟧', ['Clean', 'Preprocess'], cur as never).steps![1], 'Preprocess')
  assert.equal(parseFlowchart('connect ⟦0⟧ back to ⟦1⟧ in the flowchart labelled ⟦2⟧', ['Deploy', 'Collect data', 'retrain'], cur as never).links, '4>3 no, 4>5 yes, 5>1 retrain')
}

{ // equation: one step after another; replace mode hands over; markers follow
  const eq = getBlock('equationReveal')!
  const stack = eq.build(eq.normalize({ steps: ['a=b', 'b=c', 'a=c'], stepTime: 2, startAt: 1 }), frames[0])
  const steps = ['step-0', 'step-1', 'step-2'].map(k => stack.find(el => el.blockKey === k) as LatexElement)
  assert.deepEqual(steps.map(s => s.animations[0].delay), [1, 3, 5])
  assert.ok(steps.every(s => s.fitContent), 'drawn at natural size')
  assert.ok(steps[1].y > steps[0].y, 'stacked')
  assert.ok(stack.find(el => el.blockKey === 'mark-0')!.animations.some(a => a.type === 'fadeOut' && a.delay === 3))
  assert.ok(!stack.find(el => el.blockKey === 'mark-2')!.animations.some(a => a.type === 'fadeOut'), 'the last stays marked')
  const swap = eq.build(eq.normalize({ steps: ['a=b', 'b=c'], mode: 'replace' }), frames[0])
  const [s0, s1] = ['step-0', 'step-1'].map(k => swap.find(el => el.blockKey === k)!)
  assert.equal(s0.y, s1.y, 'same place')
  assert.ok(s0.animations.some(a => a.type === 'fadeOut'))
  assert.deepEqual(parseEquation('add an equation reveal ⟦0⟧ ⟦1⟧', ['x^2=4', 'x=\\pm 2'], null).steps, ['x^2=4', 'x=\\pm 2'])
  assert.deepEqual(parseEquation('add a step ⟦0⟧', ['x=2'], eq.normalize({ steps: ['a'] }) as never).steps, ['a', 'x=2'])
  // LaTeX keeps its commas and bars when typed one per line.
  assert.deepEqual((eq.normalize({ steps: 'f(x, y) = |x|\ng = 1' }) as { steps: string[] }).steps, ['f(x, y) = |x|', 'g = 1'])
}

{ // code walkthrough: highlights sit on their lines; notes beside (16:9) or below (9:16)
  const walk = getBlock('codeWalkthrough')!
  assert.deepEqual(parseSteps('1-3: Load\nline 5 — Train\nlines 7 to 99: Rest\nnot a step', 10), [
    { from: 1, to: 3, note: 'Load' }, { from: 5, to: 5, note: 'Train' }, { from: 7, to: 10, note: 'Rest' }])
  const p = walk.normalize({ code: 'a = 1\nb = 2\nc = 3\nd = 4', steps: '2-3: Middle\n4: End', stepTime: 2 })
  const els = walk.build(p, frames[0])
  const code = els.find(el => el.blockKey === 'code') as CodeElement
  const hl = els.find(el => el.blockKey === 'hl-0')!
  assert.equal(hl.y, code.y + codeLineTop(code.fontSize, 1))
  assert.equal(Math.round(hl.height), Math.round(2 * codeLineHeight(code.fontSize)))
  assert.equal(code.code, 'a = 1\nb = 2\nc = 3\nd = 4', 'line breaks kept')
  const note = els.find(el => el.blockKey === 'note-0')!
  assert.ok(note.x > code.x + code.width, 'note beside the code')
  assert.ok(hl.animations.some(a => a.type === 'fadeOut' && a.delay === els.find(el => el.blockKey === 'hl-1')!.animations[0].delay), 'hands over to the next step')
  const tall = walk.build(p, frames[1])
  const tallCode = tall.find(el => el.blockKey === 'code')!
  assert.ok(tall.find(el => el.blockKey === 'note-0')!.y > tallCode.y + tallCode.height, 'note below in portrait')
  assert.deepEqual(parseWalkthrough('add a code walkthrough with lines 1-3 ⟦0⟧ and lines 4-7 ⟦1⟧', ['Imports', 'The model'], null).steps, '1-3: Imports\n4-7: The model')
  assert.equal(parseWalkthrough('walk through this code ⟦0⟧', ['x = f(1)\ny = 2'], null).code, 'x = f(1)\ny = 2')
}

{ // rebuilding a network keeps the ids of neurons that stay, and its lines stay attached
  const project = makeProject('p', 'net')
  useEditorStore.getState().loadProject(project)
  const groupId = useEditorStore.getState().insertBlock('neuralNetwork', { layers: [3, 4, 2] })!
  const els = () => useEditorStore.getState().project!.scenes[0].elements
  const idOf = (key: string) => els().find(el => el.blockKey === key)?.id
  const first = idOf('n-0-0')
  useEditorStore.getState().rebuildBlock(groupId, { layers: [3, 4, 4, 2] })
  assert.equal(idOf('n-0-0'), first)
  const ids = new Set(els().map(el => el.id))
  const arrows = els().filter(el => el.type === 'arrow') as Array<{ startAttach?: { elementId: string }; endAttach?: { elementId: string } }>
  assert.equal(arrows.length, 3 * 4 + 4 * 4 + 4 * 2)
  assert.ok(arrows.every(a => ids.has(a.startAttach!.elementId) && ids.has(a.endAttach!.elementId)))
}

console.log('block tests passed')
