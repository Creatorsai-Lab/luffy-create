// Effects engine (pure parts): the catalogue, converting older projects, effect
// windows and fades, camera moves, beats, splitting, and speed curves.
import assert from 'node:assert/strict'
import { FX_DEFS, FX_GROUPS, fxFromWords, lookFromWords } from '../src/engine/fx/catalog'
import { beatPulse, cameraMove, effectStack, fxWeight, itemMotion, makeFx, needsPixelWork, shiftFx, stackPatch } from '../src/engine/fx/stack'
import {
  cleanCurve, clipLengthFor, clipTimeAtFootage, curveStretch, footageAt, footageSpan, footageTimeAt, playAtFootage, playbackSpeedAt, presetCurve,
  soundPieces, SPEED_PRESETS, splitTiming,
} from '../src/utils/speedCurve'
import { makeImage, makeVideo } from '../src/utils/defaults'
import { clipWindow } from '../src/ai/smart/jumpcut'
import type { MediaFx, VideoElement } from '../src/types/editor'

const near = (a: number, b: number, tol: number, label: string) => assert.ok(Math.abs(a - b) <= tol, `${label}: ${a} vs ${b}`)

// ── Catalogue ────────────────────────────────────────────────────────────────
assert.equal(new Set(FX_DEFS.map(d => d.type)).size, FX_DEFS.length, 'each effect once')
assert.equal(FX_DEFS.length, 43, 'effects in the catalogue')
for (const def of FX_DEFS) {
  assert.ok(FX_GROUPS.some(g => g.id === def.group), `${def.type} group`)
  assert.equal(fxFromWords(def.label.toLowerCase()), def.type, `"${def.label}" is understood`)
  for (const p of def.params) assert.ok(p.default !== undefined, `${def.type}.${p.key} default`)
}
assert.equal(fxFromWords('add a neon outline to me'), 'neonOutline')
assert.equal(fxFromWords('phunk edit'), 'phonk')
assert.equal(fxFromWords('make it look like vhs'), 'vhs')
assert.equal(fxFromWords('super 8 film'), 'film8mm')
assert.equal(lookFromWords('teal and orange look'), 'tealOrange')
assert.equal(lookFromWords('black and white'), 'monochrome')

// ── Older projects convert ───────────────────────────────────────────────────
const video = makeVideo(0, 0, 'a.mp4', 'a', 640, 360, 10)
video.timelineX = 2
video.mediaEffects = [{ type: 'zoomIn', startAt: 3, endAt: 6, mediaEffectZoomPosition: 'topLeft', mediaEffectIntensity: 0.6 } as never]
video.colorGrading = 'noir'
video.grainOpacity = 0.4
const legacy = effectStack(video)
assert.deepEqual(legacy.map(f => f.type), ['kenBurnsIn', 'look', 'grain'])
assert.deepEqual([legacy[0].start, legacy[0].end, legacy[0].params?.position], [1, 4, 'topLeft'], 'scene seconds become clip seconds')
assert.equal(legacy[1].params?.look, 'noir')
const patch = stackPatch(video, legacy)
assert.deepEqual([patch.mediaEffects, patch.colorGrading, patch.grainOpacity, patch.videoEffect], [undefined, 'none', 0, 'none'])
const image = makeImage(0, 0, 'a.png', 'a')
image.fx = [makeFx('glow')]
assert.equal(effectStack(image).length, 1, 'a stack wins over older fields')
assert.equal(needsPixelWork(image, effectStack(image)), true)
assert.equal(needsPixelWork(makeImage(0, 0, 'b.png', 'b'), []), false, 'plain images take the fast path')

// ── Windows, fades, beats ────────────────────────────────────────────────────
const fx: MediaFx = { ...makeFx('glitch'), start: 1, end: 3, fadeIn: 0.5, fadeOut: 0.5, intensity: 0.8 }
assert.equal(fxWeight(fx, 0.9, 5), 0)
near(fxWeight(fx, 1.25, 5), 0.4, 1e-9, 'half faded in')
near(fxWeight(fx, 2, 5), 0.8, 1e-9, 'full strength')
near(fxWeight(fx, 2.75, 5), 0.4, 1e-9, 'half faded out')
assert.equal(fxWeight(fx, 3.1, 5), 0)
const open = { ...makeFx('glow'), start: 0 }
assert.ok(fxWeight(open, 6, 5) > 0, 'an effect without an end carries on past the clip (transitions)')
const beats = [0.5, 1, 1.5, 2]
assert.equal(beatPulse(beats, 1).index, 1)
near(beatPulse(beats, 1).pulse, 1, 1e-9, 'pulse on the beat')
assert.ok(beatPulse(beats, 1.4).pulse < 0.05, 'decays before the next beat')
assert.ok(beatPulse(null, 0.5).pulse > 0.99, 'steady 120 BPM without music')

// ── Camera and item motion ───────────────────────────────────────────────────
const beat = () => ({ pulse: 0, index: 0 })
const still = cameraMove([], 1, 5, beat)
assert.deepEqual(still, { zoom: 1, cx: 0.5, cy: 0.5, rotate: 0 })
const kb = cameraMove([{ ...makeFx('kenBurnsIn'), intensity: 1 }], 5, 5, beat)
near(kb.zoom, 1.58, 1e-6, 'Ken Burns ends zoomed in')
const shaky = [{ ...makeFx('shake'), intensity: 1 }]
for (let t = 0; t < 5; t += 0.13) {
  const m = cameraMove(shaky, t, 5, beat)
  const half = 0.5 / m.zoom
  assert.ok(m.cx - half >= -1e-9 && m.cx + half <= 1 + 1e-9 && m.cy - half >= -1e-9 && m.cy + half <= 1 + 1e-9, `shake never shows past the edge at ${t}`)
}
const floaty = itemMotion([{ ...makeFx('float'), intensity: 1 }], 0.7, 5)
assert.ok(Math.abs(floaty.dy) > 0, 'float moves the item')

// ── Splitting moves effect windows onto the second part's clock ──────────────
const shifted = shiftFx([{ ...makeFx('vhs'), start: 1, end: 4 }, { ...makeFx('glow'), start: 0, end: 1.5 }], 2)
assert.deepEqual(shifted.map(f => [f.type, f.start, f.end]), [['vhs', -1, 2]])

// ── Speed curves ─────────────────────────────────────────────────────────────
for (const preset of SPEED_PRESETS) {
  const curve = presetCurve(preset.id)!
  let last = -1
  for (let u = 0; u <= 1.0001; u += 0.02) {
    const x = footageAt(curve, u)
    assert.ok(x >= last - 1e-9 && x <= 1 + 1e-9, `${preset.id} footage only moves forward`)
    last = x
  }
  near(footageAt(curve, 1), 1, 1e-6, `${preset.id} reaches the end`)
  near(playAtFootage(curve, footageAt(curve, 0.37)), 0.37, 2e-3, `${preset.id} inverse`)
}
const flat = cleanCurve({ preset: 'custom', points: [{ x: 0.5, speed: 2 }] })
near(curveStretch(flat), 0.5, 1e-9, 'twice as fast takes half the time')
assert.deepEqual(cleanCurve({ preset: 'x', points: [{ x: 0.5, speed: 50 }] }).points.map(p => p.speed), [10, 10, 10], 'speeds are capped (ends added)')

const clip = makeVideo(0, 0, 'b.mp4', 'b', 640, 360, 20) as VideoElement
clip.startTime = 2
clip.duration = 8
clip.playbackRate = 1
const span = footageSpan(clip)
near(span, 8, 1e-9, 'footage of a plain clip')
clip.speedCurve = presetCurve('slowmoStart')!
clip.duration = clipLengthFor(span, 1, clip.speedCurve)
near(footageSpan(clip), 8, 1e-6, 'a curve keeps the footage')
assert.ok(clip.duration > 8, 'slow motion makes the clip longer')
near(footageTimeAt(clip, 0), 0, 1e-9, 'starts at the trim point')
near(footageTimeAt(clip, clip.duration), 8, 1e-3, 'ends at the end of the footage')
near(playbackSpeedAt(clip, 0.1), 0.3, 1e-6, 'slow at the start')
near(playbackSpeedAt(clip, clip.duration - 0.1), 1, 1e-6, 'normal at the end')

clip.freeze = { at: 1, hold: 2 }
clip.duration += 2
near(footageTimeAt(clip, 1.5), footageTimeAt(clip, 1), 1e-9, 'the picture holds during the freeze')
assert.equal(playbackSpeedAt(clip, 2), 0)
near(footageTimeAt(clip, clip.duration), 8, 1e-3, 'a freeze adds time, not footage')

const parts = splitTiming(clip, 5)
near(parts.footage, footageTimeAt(clip, 5), 1e-9, 'the second part starts where the first ends')
assert.ok(parts.curves[0] && parts.curves[1])
assert.deepEqual(parts.freezes, [{ at: 1, hold: 2 }, undefined])

const pieces = soundPieces(clip, clip.duration)
const silence = pieces.filter(p => 'silence' in p).reduce((s, p) => s + ('silence' in p ? p.silence : 0), 0)
near(silence, 2, 1e-6, 'the freeze is silent')
const footageTotal = pieces.reduce((s, p) => s + ('footage' in p ? p.footage : 0), 0)
near(footageTotal, 8, 1e-3, 'every second of footage is heard once')
assert.ok(pieces.every(p => 'silence' in p || (p.tempo >= 0.1 && p.tempo <= 10)), 'tempos in range')
const playedLength = pieces.reduce((s, p) => s + ('silence' in p ? p.silence : p.footage / p.tempo), 0)
near(playedLength, clip.duration, 1e-6, 'the pieces fill the clip exactly')
assert.ok(pieces.length < 24, `same-speed neighbours merge (${pieces.length} pieces)`)
assert.ok(pieces.every((p, i) => i === 0 || !('silence' in p && 'silence' in pieces[i - 1])), 'silences join up')

// Jump cuts and transcript edits on a ramped clip map words through the curve.
for (const t of [0.5, 0.9, 3, 4.2, 6, 9]) {
  const footage = footageTimeAt(clip, t)
  const back = clipTimeAtFootage(clip, footage)
  near(footageTimeAt(clip, back), footage, 1e-3, `round trip at ${t}s`)
}
near(clipTimeAtFootage(clip, footageTimeAt(clip, 1)), 1, 1e-3, 'a frozen frame maps to where the freeze starts')
const placed = { ...clip, startTime: 2, timelineX: 0.5 }
const win = clipWindow(placed)
near(win.from, 2, 1e-9, 'window starts at the trim point')
near(win.to, 10, 1e-3, 'window covers the footage, not the clip length')
near(win.fromScene(0.5 + 4), 2 + footageTimeAt(placed, 4), 1e-9, 'scene → source follows the curve')
near(win.toScene(win.fromScene(5)), 5, 1e-3, 'source → scene is its reverse')

console.log('effects tests passed')
