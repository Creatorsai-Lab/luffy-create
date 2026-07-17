import assert from 'node:assert/strict'

import { filterMentionAssets, getActiveAssetMention } from '../src/ai/assetMentions'
import type { AiProjectContext } from '../src/ai/types'

const assets: AiProjectContext['assets'] = [
  { id: 'image-1', type: 'image', name: 'content-growth', filename: 'content-growth.gif' },
  { id: 'audio-1', type: 'audio', name: 'Audio-ping-A', filename: 'Audio-ping-A.mp3' },
  { id: 'video-1', type: 'video', name: 'Launch demo', filename: 'av-launch-demo-a1b2.mp4' },
]

const prompt = 'Add image @content with width 900px and audio @Audio'
const firstCaret = prompt.indexOf('@content') + '@content'.length
const secondCaret = prompt.indexOf('@Audio') + '@Audio'.length

const firstMention = getActiveAssetMention(prompt, firstCaret)
assert.deepEqual(firstMention, {
  start: prompt.indexOf('@content'),
  end: firstCaret,
  query: 'content',
})
assert.deepEqual(
  filterMentionAssets(assets, firstMention).map(asset => asset.filename),
  ['content-growth.gif']
)

const secondMention = getActiveAssetMention(prompt, secondCaret)
assert.deepEqual(
  filterMentionAssets(assets, secondMention).map(asset => asset.filename),
  ['Audio-ping-A.mp3']
)

const allMention = getActiveAssetMention('Add @', 'Add @'.length)
assert.deepEqual(
  filterMentionAssets(assets, allMention).map(asset => asset.type),
  ['image', 'audio', 'video']
)

console.log('AI asset mention tests passed')
