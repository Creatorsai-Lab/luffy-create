import assert from 'node:assert/strict'

import type { AiProjectContext } from '../../src/ai/types'
import { makeAssetUploadName } from '../../electron/main/assetNaming'

async function main() {
  ;(globalThis as unknown as { window: unknown }).window = { api: {} }
  const { planAiEdit } = await import('../../src/ai/planner')
  const { prepareAiPlan } = await import('../../src/ai/prepare')

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
    }, {
      id: 'image-asset-1',
      type: 'image',
      name: 'content-growth.gif',
      filename: 'content-growth.gif',
    }, {
      id: 'image-asset-2',
      type: 'image',
      name: 'ai-creator-gr-02td.gif',
      filename: 'ai-creator-gr-02td.gif',
    }, {
      id: 'audio-asset-1',
      type: 'audio',
      name: 'Audio-ping-A',
      filename: 'Audio-ping-A.mp3',
    }, {
      id: 'audio-asset-2',
      type: 'audio',
      name: 'aa-piano-ping-a-0m24.wav',
      filename: 'aa-piano-ping-a-0m24.wav',
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
    'addVideoFromAsset',
    'addText',
  ])
  const carVideoCommand = result.plan.commands[1] as Record<string, unknown>
  const welcomeTextCommand = result.plan.commands[2] as Record<string, unknown>
  assert.equal(welcomeTextCommand.sceneAlias, 'newScene')
  assert.equal(carVideoCommand.sceneAlias, 'newScene')
  assert.equal(carVideoCommand.assetName, 'av-car-race-sc-4s1z.mp4')
  assert.equal(carVideoCommand.width, 500)
  assert.equal(carVideoCommand.height, 500)

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
  const sceneTextCommand = sceneTargetResult.plan.commands[0] as Record<string, unknown>
  assert.equal(sceneTextCommand.sceneIndex, 8)
  assert.equal(sceneTextCommand.text, 'checking the updated AI edits')

  const assetMentionResult = await planAiEdit(`
1. Add a new scene in last
2. In that scene at image @content-growth.gif with width 900px
3. Add a text box with content "AI Added Text" and also give it fade animation with duration 1.1 seconds
4. Last, add audio @Audio-ping-A in timeline below last scene
`, context)

  assert.deepEqual(assetMentionResult.plan.commands.map(command => command.type), [
    'addScene',
    'addImageFromAsset',
    'addText',
    'addAudioFromAsset',
  ])
  const gifImageCommand = assetMentionResult.plan.commands[1] as Record<string, unknown>
  const aiTextCommand = assetMentionResult.plan.commands[2] as Record<string, unknown>
  const audioCommand = assetMentionResult.plan.commands[3] as Record<string, unknown>
  assert.deepEqual(aiTextCommand.animation, { type: 'fadeIn', duration: 1.1 })
  assert.equal(gifImageCommand.sceneAlias, 'newScene')
  assert.equal(gifImageCommand.assetName, 'content-growth.gif')
  assert.equal(gifImageCommand.width, 900)
  assert.equal(audioCommand.sceneAlias, 'newScene')
  assert.equal(audioCommand.assetName, 'Audio-ping-A.mp3')

  const creativePromptResult = await planAiEdit(`
1. Add a new scene in last with duration 6 seconds with #e4dfe6 background
2. In that scene at image @ai-creator-gr-02td.gif  at bottom with width 1500px and height 1200px
3. Add a text box at top with content "AI Added Text" and also give it fade animation with duration 1.1 seconds
4. Last, add audio @aa-piano-ping-a-0m24.wav  in timeline below last scene
`, context)

  assert.deepEqual(creativePromptResult.plan.commands.map(command => command.type), [
    'addScene',
    'setBackground',
    'addImageFromAsset',
    'addText',
    'addAudioFromAsset',
  ])
  const creativeSceneCommand = creativePromptResult.plan.commands[0] as Record<string, unknown>
  const creativeBackgroundCommand = creativePromptResult.plan.commands[1] as Record<string, unknown>
  const creativeImageCommand = creativePromptResult.plan.commands[2] as Record<string, unknown>
  const creativeTextCommand = creativePromptResult.plan.commands[3] as Record<string, unknown>
  const creativeAudioCommand = creativePromptResult.plan.commands[4] as Record<string, unknown>
  assert.equal(creativeSceneCommand.duration, 6)
  assert.equal(creativeTextCommand.y, 80)
  assert.equal(creativeTextCommand.color, undefined)
  assert.deepEqual(creativeTextCommand.animation, { type: 'fadeIn', duration: 1.1 })
  assert.equal(creativeImageCommand.width, 1500)
  assert.equal(creativeImageCommand.height, 1200)
  assert.equal(creativeImageCommand.x, 210)
  assert.equal(creativeImageCommand.y, -120)
  assert.equal(creativeAudioCommand.duration, 6)
  assert.deepEqual(creativeBackgroundCommand.background, { type: 'solid', color: '#e4dfe6' })

  const preparedCreative = prepareAiPlan(creativePromptResult.plan, context)
  const preparedImageCommand = preparedCreative.plan.commands[2] as Record<string, unknown>
  assert.equal(preparedImageCommand.height, 1200)
  assert.equal(preparedImageCommand.y, -120)

  const twoTextResult = await planAiEdit(`
1. Add a text box at left side center with content "Healthy" and also give it fade animation with duration 1.1 seconds, font size 160, color: #6a32c9, fontfamily Poppins
2. Add a text box at right side center with content "Drink" and also give it fade animation with duration 1.3 seconds, font size 160, color: #6a32c9, fontfamily Poppins
`, context)

  assert.deepEqual(twoTextResult.plan.commands.map(command => command.type), ['addText', 'addText'])
  const healthyCommand = twoTextResult.plan.commands[0] as Record<string, unknown>
  const drinkCommand = twoTextResult.plan.commands[1] as Record<string, unknown>
  assert.equal(healthyCommand.text, 'Healthy')
  assert.equal(healthyCommand.x, 80)
  assert.equal(healthyCommand.y, 510)
  assert.equal(healthyCommand.fontSize, 160)
  assert.equal(healthyCommand.fontFamily, 'Poppins')
  assert.equal(healthyCommand.color, '#6a32c9')
  assert.deepEqual(healthyCommand.animation, { type: 'fadeIn', duration: 1.1 })
  assert.equal(drinkCommand.text, 'Drink')
  assert.equal(drinkCommand.x, 1240)
  assert.equal(drinkCommand.y, 510)
  assert.equal(drinkCommand.fontSize, 160)
  assert.equal(drinkCommand.fontFamily, 'Poppins')
  assert.equal(drinkCommand.color, '#6a32c9')
  assert.deepEqual(drinkCommand.animation, { type: 'fadeIn', duration: 1.3 })

  assert.equal(makeAssetUploadName('Blue Big Cat Sitting.png', 'image', 'f4z4'), 'ai-blue-big-cat-f4z4.png')
  assert.equal(makeAssetUploadName('Car Race Scene.mp4', 'video', '4s1z'), 'av-car-race-sc-4s1z.mp4')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
