import assert from 'node:assert/strict'
import { buildTransitionTimeline, getTransitionFrameState } from '../src/utils/transitionTiming'

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

console.log('transition timing tests passed')
