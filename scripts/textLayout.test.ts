// Text layout: rotating about the centre, and a text's box following its wrapped
// content (so perspective covers every line).
import assert from 'node:assert/strict'
import { boxCenter, normalizeRotation, rotateAboutCenter } from '../src/utils/rotateAboutCenter'
import { measureTextHeight, scalePtsY, setTextMeasurer } from '../src/utils/textMeasure'
import { useEditorStore } from '../src/store/editorStore'
import { makeProject, makeScene, makeText } from '../src/utils/defaults'
import type { TextElement } from '../src/types/editor'

;(globalThis as { window?: unknown }).window ??= { api: {} }
const near = (a: number, b: number, label: string) => assert.ok(Math.abs(a - b) < 1e-6, `${label}: ${a} vs ${b}`)

// ── Rotation about the centre ───────────────────────────────────────────────
{
  const box = { x: 100, y: 50, width: 400, height: 120, rotation: 0 }
  const [cx, cy] = boxCenter(box)
  near(cx, 300, 'centre x'); near(cy, 110, 'centre y')
  for (const deg of [90, -45, 180, 30]) {
    const turned = rotateAboutCenter(box, deg)
    const [tx, ty] = boxCenter({ ...box, ...turned })
    near(tx, cx, `centre kept at ${deg}°`); near(ty, cy, `centre kept at ${deg}°`)
  }
  // Turning again from a rotated box keeps the same centre.
  const once = { ...box, ...rotateAboutCenter(box, 60) }
  const twice = { ...box, ...rotateAboutCenter(once, 150) }
  near(boxCenter(twice)[0], cx, 'chained'); near(boxCenter(twice)[1], cy, 'chained')
  assert.equal(normalizeRotation(270), -90)
  assert.equal(normalizeRotation(-190), 170)
  assert.equal(rotateAboutCenter(box, 360).rotation, 0)
}

// ── Perspective corners stretched with the box ──────────────────────────────
{
  const pts = { tl: [5, 0] as [number, number], tr: [95, 10] as [number, number], br: [100, 60] as [number, number], bl: [0, 60] as [number, number] }
  assert.deepEqual(scalePtsY(pts, 3), { tl: [5, 0], tr: [95, 30], br: [100, 180], bl: [0, 180] })
}

// ── The store keeps a text's height = its wrapped content ───────────────────
{
  assert.equal(measureTextHeight({ content: 'x', width: 100, fontSize: 20, fontFamily: 'Inter', fontWeight: 'normal', italic: false, lineHeight: 1.2, letterSpacing: 0 }), null, 'no measurer: nothing measured')
  // A stand-in for the canvas: one line per 10 characters.
  setTextMeasurer(el => Math.max(1, Math.ceil(el.content.length / 10)) * el.fontSize * el.lineHeight)
  const project = makeProject('t', 'T')
  const scene = makeScene(1)
  const text = Object.assign(makeText(0, 0), { content: 'one line', fontSize: 50, lineHeight: 1, height: 50 }) as TextElement
  text.perspectivePts = { tl: [0, 0], tr: [600, 10], br: [600, 50], bl: [0, 40] }
  scene.elements = [text]
  project.scenes = [scene]
  useEditorStore.setState({ project, currentSceneId: scene.id })
  const get = () => useEditorStore.getState().project!.scenes[0].elements[0] as TextElement

  useEditorStore.getState().updateElement(text.id, { content: 'a much longer text that wraps over four lines' })
  assert.equal(get().height, 250, 'five lines tall now')
  assert.deepEqual(get().perspectivePts, { tl: [0, 0], tr: [600, 50], br: [600, 250], bl: [0, 200] }, 'the quad covers every line')
  useEditorStore.getState().updateElement(text.id, { x: 40 })
  assert.equal(get().height, 250, 'moving does not re-measure')
  useEditorStore.getState().updateElement(text.id, { content: 'short', height: 80 })
  assert.equal(get().height, 80, 'an explicit height wins')
}

console.log('text layout tests passed')
