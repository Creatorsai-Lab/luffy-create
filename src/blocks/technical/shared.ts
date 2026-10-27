/** Builders shared by the technical blocks (network, flowchart, equation, code). */
import type { ArrowElement, EditorElement, ElementAnimation, LatexElement, ShapeElement, ShapeType } from '../../types/editor'
import { syncConnectors } from '../../utils/connectors'
import { makeAnimation, makeArrow, makeLatex, makeShape } from '../../utils/defaults'

export function shape(key: string, type: ShapeType, opts: { x: number; y: number; width: number; height: number; fill: string; stroke?: string; strokeWidth?: number; radius?: number; opacity?: number }): ShapeElement {
  return Object.assign(makeShape(type, opts.x, opts.y), {
    name: key, blockKey: key,
    width: opts.width, height: opts.height, fill: opts.fill,
    stroke: opts.stroke ?? 'transparent', strokeWidth: opts.strokeWidth ?? 0,
    cornerRadius: opts.radius ?? 0, opacity: opts.opacity ?? 1,
  })
}

/** An arrow whose ends stay attached to two built parts (it follows them when they move). */
export function connector(key: string, from: EditorElement, to: EditorElement, style: { stroke: string; width: number; head?: boolean; opacity?: number; dashed?: boolean }): ArrowElement {
  return Object.assign(makeArrow(0, 0, 1, 1), {
    name: key, blockKey: key,
    stroke: style.stroke, arrowHeadColor: style.stroke, strokeWidth: style.width,
    arrowHead: style.head ? 'end' : 'none',
    pointerLength: Math.max(6, style.width * 3.2), pointerWidth: Math.max(6, style.width * 3.2),
    dashed: Boolean(style.dashed), opacity: style.opacity ?? 1,
    startAttach: { elementId: from.id, anchor: 'auto' as const },
    endAttach: { elementId: to.id, anchor: 'auto' as const },
  })
}

/** Places every connector between its parts (call once the parts are positioned). */
export function placeConnectors(elements: EditorElement[]) {
  syncConnectors(elements)
}

export function latex(key: string, source: string, opts: { x: number; y: number; width: number; height: number; color: string; fontSize: number; align?: 'left' | 'center' }): LatexElement {
  return Object.assign(makeLatex(opts.x, opts.y, source, opts.width, opts.height), {
    name: key, blockKey: key, color: opts.color, fontSize: opts.fontSize,
    fitContent: true, contentAlign: opts.align ?? 'center',
  })
}

/**
 * A colour pulse that runs through `slots` in order (slot 0 first), each slot
 * `step` seconds after the last — a forward pass through a network, a token
 * moving along a pipeline. Same animation model as Group Effects waves: one
 * pulse each, repeating every `period` seconds when given.
 */
export function pulseWave(slots: EditorElement[][], opts: { start: number; step: number; color: string; duration: number; period?: number }): Array<{ element: EditorElement; animation: ElementAnimation }> {
  const out: Array<{ element: EditorElement; animation: ElementAnimation }> = []
  slots.forEach((slot, i) => {
    for (const element of slot) {
      out.push({
        element,
        animation: {
          ...makeAnimation(),
          type: 'colorPulse', timing: 'loop', easing: 'linear',
          duration: opts.duration, delay: round(opts.start + i * opts.step),
          params: { pulseColor: opts.color, pulseCount: 1 },
          ...(opts.period ? { repeatEvery: round(opts.period) } : {}),
        },
      })
    }
  })
  return out
}

export function round(value: number) {
  return Math.round(value * 1000) / 1000
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
