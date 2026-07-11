import assert from 'node:assert/strict'

import type { AiProjectContext } from '../../src/ai/types'
import { makeAssetUploadName } from '../../electron/main/assetNaming'

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
      name: 'av-car-race-sc-4s1z.mp4',
      filename: 'av-car-race-sc-4s1z.mp4',
    }],
  }

  const result = await planAiEdit(`
Add a new scene with:
A text written "Welcome to the Luffy create"
Also a video assets \`@av-car-race-sc-4s1z.mp4\` with width 500 x heigh 500
`, context)

  assert.equal(result.source, 'local')
  assert.deepEqual(result.plan.commands.map(command => command.type), [
    'addScene',
    'addText',
    'addVideoFromAsset',
  ])
  assert.equal(result.plan.commands[1].sceneAlias, 'newScene')
  assert.equal(result.plan.commands[2].sceneAlias, 'newScene')
  assert.equal(result.plan.commands[2].assetName, 'av-car-race-sc-4s1z.mp4')
  assert.equal(result.plan.commands[2].width, 500)
  assert.equal(result.plan.commands[2].height, 500)

  const sceneTargetContext: AiProjectContext = {
    ...context,
    project: { ...context.project, sceneCount: 8, totalDuration: 40 },
    scenes: Array.from({ length: 8 }, (_, index) => ({
      id: `scene-${index + 1}`,
      index: index + 1,
      name: `Scene ${index + 1}`,
      duration: 5,
      backgroundType: 'solid',
      elements: [],
    })),
  }
  const sceneTargetResult = await planAiEdit('add text box with text "checking the updated AI edits" on Scene 8', sceneTargetContext)
  assert.deepEqual(sceneTargetResult.plan.commands.map(command => command.type), ['addText'])
  assert.equal(sceneTargetResult.plan.commands[0].sceneIndex, 8)
  assert.equal(sceneTargetResult.plan.commands[0].text, 'checking the updated AI edits')

  assert.equal(makeAssetUploadName('Blue Big Cat Sitting.png', 'image', 'f4z4'), 'ai-blue-big-cat-f4z4.png')
  assert.equal(makeAssetUploadName('Car Race Scene.mp4', 'video', '4s1z'), 'av-car-race-sc-4s1z.mp4')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
