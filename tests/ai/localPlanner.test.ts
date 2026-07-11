import assert from 'node:assert/strict'

import type { AiProjectContext } from '../../src/ai/types'

async function main() {
  ;(globalThis as unknown as { window: unknown }).window = { api: {} }
  const { planAiEdit } = await import('../../src/ai/planner')

  const context: AiProjectContext = {
    project: {
      id: 'project-1',
      name: 'Test Project',
      width: 1920,
      height: 1080,
      fps: 30,
      sceneCount: 1,
      totalDuration: 5,
    },
    currentSceneIndex: 1,
    currentSceneId: 'scene-1',
    selectedIds: [],
    selectedElements: [],
    scenes: [{
      id: 'scene-1',
      index: 1,
      name: 'Scene 1',
      duration: 5,
      backgroundType: 'solid',
      elements: [],
    }],
    assets: [{
      id: 'video-asset-1',
      type: 'video',
      name: 'assets_1783761811418.mp4',
      filename: 'assets_1783761811418.mp4',
    }],
  }

  const result = await planAiEdit(`
Add a new scene with:
A text written "Welcome to the Luffy create"
Also a video assets \`assets_1783761811418.mp4\` with width 500 x heigh 500
`, context)

  assert.equal(result.source, 'local')
  assert.deepEqual(result.plan.commands.map(command => command.type), [
    'addScene',
    'addText',
    'addVideoFromAsset',
  ])
  assert.equal(result.plan.commands[1].sceneAlias, 'newScene')
  assert.equal(result.plan.commands[2].sceneAlias, 'newScene')
  assert.equal(result.plan.commands[2].width, 500)
  assert.equal(result.plan.commands[2].height, 500)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
