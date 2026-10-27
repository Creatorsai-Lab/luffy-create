import type { ElementAnimation, Project } from '../types/editor'

/** Brings a project saved by an older version up to date. Runs on every load. */
export function migrateProject(project: Project): Project {
  for (const scene of project.scenes ?? []) {
    for (const el of scene.elements ?? []) {
      for (const anim of el.animations ?? []) foldStartTime(anim)
    }
  }
  return project
}

/**
 * Animations used to have both `startTime` and `delay`, and always started at
 * their sum. `startTime` is gone; folding it into `delay` keeps the timing.
 */
function foldStartTime(anim: ElementAnimation) {
  const legacy = anim as ElementAnimation & { startTime?: number }
  if (legacy.startTime == null) return
  const delay = Number.isFinite(anim.delay) ? anim.delay : 0
  if (Number.isFinite(legacy.startTime)) anim.delay = delay + legacy.startTime
  delete legacy.startTime
}
