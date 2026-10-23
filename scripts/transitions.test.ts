// Scene transitions: the catalogue (every shader transition has a shader and a
// name the AI understands), defaults and easing, timing for cuts, the intro
// from black and the fade-out at the end, and clips playing on past a cut.
import assert from 'node:assert/strict'
import { ease, TRANSITION_DEFS, transitionDef, transitionFromWords, withDefaults } from '../src/engine/transitions/catalog'
import { SHADERS } from '../src/engine/transitions/shaders'
import { buildTransitionTimeline, getEffectiveTransitionDuration, getEndTransitionDuration, getTransitionFrameState } from '../src/utils/transitionTiming'
import { getVideoClipState } from '../src/utils/videoClip'
import type { SceneTransition, VideoElement } from '../src/types/editor'

const near = (a: number, b: number, label: string) => assert.ok(Math.abs(a - b) < 1e-6, `${label}: ${a} ≠ ${b}`)

// ── Catalogue ────────────────────────────────────────────────────────────────
const values = TRANSITION_DEFS.map(d => d.value)
assert.equal(new Set(values).size, values.length, 'each transition once')
assert.equal(new Set(TRANSITION_DEFS.map(d => d.label)).size, values.length, 'labels are unique')
for (const def of TRANSITION_DEFS) {
  if (def.render === 'gl') {
    assert.ok(SHADERS[def.value]?.includes('vec4 transition('), `${def.value} has a shader`)
  }
  if (def.value !== 'none') {
    assert.equal(transitionFromWords(def.label.toLowerCase()), def.value, `"${def.label}" is understood`)
  }
  assert.match(def.color, /^#[0-9a-f]{6}$/i, `${def.value} colour`)
  assert.ok(def.duration >= 0.1 && def.duration <= 3, `${def.value} default length`)
}
assert.equal(TRANSITION_DEFS.filter(d => d.render === 'gl').length, 22, '22 shader transitions')
assert.equal(transitionFromWords('a whip pan'), 'whip')
assert.equal(transitionFromWords('crash zoom'), 'zoomBlur')
assert.equal(transitionFromWords('zoom out'), 'zoomOut')
assert.equal(transitionFromWords('fade through black'), 'dipBlack')
assert.equal(transitionFromWords('rgb split'), 'glitch')
assert.equal(transitionFromWords('sparkle'), null)
assert.equal(transitionDef('nonsense').value, 'fade', 'unknown types draw as a dissolve')

// ── Defaults and easing ──────────────────────────────────────────────────────
const removed: SceneTransition = { type: 'none', duration: 0 }
assert.equal(withDefaults('whip', removed).duration, transitionDef('whip').duration, 'after "remove transitions", picking one gets a real length')
const picked = withDefaults('push', { type: 'wipe', duration: 1.2, direction: 'up' })
assert.deepEqual([picked.duration, picked.direction], [1.2, 'up'], 'length and direction carry over')
assert.equal(withDefaults('fade', { type: 'wipe', duration: 1, direction: 'up' }).direction, undefined, 'no direction where it has none')
assert.equal(withDefaults('dipWhite').color, '#ffffff')
for (const easing of ['smooth', 'linear', 'snappy'] as const) {
  near(ease(0, easing), 0, `${easing} starts at 0`)
  near(ease(1, easing), 1, `${easing} ends at 1`)
  let last = -1
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const v = ease(t, easing)
    assert.ok(v >= last - 1e-9, `${easing} never goes back`)
    last = v
  }
}

// ── Timing ───────────────────────────────────────────────────────────────────
const t = (type: SceneTransition['type'], duration: number): SceneTransition => ({ type, duration })
const scenes = [
  { id: 'a', duration: 4, transition: t('fade', 1) },   // intro from black
  { id: 'b', duration: 3, transition: t('push', 0.5) },
  { id: 'c', duration: 2, transition: t('none', 0.5) },
  { id: 'd', duration: 0.3, transition: t('glitch', 2) }, // longer than its scene
]
const timeline = buildTransitionTimeline(scenes, t('dipBlack', 1))

const intro = getTransitionFrameState(timeline, 0.5)
assert.ok(intro.kind === 'transition' && intro.phase === 'intro' && intro.fromSceneIndex === -1 && intro.toSceneId === 'a')
near(intro.progress, 0.5, 'intro progress')

const cut = getTransitionFrameState(timeline, 4.25)
assert.ok(cut.kind === 'transition' && cut.phase === 'cut' && cut.fromSceneId === 'a' && cut.toSceneId === 'b')
near(cut.progress, 0.5, 'cut progress')
near(cut.fromLocalTime, 4.25, 'the outgoing scene keeps playing past its end')
near(cut.toLocalTime, 0.25, 'the incoming scene plays from its start')

assert.equal(getTransitionFrameState(timeline, 7.1).kind, 'scene', 'no transition into c')
assert.equal(getEffectiveTransitionDuration(timeline[3]), 0.3, 'a transition never outlasts its scene')
// The fade-out has to fit after d's own transition (which uses all of d), so there is none.
assert.equal(getEndTransitionDuration(timeline), 0)

const ending = buildTransitionTimeline(scenes.slice(0, 3), t('dipBlack', 1))
const outro = getTransitionFrameState(ending, 8.5)
assert.ok(outro.kind === 'transition' && outro.phase === 'outro' && outro.fromSceneId === 'c' && outro.toSceneIndex === -1)
near(outro.progress, 0.5, 'outro progress')
const last = getTransitionFrameState(ending, 9)
assert.ok(last.kind === 'transition' && last.progress === 1, 'black on the very last frame')
assert.equal(getTransitionFrameState(buildTransitionTimeline(scenes.slice(0, 3)), 8.5).kind, 'scene', 'no ending unless set')

const morphFirst = buildTransitionTimeline([{ id: 'a', duration: 2, transition: t('morph', 1) }])
assert.equal(getEffectiveTransitionDuration(morphFirst[0]), 0, 'morph needs a scene before it')

// ── Clips keep playing past the cut ──────────────────────────────────────────
const clip = { type: 'video', timelineX: 0, startTime: 2, duration: 4, playbackRate: 1, sourceDuration: 10, loop: false } as VideoElement
assert.equal(getVideoClipState(clip, 4.5).visible, false, 'normally the clip ends with the scene')
const on = getVideoClipState(clip, 4.5, { sceneEnd: 4 })
assert.ok(on.visible)
near(on.sourceTime, 6.5, 'continues into the footage after the trim point')
near(getVideoClipState({ ...clip, sourceDuration: 6.2 } as VideoElement, 5, { sceneEnd: 4 }).sourceTime, 6.16, 'holds the last frame when the footage runs out')
assert.equal(getVideoClipState({ ...clip, duration: 2 } as VideoElement, 4.5, { sceneEnd: 4 }).visible, false, 'a clip that ended earlier stays gone')

console.log('transition tests passed')
