// End to end: prompt → parse → prepare → execute against the real store, then
// check the project. Multi-step plans must stay correct as scenes are added,
// removed and reordered, and a whole plan must undo in one step.
import assert from 'node:assert/strict'
import { useEditorStore } from '../../store/editorStore'
import { buildAiProjectContext, executeAiPlan, planAiEdit, prepareAiPlan } from '..'
import type { TextElement, VideoElement, ShapeElement } from '../../types/editor'
import { loadFixture } from './fixture'
import { CAPTION_PRESETS, matchingCaptionPreset } from '../../subtitle/presets'
import { defaultSubtitleStyle } from '../../subtitle/types'

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
  ['caption presets style the project captions, and tweaks go on top', async () => {
    loadFixture()
    const track = () => project().subtitleTracks?.[0]
    const context = buildAiProjectContext()!
    const planned = await planAiEdit('use bold captions', context)
    const prepared = prepareAiPlan(planned.plan, context)
    assert.ok(prepared.issues.some(i => /no captions yet/.test(i.message)), 'explains there are no captions yet')
    executeAiPlan(prepared.plan)
    const style = track()!.style
    assert.equal(style.uppercase, true)
    assert.equal(style.activeColor, '#facc15')
    assert.equal(style.fontSize, 81)
    assert.equal(matchingCaptionPreset(style, { width: 1920, height: 1080 })?.id, 'bold')
    useEditorStore.getState().upsertSubtitleTrack({ ...track()!, cues: [{ id: 'c1', start: 0, end: 2, text: 'hello there' }] })
    await run('make the captions bigger and move them to the bottom')
    assert.equal(track()!.style.fontSize, 101)
    assert.equal(track()!.style.positionY, 88)
    assert.equal(track()!.style.uppercase, true, 'the preset stays')
    assert.equal(track()!.cues.length, 1, 'cues are untouched')
    for (const preset of CAPTION_PRESETS) {
      for (const frame of [{ width: 1920, height: 1080 }, { width: 1080, height: 1920 }]) {
        assert.equal(matchingCaptionPreset({ ...defaultSubtitleStyle(), ...preset.style(frame) }, frame)?.id, preset.id, `${preset.id} is recognised`)
      }
    }
  }],
  ['split screen tiles the clips without stretching them, and undoes', async () => {
    const f = loadFixture()
    f.goTo(2)
    await run('put the image and the video side by side')
    const scene = () => project().scenes[1]
    const find = (id: string) => scene().elements.find(e => e.id === id) as VideoElement
    const [image, video] = [find(f.el.image.id), find(f.el.video.id)]
    assert.deepEqual([image.x, image.width, image.height, video.x, video.width], [0, 960, 1080, 960, 960])
    // The video is 16:9, the tile is 960×1080: it is cropped to the tile's shape around its centre.
    assert.ok(Math.abs(video.crop!.w - (960 / 1080) / (16 / 9)) < 0.001, JSON.stringify(video.crop))
    assert.ok(Math.abs(video.crop!.x + video.crop!.w / 2 - 0.5) < 0.001)
    useEditorStore.getState().undo()
    assert.deepEqual([find(f.el.video.id).x, find(f.el.video.id).width, find(f.el.video.id).crop], [400, 640, undefined])
  }],
  ['clips go exactly where the prompt says, in a vertical frame', async () => {
    const f = loadFixture()
    useEditorStore.setState(s => ({ project: { ...s.project!, width: 1080, height: 1920 } }))
    f.goTo(2)
    const scene = () => project().scenes[1]
    const find = (id: string) => scene().elements.find(e => e.id === id) as VideoElement
    await run('put the video in the upper half and the image in the lower half')
    let video = find(f.el.video.id)
    let image = find(f.el.image.id)
    assert.deepEqual([video.x, video.y, video.width, video.height], [0, 0, 1080, 960])
    assert.deepEqual([image.x, image.y, image.width, image.height], [0, 960, 1080, 960])
    // Not stretched: the 16:9 video shows its centre strip at 1080:960.
    assert.ok(Math.abs((video.width / video.crop!.w) / (video.height / video.crop!.h) - 16 / 9) < 0.01, JSON.stringify(video.crop))

    await run('make the video full screen and the image bottom right at 400x300')
    video = find(f.el.video.id)
    image = find(f.el.image.id)
    assert.deepEqual([video.x, video.y, video.width, video.height], [0, 0, 1080, 1920])
    assert.deepEqual([image.x, image.y, image.width, image.height], [1080 - 32 - 400, 1920 - 32 - 300, 400, 300])
    // The full-screen video is the backdrop; the small image is in front of it.
    const z = scene().elements.slice().sort((a, b) => a.zIndex - b.zIndex).map(e => e.id)
    assert.equal(z[0], f.el.video.id)
    assert.ok(z.indexOf(f.el.image.id) > z.indexOf(f.el.video.id))
    // The 3:2 image is cropped to 4:3, not squashed.
    assert.ok(Math.abs((image.width / image.crop!.w) / (image.height / image.crop!.h) - 1.5) < 0.01, JSON.stringify(image.crop))
  }],
  ['a smart block is added, then edited by name', async () => {
    loadFixture()
    await run("add a lower third for 'Adya' 'ML engineer'")
    const group = () => Object.values(project().scenes[0].groups ?? {}).find(g => g.smart?.blockId === 'lowerThird')!
    const g = group()
    assert.ok(g, 'block group created')
    const parts = () => project().scenes[0].elements.filter(e => e.groupId === g.id)
    const nameId = parts().find(e => e.blockKey === 'name')!.id
    assert.equal((parts().find(e => e.blockKey === 'name') as TextElement).content, 'Adya')
    await run("change the lower third name to 'Adya P' and make it green")
    assert.equal(group().smart!.params.name, 'Adya P')
    assert.equal(group().smart!.params.accent, '#22c55e')
    const name = parts().find(e => e.blockKey === 'name') as TextElement
    assert.equal(name.id, nameId, 'rebuild keeps ids')
    assert.equal(name.content, 'Adya P')
    useEditorStore.getState().undo()
    assert.equal(group().smart!.params.name, 'Adya')
  }],
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
  ['a forward and backward wave share one repeat', async () => {
    const f = loadFixture()
    f.goTo(2)
    await run('pulse all circles left to right one by one 0.25s apart, then flash them red right to left and repeat')
    const anims = (id: string) => project().scenes[1].elements.find(e => e.id === id)!.animations
    const [green, red] = [anims(f.el.greenCircle.id), anims(f.el.redCircle2.id)] // green is left of red
    const delay = (list: typeof green, type: string) => list.find(a => a.type === type)!.delay
    // forward: green 0, red 0.25; ends 0.25 + 0.4 = 0.65. Backward (right to left): red 0.65, green 0.9.
    assert.equal(delay(green, 'pulse'), 0)
    assert.equal(delay(red, 'pulse'), 0.25)
    assert.equal(delay(red, 'colorPulse'), 0.65)
    assert.equal(delay(green, 'colorPulse'), 0.9)
    const period = 0.9 + 0.4 + 0.5 // backward ends + default gap
    assert.ok([...green, ...red].every(a => a.repeatEvery === period), JSON.stringify([...green, ...red].map(a => a.repeatEvery)))
    assert.equal(green.find(a => a.type === 'colorPulse')!.params?.pulseColor, '#ef4444')
    // Running it again replaces instead of stacking.
    await run('pulse all circles left to right one by one 0.25s apart')
    assert.equal(anims(f.el.greenCircle.id).filter(a => a.type === 'pulse').length, 1)
  }],
  ['connectors attach, sit behind, and follow', async () => {
    const f = loadFixture()
    await run('connect the title to the logo box')
    const scene = () => project().scenes[0]
    const arrow = scene().elements.find(e => e.type === 'arrow') as import('../../types/editor').ArrowElement
    assert.equal(arrow.startAttach?.elementId, f.el.title.id)
    assert.equal(arrow.endAttach?.elementId, f.el.logoBox.id)
    assert.ok(scene().elements.every(e => e.id === arrow.id || e.zIndex > arrow.zIndex), 'behind everything')
    useEditorStore.getState().updateElement(f.el.logoBox.id, { y: 900 })
    const moved = scene().elements.find(e => e.id === arrow.id) as import('../../types/editor').ArrowElement
    assert.notEqual(moved.y2, arrow.y2, 'end followed the box')
  }],
  ['a new shape can be connected in the same request', async () => {
    loadFixture()
    await run("add a red circle in the bottom right and connect it to the title")
    const arrows = project().scenes[0].elements.filter(e => e.type === 'arrow')
    assert.equal(arrows.length, 1)
  }],
  ['grouping by AI, then referring to the group by name', async () => {
    const f = loadFixture()
    f.goTo(2)
    await run("group all circles as 'Layer 1'")
    const scene = () => project().scenes[1]
    const groupId = scene().elements.find(e => e.id === f.el.greenCircle.id)!.groupId!
    assert.equal(scene().groups?.[groupId]?.name, 'Layer 1')
    assert.equal(scene().elements.find(e => e.id === f.el.redCircle2.id)!.groupId, groupId)
    await run('make the layer 1 group blue')
    const fills = scene().elements.filter(e => e.groupId === groupId).map(e => (e as import('../../types/editor').ShapeElement).fill)
    assert.deepEqual(fills, ['#3b82f6', '#3b82f6'])
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
