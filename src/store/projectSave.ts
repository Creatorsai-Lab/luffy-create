import { useEditorStore } from './editorStore'

// Every save goes through here (autosave, rename, switching projects, closing
// the app), so saves never overlap and an edit made during a save is kept.

let queue: Promise<unknown> = Promise.resolve()

/**
 * Save the open project. Saves run one at a time, so a slower older save can
 * never land after a newer one. The project is only marked clean if it is
 * still the exact object that was written: every edit produces a new project
 * object, so an edit made while the file was being written stays dirty and is
 * saved next time.
 */
export function saveCurrentProject(): Promise<void> {
  const run = async () => {
    const { project } = useEditorStore.getState()
    if (!project || project.id === 'default') return
    await window.api.projects.save(project.id, JSON.stringify(project))
    if (useEditorStore.getState().project === project) useEditorStore.getState().markClean()
  }
  const next = queue.then(run, run)
  queue = next.catch(() => {})
  return next
}
