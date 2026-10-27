// Numbered AI edits and undoing any one of them later: only what that edit
// changed goes back, later changes are kept, and the undo is itself undoable.
import assert from 'node:assert/strict'
import { useEditorStore } from '../../store/editorStore'
import type { ShapeElement } from '../../types/editor'
import { buildAiProjectContext, planAiEdit, prepareAiPlan } from '..'
import { applyAiPlan, readUndoRequest, undoAiEdit, useAiEditLog } from '../editLog'
import { changedScenes } from '../preview'
import { loadFixture } from './fixture'

;(globalThis as { window?: unknown }).window ??= { api: {} }

const project = () => useEditorStore.getState().project!
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function apply(prompt: string) {
  const context = buildAiProjectContext()!
  const planned = await planAiEdit(prompt, context)
  const prepared = prepareAiPlan(planned.plan, context)
  const { results, edit } = applyAiPlan(prepared.plan, prompt)
  assert.deepEqual(results.filter(r => !r.ok).map(r => r.message), [], prompt)
  return edit!
}

const circlesOn = (sceneIndex: number) => project().scenes[sceneIndex].elements.filter(e => e.type === 'shape' && (e as ShapeElement).shapeType === 'circle')

const tests: Array<[string, () => Promise<void>]> = [
  ['edits are numbered, and an older one is undone without losing a newer one', async () => {
    loadFixture()
    useAiEditLog.setState({ edits: [], nextId: {} })
    const circles = circlesOn(1).length
    const first = await apply('add a purple circle on scene 2')
    const second = await apply('make scene 3 5s long')
    assert.deepEqual([first.id, second.id], [1, 2])
    assert.equal(circlesOn(1).length, circles + 1)
    const { result, error } = undoAiEdit(1)
    assert.equal(error, undefined)
    assert.equal(circlesOn(1).length, circles, 'the circle from #1 is gone')
    assert.equal(project().scenes[2].duration, 5, '#2 is kept')
    assert.deepEqual(result!.skipped, [])
    assert.equal(useAiEditLog.getState().edits.find(e => e.id === 1)!.undone, true)
    assert.match(undoAiEdit(1).error!, /already undone/)
    // "undo the last AI edit" now means #2.
    undoAiEdit('last')
    assert.equal(project().scenes[2].duration, 6)
  }],
  ['what was changed after the edit is kept, and said so', async () => {
    loadFixture()
    useAiEditLog.setState({ edits: [], nextId: {} })
    const edit = await apply('add a purple circle on scene 2')
    const circle = circlesOn(1).at(-1)!
    useEditorStore.getState().updateElement(circle.id, { fill: '#00ff00' } as Partial<ShapeElement>)
    const { result } = undoAiEdit(edit.id)
    assert.ok(circlesOn(1).some(c => c.id === circle.id), 'kept')
    assert.match(result!.skipped.join(' '), /was changed after this edit/)
  }],
  ['a deleted scene comes back in its place; later changes elsewhere stay', async () => {
    const f = loadFixture()
    useAiEditLog.setState({ edits: [], nextId: {} })
    const edit = await apply('delete scene 2')
    assert.equal(project().scenes.length, 3)
    useEditorStore.getState().updateElement(f.el.thanks.id, { content: 'Bye' } as never)
    undoAiEdit(edit.id)
    assert.deepEqual(project().scenes.map(s => s.id), f.scenes.map(s => s.id))
    assert.equal((project().scenes[2].elements[0] as { content: string }).content, 'Bye')
  }],
  ['undoing an AI edit is one normal undo step: Ctrl+Z brings the edit back', async () => {
    loadFixture()
    useAiEditLog.setState({ edits: [], nextId: {} })
    const circles = circlesOn(1).length
    const edit = await apply('add a purple circle on scene 2')
    await wait(650) // history is saved shortly after a change
    undoAiEdit(edit.id)
    await wait(650)
    assert.equal(circlesOn(1).length, circles)
    useEditorStore.getState().undo()
    assert.equal(circlesOn(1).length, circles + 1)
  }],
  ['undo requests and changed scenes', async () => {
    assert.equal(readUndoRequest('undo #3'), 3)
    assert.equal(readUndoRequest('Undo edit 12'), 12)
    assert.equal(readUndoRequest('revert AI edit #2.'), 2)
    assert.equal(readUndoRequest('undo the last ai edit'), 'last')
    assert.equal(readUndoRequest('undo last edit'), 'last')
    assert.equal(readUndoRequest('undo the title animation'), null)
    loadFixture()
    const before = JSON.parse(JSON.stringify(project()))
    await apply('make scene 3 5s long and add a new scene')
    assert.deepEqual(changedScenes(before, project()).map(s => project().scenes.indexOf(s) + 1), [3, 5])
  }],
]

async function main() {
  let failed = 0
  for (const [name, test] of tests) {
    try {
      await test()
    } catch (error) {
      failed++
      console.error(`✘ ${name}\n  ${(error as Error).message.split('\n').slice(0, 6).join('\n  ')}`)
    }
  }
  if (failed) {
    console.error(`\n${failed}/${tests.length} AI edit log tests failed`)
    process.exit(1)
  }
  console.log(`ai edit log tests passed (${tests.length})`)
  process.exit(0)
}

main().catch(error => { console.error(error); process.exit(1) })
