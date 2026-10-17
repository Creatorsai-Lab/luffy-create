// Media geometry: split screens tile the frame, one clip can be put in any
// area (cover crops to fill, contain shows it whole, stretch distorts), and
// nothing is distorted unless asked.
import assert from 'node:assert/strict'
import { coverCrop, fullAspect, layoutMedia, placeInRegion, type LayoutItem, type LayoutPatch } from '../src/utils/mediaLayout'

const LAND = { width: 1920, height: 1080 }
const PORT = { width: 1080, height: 1920 }
const wide = (id: string): LayoutItem => ({ id, width: 640, height: 360 })
const near = (a: number, b: number, label: string, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${label}: ${a} vs ${b}`)

/** What a patch shows must have the shape of the source, i.e. it is not stretched. */
function undistorted(item: LayoutItem, patch: LayoutPatch) {
  const crop = patch.crop ?? { x: 0, y: 0, w: 1, h: 1 }
  near((patch.width / crop.w) / (patch.height / crop.h), fullAspect(item), `${item.id} aspect`, 0.02)
  assert.ok(crop.x >= 0 && crop.y >= 0 && crop.x + crop.w <= 1.0001 && crop.y + crop.h <= 1.0001, `${item.id} crop inside source`)
}

{ // side by side in landscape: two half-width tiles, centre-cropped
  const items = [wide('a'), wide('b')]
  const out = layoutMedia(items, LAND, 'sideBySide')
  assert.deepEqual(out.map(p => [p.x, p.y, p.width, p.height]), [[0, 0, 960, 1080], [960, 0, 960, 1080]])
  near(out[0].crop!.w, 0.5, 'crop width')
  near(out[0].crop!.x, 0.25, 'crop centred')
  out.forEach((p, i) => undistorted(items[i], p))
}

{ // "split" means stacked in portrait, side by side in landscape; gaps are honoured
  const items = [wide('a'), wide('b')]
  const port = layoutMedia(items, PORT, 'split', { gap: 20 })
  assert.deepEqual(port.map(p => [p.x, p.y, p.width, p.height]), [[0, 0, 1080, 950], [0, 970, 1080, 950]])
  port.forEach((p, i) => undistorted(items[i], p))
  assert.equal(layoutMedia(items, LAND, 'split')[1].x, 960)
}

{ // grid: a short last row is centred
  const items = [wide('a'), wide('b'), wide('c')]
  const out = layoutMedia(items, LAND, 'grid')
  assert.deepEqual(out.map(p => [p.x, p.y]), [[0, 0], [960, 0], [480, 540]])
  out.forEach((p, i) => undistorted(items[i], p))
}

{ // the upper half of a 1080×1920 frame: the box is 1080×960 and the 16:9 clip is cropped to it
  const clip = wide('v')
  const p = placeInRegion(clip, { region: { x: 0, y: 0, width: 1080, height: 960 } })
  assert.deepEqual([p.x, p.y, p.width, p.height], [0, 0, 1080, 960])
  near(p.crop!.w, (1080 / 960) / (16 / 9), 'crop keeps the centre strip')
  undistorted(clip, p)
  // contain: the whole clip, as large as fits, centred in the half
  const c = placeInRegion(clip, { region: { x: 0, y: 0, width: 1080, height: 960 }, fit: 'contain' })
  assert.deepEqual([c.x, c.width, c.crop], [0, 1080, undefined])
  near(c.height, 607.5, 'contained height')
  near(c.y, (960 - 607.5) / 2, 'centred')
  // stretch: exactly the box, crop left as it was
  const s = placeInRegion({ ...clip, crop: { x: 0.1, y: 0, w: 0.8, h: 1 } }, { region: { x: 0, y: 0, width: 1080, height: 960 }, fit: 'stretch' })
  assert.deepEqual([s.width, s.height, s.crop], [1080, 960, { x: 0.1, y: 0, w: 0.8, h: 1 }])
}

{ // bottom right at 400×300, inside a 32 px margin; with only a width the height follows the clip
  const region = { x: 32, y: 32, width: 1856, height: 1016 }
  const exact = placeInRegion(wide('v'), { region, width: 400, height: 300, horizontal: 'right', vertical: 'bottom' })
  assert.deepEqual([exact.x, exact.y, exact.width, exact.height], [1488, 748, 400, 300])
  undistorted(wide('v'), exact)
  const byWidth = placeInRegion({ ...wide('v'), crop: { x: 0.25, y: 0, w: 0.5, h: 1 }, width: 320, height: 360 }, { region, width: 480, horizontal: 'right', vertical: 'bottom' })
  assert.deepEqual([byWidth.width, byWidth.height, byWidth.crop], [480, 270, undefined]) // the whole 16:9 picture again
  // a known source shape (a loaded video) wins over the element's box
  const portraitClip = placeInRegion({ id: 'p', width: 640, height: 360, aspect: 9 / 16 }, { region, height: 640, horizontal: 'left', vertical: 'top' })
  assert.deepEqual([portraitClip.x, portraitClip.y, portraitClip.width, portraitClip.height], [32, 32, 360, 640])
}

{ // cover re-crops around what was shown before
  const item = { id: 'x', width: 400, height: 400, crop: { x: 0.25, y: 0, w: 0.5, h: 1 } } // a 2:1 source shown square
  const p = placeInRegion(item, { region: { x: 0, y: 0, ...LAND } })
  near(p.crop!.w, (1920 / 1080) / 2, 'crop width')
  near(p.crop!.x + p.crop!.w / 2, 0.5, 'same centre')
  undistorted(item, p)
  assert.equal(coverCrop(wide('w'), 16 / 9), undefined)
}

console.log('media layout tests passed')
