// Golden tests for the deterministic prompt parser: each prompt must produce
// exactly these commands (partial match on the listed fields) and issues.
import assert from 'node:assert/strict'
import { useEditorStore } from '../../store/editorStore'
import { parsePrompt } from '../parser'
import { loadFixture } from './fixture'

;(globalThis as { window?: unknown }).window ??= { api: {} }

const f = loadFixture()
const [s1, s2, s3, s4] = f.scenes.map(s => s.id)
const { el } = f

type Case = {
  prompt: string
  setup?: () => void
  commands?: Array<Record<string, unknown>>
  /** Each regex must match one issue message; when omitted there must be no issues. */
  issues?: RegExp[]
  check?: (commands: Array<Record<string, unknown>>) => void
}

const ALIAS = /^el\d+$/
const SCENE_ALIAS = /^scene\d+$/

const cases: Case[] = [
  // ── Examples from docs/ai_agent.md ──────────────────────────────────────────
  { prompt: 'Add a 500x500 purple square on scene 2.',
    commands: [{ type: 'addShape', sceneId: s2, shapeType: 'rect', width: 500, height: 500, fill: '#8b5cf6' }] },
  { prompt: 'Set scene 3 background to black.',
    commands: [{ type: 'setBackground', sceneId: s3, background: { type: 'solid', color: '#111111' } }] },
  { prompt: 'Move the selected item to the right with speed 400 and delay 1.2 seconds.', setup: () => f.select(el.title.id),
    commands: [{ type: 'applyMove', elementId: el.title.id, direction: 'right', speed: 400, delay: 1.2 }] },
  { prompt: 'Add title text "Huber Loss" on scene 1 with font size 72 and white color.',
    commands: [{ type: 'addText', sceneId: s1, text: 'Huber Loss', fontSize: 72, color: '#ffffff', fontWeight: 'bold' }] },
  { prompt: 'Set a fade transition on scene 4 with duration 0.8 seconds.',
    commands: [{ type: 'setTransition', sceneId: s4, transition: { type: 'fade', duration: 0.8 } }] },
  { prompt: 'Make the selected text larger and white.', setup: () => f.select(el.subtitle.id),
    commands: [{ type: 'updateElement', elementId: el.subtitle.id, patch: { color: '#ffffff', fontSize: 50 } }] },
  { prompt: 'Apply move animation to this item toward top right.', setup: () => f.select(el.redCircle.id),
    commands: [{ type: 'applyMove', elementId: el.redCircle.id, direction: 'topRight' }] },

  // ── Regressions from the old regex planner ─────────────────────────────────
  { prompt: "add centered text 'Hi'",
    commands: [{ type: 'addText', text: 'Hi', color: undefined, alias: ALIAS }, { type: 'alignElement', horizontal: 'center', vertical: 'middle' }] },
  { prompt: "add a title 'Intro' and add a fade transition to scene 2",
    commands: [{ type: 'addText', sceneId: s1, text: 'Intro' }, { type: 'setTransition', sceneId: s2, transition: { type: 'fade' } }] },
  { prompt: "add text 'delete scene 2'",
    commands: [{ type: 'addText', text: 'delete scene 2' }] },

  // ── Scenes ──────────────────────────────────────────────────────────────────
  { prompt: 'add a new scene', commands: [{ type: 'addScene', alias: SCENE_ALIAS }] },
  { prompt: 'add 3 scenes', commands: [{ type: 'addScene' }, { type: 'addScene' }, { type: 'addScene' }] },
  { prompt: 'add a 5 second scene after scene 2', commands: [{ type: 'addScene', duration: 5, afterSceneId: s2 }] },
  { prompt: "add a new scene with title 'Chapter 2'",
    commands: [{ type: 'addScene', alias: SCENE_ALIAS }, { type: 'addText', sceneAlias: SCENE_ALIAS, text: 'Chapter 2', fontSize: 72 }] },
  { prompt: "add a new scene and add a title 'Hi'",
    commands: [{ type: 'addScene', alias: SCENE_ALIAS }, { type: 'addText', sceneAlias: SCENE_ALIAS, text: 'Hi' }] },
  { prompt: 'delete scene 3', commands: [{ type: 'removeScene', sceneId: s3 }] },
  { prompt: 'remove scenes 2-4', commands: [{ type: 'removeScene', sceneId: s2 }, { type: 'removeScene', sceneId: s3 }, { type: 'removeScene', sceneId: s4 }] },
  { prompt: 'delete scene 2 and 4', commands: [{ type: 'removeScene', sceneId: s2 }, { type: 'removeScene', sceneId: s4 }] },
  { prompt: 'delete all scenes', issues: [/at least one scene/],
    commands: [{ type: 'removeScene', sceneId: s2 }, { type: 'removeScene', sceneId: s3 }, { type: 'removeScene', sceneId: s4 }] },
  { prompt: 'delete scene 9', issues: [/Scene 9 does not exist/], commands: [] },
  { prompt: 'duplicate scene 2', commands: [{ type: 'duplicateScene', sceneId: s2, alias: SCENE_ALIAS }] },
  { prompt: 'split scene 2 at 3s', commands: [{ type: 'splitScene', sceneId: s2, at: 3 }] },
  { prompt: 'split at 7s', commands: [{ type: 'splitScene', sceneId: s2, at: 2 }] },
  { prompt: 'split scene 3 into 3 parts', commands: [{ type: 'splitScene', sceneId: s3, at: 4 }, { type: 'splitScene', sceneId: s3, at: 2 }] },
  { prompt: 'split scene 1 in half', commands: [{ type: 'splitScene', sceneId: s1, at: 2.5 }] },
  { prompt: 'split here', setup: () => useEditorStore.setState({ playhead: 6.5 }),
    commands: [{ type: 'splitScene', sceneId: s2, at: 1.5 }] },
  { prompt: 'split scene 2 at 10s', issues: [/Cannot split Scene 2/], commands: [] },
  { prompt: 'make scene 2 5 seconds', commands: [{ type: 'setSceneDuration', sceneId: s2, duration: 5 }] },
  { prompt: 'make all scenes 3s long', commands: [s1, s2, s3, s4].map(id => ({ type: 'setSceneDuration', sceneId: id, duration: 3 })) },
  { prompt: 'extend scene 1 by 2s', commands: [{ type: 'setSceneDuration', sceneId: s1, duration: 7 }] },
  { prompt: 'shorten the last scene by 1s', commands: [{ type: 'setSceneDuration', sceneId: s4, duration: 2 }] },
  { prompt: 'trim the first scene to 3s', commands: [{ type: 'setSceneDuration', sceneId: s1, duration: 3 }] },
  { prompt: 'trim the first 2 seconds of scene 3',
    commands: [{ type: 'splitScene', sceneId: s3, at: 2 }, { type: 'removeScene', sceneId: s3 }] },
  { prompt: 'move scene 3 to the start', commands: [{ type: 'moveScene', sceneId: s3, toIndex: 1 }] },
  { prompt: 'move scene 4 before scene 2', commands: [{ type: 'moveScene', sceneId: s4, toIndex: 2 }] },
  { prompt: 'move scene 1 after scene 3', commands: [{ type: 'moveScene', sceneId: s1, toIndex: 3 }] },
  { prompt: 'swap scene 1 and 3', commands: [{ type: 'moveScene', sceneId: s1, toIndex: 3 }, { type: 'moveScene', sceneId: s3, toIndex: 1 }] },

  // ── Transitions and backgrounds ────────────────────────────────────────────
  { prompt: 'use wipe transitions between all scenes',
    commands: [s2, s3, s4].map(id => ({ type: 'setTransition', sceneId: id, transition: { type: 'wipe' } })) },
  { prompt: 'add a zoom transition to scene 2 lasting 1s', commands: [{ type: 'setTransition', sceneId: s2, transition: { type: 'zoom', duration: 1 } }] },
  { prompt: 'remove all transitions', commands: [s1, s2, s3, s4].map(id => ({ type: 'setTransition', sceneId: id, transition: { type: 'none' } })) },
  { prompt: 'make the background dark blue',
    check: c => { assert.equal(c.length, 1); const bg = c[0].background as { type: string; color: string }; assert.equal(bg.type, 'solid'); assert.match(bg.color, /^#[0-9a-f]{6}$/); assert.notEqual(bg.color, '#3b82f6') } },
  { prompt: 'set scene 2 background to #222', commands: [{ type: 'setBackground', sceneId: s2, background: { type: 'solid', color: '#222' } }] },
  { prompt: 'transparent background on scene 3', commands: [{ type: 'setBackground', sceneId: s3, background: { type: 'transparent' } }] },
  { prompt: 'gradient background from purple to pink', commands: [{ type: 'setBackground', background: { type: 'gradient', from: '#8b5cf6', to: '#ec4899' } }] },

  // ── Animations ──────────────────────────────────────────────────────────────
  { prompt: 'fade in the title', commands: [{ type: 'addAnimation', elementId: el.title.id, animation: { type: 'fadeIn', timing: 'onEnter' } }] },
  { prompt: "fade out the text 'Learn fast' over 2s",
    commands: [{ type: 'addAnimation', elementId: el.subtitle.id, animation: { type: 'fadeOut', timing: 'onExit', duration: 2 } }] },
  { prompt: 'make it spin', setup: () => f.select(el.redCircle.id),
    commands: [{ type: 'addAnimation', elementId: el.redCircle.id, animation: { type: 'rotateLoop', timing: 'loop' } }] },
  { prompt: 'add typewriter to the title', commands: [{ type: 'addAnimation', elementId: el.title.id, animation: { type: 'typewriter' } }] },
  { prompt: 'slide in the image from the left over 1s', setup: () => f.goTo(2),
    commands: [{ type: 'addAnimation', elementId: el.image.id, animation: { type: 'slideIn', direction: 'left', duration: 1 } }] },
  { prompt: 'zoom in on the video', setup: () => f.goTo(2),
    commands: [{ type: 'addAnimation', elementId: el.video.id, animation: { type: 'zoomIn' } }] },
  { prompt: 'remove animations from the title', commands: [{ type: 'removeAnimations', elementId: el.title.id }] },
  { prompt: "add a title 'Hello' and make it fade in",
    commands: [{ type: 'addText', text: 'Hello', alias: ALIAS }, { type: 'addAnimation', elementAlias: ALIAS, animation: { type: 'fadeIn' } }] },
  { prompt: "add text 'Hi' that fades in", commands: [{ type: 'addText', text: 'Hi', animation: { type: 'fadeIn' } }] },

  // ── Position, size, style ───────────────────────────────────────────────────
  { prompt: 'move the logo box to the top right', commands: [{ type: 'alignElement', elementId: el.logoBox.id, vertical: 'top', horizontal: 'right' }] },
  { prompt: 'center the title', commands: [{ type: 'alignElement', elementId: el.title.id, horizontal: 'center', vertical: 'middle' }] },
  { prompt: 'center it horizontally', setup: () => f.select(el.subtitle.id),
    commands: [{ type: 'alignElement', elementId: el.subtitle.id, horizontal: 'center', vertical: undefined }] },
  { prompt: 'move the title 50px left', commands: [{ type: 'updateElement', elementId: el.title.id, patch: { x: 50 } }] },
  { prompt: 'make the title bigger', commands: [{ type: 'updateElement', elementId: el.title.id, patch: { fontSize: 90 } }] },
  { prompt: 'make the red circle blue', commands: [{ type: 'updateElement', elementId: el.redCircle.id, patch: { fill: '#3b82f6' } }] },
  { prompt: 'make the circle twice as big',
    commands: [{ type: 'updateElement', elementId: el.redCircle.id, patch: { width: 400, height: 400, x: 400, y: 400 } }] },
  { prompt: 'scale the image to 50%', setup: () => f.goTo(2),
    commands: [{ type: 'updateElement', elementId: el.image.id, patch: { width: 150, height: 100, x: 125, y: 100 } }] },
  { prompt: 'resize the video to 800x450', setup: () => f.goTo(2),
    commands: [{ type: 'updateElement', elementId: el.video.id, patch: { width: 800, height: 450 } }] },
  { prompt: 'make the image fill the screen', setup: () => f.goTo(2),
    commands: [{ type: 'updateElement', elementId: el.image.id, patch: { x: 0, y: 0, width: 1920, height: 1080 } }] },
  { prompt: 'set the title font size to 90', commands: [{ type: 'updateElement', elementId: el.title.id, patch: { fontSize: 90 } }] },
  { prompt: 'make all text bold',
    commands: [{ type: 'updateElement', elementId: el.title.id, patch: { fontWeight: 'bold' } }, { type: 'updateElement', elementId: el.subtitle.id, patch: { fontWeight: 'bold' } }] },
  { prompt: "use Poppins for 'Welcome'", commands: [{ type: 'updateElement', elementId: el.title.id, patch: { fontFamily: 'Poppins' } }] },
  { prompt: 'set opacity of the logo box to 50%', commands: [{ type: 'updateElement', elementId: el.logoBox.id, patch: { opacity: 0.5 } }] },
  { prompt: "rename the circle to 'Badge'", commands: [{ type: 'updateElement', elementId: el.redCircle.id, patch: { name: 'Badge' } }] },
  { prompt: "change the title text to 'Hello world'", commands: [{ type: 'updateElement', elementId: el.title.id, patch: { content: 'Hello world' } }] },
  { prompt: "change the circle's border to white",
    commands: [{ type: 'updateElement', elementId: el.redCircle.id, patch: { stroke: '#ffffff' } }] },
  { prompt: 'rotate the logo box by 45 degrees', commands: [{ type: 'updateElement', elementId: el.logoBox.id, patch: { rotation: 45 } }] },
  { prompt: 'bring the logo box to the front', commands: [{ type: 'arrangeElement', elementId: el.logoBox.id, order: 'front' }] },
  { prompt: 'send it to the back', setup: () => f.select(el.title.id), commands: [{ type: 'arrangeElement', elementId: el.title.id, order: 'back' }] },
  { prompt: 'delete the selected item', setup: () => f.select(el.redCircle.id), commands: [{ type: 'removeElement', elementId: el.redCircle.id }] },
  { prompt: 'duplicate the logo box', commands: [{ type: 'duplicateElement', elementId: el.logoBox.id, alias: ALIAS }] },
  { prompt: 'make the text red', issues: [/There are 2 texts/], commands: [] },
  // Not on the current scene, but the only green circle in the project.
  { prompt: 'make the green circle red', commands: [{ type: 'updateElement', elementId: el.greenCircle.id, patch: { fill: '#ef4444' } }] },
  { prompt: 'make the purple circle red', issues: [/No purple circle found/], commands: [] },

  // ── Audio and video ─────────────────────────────────────────────────────────
  { prompt: 'mute the video', setup: () => f.goTo(2), commands: [{ type: 'updateElement', elementId: el.video.id, patch: { muted: true } }] },
  { prompt: 'set the music volume to 30%', commands: [{ type: 'updateElement', elementId: el.music.id, patch: { volume: 0.3 } }] },
  { prompt: 'make the voiceover louder', commands: [{ type: 'updateElement', elementId: el.voice.id, patch: { volume: 1.5 } }] },
  { prompt: 'speed up the video 2x', setup: () => f.goTo(2), commands: [{ type: 'updateElement', elementId: el.video.id, patch: { playbackRate: 2 } }] },
  { prompt: 'slow down the music', commands: [{ type: 'updateElement', elementId: el.music.id, patch: { speed: 0.5 } }] },
  { prompt: 'fade in the music over 2s', commands: [{ type: 'updateElement', elementId: el.music.id, patch: { fadeIn: 2 } }] },
  { prompt: 'fade out the music 3 seconds', commands: [{ type: 'updateElement', elementId: el.music.id, patch: { fadeOut: 3 } }] },
  { prompt: 'loop the music', commands: [{ type: 'updateElement', elementId: el.music.id, patch: { loop: true } }] },
  { prompt: 'trim the first 2 seconds of the video', setup: () => f.goTo(2),
    commands: [{ type: 'updateElement', elementId: el.video.id, patch: { startTime: 2, duration: 2 } }] },
  { prompt: 'trim the video to 3s', setup: () => f.goTo(2), commands: [{ type: 'updateElement', elementId: el.video.id, patch: { duration: 3 } }] },

  // ── Adding media and shapes ─────────────────────────────────────────────────
  { prompt: 'add @intro.mp4 to scene 3', commands: [{ type: 'addVideoFromAsset', sceneId: s3, assetId: 'asset-intro' }] },
  { prompt: 'add song.mp3 at 2s', commands: [{ type: 'addAudioFromAsset', assetId: 'asset-song', timelineX: 2 }] },
  { prompt: 'add an image', issues: [/Which image\?/], commands: [] },
  { prompt: 'add a red circle with a white border in the bottom right',
    commands: [
      { type: 'addShape', shapeType: 'circle', fill: '#ef4444', stroke: '#ffffff', strokeWidth: 4, alias: ALIAS },
      { type: 'alignElement', elementAlias: ALIAS, vertical: 'bottom', horizontal: 'right' },
    ] },
  { prompt: 'add the logo to all scenes', check: c => {
    assert.equal(c.length, 0) // "the logo" is not an asset name; the user is asked which image
  }, issues: [/Which image\?/] },
  { prompt: 'add logo.png to all scenes', commands: [s1, s2, s3, s4].map(id => ({ type: 'addImageFromAsset', sceneId: id, assetId: 'asset-logo' })) },

  // ── Staggered sequences ─────────────────────────────────────────────────────
  { prompt: 'fade in all circles one by one 0.2s apart', setup: () => f.goTo(2),
    commands: [{ type: 'animateSequence', waves: [{ animation: { type: 'fadeIn' }, step: 0.2, order: 'leftToRight' }] }],
    check: c => assert.equal((c[0].waves as Array<{ targets: unknown[] }>)[0].targets.length, 2) },
  { prompt: 'pulse all circles left to right one by one, then flash them red right to left and repeat', setup: () => f.goTo(2),
    commands: [{ type: 'animateSequence', repeat: true, waves: [
      { animation: { type: 'pulse' }, order: 'leftToRight' },
      { animation: { type: 'colorPulse', color: '#ef4444' }, order: 'rightToLeft' },
    ] }] },
  { prompt: 'make all text appear one after another starting at 2s',
    commands: [{ type: 'animateSequence', start: 2, waves: [{ animation: { type: 'fadeIn' } }] }] },
  { prompt: 'flash all circles yellow layer by layer and repeat every 4s', setup: () => f.goTo(2),
    commands: [{ type: 'animateSequence', repeat: 4, waves: [{ animation: { type: 'colorPulse', color: '#f59e0b' }, together: true }] }] },
  { prompt: 'make it glow', setup: () => f.select(el.redCircle.id),
    commands: [{ type: 'addAnimation', elementId: el.redCircle.id, animation: { type: 'colorPulse' } }] },

  // ── Connectors ──────────────────────────────────────────────────────────────
  { prompt: 'connect the title to the logo box',
    commands: [{ type: 'connectElements', from: [{ elementId: el.title.id }], to: [{ elementId: el.logoBox.id }] }] },
  { prompt: 'connect all circles in a chain', setup: () => f.goTo(2),
    commands: [{ type: 'connectElements', mode: 'chain', to: undefined }],
    check: c => assert.equal((c[0].from as unknown[]).length, 2) },
  { prompt: 'fully connect the circles layer by layer with thin red lines', setup: () => f.goTo(2),
    commands: [{ type: 'connectElements', mode: 'columns', width: 1, color: '#ef4444', heads: false }] },
  { prompt: 'connect the selected items', setup: () => f.select(el.logoBox.id, el.title.id),
    commands: [{ type: 'connectElements', mode: 'chain', keepOrder: true, from: [{ elementId: el.logoBox.id }, { elementId: el.title.id }] }] },
  { prompt: 'connect the logo box', issues: [/at least two items/], commands: [] },

  // ── Smart edits (expanded later by media analysis) ──────────────────────────
  { prompt: 'remove silences', commands: [{ type: 'removeSilences', sceneIds: undefined }] },
  { prompt: 'cut out the pauses in scene 2', commands: [{ type: 'removeSilences', sceneIds: [s2] }] },
  { prompt: 'remove pauses longer than 1s', commands: [{ type: 'removeSilences', minSilence: 1 }] },
  { prompt: 'tighten the pauses', commands: [{ type: 'removeSilences', minSilence: 0.35 }] },
  { prompt: 'add jump cuts', commands: [{ type: 'removeSilences' }] },
  { prompt: 'remove filler words', commands: [{ type: 'removeFillers' }] },
  { prompt: "cut all the ums and uhs", commands: [{ type: 'removeFillers' }] },
  { prompt: 'cut to the beat', commands: [{ type: 'cutToBeat', beatsPerCut: 1 }] },
  { prompt: 'sync the scenes to the music beat every 2 beats', commands: [{ type: 'cutToBeat', beatsPerCut: 2 }] },
  { prompt: 'cut on every bar of the beat', commands: [{ type: 'cutToBeat', beatsPerCut: 4 }] },
  { prompt: 'split the video into shots', commands: [{ type: 'splitShots' }] },
  { prompt: 'detect camera cuts in scene 2', commands: [{ type: 'splitShots', sceneIds: [s2] }] },

  // ── Not understood ──────────────────────────────────────────────────────────
  { prompt: 'make it awesome', setup: () => f.select(el.title.id), issues: [/Didn't understand "make it awesome"/], commands: [] },
]

function matches(actual: unknown, expected: unknown, path: string): void {
  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual) && actual.length === expected.length, `${path}: expected ${expected.length} items, got ${JSON.stringify(actual)}`)
    expected.forEach((item, i) => matches((actual as unknown[])[i], item, `${path}[${i}]`))
  } else if (expected instanceof RegExp) {
    assert.match(String(actual), expected, path)
  } else if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    assert.ok(actual && typeof actual === 'object', `${path}: expected an object, got ${JSON.stringify(actual)}`)
    for (const [key, value] of Object.entries(expected)) matches((actual as Record<string, unknown>)[key], value, `${path}.${key}`)
  } else {
    assert.deepEqual(actual, expected, path)
  }
}

let failed = 0
for (const c of cases) {
  f.goTo(1)
  useEditorStore.setState({ playhead: 0 })
  c.setup?.()
  const { steps, issues } = parsePrompt(c.prompt, f.context())
  const commands = steps as unknown as Array<Record<string, unknown>>
  try {
    if (c.commands) {
      assert.equal(commands.length, c.commands.length, `command count (got ${JSON.stringify(commands.map(x => x.type))})`)
      c.commands.forEach((expected, i) => matches(commands[i], expected, `command ${i}`))
    }
    c.check?.(commands)
    const expectedIssues = c.issues ?? []
    assert.equal(issues.length, expectedIssues.length, `issues: ${JSON.stringify(issues.map(i => i.message))}`)
    expectedIssues.forEach(re => assert.ok(issues.some(i => re.test(i.message)), `missing issue ${re}`))
  } catch (error) {
    failed++
    console.error(`✘ ${c.prompt}\n  ${(error as Error).message.split('\n')[0]}\n  got: ${JSON.stringify(commands)}\n  issues: ${JSON.stringify(issues.map(i => i.message))}`)
  }
}

if (failed) {
  console.error(`\n${failed}/${cases.length} parser cases failed`)
  process.exit(1)
}
console.log(`ai parser tests passed (${cases.length} prompts)`)
