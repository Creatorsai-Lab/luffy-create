/**
 * Undoing one AI edit later on, without losing what happened after it.
 *
 * An applied AI edit is remembered as the project before and after it. To
 * undo it, every scene and element the edit changed goes back to its "before"
 * state — but only where it still looks exactly as the edit left it. Anything
 * changed since (by hand or by a later edit) is kept, and reported. Pure.
 */
import type { EditorElement, Project, Scene } from '../types/editor'

export interface RevertResult {
  project: Project
  /** How many scenes / elements / settings went back. */
  changes: number
  /** What was left as it is because it changed after the edit. */
  skipped: string[]
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const clone = <T,>(value: T): T => (value === undefined ? value : JSON.parse(JSON.stringify(value)))
const SCENE_FIELDS = ['name', 'duration', 'background', 'transition', 'groups'] as const

export function revertEdit(current: Project, before: Project, after: Project): RevertResult {
  const project = clone(current)
  const skipped: string[] = []
  let changes = 0
  const beforeIds = new Set(before.scenes.map(s => s.id))
  const afterIds = new Set(after.scenes.map(s => s.id))
  const sceneLabel = (scene: Scene) => {
    const index = project.scenes.findIndex(s => s.id === scene.id)
    return index >= 0 ? `Scene ${index + 1}` : scene.name
  }

  // 1. Scenes the edit added go away — if nobody touched them since.
  for (const added of after.scenes.filter(s => !beforeIds.has(s.id))) {
    const now = project.scenes.find(s => s.id === added.id)
    if (!now) continue
    if (same(now, added)) {
      project.scenes = project.scenes.filter(s => s.id !== added.id)
      changes++
    } else {
      skipped.push(`${sceneLabel(now)} was changed after this edit, so it was kept.`)
    }
  }

  // 2. Scene order the edit changed goes back (when it is still the edit's order).
  const order = (scenes: Scene[]) => scenes.map(s => s.id).filter(id => beforeIds.has(id) && afterIds.has(id))
  if (!same(order(before.scenes), order(after.scenes))) {
    if (same(order(project.scenes), order(after.scenes))) {
      const rank = new Map(before.scenes.map((s, i) => [s.id, i]))
      const kept = project.scenes.filter(s => rank.has(s.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!)
      let k = 0
      project.scenes = project.scenes.map(s => (rank.has(s.id) ? kept[k++] : s))
      changes++
    } else {
      skipped.push('The scene order was changed after this edit, so it was kept.')
    }
  }

  // 3. Scenes the edit deleted come back, next to the scene that came before them.
  before.scenes.forEach((removed, i) => {
    if (afterIds.has(removed.id) || project.scenes.some(s => s.id === removed.id)) return
    const prev = before.scenes[i - 1]
    const prevIndex = prev ? project.scenes.findIndex(s => s.id === prev.id) : -1
    project.scenes.splice(prevIndex >= 0 ? prevIndex + 1 : Math.min(i, project.scenes.length), 0, clone(removed))
    changes++
  })

  // 4. Scenes in both: settings and elements the edit changed.
  for (const was of before.scenes) {
    const became = after.scenes.find(s => s.id === was.id)
    const now = project.scenes.find(s => s.id === was.id)
    if (!became || !now || same(was, became)) continue
    for (const key of SCENE_FIELDS) {
      if (same(was[key], became[key])) continue
      if (same(now[key], became[key])) {
        ;(now as unknown as Record<string, unknown>)[key] = clone(was[key])
        changes++
      } else {
        skipped.push(`${sceneLabel(now)}: its ${key} was changed after this edit, so it was kept.`)
      }
    }
    changes += revertElements(now, was.elements, became.elements, skipped)
    // Groups the restored elements no longer use go away.
    if (now.groups) {
      for (const id of Object.keys(now.groups)) if (!now.elements.some(el => el.groupId === id)) delete now.groups[id]
    }
  }

  // 5. Captions.
  if (!same(before.subtitleTracks, after.subtitleTracks)) {
    if (same(project.subtitleTracks, after.subtitleTracks)) {
      project.subtitleTracks = clone(before.subtitleTracks)
      changes++
    } else {
      skipped.push('The captions were changed after this edit, so they were kept.')
    }
  }
  return { project, changes, skipped }
}

function revertElements(scene: Scene, was: EditorElement[], became: EditorElement[], skipped: string[]): number {
  let changes = 0
  const wasById = new Map(was.map(el => [el.id, el]))
  const becameIds = new Set(became.map(el => el.id))
  for (const el of became) {
    const old = wasById.get(el.id)
    if (old && same(old, el)) continue
    const index = scene.elements.findIndex(e => e.id === el.id)
    if (index < 0) continue // deleted since: nothing to undo
    if (!same(scene.elements[index], el)) {
      skipped.push(`"${el.name}" was changed after this edit, so it was kept.`)
      continue
    }
    if (old) scene.elements[index] = clone(old)
    else scene.elements.splice(index, 1)
    changes++
  }
  // Elements the edit deleted come back.
  for (const old of was) {
    if (becameIds.has(old.id) || scene.elements.some(e => e.id === old.id)) continue
    scene.elements.push(clone(old))
    changes++
  }
  scene.elements.sort((a, b) => a.zIndex - b.zIndex)
  return changes
}
