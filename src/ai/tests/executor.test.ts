// End to end: prompt → parse → prepare → execute against the real store, then
// check the project. Multi-step plans must stay correct as scenes are added,
// removed and reordered, and a whole plan must undo in one step.
import assert from 'node:assert/strict'
import { useEditorStore } from '../../store/editorStore'
import { buildAiProjectContext, executeAiPlan, planAiEdit, prepareAiPlan } from '..'
import type { TextElement, VideoElement, ShapeElement } from '../../types/editor'
import { loadFixture } from './fixture'

;(globalThis as { window?: unknown }).window ??= { api: {} }

const project = () => useEditorStore.getState().project!
const ids = () => project().scenes.map(s => s.id)
const durations = () => project().scenes.map(s => s.duration)

async function run(prompt: string) {
  const context = buildAiProjectContext()!
  const planned = await planAiEdit(prompt, context)
  const prepared = prepareAiPlan(planned.plan, context)
  const issues = [...(planned.issues ?? []), ...prepared.issues]
  assert.deepEqual(issues.map(i => i.message), [], `issues for "${prompt}"`)
  const results = executeAiPlan(prepared.plan)
  const failed = results.filter(r => !r.ok)
  assert.deepEqual(failed.map(r => r.message), [], `failed commands for "${prompt}"`)
  return results
}

const tests: Array<[string, () => Promise<void>]> = [
  ['deleting several scenes removes exactly those scenes', async () => {
    const f = loadFixture()
    await run('delete scene 2 and 4')
    assert.deepEqual(ids(), [f.scenes[0].id, f.scenes[2].id])
  }],
  ['swap exchanges two scenes', async () => {
    const f = loadFixture()
    const [a, b, c, d] = f.scenes.map(s => s.id)
    await run('swap scene 1 and 3')
    assert.deepEqual(ids(), [c, b, a, d])
  }],
  ['move scene before another', async () => {
    const f = loadFixture()
    const [a, b, c, d] = f.scenes.map(s => s.id)
    await run('move scene 4 before scene 2')
    assert.deepEqual(ids(), [a, d, b, c])
  }],
  ['a new scene gets its title', async () => {
    loadFixture()
    await run("add a new scene with title 'Chapter 2'")
    const last = project().scenes.at(-1)!
    assert.equal(project().scenes.length, 5)
    assert.equal((last.elements[0] as TextElement).content, 'Chapter 2')
  }],
  ['"it" refers to the element the previous clause added', async () => {
    loadFixture()
    await run("add a title 'Hello' and make it fade in")
    const hello = project().scenes[0].elements.find(e => e.type === 'text' && (e as TextElement).content === 'Hello')!
    assert.deepEqual(hello.animations.map(a => [a.type, a.timing]), [['fadeIn', 'onEnter']])
  }],
  ['"it" refers to the scene the previous clause duplicated', async () => {
    const f = loadFixture()
    await run('duplicate scene 2 and make it 6 seconds')
    assert.equal(project().scenes[1].id, f.scenes[1].id)
    assert.deepEqual(durations(), [5, 4, 6, 6, 3])
  }],
  ['split into parts keeps the original scene first', async () => {
    const f = loadFixture()
    await run('split scene 3 into 3 parts')
    assert.deepEqual(durations(), [5, 4, 2, 2, 2, 3])
    assert.equal(project().scenes[2].id, f.scenes[2].id)
  }],
  ['trimming the start of a scene removes its opening', async () => {
    const f = loadFixture()
    await run('trim the first 2 seconds of scene 3')
    assert.deepEqual(durations(), [5, 4, 4, 3])
    assert.ok(!ids().includes(f.scenes[2].id))
  }],
  ['speeding up a clip keeps the same source span', async () => {
    const f = loadFixture()
    f.goTo(2)
    await run('speed up the video 2x')
    const video = project().scenes[1].elements.find(e => e.id === f.el.video.id) as VideoElement
    assert.equal(video.playbackRate, 2)
    assert.equal(video.duration, 2)
  }],
  ['new shapes are placed with their real size', async () => {
    loadFixture()
    await run('add a red circle with a white border in the bottom right')
    const circle = project().scenes[0].elements.at(-1) as ShapeElement
    assert.equal(circle.shapeType, 'circle')
    assert.equal(circle.stroke, '#ffffff')
    assert.equal(circle.x, 1920 - circle.width - 80)
    assert.equal(circle.y, 1080 - circle.height - 80)
  }],
  ['adding scenes after a scene', async () => {
    const f = loadFixture()
    await run('add 2 scenes after scene 2')
    assert.equal(project().scenes.length, 6)
    assert.equal(project().scenes[1].id, f.scenes[1].id)
    assert.equal(project().scenes[4].id, f.scenes[2].id)
  }],
  ['a whole plan undoes in one step', async () => {
    const f = loadFixture()
    const before = JSON.stringify(project().scenes)
    await run('make the circle twice as big and delete scene 4')
    assert.notEqual(JSON.stringify(project().scenes), before)
    assert.equal((project().scenes[0].elements.find(e => e.id === f.el.redCircle.id) as ShapeElement).width, 400)
    useEditorStore.getState().undo()
    assert.equal(JSON.stringify(project().scenes), before)
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
    console.error(`\n${failed}/${tests.length} executor tests failed`)
    process.exit(1)
  }
  console.log(`ai executor tests passed (${tests.length} plans)`)
}

main().catch(error => { console.error(error); process.exit(1) })
