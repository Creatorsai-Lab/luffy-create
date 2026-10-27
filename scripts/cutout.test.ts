// Background removal (pure parts): mask resizing and cropping, the guided-filter
// edge refine, growing and regions (following a picked subject), picks,
// run-length storage, blending and smoothing in time, and validating picks.
import assert from 'node:assert/strict'
import {
  applyPicks, blendMasks, cropMask, dilate, guidedFilter, refineRadius, regions, regionsTouching, resizeMask,
  rleDecode, rleEncode, smoothInTime, unionMasks,
} from '../src/engine/cutout/maskMath'
import { MAX_PICKS, normalizeKeying, normalizePicks } from '../src/utils/keying'

const fill = (w: number, h: number, f: (x: number, y: number) => number) => {
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = f(x, y)
  return out
}

// ── Resize / crop ─────────────────────────────────────────────────────────────
assert.ok(resizeMask(new Uint8Array(16).fill(200), 4, 4, 9, 7).every(v => v === 200), 'a flat mask stays flat')
const ramp = resizeMask(Uint8Array.from([0, 255]), 2, 1, 4, 1)
assert.ok(ramp[0] < ramp[1] && ramp[1] < ramp[2] && ramp[2] < ramp[3], `bilinear ramp ${ramp}`)
const halves = fill(8, 4, x => (x < 4 ? 0 : 255))
assert.deepEqual(cropMask({ data: halves, w: 8, h: 4 }, 4, 0, 4, 4, 4, 4), new Uint8Array(16).fill(255), 'cropping the right half')
assert.deepEqual(cropMask({ data: halves, w: 8, h: 4 }, 0, 0, 8, 4, 8, 4), halves, 'the whole mask is itself')

// ── Guided filter: a blurry mask snaps to the picture's edge ─────────────────
{
  const w = 60, h = 12
  const guide = new Float32Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) guide[y * w + x] = x < 30 ? 0.1 : 0.9
  const blurry = fill(w, h, x => Math.round(Math.max(0, Math.min(1, (x - 20) / 20)) * 255))
  const sharp = guidedFilter(guide, blurry, w, h, 4, 1e-3)
  const at = (m: Uint8Array, x: number) => m[6 * w + x]
  assert.ok(at(sharp, 26) < at(blurry, 26), `left of the edge gets more transparent (${at(blurry, 26)} → ${at(sharp, 26)})`)
  assert.ok(at(sharp, 33) > at(blurry, 33), `right of the edge gets more solid (${at(blurry, 33)} → ${at(sharp, 33)})`)
  assert.ok(guidedFilter(guide, new Uint8Array(w * h).fill(255), w, h, 4).every(v => v >= 254), 'a full mask stays full')
  assert.equal(refineRadius(1600, 900), 13)
  assert.equal(refineRadius(100, 50), 2)
}

// ── Grow, regions, following a subject ──────────────────────────────────────
{
  const w = 20, h = 10
  const dot = fill(w, h, (x, y) => (x === 10 && y === 5 ? 255 : 0))
  const grown = dilate(dot, w, h, 2)
  assert.equal(grown.filter(v => v).length, 25, 'a dot grows into a 5×5 square')
  const two = fill(w, h, x => (x < 5 || x > 14 ? 255 : 0))
  assert.equal(regions(two, w, h).count, 2, 'two separate people')
  const near = fill(w, h, x => (x === 2 ? 255 : 0))
  const kept = regionsTouching(two, near, w, h)
  assert.equal(kept.filter(v => v).length, 50, 'only the region the subject touches')
  assert.equal(kept[w - 1], 0, 'the other person is left out')
}

// ── Picks ─────────────────────────────────────────────────────────────────────
{
  const w = 20, h = 4
  const base = fill(w, h, x => (x < 8 || x > 12 ? 255 : 0))
  const keepLeft = fill(w, h, x => (x < 6 ? 255 : 0))
  const onlyLeft = applyPicks(base, keepLeft, null, w, h, 1)
  assert.equal(onlyLeft[0], 255)
  assert.equal(onlyLeft[19], 0, 'keep: what is far from the pick goes')
  const lamp = fill(w, h, x => (x === 10 ? 255 : 0))
  assert.equal(applyPicks(base, unionMasks([keepLeft, lamp]), null, w, h, 1)[10], 255, 'keep: a picked object the cut-out missed is added')
  const removed = applyPicks(base, null, fill(w, h, x => (x > 12 ? 255 : 0)), w, h, 1)
  assert.equal(removed[19], 0)
  assert.equal(removed[0], 255, 'remove: only the picked one goes')
  assert.equal(unionMasks([]), null)
}

// ── Run-length storage ──────────────────────────────────────────────────────
{
  const mask = fill(384, 216, (x, y) => ((x - 192) ** 2 + (y - 108) ** 2 < 80 ** 2 ? 255 : (x - 192) ** 2 + (y - 108) ** 2 < 84 ** 2 ? 128 : 0))
  const rle = rleEncode(mask)
  assert.deepEqual(rleDecode(rle, mask.length), mask, 'round trip')
  assert.ok(rle.length < mask.length / 10, `a typical mask compresses well (${mask.length} → ${rle.length} bytes)`)
  const noisy = Uint8Array.from({ length: 1000 }, (_, i) => (i * 37) % 251)
  assert.deepEqual(rleDecode(rleEncode(noisy), noisy.length), noisy, 'round trip of noise')
}

// ── Time: blending between masks, smoothing ─────────────────────────────────
{
  const a = new Uint8Array(4).fill(0), b = new Uint8Array(4).fill(200)
  assert.equal(blendMasks(a, b, 0.25)[0], 50)
  assert.equal(blendMasks(a, b, 0), a)
  const flicker = smoothInTime(new Uint8Array([255]), new Uint8Array([0]), new Uint8Array([255]))
  assert.equal(flicker[0], 128, 'a one-frame dropout is calmed')
  assert.equal(smoothInTime(null, new Uint8Array([90]), null)[0], 90)
}

// ── Picks in project data ───────────────────────────────────────────────────
{
  assert.deepEqual(normalizePicks([{ x: 0.5, y: 0.25, keep: true, t: 1.5 }, { x: 2, y: 0 }, { x: 0.1, y: 0.1, keep: false }, 'junk']),
    [{ x: 0.5, y: 0.25, keep: true, t: 1.5 }, { x: 0.1, y: 0.1, keep: false }])
  assert.equal(normalizePicks(Array.from({ length: 30 }, () => ({ x: 0.5, y: 0.5 }))).length, MAX_PICKS)
  assert.deepEqual(normalizeKeying({ mode: 'person', picks: [{ x: 0.3, y: 0.6 }] })?.picks, [{ x: 0.3, y: 0.6, keep: true }])
  assert.equal(normalizeKeying({ mode: 'person' })?.picks, undefined, 'no picks: none stored')
}

console.log('cutout tests passed')
