// Scenes play back to back, so a scene's start on the project timeline is the
// sum of the durations before it. These are the shared lookups for that.

import type { EditorElement, Scene } from '../types/editor'

type TimedScene = { id: string; duration: number }

/** Start time of every scene on the project timeline, in scene order. */
export function sceneStartTimes(scenes: readonly TimedScene[]): number[] {
  const starts: number[] = []
  let t = 0
  for (const scene of scenes) { starts.push(t); t += scene.duration }
  return starts
}

/** Start time of one scene on the project timeline (0 if it isn't found). */
export function sceneStartTime(scenes: readonly TimedScene[], sceneId: string): number {
  let t = 0
  for (const scene of scenes) {
    if (scene.id === sceneId) return t
    t += scene.duration
  }
  return 0
}

/** The scene playing at `time`; times at or past the end resolve to the last scene. */
export function sceneAtTime<T extends TimedScene>(scenes: readonly T[], time: number): { scene: T; index: number; start: number } | null {
  let start = 0
  for (let i = 0; i < scenes.length; i++) {
    if (time < start + scenes[i].duration || i === scenes.length - 1) return { scene: scenes[i], index: i, start }
    start += scenes[i].duration
  }
  return null
}

/** The scene that holds an element, with that scene's start time. */
export function findElementScene(scenes: readonly Scene[], elementId: string): { scene: Scene; element: EditorElement; start: number } | null {
  let start = 0
  for (const scene of scenes) {
    const element = scene.elements.find(e => e.id === elementId)
    if (element) return { scene, element, start }
    start += scene.duration
  }
  return null
}
