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
const portrait = () => useEditorStore.setState(s => ({ project: { ...s.project!, width: 1080, height: 1920 } }))
const landscape = () => useEditorStore.setState(s => ({ project: { ...s.project!, width: 1920, height: 1080 } }))
const near = (actual: number, expected: number, tolerance: number) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not near ${expected}`)
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
  { prompt: 'add whip pan transitions between all scenes',
    commands: [s2, s3, s4].map(id => ({ type: 'setTransition', sceneId: id, transition: { type: 'whip' } })) },
  { prompt: 'use a glitch transition on scene 3', commands: [{ type: 'setTransition', sceneId: s3, transition: { type: 'glitch' } }] },
  { prompt: 'add a dip to white transition to scene 2', commands: [{ type: 'setTransition', sceneId: s2, transition: { type: 'dipWhite' } }] },
  { prompt: 'add a strong zoom blur transition to scene 2 lasting 0.5s',
    commands: [{ type: 'setTransition', sceneId: s2, transition: { type: 'zoomBlur', intensity: 0.9, duration: 0.5 } }] },
  { prompt: 'add a push transition from the left to scene 3', commands: [{ type: 'setTransition', sceneId: s3, transition: { type: 'push', direction: 'left' } }] },
  { prompt: 'add a light leak transition to scene 4', commands: [{ type: 'setTransition', sceneId: s4, transition: { type: 'lightLeak' } }] },
  { prompt: 'cinematic transitions between all scenes',
    commands: [s2, s3, s4].map(id => ({ type: 'setTransition', sceneId: id, transition: { type: 'blurDissolve' } })) },
  { prompt: 'add a sparkle transition to scene 2', issues: [/I don't know a "sparkle" transition/], commands: [] },
  { prompt: 'fade out to black at the end', commands: [{ type: 'setEndTransition', transition: { type: 'fade' } }] },
  { prompt: 'end the video with a dip to white', commands: [{ type: 'setEndTransition', transition: { type: 'dipWhite' } }] },
  { prompt: 'remove the fade at the end', commands: [{ type: 'setEndTransition', transition: { type: 'none' } }] },
  { prompt: 'fade in from black at the start', commands: [{ type: 'setTransition', sceneId: s1, transition: { type: 'fade' } }] },
  { prompt: 'start the video with an iris', commands: [{ type: 'setTransition', sceneId: s1, transition: { type: 'iris' } }] },
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
    commands: [{ type: 'placeMedia', elementId: el.image.id, region: { x: 0, y: 0, width: 1920, height: 1080 }, regionLabel: 'full screen', fit: 'cover' }] },
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

  // ── Groups ──────────────────────────────────────────────────────────────────
  { prompt: "group all circles as 'Layer 1'", setup: () => f.goTo(2),
    commands: [{ type: 'groupElements', name: 'Layer 1' }],
    check: c => assert.equal((c[0].targets as unknown[]).length, 2) },
  { prompt: 'group the selected items', setup: () => f.select(el.title.id, el.logoBox.id),
    commands: [{ type: 'groupElements', targets: [{ elementId: el.title.id }, { elementId: el.logoBox.id }] }] },
  { prompt: 'group the title', issues: [/at least two items/], commands: [] },
  { prompt: 'make the intro group red', setup: () => {
      useEditorStore.getState().groupElements([el.redCircle.id, el.logoBox.id], 'Intro')
      f.goTo(1)
    },
    commands: [
      { type: 'updateElement', elementId: el.redCircle.id, patch: { fill: '#ef4444' } },
      { type: 'updateElement', elementId: el.logoBox.id, patch: { fill: '#ef4444' } },
    ] },
  { prompt: 'ungroup the group',
    commands: [{ type: 'ungroupElements' }],
    // parse-only: remove the Intro group so later cases see the plain fixture
    check: () => useEditorStore.getState().ungroupElements([el.redCircle.id]) },

  // ── Captions ────────────────────────────────────────────────────────────────
  { prompt: 'hormozi style captions', commands: [{ type: 'setCaptionStyle', preset: 'bold', style: undefined }] },
  { prompt: 'use the karaoke preset for the captions', commands: [{ type: 'setCaptionStyle', preset: 'karaoke' }] },
  { prompt: 'make the captions yellow with a black outline',
    commands: [{ type: 'setCaptionStyle', preset: undefined, style: { color: /^#/, strokeColor: /^#/, strokeWidth: 9 } }],
    check: c => assert.notEqual((c[0].style as Record<string, unknown>).color, (c[0].style as Record<string, unknown>).strokeColor) },
  { prompt: 'move the captions to the top', commands: [{ type: 'setCaptionStyle', style: { positionY: 12 } }] },
  { prompt: 'captions in all caps with a dark box behind', commands: [{ type: 'setCaptionStyle', style: { uppercase: true, boxOpacity: 0.72 } }] },
  { prompt: 'highlight the spoken word in green in the captions', commands: [{ type: 'setCaptionStyle', style: { activeColor: '#22c55e' } }] },
  { prompt: 'hide the captions', commands: [{ type: 'setCaptionStyle', enabled: false, style: undefined }] },
  { prompt: "add a caption 'Hello'", check: c => assert.ok(c.length && c.every(x => x.type !== 'setCaptionStyle')) },
  { prompt: 'make the subtitle red', setup: () => f.select(el.subtitle.id),
    commands: [{ type: 'updateElement', elementId: el.subtitle.id }] },

  // ── Media layout ────────────────────────────────────────────────────────────
  { prompt: 'split screen', setup: () => f.goTo(2),
    commands: [{ type: 'arrangeMedia', layout: 'split', targets: [{ elementId: el.image.id }, { elementId: el.video.id }] }] },
  { prompt: 'stack the image and the video with a 20px gap', setup: () => f.goTo(2),
    commands: [{ type: 'arrangeMedia', layout: 'stacked', gap: 20 }] },
  // ── Putting clips in areas of the frame (1920×1080 here; 1080×1920 below) ────
  { prompt: 'make the video fill the screen', setup: () => f.goTo(2),
    commands: [{ type: 'placeMedia', elementId: el.video.id, region: { x: 0, y: 0, width: 1920, height: 1080 }, width: undefined, height: undefined, fit: 'cover' }] },
  { prompt: 'make it full screen', setup: () => { f.goTo(2); f.select(el.image.id) },
    commands: [{ type: 'placeMedia', elementId: el.image.id, region: { x: 0, y: 0, width: 1920, height: 1080 } }] },
  { prompt: 'put the image in the left half and the video in the right half', setup: () => f.goTo(2),
    commands: [
      { type: 'placeMedia', elementId: el.image.id, region: { x: 0, y: 0, width: 960, height: 1080 }, regionLabel: 'left half' },
      { type: 'placeMedia', elementId: el.video.id, region: { x: 960, y: 0, width: 960, height: 1080 }, regionLabel: 'right half' },
    ] },
  { prompt: 'make video 1 fill the full screen and image 1 show in the bottom right at 400x300', setup: () => f.goTo(2),
    commands: [
      { type: 'placeMedia', elementId: el.video.id, region: { x: 0, y: 0, width: 1920, height: 1080 }, width: undefined },
      { type: 'placeMedia', elementId: el.image.id, region: { x: 32, y: 32, width: 1856, height: 1016 }, width: 400, height: 300, horizontal: 'right', vertical: 'bottom', regionLabel: 'bottom right corner' },
    ] },
  { prompt: 'make video_id_1 full screen', setup: () => f.goTo(2),
    commands: [{ type: 'placeMedia', elementId: el.video.id, region: { x: 0, y: 0, width: 1920, height: 1080 } }] },
  { prompt: 'make this video full screen and this image bottom right at 30%', setup: () => { f.goTo(2); f.select(el.video.id, el.image.id) },
    commands: [
      { type: 'placeMedia', elementId: el.video.id, region: { x: 0, y: 0, width: 1920, height: 1080 } },
      { type: 'placeMedia', elementId: el.image.id, width: 576, height: undefined, horizontal: 'right', vertical: 'bottom' },
    ] },
  { prompt: 'make this full screen and put this one in the top left corner, 480px wide', setup: () => { f.goTo(2); f.select(el.video.id, el.image.id) },
    commands: [
      { type: 'placeMedia', elementId: el.video.id, region: { x: 0, y: 0, width: 1920, height: 1080 } },
      { type: 'placeMedia', elementId: el.image.id, region: { x: 32, y: 32, width: 1856, height: 1016 }, width: 480, horizontal: 'left', vertical: 'top' },
    ] },
  { prompt: 'put one in the top left quarter and the other in the bottom right quarter', setup: () => { f.goTo(2); f.select(el.video.id, el.image.id) },
    commands: [
      { type: 'placeMedia', elementId: el.video.id, region: { x: 0, y: 0, width: 960, height: 540 } },
      { type: 'placeMedia', elementId: el.image.id, region: { x: 960, y: 540, width: 960, height: 540 } },
    ] },
  { prompt: 'put the video in the top third', setup: () => f.goTo(2),
    commands: [{ type: 'placeMedia', elementId: el.video.id, region: { x: 0, y: 0, width: 1920, height: 360 }, regionLabel: 'top third' }] },
  { prompt: 'put the video in the left 60%', setup: () => f.goTo(2),
    commands: [{ type: 'placeMedia', elementId: el.video.id, region: { x: 0, y: 0, width: 1152, height: 1080 }, width: undefined }] },
  { prompt: 'fit the whole video in the upper half', setup: () => f.goTo(2),
    commands: [{ type: 'placeMedia', elementId: el.video.id, region: { x: 0, y: 0, width: 1920, height: 540 }, fit: 'contain' }] },
  { prompt: 'stretch the video to fill the screen', setup: () => f.goTo(2),
    commands: [{ type: 'placeMedia', elementId: el.video.id, region: { x: 0, y: 0, width: 1920, height: 1080 }, fit: 'stretch' }] },
  { prompt: 'put the video at x 100 y 200, 500px wide', setup: () => f.goTo(2),
    commands: [{ type: 'placeMedia', elementId: el.video.id, region: { x: 100, y: 200, width: 1820, height: 880 }, width: 500, horizontal: 'left', vertical: 'top' }] },
  { prompt: 'put the image in the bottom right corner at 400x300 with no margin', setup: () => f.goTo(2),
    commands: [{ type: 'placeMedia', elementId: el.image.id, region: { x: 0, y: 0, width: 1920, height: 1080 }, width: 400, height: 300 }] },
  { prompt: 'move the image to the top right corner', setup: () => f.goTo(2),
    commands: [{ type: 'alignElement', elementId: el.image.id, horizontal: 'right', vertical: 'top', margin: 32 }] },
  { prompt: 'picture in picture', setup: () => f.goTo(2),
    commands: [
      { type: 'placeMedia', elementId: el.video.id, region: { x: 0, y: 0, width: 1920, height: 1080 } },
      { type: 'placeMedia', elementId: el.image.id, width: 576, horizontal: 'right', vertical: 'bottom' },
    ] },
  { prompt: 'put the video in the upper half and the image in the lower half', setup: () => { f.goTo(2); portrait() },
    commands: [
      { type: 'placeMedia', elementId: el.video.id, region: { x: 0, y: 0, width: 1080, height: 960 }, regionLabel: 'upper half' },
      { type: 'placeMedia', elementId: el.image.id, region: { x: 0, y: 960, width: 1080, height: 960 }, regionLabel: 'lower half' },
    ],
    check: () => landscape() },
  { prompt: 'put the image and the video in the top and bottom halves', setup: () => { f.goTo(2); portrait() },
    check: c => { landscape(); assert.equal(c[0].type, 'arrangeMedia') } },
  { prompt: 'add clip.mp4 to the upper half',
    commands: [
      { type: 'addVideoFromAsset', assetId: 'asset-clip', alias: ALIAS },
      { type: 'placeMedia', elementAlias: ALIAS, region: { x: 0, y: 0, width: 1920, height: 540 }, regionLabel: 'upper half' },
    ] },
  { prompt: 'slide the video in from the top left', setup: () => f.goTo(2),
    check: c => assert.ok(c.every(x => x.type !== 'placeMedia')) },
  { prompt: 'move the title to the top right', check: c => assert.equal(c[0].type, 'alignElement') },
  { prompt: 'put the videos side by side', setup: () => f.goTo(2), commands: [], issues: [/at least two videos or images/] },
  { prompt: 'split screen', commands: [], issues: [/no video or image/] },

  // ── Auto-reframe ────────────────────────────────────────────────────────────
  { prompt: 'reframe the video for vertical', setup: () => f.goTo(2),
    commands: [{ type: 'reframe', elementIds: [el.video.id], fill: true, mode: undefined }] },
  { prompt: "follow the speaker's face", setup: () => f.goTo(2),
    commands: [{ type: 'reframe', elementIds: [el.video.id], fill: undefined }] },
  { prompt: 'keep my face centered and keep the camera steady', setup: () => f.goTo(2),
    commands: [{ type: 'reframe', mode: 'steady' }] },
  { prompt: 'auto reframe for tiktok', setup: () => f.goTo(2), commands: [{ type: 'reframe', fill: true }] },
  { prompt: 'track the face closely', setup: () => f.goTo(2), commands: [{ type: 'reframe', mode: 'follow' }] },
  { prompt: 'stop following the face', setup: () => f.goTo(2), commands: [], issues: [/No video is following a face/] },
  { prompt: 'reframe the video', commands: [], issues: [/no video on this scene/] },

  // ── Ducking ─────────────────────────────────────────────────────────────────
  { prompt: 'duck the music', commands: [{ type: 'duckMusic', level: undefined, fade: undefined }] },
  { prompt: 'duck the music to 15% with a 0.5s fade', commands: [{ type: 'duckMusic', level: 0.15, fade: 0.5 }] },
  { prompt: 'lower the background music by 80% when I talk', commands: [{ type: 'duckMusic', level: 0.2 }] },
  { prompt: 'turn the music down while someone is speaking', commands: [{ type: 'duckMusic' }] },
  { prompt: 'duck the music by -12db', check: c => near(c[0].level as number, 0.251, 0.001) },
  { prompt: 'remove the ducking', commands: [], issues: [/No audio clip has ducking/] },
  { prompt: 'lower the music volume to 30%', check: c => assert.ok(c.every(x => x.type !== 'duckMusic')) },

  // ── Smart blocks ────────────────────────────────────────────────────────────
  { prompt: "add a lower third for 'Adya' 'ML engineer' on the right",
    commands: [{ type: 'insertBlock', blockId: 'lowerThird', sceneId: s1, params: { name: 'Adya', role: 'ML engineer', side: 'right' } }] },
  { prompt: "add a hook 'Stop scrolling, this changes everything' highlighting 'everything'",
    commands: [{ type: 'insertBlock', blockId: 'hook', params: { text: 'Stop scrolling, this changes everything', emphasis: 'everything' } }] },
  { prompt: "add a title card 'Chapter 2' with subtitle 'Setup' on scene 3",
    commands: [{ type: 'insertBlock', blockId: 'titleCard', sceneId: s3, params: { title: 'Chapter 2', subtitle: 'Setup' } }] },
  { prompt: "add a boxed title card 'Results' in red",
    commands: [{ type: 'insertBlock', blockId: 'titleCard', params: { title: 'Results', style: 'boxed', accent: '#ef4444' } }] },
  { prompt: "add a call to action 'Follow for part 2' at the bottom at 3s",
    commands: [{ type: 'insertBlock', blockId: 'hook', params: { text: 'Follow for part 2', position: 'bottom', startAt: 3 } }] },
  { prompt: 'make the lower third red', setup: () => {
      useEditorStore.getState().insertBlock('lowerThird', { name: 'Adya' })
      f.goTo(1)
    },
    commands: [{ type: 'updateBlock', groupId: /.+/, params: { accent: '#ef4444' } }] },
  { prompt: "change the lower third role to 'Founder' and put it on the left",
    commands: [{ type: 'updateBlock', params: { role: 'Founder' } }, { type: 'updateBlock', params: { side: 'left' } }] },
  { prompt: 'delete the lower third',
    check: c => {
      assert.ok(c.length > 1 && c.every(x => x.type === 'removeElement'), 'removes every part')
      // parse-only: take the block back off so later cases see the plain fixture
      const sc = useEditorStore.getState().project!.scenes[0]
      for (const e of sc.elements.filter(e => e.groupId)) useEditorStore.getState().removeElement(e.id)
    } },

  // ── Technical blocks ────────────────────────────────────────────────────────
  { prompt: 'add a neural network with layers 3, 5, 5, 2 and a forward and backward pass',
    commands: [{ type: 'insertBlock', blockId: 'neuralNetwork', params: { layers: [3, 5, 5, 2], pass: 'forwardBackward' } }] },
  { prompt: 'add a 3-layer neural network on scene 3', commands: [{ type: 'insertBlock', blockId: 'neuralNetwork', sceneId: s3, params: { layers: [3, 4, 2] } }] },
  { prompt: 'add an mlp with 784 inputs, two hidden layers of 128 and 10 outputs',
    commands: [{ type: 'insertBlock', blockId: 'neuralNetwork', params: { layers: [784, 128, 128, 10] } }] },
  { prompt: 'make the network seven layers with 12 neurons in the middle', setup: () => {
      useEditorStore.getState().insertBlock('neuralNetwork', { layers: [3, 4, 2] })
      f.goTo(1)
    },
    commands: [{ type: 'updateBlock', params: { layers: [3, 6, 9, 12, 9, 5, 2] } }] },
  { prompt: 'add a hidden layer to the network', commands: [{ type: 'updateBlock', params: { layers: [3, 4, 4, 2] } }] },
  { prompt: 'make the network vertical with sparse connections', commands: [{ type: 'updateBlock', params: { direction: 'topToBottom', connections: 'sparse' } }] },
  { prompt: 'delete the network',
    check: c => {
      assert.ok(c.length > 5 && c.every(x => x.type === 'removeElement'), 'removes every part')
      const sc = useEditorStore.getState().project!.scenes[0]
      for (const e of sc.elements.filter(e => e.groupId)) useEditorStore.getState().removeElement(e.id)
    } },
  { prompt: 'add a flowchart: collect data -> clean -> train -> deploy',
    commands: [{ type: 'insertBlock', blockId: 'flowchart', params: { steps: ['Collect data', 'Clean', 'Train', 'Deploy'], links: '' } }] },
  { prompt: "add a pipeline 'Ingest' 'Embed' 'Index' 'Query' step by step with a pulse",
    commands: [{ type: 'insertBlock', blockId: 'flowchart', params: { steps: ['Ingest', 'Embed', 'Index', 'Query'], reveal: 'stepByStep', flow: true } }] },
  { prompt: "add a step 'Test' after 'Train model' in the flowchart", setup: () => {
      useEditorStore.getState().insertBlock('flowchart', {})
      f.goTo(1)
    },
    commands: [{ type: 'updateBlock', params: { steps: ['Collect data', 'Clean', 'Train model', 'Test', 'Good enough?', 'Deploy'] } }] },
  { prompt: "connect 'Deploy' back to 'Collect data' in the flowchart labelled 'retrain'",
    commands: [{ type: 'updateBlock', params: { links: '4>3 no, 4>5 yes, 5>1 retrain' } }] },
  { prompt: 'make the flowchart vertical with pill steps', commands: [{ type: 'updateBlock', params: { direction: 'topToBottom', shape: 'pill' } }] },
  { prompt: 'add another flowchart', commands: [{ type: 'insertBlock', blockId: 'flowchart' }],
    check: () => {
      const sc = useEditorStore.getState().project!.scenes[0]
      for (const e of sc.elements.filter(e => e.groupId)) useEditorStore.getState().removeElement(e.id)
    } },
  { prompt: "add an equation reveal 'x^2 - 4 = 0' 'x^2 = 4' 'x = \\pm 2' one at a time",
    commands: [{ type: 'insertBlock', blockId: 'equationReveal', params: { steps: ['x^2 - 4 = 0', 'x^2 = 4', 'x = \\pm 2'], mode: 'replace' } }] },
  { prompt: "add a step by step derivation titled 'Solving' with 'a+b=c' 'a=c-b'",
    commands: [{ type: 'insertBlock', blockId: 'equationReveal', params: { title: 'Solving', steps: ['a+b=c', 'a=c-b'] } }] },
  { prompt: "add a code walkthrough of 'x = load()\ny = train(x)' with lines 1 'Load' and line 2 'Train'",
    commands: [{ type: 'insertBlock', blockId: 'codeWalkthrough', params: { code: 'x = load()\ny = train(x)', steps: '1: Load\n2: Train' } }] },
  { prompt: "add the equation 'E=mc^2'", check: c => assert.ok(c.length > 0 && c.every(x => x.type !== 'insertBlock'), 'still a plain equation, not a reveal block') },

  // ── Add-on slash commands ───────────────────────────────────────────────────
  { prompt: 'add /neural-network in scene 4 with 4 seconds delay',
    commands: [{ type: 'insertBlock', blockId: 'neuralNetwork', sceneId: s4, params: { startAt: 4 } }] },
  { prompt: 'add /neurall network in scene 4 with 4 seconds delay',
    commands: [{ type: 'insertBlock', blockId: 'neuralNetwork', sceneId: s4, params: { startAt: 4 } }] },
  { prompt: 'add /flowchart with steps load -> train -> ship after 2s',
    commands: [{ type: 'insertBlock', blockId: 'flowchart', params: { steps: ['Load', 'Train', 'Ship'], startAt: 2 } }] },
  { prompt: "add /lower-third 'Adya' 'ML engineer'", commands: [{ type: 'insertBlock', blockId: 'lowerThird', params: { name: 'Adya', role: 'ML engineer' } }] },
  { prompt: "add a step 'Test' to /flowchart", setup: () => {
      useEditorStore.getState().insertBlock('flowchart', {})
      f.goTo(1)
    },
    commands: [{ type: 'updateBlock', params: { steps: ['Collect data', 'Clean', 'Train model', 'Good enough?', 'Deploy', 'Test'] } }] },
  { prompt: 'make /flowchart vertical', commands: [{ type: 'updateBlock', params: { direction: 'topToBottom' } }] },
  { prompt: 'add /flowchart', commands: [{ type: 'insertBlock', blockId: 'flowchart' }] },
  { prompt: 'delete /flowchart',
    check: c => {
      assert.ok(c.length > 3 && c.every(x => x.type === 'removeElement'), 'removes every part')
      const sc = useEditorStore.getState().project!.scenes[0]
      for (const e of sc.elements.filter(e => e.groupId)) useEditorStore.getState().removeElement(e.id)
    } },

  // ── Smart edits (expanded later by media analysis) ──────────────────────────
  { prompt: 'remove silences', commands: [{ type: 'removeSilences', sceneIds: undefined }] },
  { prompt: 'cut out the pauses in scene 2', commands: [{ type: 'removeSilences', sceneIds: [s2] }] },
  { prompt: 'remove pauses longer than 1s', commands: [{ type: 'removeSilences', minSilence: 1 }] },
  { prompt: 'tighten the pauses', commands: [{ type: 'removeSilences', minSilence: 0.35 }] },
  { prompt: 'add jump cuts', commands: [{ type: 'removeSilences' }] },
  { prompt: 'remove filler words', commands: [{ type: 'removeFillers' }] },
  { prompt: "cut all the ums and uhs", commands: [{ type: 'removeFillers' }] },
  { prompt: 'remove the retakes', commands: [{ type: 'jumpCut', sceneIds: undefined, settings: { pauses: false, fillers: false, retakes: true, punchIn: false } }] },
  { prompt: 'cut out the false starts in scene 2', commands: [{ type: 'jumpCut', sceneIds: [s2], settings: { pauses: false, retakes: true } }] },
  { prompt: 'add jump cuts with punch-in zooms', commands: [{ type: 'jumpCut', settings: { pauses: true, retakes: false, punchIn: true } }] },
  { prompt: 'zoom in 15% on every other cut', commands: [{ type: 'jumpCut', settings: { pauses: false, punchIn: true, zoom: 1.15 } }] },
  { prompt: 'remove pauses longer than 0.8s and punch in on the cuts', commands: [{ type: 'jumpCut', settings: { pauses: true, punchIn: true, minPause: 0.8 } }] },

  // ── Green screen / background removal ───────────────────────────────────────
  { prompt: 'remove the green screen', setup: () => f.goTo(2),
    commands: [{ type: 'updateElement', elementId: el.video.id, patch: { keying: { mode: 'chroma', color: '#00b140' } } }] },
  { prompt: 'key out the blue screen on the video', setup: () => f.goTo(2),
    commands: [{ type: 'updateElement', elementId: el.video.id, patch: { keying: { mode: 'chroma', color: '#0047bb' } } }] },
  { prompt: 'chroma key the image', setup: () => f.goTo(2),
    commands: [{ type: 'updateElement', elementId: el.image.id, patch: { keying: { mode: 'chroma' } } }] },
  { prompt: 'remove the background from my video', setup: () => f.goTo(2),
    commands: [{ type: 'updateElement', elementId: el.video.id, patch: { keying: { mode: 'person', background: 'none' } } }] },
  { prompt: 'blur my background', setup: () => f.goTo(2),
    commands: [{ type: 'updateElement', elementId: el.video.id, patch: { keying: { mode: 'person', background: 'blur' } } }] },
  { prompt: 'replace the background behind me with black', setup: () => f.goTo(2),
    commands: [{ type: 'updateElement', elementId: el.video.id, patch: { keying: { mode: 'person', background: 'color', backgroundColor: '#111111' } } }] },
  { prompt: 'remove the green screen', issues: [/no video or image on this scene/], commands: [] },
  // Without a clip being meant, "background" is still the scene's.
  { prompt: 'change the background to blue', setup: () => f.goTo(2),
    commands: [{ type: 'setBackground', sceneId: s2, background: { type: 'solid' } }] },
  { prompt: 'zoom in on the video', setup: () => f.goTo(2), check: c => assert.ok(c.every(x => x.type !== 'jumpCut')) },
  { prompt: 'cut to the beat', commands: [{ type: 'cutToBeat', beatsPerCut: 1 }] },
  { prompt: 'sync the scenes to the music beat every 2 beats', commands: [{ type: 'cutToBeat', beatsPerCut: 2 }] },
  { prompt: 'cut on every bar of the beat', commands: [{ type: 'cutToBeat', beatsPerCut: 4 }] },
  { prompt: 'split the video into shots', commands: [{ type: 'splitShots' }] },
  { prompt: 'detect camera cuts in scene 2', commands: [{ type: 'splitShots', sceneIds: [s2] }] },

  // ── Effects, speed ramps and freeze frames ──────────────────────────────────
  { prompt: 'add a neon outline to me', setup: () => f.goTo(2), commands: [{ type: 'addEffect', elementId: el.video.id, effect: 'neonOutline' }] },
  { prompt: 'add a pink neon outline to the image', setup: () => f.goTo(2),
    commands: [{ type: 'addEffect', elementId: el.image.id, effect: 'neonOutline', params: { color: '#ec4899' } }] },
  { prompt: 'make the video look like VHS', setup: () => f.goTo(2), commands: [{ type: 'addEffect', elementId: el.video.id, effect: 'vhs' }] },
  { prompt: 'old film look on the video', setup: () => f.goTo(2), commands: [{ type: 'addEffect', elementId: el.video.id, effect: 'oldFilm' }] },
  { prompt: 'phonk edit on the beat', setup: () => f.goTo(2), commands: [{ type: 'addEffect', elementId: el.video.id, effect: 'phonk', beatSync: true }] },
  { prompt: 'add an rgb split on the beat', setup: () => f.goTo(2), commands: [{ type: 'addEffect', effect: 'rgbSplit', beatSync: true }] },
  { prompt: 'add zoom pulse to the beat', setup: () => f.goTo(2), commands: [{ type: 'addEffect', effect: 'zoomPulse', beatSync: true }] },
  { prompt: 'give the video a teal and orange look', setup: () => f.goTo(2),
    commands: [{ type: 'addEffect', elementId: el.video.id, effect: 'look', params: { look: 'tealOrange' } }] },
  { prompt: 'make it black and white', setup: () => { f.goTo(2); f.select(el.video.id) },
    commands: [{ type: 'addEffect', elementId: el.video.id, effect: 'look', params: { look: 'monochrome' } }] },
  { prompt: 'add a strong glitch from 2s to 4s on the video', setup: () => f.goTo(2),
    commands: [{ type: 'addEffect', elementId: el.video.id, effect: 'glitch', intensity: 0.95, start: 2, end: 4 }] },
  { prompt: 'add a subtle light leak for the first 3 seconds', setup: () => f.goTo(2),
    commands: [{ type: 'addEffect', elementId: el.video.id, effect: 'lightLeak', start: 0, end: 3 }] },
  { prompt: 'add film grain', setup: () => f.goTo(2), commands: [{ type: 'addEffect', elementId: el.video.id, effect: 'grain' }] },
  { prompt: 'add a lens flare', setup: () => f.goTo(2), commands: [{ type: 'addEffect', effect: 'lensFlare' }] },
  { prompt: 'warp the video', setup: () => f.goTo(2), commands: [{ type: 'addEffect', effect: 'wave' }] },
  { prompt: 'add rain to the photo', setup: () => f.goTo(2), commands: [{ type: 'addEffect', elementId: el.image.id, effect: 'rain' }] },
  { prompt: 'add a shine to the image', setup: () => f.goTo(2), commands: [{ type: 'addEffect', elementId: el.image.id, effect: 'lightSweep' }] },
  { prompt: 'dim the background', setup: () => f.goTo(2), commands: [{ type: 'addEffect', elementId: el.video.id, effect: 'spotlight' }] },
  { prompt: 'add a vhs effect to the video and make it shake', setup: () => f.goTo(2),
    commands: [{ type: 'addEffect', elementId: el.video.id, effect: 'vhs' }, { type: 'addEffect', elementId: el.video.id, effect: 'shake' }] },
  { prompt: 'remove the glitch from the video', setup: () => f.goTo(2), commands: [{ type: 'removeEffects', elementId: el.video.id, effect: 'glitch' }] },
  { prompt: 'remove all effects from the video', setup: () => f.goTo(2), commands: [{ type: 'removeEffects', elementId: el.video.id, effect: undefined }] },
  { prompt: 'velocity edit', setup: () => f.goTo(2), commands: [{ type: 'setSpeedCurve', elementId: el.video.id, preset: 'montage' }] },
  { prompt: 'slow-mo start on the video', setup: () => f.goTo(2), commands: [{ type: 'setSpeedCurve', elementId: el.video.id, preset: 'slowmoStart' }] },
  { prompt: 'bullet time', setup: () => f.goTo(2), commands: [{ type: 'setSpeedCurve', elementId: el.video.id, preset: 'bullet' }] },
  { prompt: 'remove the speed ramp', setup: () => f.goTo(2), commands: [{ type: 'setSpeedCurve', elementId: el.video.id, preset: 'none' }] },
  { prompt: 'freeze the frame at 2s for 1.5s', setup: () => f.goTo(2), commands: [{ type: 'freezeFrame', elementId: el.video.id, at: 2, hold: 1.5 }] },
  { prompt: 'remove the freeze frame', setup: () => f.goTo(2), commands: [{ type: 'freezeFrame', elementId: el.video.id, hold: 0 }] },
  { prompt: 'speed ramp the image', setup: () => f.goTo(2), issues: [/Speed ramps work on videos/], commands: [] },
  { prompt: 'add a glitch effect to the video', issues: [/no video or image on this scene/], commands: [] },
  { prompt: 'add film grain', issues: [/no video or image on this scene/], commands: [] },
  // Effect words that are also animations stay animations on other items.
  { prompt: 'make the title glow', commands: [{ type: 'addAnimation', elementId: el.title.id }] },
  { prompt: 'make it float', setup: () => f.goTo(2), check: c => assert.ok(c.every(x => x.type !== 'addEffect')), issues: [/Nothing is selected/] },
  { prompt: 'cut to the beat with a flash', check: c => assert.ok(c.some(x => x.type === 'cutToBeat')) },

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
