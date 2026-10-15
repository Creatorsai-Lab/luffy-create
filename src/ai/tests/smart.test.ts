// Smart edits: speech/silence detection, beat tracking and shot cuts on
// synthetic signals, then whole prompts expanded with fake media and applied
// to the real store.
import assert from 'node:assert/strict'
import { useEditorStore } from '../../store/editorStore'
import type { VideoElement } from '../../types/editor'
import { buildAiProjectContext, executeAiPlan, planAiEdit, prepareAiPlan } from '..'
import { detectBeats, snapDurationsToBeats } from '../smart/beats'
import type { SmartMedia } from '../smart/expand'
import { findCuts } from '../smart/shots'
import { detectSpeech, silencesBetween } from '../smart/speech'
import { loadFixture } from './fixture'

;(globalThis as { window?: unknown }).window ??= { api: {} }

const SR = 16000
const near = (actual: number, expected: number, tolerance: number, label: string) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} is not within ${tolerance} of ${expected}`)

/** Quiet noise with "speech" (a 220 Hz tone with short gaps between words) in the given ranges. */
function speechSignal(seconds: number, speech: Array<[number, number]>) {
  const out = new Float32Array(Math.round(seconds * SR))
  let seed = 7
  for (let i = 0; i < out.length; i++) {
    seed = (seed * 16807) % 2147483647
    const t = i / SR
    const talking = speech.some(([a, b]) => t >= a && t < b) && (t * 1000) % 300 > 60 // 60 ms gap every 300 ms
    out[i] = (seed / 2147483647 - 0.5) * 0.002 + (talking ? 0.3 * Math.sin(2 * Math.PI * 220 * t) : 0)
  }
  return out
}

/** Decaying noise clicks every `period` seconds starting at `offset`. */
function clickTrack(seconds: number, period: number, offset: number) {
  const out = new Float32Array(Math.round(seconds * SR))
  let seed = 3
  for (let beat = offset; beat < seconds; beat += period) {
    const start = Math.round(beat * SR)
    for (let i = 0; i < 0.05 * SR && start + i < out.length; i++) {
      seed = (seed * 16807) % 2147483647
      out[start + i] += (seed / 2147483647 - 0.5) * Math.exp(-i / (0.01 * SR))
    }
  }
  return out
}

function fakeMedia(over: Partial<SmartMedia>): SmartMedia {
  return {
    decodeMono: async () => null,
    detectShotChanges: async () => [],
    transcribeWords: async () => [],
    ...over,
  }
}

async function apply(prompt: string, media: SmartMedia) {
  const context = buildAiProjectContext()!
  const planned = await planAiEdit(prompt, context, { media })
  const prepared = prepareAiPlan(planned.plan, context)
  const results = executeAiPlan(prepared.plan)
  assert.deepEqual(results.filter(r => !r.ok).map(r => r.message), [], 'failed commands')
  return { planned, issues: [...(planned.issues ?? []), ...prepared.issues] }
}

const project = () => useEditorStore.getState().project!

const tests: Array<[string, () => void | Promise<void>]> = [
  ['speech detection finds talking and ignores gaps between words', () => {
    const regions = detectSpeech(speechSignal(8, [[1, 3], [4.5, 5.5], [5.8, 6.8]]), SR, { minSilence: 0.5 })
    assert.equal(regions.length, 2, JSON.stringify(regions))
    near(regions[0][0], 1, 0.05, 'first start'); near(regions[0][1], 3, 0.06, 'first end')
    near(regions[1][0], 4.5, 0.05, 'second start'); near(regions[1][1], 6.8, 0.06, 'second end')
  }],
  ['pure silence has no speech', () => {
    assert.deepEqual(detectSpeech(new Float32Array(SR * 3), SR), [])
  }],
  ['silences between speech', () => {
    assert.deepEqual(silencesBetween([[1, 3], [4.5, 6.8]], 0, 8, 0.6), [[0, 1], [3, 4.5], [6.8, 8]])
    assert.deepEqual(silencesBetween([[1, 3], [3.4, 6]], 0, 6, 0.6), [[0, 1]])
  }],
  ['beat tracking on a 120 BPM click track', () => {
    const grid = detectBeats(clickTrack(20, 0.5, 0.23), SR)!
    near(grid.bpm, 120, 1.5, 'bpm')
    const first = grid.beats.find(b => b > 1)!
    near(((first - 0.23) % 0.5 + 0.5) % 0.5 > 0.25 ? ((first - 0.23) % 0.5) - 0.5 : (first - 0.23) % 0.5, 0, 0.03, 'phase')
  }],
  ['beat tracking on a 90 BPM click track', () => {
    near(detectBeats(clickTrack(20, 60 / 90, 0.1), SR)!.bpm, 90, 1.5, 'bpm')
  }],
  ['scene boundaries snap to beats', () => {
    const beats = Array.from({ length: 40 }, (_, i) => i * 0.5)
    assert.deepEqual(snapDurationsToBeats([1.9, 2.2, 1.1], beats), [2, 2, 1])
    assert.deepEqual(snapDurationsToBeats([1.9, 2.2, 1.1], beats, { beatsPerCut: 4 }), [2, 2, 2])
  }],
  ['shot cuts are sudden changes, not slow drift', () => {
    const times = Array.from({ length: 60 }, (_, i) => i * 0.25)
    const diffs = times.map((_, i) => (i === 10 || i === 30 ? 0.6 : i === 11 ? 0.55 : i >= 40 && i < 50 ? 0.15 : 0.02))
    assert.deepEqual(findCuts(diffs, times), [10, 30])
  }],

  ['"remove silences" cuts the pause out of a clip', async () => {
    const f = loadFixture()
    // clip.mp4 plays source 0–4 s on scene 2; talking at 0.5–1.5 and 2.5–3.5.
    const audio = speechSignal(10, [[0.5, 1.5], [2.5, 3.5]])
    const { planned } = await apply('remove silences', fakeMedia({ decodeMono: async () => ({ samples: audio, sampleRate: SR }) }))
    assert.match(planned.plan.summary, /Remove 1 pause/)
    const scenes = project().scenes
    assert.equal(scenes.length, 5)
    assert.equal(scenes[1].id, f.scenes[1].id)
    near(scenes[1].duration, 1.65, 0.05, 'first part')
    near(scenes[2].duration, 1.65, 0.05, 'second part')
    const rest = scenes[2].elements.find(e => e.type === 'video') as VideoElement
    near(rest.startTime ?? 0, 2.35, 0.05, 'second part resumes after the pause')
  }],
  ['"remove filler words" cuts each filler', async () => {
    loadFixture()
    const words = [
      { start: 0.2, end: 0.6, text: 'So,' }, { start: 1.0, end: 1.3, text: 'um,' }, { start: 1.3, end: 2.0, text: 'today' },
      { start: 2.0, end: 2.4, text: 'E-R-M,' }, { start: 2.4, end: 3.0, text: 'cutting.' },
    ]
    const { planned } = await apply('remove filler words', fakeMedia({ transcribeWords: async () => words }))
    assert.match(planned.plan.summary, /Remove 2 filler words \(0\.7s\)/)
    const parts = project().scenes.slice(1, 4).map(s => Math.round(s.duration * 100) / 100)
    assert.deepEqual(parts, [1, 0.7, 1.6])
  }],
  ['"cut to the beat" snaps scene ends under the music', async () => {
    loadFixture()
    // song.mp3 plays 0–12 s from the start of the project; beats at 0.2 + k·0.5.
    const { planned } = await apply('cut to the beat', fakeMedia({ decodeMono: async () => ({ samples: clickTrack(30, 0.5, 0.2), sampleRate: SR }) }))
    assert.match(planned.plan.summary, /to the beat \(120/)
    // Boundaries at 5 and 9 move to beats 5.2 and 9.2; the ones past the music stay.
    // Beats are found to the nearest 10 ms analysis frame.
    const durations = project().scenes.map(s => s.duration)
    ;[5.2, 4, 5.8, 3].forEach((expected, i) => near(durations[i], expected, 0.03, `scene ${i + 1}`))
  }],
  ['"split into shots" splits at each change', async () => {
    loadFixture()
    await apply('split the video into shots', fakeMedia({ detectShotChanges: async () => [1.2, 2.8] }))
    assert.deepEqual(project().scenes.slice(1, 4).map(s => Math.round(s.duration * 100) / 100), [1.2, 1.6, 1.2])
  }],
  ['no speech means no cuts', async () => {
    loadFixture()
    const { issues } = await apply('remove silences', fakeMedia({ decodeMono: async () => ({ samples: new Float32Array(SR * 10), sampleRate: SR }) }))
    assert.equal(project().scenes.length, 4)
    assert.ok(issues.some(i => /No speech found/.test(i.message)))
  }],
]

async function main() {
  let failed = 0
  for (const [name, test] of tests) {
    try {
      await test()
    } catch (error) {
      failed++
      console.error(`✘ ${name}\n  ${(error as Error).message.split('\n').slice(0, 6).join('\n  ')}`)
    }
  }
  if (failed) {
    console.error(`\n${failed}/${tests.length} smart tests failed`)
    process.exit(1)
  }
  console.log(`ai smart tests passed (${tests.length})`)
}

main().catch(error => { console.error(error); process.exit(1) })
