import assert from 'node:assert/strict'
import { fitPreviewToViewport } from '../src/utils/previewLayout'

assert.deepEqual(
  fitPreviewToViewport(1920, 1080, 1920, 1080),
  { width: 1920, height: 1080 },
  'matching aspect ratios should use the complete viewport',
)

assert.deepEqual(
  fitPreviewToViewport(1080, 1920, 1920, 1080),
  { width: 608, height: 1080 },
  'portrait previews should use the complete viewport height without padding',
)

assert.deepEqual(
  fitPreviewToViewport(1920, 1080, 1000, 1000),
  { width: 1000, height: 563 },
  'wide previews should remain fully visible when viewport width is limiting',
)

console.log('preview layout tests passed')
