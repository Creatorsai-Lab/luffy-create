// Saving must never drop an edit, saves must not overlap, and undo history
// must never cross from one project into another.
import assert from 'node:assert/strict'
import { useEditorStore } from '../src/store/editorStore'
import { useHistoryStore } from '../src/store/historyStore'
import { saveCurrentProject } from '../src/store/projectSave'
import { makeProject } from '../src/utils/defaults'

const st = () => useEditorStore.getState()
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// Fake IPC: each save resolves only when the test releases it.
const writes: { id: string; name: string; release: () => void }[] = []
;(globalThis as any).window = {
  api: {
    projects: {
      save: (id: string, data: string) => new Promise<void>(release => {
        writes.push({ id, name: JSON.parse(data).name, release })
      }),
    },
  },
}

async function main() {
  { // an edit made while a save is in flight is not marked as saved
    st().loadProject(makeProject('a', 'A'))
    st().setProjectName('A1')                       // dirty
    const first = saveCurrentProject()
    await sleep(0)
    assert.equal(writes.length, 1)
    st().setProjectName('A2')                       // edit during the write
    writes[0].release(); await first
    assert.equal(st().isDirty, true, 'edit made during the save must stay dirty')

    const second = saveCurrentProject()
    await sleep(0)
    assert.equal(writes[1].name, 'A2', 'the next save writes the newer edit')
    writes[1].release(); await second
    assert.equal(st().isDirty, false)
  }

  { // overlapping saves run one at a time, in order
    writes.length = 0
    st().setProjectName('B1')
    const p1 = saveCurrentProject()
    const p2 = saveCurrentProject()
    await sleep(0)
    assert.equal(writes.length, 1, 'second save waits for the first')
    writes[0].release(); await p1; await sleep(0)
    assert.equal(writes.length, 2)
    writes[1].release(); await p2
  }

  { // undo never brings back the previous project
    st().loadProject(makeProject('p1', 'First'))
    st().setProjectName('First edited')
    await sleep(600)                                // history snapshot is debounced (500 ms)
    assert.equal(useHistoryStore.getState().canUndo, true)

    st().loadProject(makeProject('p2', 'Second'))
    await sleep(600)
    assert.equal(useHistoryStore.getState().canUndo, false, 'switching projects starts a fresh history')
    st().undo()
    assert.equal(st().project?.id, 'p2', 'undo stays in the current project')
    assert.equal(st().isDirty, false, 'loading a project is not an edit')
  }

  console.log('project save tests passed')
  process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })
