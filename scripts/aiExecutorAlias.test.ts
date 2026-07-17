import assert from 'node:assert/strict'

import { executeAiPlan } from '../src/ai/executor'
import { useEditorStore } from '../src/store/editorStore'
import { makeProject } from '../src/utils/defaults'

const project = makeProject('project-1', 'Alias Test')
project.assets.push({
  id: 'image-asset-1',
  type: 'image',
  name: 'ai-screenshot-0b4m.png',
  filename: 'ai-screenshot-0b4m.png',
  path: 'D:/tmp/ai-screenshot-0b4m.png',
})

useEditorStore.getState().loadProject(project)

const results = executeAiPlan({
  summary: 'Add a new scene and add image in that scene.',
  needsConfirmation: true,
  commands: [
    { type: 'addScene' },
    { type: 'addImageFromAsset', sceneAlias: 'newScene', assetName: 'ai-screenshot-0b4m.png', width: 900 },
    { type: 'addText', sceneAlias: 'newScene', text: 'Healthy', fontSize: 160, fontFamily: 'Poppins', color: '#6a32c9' },
  ],
})

assert.equal(results.length, 3)
assert.equal(results[0].ok, true)
assert.equal(results[1].ok, true, results[1].message)
assert.equal(results[2].ok, true, results[2].message)

const nextProject = useEditorStore.getState().project
assert.ok(nextProject)
assert.equal(nextProject.scenes.length, 2)
assert.equal(nextProject.scenes[1].elements.length, 2)
assert.equal(nextProject.scenes[1].elements[0].type, 'image')
assert.equal(nextProject.scenes[1].elements[0].width, 900)
assert.equal(nextProject.scenes[1].elements[1].type, 'text')
assert.equal(nextProject.scenes[1].elements[1].fontFamily, 'Poppins')
assert.equal(nextProject.scenes[1].elements[1].fontSize, 160)
assert.equal(nextProject.scenes[1].elements[1].color, '#6a32c9')

console.log('AI executor alias tests passed')
