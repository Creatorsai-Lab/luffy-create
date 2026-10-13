// The perspective warp must be a true homography: box corners land exactly on
// the quad corners, and the box centre lands where the quad's diagonals cross
// (a bilinear blend would put it elsewhere and bend content).
import assert from 'node:assert/strict'
import { perspectiveHomography, projectPoint, type PerspectivePts } from '../src/engine/perspectiveUtils'

const near = (a: number[] | null, b: number[]) =>
  assert.ok(a && Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6, `${a} vs ${b}`)

const w = 400, h = 200
const pts: PerspectivePts = { tl: [100, 50], tr: [400, 0], br: [400, 200], bl: [100, 150] }
const H = perspectiveHomography(pts, w, h)
assert.ok(H)
near(projectPoint(H, 0, 0), pts.tl)
near(projectPoint(H, w, 0), pts.tr)
near(projectPoint(H, w, h), pts.br)
near(projectPoint(H, 0, h), pts.bl)
near(projectPoint(H, w / 2, h / 2), [200, 100])   // diagonals of this quad cross at (200, 100)

const identity = perspectiveHomography({ tl: [0, 0], tr: [w, 0], br: [w, h], bl: [0, h] }, w, h)!
near(projectPoint(identity, 123, 45), [123, 45])

assert.equal(perspectiveHomography({ tl: [0, 0], tr: [0, 0], br: [0, 0], bl: [0, 0] }, w, h), null)

console.log('perspective tests passed')
