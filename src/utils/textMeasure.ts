/**
 * The real size of a text element: its content wrapped to the box width, as
 * the canvas draws it (TextKonva). A text's stored height can be stale —
 * typing more lines doesn't resize the box — so the store keeps it in sync,
 * and perspective and rotation use it.
 *
 * The measuring itself needs Konva (a canvas), which the store and its Node
 * tests can't load, so the canvas code registers it (see TextKonva); without
 * it nothing is measured and stored heights are used as they are.
 */
import type { TextElement } from '../types/editor'

export type MeasuredText = Pick<TextElement, 'content' | 'width' | 'fontSize' | 'fontFamily' | 'fontWeight' | 'italic' | 'lineHeight' | 'letterSpacing'>

let measurer: ((el: MeasuredText) => number) | null = null

export function setTextMeasurer(fn: (el: MeasuredText) => number) {
  measurer = fn
}

/** The wrapped content's height in pixels, or null when it can't be measured here. */
export function measureTextHeight(el: MeasuredText): number | null {
  if (!measurer) return null
  const h = measurer(el)
  return Number.isFinite(h) && h > 0 ? h : null
}

/** A text's height for layout: the measured content height when known, else the stored one. */
export function textBoxHeight(el: MeasuredText & { height: number }): number {
  return measureTextHeight(el) ?? el.height
}

/** Fields whose change can re-wrap a text onto more or fewer lines. */
export const TEXT_LAYOUT_KEYS = ['content', 'width', 'fontSize', 'fontFamily', 'fontWeight', 'italic', 'lineHeight', 'letterSpacing'] as const

/** Perspective corners stretched vertically when a box's height changes, so the quad keeps covering it. */
export function scalePtsY<T extends { tl: [number, number]; tr: [number, number]; br: [number, number]; bl: [number, number] }>(pts: T, k: number): T {
  return { ...pts, tl: [pts.tl[0], pts.tl[1] * k], tr: [pts.tr[0], pts.tr[1] * k], br: [pts.br[0], pts.br[1] * k], bl: [pts.bl[0], pts.bl[1] * k] }
}
