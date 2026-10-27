// Jump cuts (pauses, fillers, retakes, punch-in), transcript cuts and the
// green screen / cut-out settings: the pure engine on synthetic input, then
// plans applied to the real store.
import assert from 'node:assert/strict'
import { useEditorStore } from '../../store/editorStore'
import type { VideoElement } from '../../types/editor'
import { buildAiProjectContext, executeAiPlan, planAiEdit, planSmartSteps, prepareAiPlan } from '..'
import type { SmartMedia } from '../smart/expand'
import { removeRanges } from '../smart/cuts'
import { autoThreshold, frameLoudness, speechFromLoudness } from '../smart/speech'
import {
  cutCommands, cutLength, DEFAULT_JUMP_CUT, describeCuts, fillerRanges, findRetakes, jumpCutRanges, partsOfSource,
  pauseRanges, retakeRanges, transcriptCuts, type Word,
} from '../smart/jumpcut'
import { punchedCrop } from '../../utils/cropKeys'
import { detectScreenColor, hexToRgb, normalizeKeying } from '../../utils/keying'
import { clipParts } from '../../utils/keyingBackground'
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
    const talking = speech.some(([a, b]) => t >= a && t < b) && (t * 1000) % 300 > 60
    out[i] = (seed / 2147483647 - 0.5) * 0.002 + (talking ? 0.3 * Math.sin(2 * Math.PI * 220 * t) : 0)
  }
  return out
}

/** Words from "text@start" with each word lasting 0.3 s unless "text@start-end". */
function words(spec: string): Word[] {
  return spec.split(/\s+/).filter(Boolean).map(token => {
    const [text, time] = token.split('@')
    const [start, end] = time.split('-').map(Number)
    return { text: text.replace(/_/g, ' '), start, end: end ?? start + 0.3 }
  })
}

const texts = (list: Word[], [i, j]: [number, number]) => list.slice(i, j).map(w => w.text).join(' ')

function fakeMedia(over: Partial<SmartMedia>): SmartMedia {
  return {
    decodeMono: async () => null,
    detectShotChanges: async () => [],
    transcribeWords: async () => [],
    detectFaces: async () => ({ aspect: 16 / 9, samples: [] }),
    ...over,
  }
}

function run(plan: { summary: string; commands: Parameters<typeof prepareAiPlan>[0]['commands'] }) {
  const prepared = prepareAiPlan(plan, buildAiProjectContext()!)
  assert.deepEqual(prepared.issues.filter(i => i.level === 'error').map(i => i.message), [], 'plan errors')
  const results = executeAiPlan(prepared.plan)
  assert.deepEqual(results.filter(r => !r.ok).map(r => r.message), [], 'failed commands')
}

const project = () => useEditorStore.getState().project!
const videosOf = (scene: { elements: Array<{ type: string }> }) => scene.elements.filter(e => e.type === 'video') as VideoElement[]

const tests: Array<[string, () => void | Promise<void>]> = [
  // ── Speech level ─────────────────────────────────────────────────────────────
  ['speech level: automatic, or set by hand', () => {
    const db = frameLoudness(speechSignal(6, [[1, 2], [3, 4]]), SR)
    const auto = autoThreshold(db)!
    assert.ok(auto > -60 && auto < -10, `auto threshold ${auto}`)
    assert.equal(speechFromLoudness(db, { minSilence: 0.5 }).length, 2)
    // A level above the speech hears nothing; far below the noise hears one long region.
    assert.equal(speechFromLoudness(db, { threshold: 0 }).length, 0)
    assert.equal(speechFromLoudness(db, { threshold: -120, minSilence: 0.5 }).length, 1)
    assert.equal(autoThreshold(new Float32Array(0)), null)
  }],

  // ── Ranges ───────────────────────────────────────────────────────────────────
  ['pauses keep a breath next to speech, and clip edges go completely', () => {
    const speech: Array<[number, number]> = [[1, 2], [3, 4]]
    const ranges = pauseRanges(speech, { from: 0, to: 5 }, { minPause: 0.5, padding: 0.1 })
    assert.deepEqual(ranges.map(r => [r.from, r.to].map(n => Math.round(n * 100) / 100)), [[0, 0.9], [2.1, 2.9], [4.1, 5]])
    // Shorter than the shortest pause: kept.
    assert.equal(pauseRanges(speech, { from: 0, to: 5 }, { minPause: 1.5, padding: 0.1 }).length, 0)
  }],
  ['fillers are cut where they are', () => {
    const list = words('So@0 um@0.4 this@0.8 uh,@1.2 works@1.6')
    assert.deepEqual(fillerRanges(list).map(r => r.from), [0.4, 1.2])
  }],
  ['retakes: the earlier tries go, the last take stays', () => {
    const a = words("So@0 today@0.3 we're@0.6 going@0.9 to,@1.2 so@2 today@2.3 we're@2.6 going@2.9 to@3.2 talk@3.5 about@3.8 AI.@4.1")
    assert.deepEqual(findRetakes(a).map(r => texts(a, r)), ["So today we're going to,"])
    const b = words('I@0 think,@0.3 I@1 think@1.3 that@1.6 we@1.9 should,@2.2 I@3 think@3.3 that@3.6 we@3.9 should@4.2 go.@4.5')
    assert.deepEqual(findRetakes(b).map(r => texts(b, r)), ['I think,', 'I think that we should,'])
    // Fillers between takes don't matter.
    const c = words('So@0 today@0.3 um@0.7 so@1.2 today@1.5 we@1.8 talk@2.1')
    assert.deepEqual(findRetakes(c).map(r => texts(c, r)), ['So today um'])
    // The same words later in a sentence are not a retake.
    const d = words("it's@0 in@0.3 the@0.6 box.@0.9 Put@1.3 it@1.6 in@1.9 the@2.2 box.@2.5")
    assert.deepEqual(findRetakes(d), [])
    // Too far apart to be a retake.
    const e = words('Let@0 me@0.3 show@0.6 you.@0.9 Let@30 me@30.3 show@30.6 you@30.9 more.@31.2')
    assert.deepEqual(findRetakes(e), [])
    // The cut runs from the abandoned take to the restart.
    assert.deepEqual(retakeRanges(a).map(r => [r.from, r.to]), [[0, 2]])
  }],
  ['jump-cut ranges stay inside the clip and say why each cut is there', () => {
    const list = words("um@0.2 Hello@1 there.@1.3 Hello@2 there,@2.3 friends.@2.6")
    const ranges = jumpCutRanges({ speech: [[0.2, 0.5], [1, 1.6], [2, 2.9]], words: list }, { from: 0.5, to: 3 }, { ...DEFAULT_JUMP_CUT, fillers: true, retakes: true })
    assert.deepEqual(ranges.map(r => r.kind), ['pause', 'retake'])
    assert.ok(ranges.every(r => r.from >= 0.5 && r.to <= 3))
    near(cutLength([{ from: 0, to: 2 }, { from: 1, to: 3 }, { from: 5, to: 6 }]), 4, 1e-9, 'overlaps count once')
  }],
  ['transcript cuts take half the gap on each side of deleted words', () => {
    const list = words('One@0-0.4 two@0.6-1 three@1.4-1.8 four@2.2-2.6')
    const cuts = transcriptCuts(list, new Set([1, 2]), [{ from: 3, to: 4 }])
    assert.deepEqual(cuts.map(c => [c.kind, Math.round(c.from * 100) / 100, Math.round(c.to * 100) / 100]), [['edit', 0.5, 2], ['pause', 3.1, 3.9]])
    // The last word: to its own end.
    assert.deepEqual(transcriptCuts(list, new Set([3]), []).map(c => [c.from, c.to]), [[2, 2.6]])
  }],

  // ── Scene commands ───────────────────────────────────────────────────────────
  ['cutting names every part left, so it can be changed later in the plan', () => {
    let n = 0
    const scene = { id: 's', index: 1, duration: 10 }
    const result = removeRanges(scene, [[2, 3], [6, 7]], () => `a${++n}`, { canRemoveScene: true, nameParts: true })
    assert.deepEqual(result.kept.map(k => [k.from, k.to]), [[0, 2], [3, 6], [7, 10]])
    assert.deepEqual(result.kept[0].ref, { sceneId: 's', sceneIndex: 1 })
    assert.ok(result.kept[1].ref.sceneAlias && result.kept[2].ref.sceneAlias)
    // A cut at the start: the first part left is a new scene.
    const start = removeRanges(scene, [[0, 2]], () => `b${++n}`, { canRemoveScene: true, nameParts: true })
    assert.deepEqual(start.kept.map(k => [k.from, k.to, Boolean(k.ref.sceneAlias)]), [[2, 10, true]])
    // Slivers shorter than minKeep are cut with their neighbours.
    const sliver = removeRanges(scene, [[2, 3], [3.1, 4]], () => `c${++n}`, { canRemoveScene: true, minKeep: 0.3 })
    assert.equal(sliver.count, 1)
    near(sliver.removed, 2, 1e-9, 'merged')
  }],
  ['punch-in zooms every other part, across the whole clip', () => {
    const f = loadFixture()
    // clip.mp4 plays source 0–4 s on scene 2.
    const [part] = partsOfSource(buildAiProjectContext()!, 'clip.mp4')
    let n = 0
    const result = cutCommands([{ part, ranges: [{ from: 1, to: 1.5, kind: 'pause' }, { from: 2.5, to: 3, kind: 'filler' }] }], { punchIn: true, zoom: 1.12 }, { canRemoveScene: true, nextAlias: () => `p${++n}` })
    assert.deepEqual(result.counts, { pause: 1, filler: 1, retake: 0, edit: 0 })
    assert.equal(result.punched, 1)
    assert.match(describeCuts(result), /^Cut 1 pause and 1 filler word \(1\.0s\), punching in on 1 part\.$/)
    run({ summary: 'jump cut', commands: result.commands })
    const scenes = project().scenes
    assert.equal(scenes.length, 6)
    assert.equal(scenes[1].id, f.scenes[1].id)
    const zooms = scenes.slice(1, 4).map(s => videosOf(s)[0]?.punchIn)
    assert.deepEqual(zooms, [1, 1.12, 1])
    near(videosOf(scenes[2])[0].startTime ?? 0, 1.5, 0.01, 'second part starts after the pause')
    // The other scene 2 items were split with it, untouched.
    assert.ok(scenes[2].elements.some(e => e.type === 'image'))
  }],
  ['punch-in crop: the middle of the crop, same shape', () => {
    assert.deepEqual(punchedCrop(undefined, 1), undefined)
    const c = punchedCrop({ x: 0.2, y: 0, w: 0.5, h: 1 }, 1.25)!
    near(c.w, 0.4, 1e-9, 'w'); near(c.h, 0.8, 1e-9, 'h'); near(c.x, 0.25, 1e-9, 'x'); near(c.y, 0.1, 1e-9, 'y')
  }],
  ['"jumpCut" smart step: pauses, retakes and punch-in from one request', async () => {
    loadFixture()
    // Talking 0.3–1.4 s (an abandoned take), then 1.9–3.8 s; clip plays source 0–4 s.
    const audio = speechSignal(10, [[0.3, 1.4], [1.9, 3.8]])
    const said = words("So@0.3 today@0.6 we@0.9 go,@1.1 so@1.9 today@2.2 we@2.5 go@2.8 far.@3.1-3.6")
    const media = fakeMedia({ decodeMono: async () => ({ samples: audio, sampleRate: SR }), transcribeWords: async () => said })
    const planned = await planSmartSteps([{ type: 'jumpCut', src: 'clip.mp4', settings: { pauses: true, retakes: true, punchIn: true, minPause: 0.3, padding: 0.05 } }], buildAiProjectContext()!, { media })
    assert.match(planned.plan.summary, /retake/)
    assert.match(planned.plan.summary, /Word timings are approximate/)
    run(planned.plan)
    // The abandoned take (0.3–1.9) is gone: the clip now starts with the restart.
    const firstVideo = project().scenes.map(s => videosOf(s)[0]).find(Boolean)!
    near(firstVideo.startTime ?? 0, 1.85, 0.12, 'starts at the last take')
  }],
  ['"remove retakes" from a prompt uses the jump-cut engine', async () => {
    loadFixture()
    const said = words("Hi@0.5 there@0.8 friends,@1.1 hi@1.8 there@2.1 friends@2.4 and@2.7 welcome.@3")
    const media = fakeMedia({ decodeMono: async () => ({ samples: speechSignal(10, [[0.5, 3.4]]), sampleRate: SR }), transcribeWords: async () => said })
    const planned = await planAiEdit('remove the retakes', buildAiProjectContext()!, { media })
    assert.match(planned.plan.summary, /^Cut 1 retake/)
    run(planned.plan)
    assert.equal(project().scenes.length, 5)
  }],

  // ── Green screen / cut-out settings ─────────────────────────────────────────
  ['keying settings are cleaned', () => {
    assert.deepEqual(normalizeKeying({ mode: 'chroma', color: '#00FF00', strength: 3 }), { mode: 'chroma', color: '#00ff00', strength: 1, softness: 0.1, spill: 0.3 })
    assert.deepEqual(normalizeKeying({ mode: 'person', background: 'blur' }), { mode: 'person', feather: 0.3, background: 'blur', backgroundBlur: 0.5 })
    assert.deepEqual(normalizeKeying({ mode: 'person', background: 'sky' }), { mode: 'person', feather: 0.3, background: 'none' })
    assert.equal(normalizeKeying({ mode: 'magic' }), undefined)
    assert.deepEqual(hexToRgb('#ff8000').map(v => Math.round(v * 100) / 100), [1, 0.5, 0])
  }],
  ['the screen colour is found from the picture edges', () => {
    const w = 32, h = 18
    const data = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        const subject = x > 10 && x < 22 && y > 4
        const [r, g, b] = subject ? [200, 150, 120] : [40 + (x % 3), 180 + (y % 4), 70]
        data.set([r, g, b, 255], i)
      }
    }
    const color = detectScreenColor(data, w, h)!
    const [r, g, b] = hexToRgb(color).map(v => v * 255)
    assert.ok(g > 170 && r < 50 && b < 80, `green screen colour ${color}`)
    // A grey picture has no screen colour.
    assert.equal(detectScreenColor(new Uint8ClampedArray(w * h * 4).fill(128), w, h), null)
  }],
  ['green screen and cut-out from prompts, applied and removed', async () => {
    const f = loadFixture()
    f.goTo(2)
    const apply = async (prompt: string) => {
      const planned = await planAiEdit(prompt, buildAiProjectContext()!, { media: fakeMedia({}) })
      run(planned.plan)
      return planned
    }
    const keyed = await apply('remove the green screen')
    assert.match(keyed.plan.summary, /remove green screen/)
    const video = () => videosOf(project().scenes[1])[0]
    assert.equal(video().keying?.mode, 'chroma')
    await apply('blur my background')
    assert.deepEqual(video().keying, { mode: 'person', feather: 0.3, background: 'blur', backgroundBlur: 0.5 }, JSON.stringify(video().keying))
    await apply('bring the background back')
    assert.equal(video().keying, undefined)
  }],
  ['background changes reach every part of a clip cut into parts', async () => {
    const f = loadFixture()
    useEditorStore.getState().splitScene(f.scenes[1].id, 2)
    const first = videosOf(project().scenes[1])[0]
    assert.deepEqual(clipParts(project(), first).map(el => el.src), ['clip.mp4', 'clip.mp4'], 'two parts of clip.mp4')
    assert.equal(clipParts(project(), project().scenes[1].elements.find(e => e.type === 'image') as never).length, 2, 'the image was split too')
    const planned = await planAiEdit('blur my background', buildAiProjectContext()!, { media: fakeMedia({}) })
    run(planned.plan)
    assert.deepEqual(project().scenes.slice(1, 3).map(s => videosOf(s)[0].keying?.background), ['blur', 'blur'])
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
    console.error(`\n${failed}/${tests.length} jump cut tests failed`)
    process.exit(1)
  }
  console.log(`ai jump cut tests passed (${tests.length})`)
}

main().catch(error => { console.error(error); process.exit(1) })
