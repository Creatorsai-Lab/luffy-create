import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const setup = readFileSync('scripts/prepare-local-whisper.mjs', 'utf8')
const main = readFileSync('electron/main/index.ts', 'utf8')

assert.match(setup, /LUFFY_WHISPER_MODEL \|\| 'tiny'/, 'Hindi transcription requires the multilingual tiny model by default')
assert.match(main, /resolveDevBuildAsset\('python-sandbox'\)/, 'development must resolve prepared assets from a Git worktree')

console.log('subtitle Whisper setup tests passed')
