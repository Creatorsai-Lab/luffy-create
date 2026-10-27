// A small but realistic project for AI tests, loaded into the real editor store.
import { useEditorStore } from '../../store/editorStore'
import { makeAudio, makeImage, makeProject, makeScene, makeShape, makeText, makeVideo } from '../../utils/defaults'
import { buildAiProjectContext } from '../context'

export function loadFixture() {
  const project = makeProject('fixture', 'Fixture')
  const [s1, s2, s3, s4] = [1, 2, 3, 4].map(makeScene)
  s1.duration = 5; s2.duration = 4; s3.duration = 6; s4.duration = 3

  // Scene 1: a title, a subtitle, a red circle, a named box, background music.
  const title = Object.assign(makeText(100, 100), { content: 'Welcome', fontSize: 72 })
  const subtitle = Object.assign(makeText(100, 300), { content: 'Learn fast', fontSize: 40 })
  const redCircle = Object.assign(makeShape('circle', 500, 500), { fill: '#ef4444', width: 200, height: 200 })
  const logoBox = Object.assign(makeShape('rect', 800, 500), { name: 'Logo Box', fill: '#3b82f6', strokeWidth: 0 })
  const music = Object.assign(makeAudio('song.mp3', 'asset-song', 12), { name: 'song.mp3', track: 'background' as const })
  s1.elements = [title, subtitle, redCircle, logoBox, music]

  // Scene 2: an image, a video clip, two circles, a voiceover.
  const image = makeImage(50, 50, 'logo.png', 'asset-logo', 300, 200)
  const video = Object.assign(makeVideo(400, 200, 'clip.mp4', 'asset-clip', 640, 360, 10), {
    name: 'clip.mp4', duration: 4, startTime: 0, playbackRate: 1,
  })
  const greenCircle = Object.assign(makeShape('circle', 100, 600), { fill: '#22c55e' })
  const redCircle2 = Object.assign(makeShape('circle', 300, 600), { fill: '#dc2626' })
  const voice = Object.assign(makeAudio('voice.mp3', 'asset-voice', 4), { name: 'voice.mp3', track: 'voiceover' as const })
  s2.elements = [image, video, greenCircle, redCircle2, voice]

  // Scene 3: one text. Scene 4: empty.
  const thanks = Object.assign(makeText(100, 100), { content: 'Thanks for watching', fontSize: 60 })
  s3.elements = [thanks]

  project.scenes = [s1, s2, s3, s4]
  project.assets = [
    { id: 'asset-logo', filename: 'logo.png', path: 'logo.png', type: 'image', name: 'logo.png' },
    { id: 'asset-clip', filename: 'clip.mp4', path: 'clip.mp4', type: 'video', name: 'clip.mp4', duration: 10 },
    { id: 'asset-intro', filename: 'intro.mp4', path: 'intro.mp4', type: 'video', name: 'intro.mp4', duration: 8 },
    { id: 'asset-song', filename: 'song.mp3', path: 'song.mp3', type: 'audio', name: 'song.mp3', duration: 60 },
  ]
  useEditorStore.getState().loadProject(project)

  const select = (...ids: string[]) => useEditorStore.setState({ selectedIds: ids })
  const goTo = (scene: number) => useEditorStore.setState({ currentSceneId: project.scenes[scene - 1].id, selectedIds: [] })
  const context = () => buildAiProjectContext()!

  return {
    project, scenes: [s1, s2, s3, s4],
    el: { title, subtitle, redCircle, logoBox, music, image, video, greenCircle, redCircle2, voice, thanks },
    select, goTo, context,
  }
}
