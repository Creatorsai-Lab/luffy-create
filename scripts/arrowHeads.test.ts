// Arrow head geometry: heads point along the line at each end, and the line
// stops short under a head so it never shows through a ring or past a flat end.
import assert from 'node:assert/strict'
import { ARROW_HEAD_STYLES, headAngle, headInset, trimPolyline } from '../src/engine/arrowHeads'

const near = (a: number, b: number, label: string) => assert.ok(Math.abs(a - b) < 1e-6, `${label}: ${a} vs ${b}`)

// Direction at the ends: along the last segment (end) / first segment, backwards (start).
near(headAngle([0, 0, 100, 0], true), 0, 'end of a line going right')
near(headAngle([0, 0, 100, 0], false), Math.PI, 'start of it points left')
near(headAngle([0, 0, 0, 50, 80, 50], true), 0, 'a bent line arrives horizontally')
near(headAngle([0, 0, 0, 50, 80, 50, 80.2, 50], true), 0, 'a tiny last step is skipped')
near(headAngle([10, 10, 10, 60], true), Math.PI / 2, 'downwards')

// Trimming walks back along the polyline, across corners.
assert.deepEqual(trimPolyline([0, 0, 100, 0], 0, 30), [0, 0, 70, 0])
assert.deepEqual(trimPolyline([0, 0, 100, 0], 25, 0), [25, 0, 100, 0])
assert.deepEqual(trimPolyline([0, 0, 0, 50, 20, 50], 0, 30), [0, 0, 0, 40])
assert.deepEqual(trimPolyline([0, 0, 100, 0], 0, 0), [0, 0, 100, 0])

// Insets: a ring's line stops at its edge (its full width back); a bar needs none.
assert.equal(headInset('ring', 12, 10, 2), 10)
assert.equal(headInset('circle', 12, 10, 2), 5)
assert.equal(headInset('bar', 12, 10, 2), 0)
assert.deepEqual(ARROW_HEAD_STYLES, ['triangle', 'open', 'circle', 'ring', 'diamond', 'square', 'bar'])

console.log('arrow head tests passed')
