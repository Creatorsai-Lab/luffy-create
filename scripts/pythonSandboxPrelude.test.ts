import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { getPythonSandboxPrelude } from '../src/pythonSandbox/runtime'

function assertMatplotlibAnimationWins(label: string, source: string) {
  const manimIndex = source.indexOf('from manim import *')
  const animationIndex = source.lastIndexOf('from matplotlib import animation')

  assert.notEqual(manimIndex, -1, `${label} should load Manim names`)
  assert.notEqual(animationIndex, -1, `${label} should expose matplotlib animation`)
  assert.ok(
    animationIndex > manimIndex,
    `${label} should bind animation to matplotlib after Manim names are loaded`
  )
}

assertMatplotlibAnimationWins('renderer prelude', getPythonSandboxPrelude('script'))

const mainSource = readFileSync('electron/main/index.ts', 'utf-8')
const preludeMatch = mainSource.match(/const PYTHON_SANDBOX_PRELUDE = `([\s\S]*?)`/)
assert.ok(preludeMatch, 'main process Python sandbox prelude should exist')
assertMatplotlibAnimationWins('main process prelude', preludeMatch[1])

console.log('python sandbox prelude tests passed')
