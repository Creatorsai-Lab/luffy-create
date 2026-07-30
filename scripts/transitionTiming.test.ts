import assert from 'node:assert/strict'
import {
  buildTransitionTimeline,
  getEffectiveTransitionDuration,
  getTransitionFrameState,
} from '../src/utils/transitionTiming'
import * as transitionTiming from '../src/utils/transitionTiming'

const getUpcomingTransitionEntry = (transitionTiming as Record<string, unknown>)
  .getUpcomingTransitionEntry as
    | ((timeline: ReturnType<typeof buildTransitionTimeline>, time: number, leadTime?: number) =>
      ReturnType<typeof buildTransitionTimeline>[number] | null)
    | undefined

const timeline = buildTransitionTimeline([
  { id: 'scene-1', duration: 5, transition: { type: 'none', duration: 0.5 } },
  { id: 'scene-2', duration: 4, transition: { type: 'fade', duration: 1 } },
  { id: 'scene-3', duration: 3, transition: { type: 'zoom', duration: 0.8 } },
])

assert.deepEqual(getTransitionFrameState(timeline, 4.5), {
  kind: 'scene',
  sceneId: 'scene-1',
  sceneIndex: 0,
  sceneTime: 4.5,
})

assert.deepEqual(getTransitionFrameState(timeline, 5), {
  kind: 'transition',
  fromSceneId: 'scene-1',
  fromSceneIndex: 0,
  fromTime: 4.999,
  toSceneId: 'scene-2',
  toSceneIndex: 1,
  toTime: 5,
  progress: 0,
  transition: { type: 'fade', duration: 1 },
})

assert.deepEqual(getTransitionFrameState(timeline, 5.5), {
  kind: 'transition',
  fromSceneId: 'scene-1',
  fromSceneIndex: 0,
  fromTime: 4.999,
  toSceneId: 'scene-2',
  toSceneIndex: 1,
  toTime: 5.5,
  progress: 0.5,
  transition: { type: 'fade', duration: 1 },
})

const afterTransition = getTransitionFrameState(timeline, 6.01)
assert.equal(afterTransition.kind, 'scene')
const { sceneTime, ...sceneState } = afterTransition
assert.deepEqual(sceneState, {
  kind: 'scene',
  sceneId: 'scene-2',
  sceneIndex: 1,
})
assert.ok(Math.abs(sceneTime - 1.01) < 1e-9)

const shortSceneTimeline = buildTransitionTimeline([
  { id: 'long', duration: 10, transition: { type: 'none', duration: 0 } },
  { id: 'short', duration: 0.5, transition: { type: 'flashBlur', duration: 2 } },
])
assert.equal(getEffectiveTransitionDuration(shortSceneTimeline[1]), 0.5)
const shortSceneTransition = getTransitionFrameState(shortSceneTimeline, 10.25)
assert.equal(shortSceneTransition.kind, 'transition')
if (shortSceneTransition.kind === 'transition') {
  assert.equal(shortSceneTransition.progress, 0.5)
}

const flashTimeline = buildTransitionTimeline([
  { id: 'scene-1', duration: 5, transition: { type: 'none', duration: 0 } },
  { id: 'scene-2', duration: 4, transition: { type: 'flashBlur', duration: 1 } },
])
assert.equal(typeof getUpcomingTransitionEntry, 'function')
if (getUpcomingTransitionEntry) {
  assert.equal(getUpcomingTransitionEntry(flashTimeline, 4.89, 0.1), null)
  assert.equal(getUpcomingTransitionEntry(flashTimeline, 4.9, 0.1)?.sceneId, 'scene-2')
  assert.equal(getUpcomingTransitionEntry(flashTimeline, 4.99, 0.1)?.transition.type, 'flashBlur')
  assert.equal(getUpcomingTransitionEntry(flashTimeline, 5, 0.1), null)
}

console.log('transition timing tests passed')
