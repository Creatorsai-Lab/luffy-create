// UGC smart blocks: they fit the frame in 16:9 and 9:16 (even with long
// text), clean up bad input, give every part a stable key, and time their
// animations as configured.
import assert from 'node:assert/strict'
import { getBlock, listBlocks } from '../src/blocks/registry'
import { useEditorStore } from '../src/store/editorStore'
import type { EditorElement, TextElement } from '../src/types/editor'
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

console.log('block tests passed')
