// Scene edits must never move or cut audio: clips keep their absolute timeline
// start across split / resize / reorder / duplicate / insert / delete. Split
// halves are a hard cut that continues the original scene.
import assert from 'node:assert/strict'
import { useEditorStore } from '../src/store/editorStore'
import { makeProject, makeScene, makeAudio, makeVideo } from '../src/utils/defaults'
import type { AudioElement, VideoElement, Project } from '../src/types/editor'

function setup() {
  const p = makeProject('p', 'test')
  const s1 = makeScene(1); s1.duration = 5
  const s2 = makeScene(2); s2.duration = 15
  const s3 = makeScene(3); s3.duration = 5
  s2.transition = { type: 'fade', duration: 0.5 }
  const audio = makeAudio('a.mp3', 'asset', 12) as AudioElement
  audio.x = 2                        // absolute start 7s, spans 7..19 across s2
  s2.elements.push(audio)
  const video = makeVideo('v.mp4', 'vasset', 12) as VideoElement
  video.timelineX = 0; video.duration = 12; video.startTime = 0; video.sourceDuration = 12
  video.animations = [{ id: 'f', type: 'fadeIn', timing: 'onEnter', startTime: 0, delay: 0, duration: 0.5, easing: 'linear' }]
  s2.elements.push(video)
  p.scenes = [s1, s2, s3]
  useEditorStore.getState().loadProject(p)
  return { audioId: audio.id, s1: s1.id, s2: s2.id }
}

function audioStart(p: Project, id: string) {
  let t = 0
  for (const sc of p.scenes) {
    const a = sc.elements.find(e => e.id === id) as AudioElement | undefined
    if (a) return t + a.x
    t += sc.duration
  }
  throw new Error('audio missing')
}
const audioCount = (p: Project) => p.scenes.flatMap(s => s.elements).filter(e => e.type === 'audio').length
const st = () => useEditorStore.getState()
const keepsStart = (id: string) => assert.ok(Math.abs(audioStart(st().project!, id) - 7) < 1e-9)

{ // split: audio stays whole; second half is a hard cut that continues the scene
  const { audioId, s2 } = setup()
  st().splitScene(s2, 5)
  const p = st().project!
  assert.equal(p.scenes.length, 4)
  assert.equal(audioCount(p), 1, 'audio must not be split')
  keepsStart(audioId)
  const second = p.scenes[2]
  assert.equal(second.transition.type, 'none')
  const v2 = second.elements.find(e => e.type === 'video') as VideoElement
  assert.equal(v2.startTime, 5)
  assert.equal(v2.animations.length, 0, 'finished fade-in is not replayed at the cut')
}
{ // resize
  const { audioId, s2 } = setup()
  st().splitScene(s2, 5)
  const second = st().project!.scenes[2]
  st().updateScene(second.id, { duration: second.duration - 3 })
  keepsStart(audioId)
}
{ // reorder
  const { audioId } = setup()
  st().reorderScenes(1, 2)
  keepsStart(audioId)
}
{ // shrinking an earlier scene
  const { audioId, s1 } = setup()
  st().updateScene(s1, { duration: 1 })
  keepsStart(audioId)
}
{ // duplicate (no audio copy, lineage kept for Morph) and insert
  const { audioId, s1, s2 } = setup()
  st().duplicateScene(s2)
  assert.equal(audioCount(st().project!), 1)
  const copy = st().project!.scenes[2]
  assert.ok(copy.elements.every(e => e.morphKey), 'duplicated elements keep a morph lineage')
  st().addSceneAfter(s1)
  keepsStart(audioId)
}
{ // deleting the scene that holds the audio
  const { audioId, s2 } = setup()
  st().removeScene(s2)
  assert.equal(audioCount(st().project!), 1)
  keepsStart(audioId)
}

console.log('scene edit tests passed')
process.exit(0)
