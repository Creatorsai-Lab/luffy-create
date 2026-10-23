/**
 * Beats for beat-synced effects: the project's background music (the longest
 * background-track clip, else the longest audio clip) is analysed once per
 * file with the "cut to the beat" tracker, and its beats placed on the
 * timeline. Until then — or without music — effects pulse at 120 BPM.
 */
import Konva from 'konva'
import { useEditorStore } from '../../store/editorStore'
import { detectBeats } from '../../ai/smart/beats'
import { decodeMono } from '../../ai/smart/media'
import type { AudioElement, Project } from '../../types/editor'

const analysed = new Map<string, Promise<number[] | null>>()
const ready = new Map<string, number[] | null>()

interface Music { src: string; start: number; startTime: number; duration: number; speed: number }

function findMusic(project: Project): Music | null {
  let elapsed = 0
  const clips: Array<Music & { background: boolean }> = []
  for (const scene of project.scenes) {
    for (const el of scene.elements) {
      if (el.type !== 'audio') continue
      const a = el as AudioElement
      clips.push({ src: a.src, start: elapsed + (a.x ?? 0), startTime: a.startTime ?? 0, duration: a.duration ?? 0, speed: a.speed ?? 1, background: a.track === 'background' })
    }
    elapsed += scene.duration
  }
  const pool = clips.some(c => c.background) ? clips.filter(c => c.background) : clips
  return pool.sort((a, b) => b.duration - a.duration)[0] ?? null
}

function key(m: Music) {
  return `${m.src}|${m.start.toFixed(3)}|${m.startTime.toFixed(3)}|${m.duration.toFixed(3)}|${m.speed}`
}

function analyse(m: Music): Promise<number[] | null> {
  const k = key(m)
  let hit = analysed.get(k)
  if (!hit) {
    hit = decodeMono(m.src).then(audio => {
      if (!audio) return null
      const grid = detectBeats(audio.samples, audio.sampleRate)
      if (!grid) return null
      // Source seconds → timeline seconds, inside the clip.
      return grid.beats
        .filter(b => b >= m.startTime && b <= m.startTime + m.duration * m.speed)
        .map(b => m.start + (b - m.startTime) / m.speed)
    }).catch(() => null)
    analysed.set(k, hit)
    hit.then(beats => {
      ready.set(k, beats)
      for (const stage of Konva.stages) stage.batchDraw()
    })
  }
  return hit
}

/** The project's beats on the timeline, or null while they load or without music. */
export function projectBeats(): number[] | null {
  const project = useEditorStore.getState().project
  if (!project) return null
  const music = findMusic(project)
  if (!music) return null
  const k = key(music)
  if (!ready.has(k)) { void analyse(music); return null }
  return ready.get(k) ?? null
}

/** Waits for the beats (before an export). */
export async function prepareBeats(project: Project) {
  const music = findMusic(project)
  if (music) await analyse(music)
}
