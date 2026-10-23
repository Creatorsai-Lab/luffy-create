// Morph transition (PowerPoint Morph / Keynote Magic Move).
//
// Works on elements, not pixels: elements that exist in both scenes are matched
// and their geometry/colors interpolated, so a shape moved between two scenes
// travels to its new place. Unmatched elements fade out (old) or in (new).
// The result is an ordinary Scene, rendered by the same pipeline as any scene.

import type { ArrowElement, Background, EditorElement, Project, Scene } from '../types/editor'
import { getAnimatedProps } from './animator'
import { get3DRotation, is3DShape } from './shape3d'
import { easeInOutCubic } from './transitionRenderer'
import { buildTransitionTimeline, getEffectiveTransitionDuration, getTransitionFrameState } from '../utils/transitionTiming'
import { parseHex } from '../utils/color'

const NUMERIC_KEYS = [
  'x', 'y', 'width', 'height', 'opacity', 'rotateX', 'rotateY', 'rotateZ', 'depth3d',
  'x1', 'y1', 'x2', 'y2', 'curve',
  'fontSize', 'letterSpacing', 'lineHeight', 'stretchX', 'stretchY',
  'cornerRadius', 'strokeWidth', 'borderWidth', 'textStrokeWidth',
  'shadowBlur', 'shadowOffsetX', 'shadowOffsetY', 'pointerLength', 'pointerWidth', 'depth',
] as const

const COLOR_KEYS = [
  'fill', 'stroke', 'color', 'borderColor', 'arrowHeadColor', 'bgColor', 'faceColor',
  'gradientFrom', 'gradientTo', 'gradientColor1', 'gradientColor2', 'textStroke', 'shadowColor',
] as const

const GEOMETRY_KEYS = ['x', 'y', 'width', 'height', 'rotation', 'x1', 'y1', 'x2', 'y2'] as const

type Bag = Record<string, unknown>

/** What makes two same-type elements "the same thing" when they have no shared lineage. */
function contentSignature(el: EditorElement): string | null {
  switch (el.type) {
    case 'text':    return el.content
    case 'shape':   return el.shapeType
    case 'image':
    case 'video':   return el.src
    case 'icon':    return el.iconName
    case 'code':    return el.code
    case 'latex':   return el.latex
    case 'chart':   return el.chartType
    case 'table':   return `${el.rows}x${el.cols}`
    case 'arrow':   return 'arrow'
    case 'counter': return el.mode
    default:        return null
  }
}

/** Pairs to-scene elements with from-scene elements: shared lineage first, then same content. */
function matchElements(from: EditorElement[], to: EditorElement[]): Map<string, EditorElement> {
  const matches = new Map<string, EditorElement>()   // to.id -> from element
  const used = new Set<string>()
  const lineage = (el: EditorElement) => el.morphKey ?? el.id

  for (const t of to) {
    const f = from.find(c => !used.has(c.id) && c.type === t.type && lineage(c) === lineage(t))
    if (f) { matches.set(t.id, f); used.add(f.id) }
  }
  for (const t of to) {
    if (matches.has(t.id)) continue
    const sig = contentSignature(t)
    if (sig == null) continue
    const f = from.find(c => !used.has(c.id) && c.type === t.type && contentSignature(c) === sig)
    if (f) { matches.set(t.id, f); used.add(f.id) }
  }
  return matches
}

/** The element as it actually looks at `time` (animations applied), with animations removed. */
function bake(el: EditorElement, time: number): EditorElement {
  const a = getAnimatedProps(el, time)
  const baked = { ...el, x: a.x, y: a.y, opacity: a.opacity, rotation: a.rotation, animations: [] } as EditorElement
  if (baked.type === 'arrow') {
    const dx = a.x - el.x, dy = a.y - el.y
    const src = el as ArrowElement
    Object.assign(baked, { x1: src.x1 + dx, y1: src.y1 + dy, x2: src.x2 + dx, y2: src.y2 + dy })
  }
  if (baked.type === 'shape' && is3DShape(baked)) {
    // Fill in default rotations so an untouched solid still turns into a rotated copy.
    const r = get3DRotation(baked)
    Object.assign(baked, { rotateX: r.x, rotateY: r.y, rotateZ: r.z })
  }
  return baked
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

function lerpAngle(a: number, b: number, t: number) {
  const delta = ((((b - a) % 360) + 540) % 360) - 180   // shortest way round
  return a + delta * t
}

function lerpColor(a: string, b: string, t: number): string {
  const ca = parseHex(a), cb = parseHex(b)
  if (!ca || !cb) return t < 0.5 ? a : b
  return '#' + ca.map((v, i) => Math.round(lerp(v, cb[i], t)).toString(16).padStart(2, '0')).join('')
}

/** `to` with every interpolatable property blended from `from`. */
function interpolate(from: EditorElement, to: EditorElement, t: number): EditorElement {
  const f = from as unknown as Bag, out = { ...to } as unknown as Bag
  for (const key of NUMERIC_KEYS) {
    if (typeof f[key] === 'number' && typeof out[key] === 'number') out[key] = lerp(f[key] as number, out[key] as number, t)
  }
  for (const key of COLOR_KEYS) {
    if (typeof f[key] === 'string' && typeof out[key] === 'string') out[key] = lerpColor(f[key] as string, out[key] as string, t)
  }
  out.rotation = lerpAngle(from.rotation, to.rotation, t)
  return out as unknown as EditorElement
}

function withGeometryOf(el: EditorElement, geometry: EditorElement, opacity: number): EditorElement {
  const out = { ...el } as unknown as Bag
  const g = geometry as unknown as Bag
  for (const key of GEOMETRY_KEYS) if (key in out && typeof g[key] === 'number') out[key] = g[key]
  out.opacity = opacity
  return out as unknown as EditorElement
}

function blendBackground(from: Background, to: Background, t: number): Background {
  if (from.type === 'solid' && to.type === 'solid') return { type: 'solid', color: lerpColor(from.color, to.color, t) }
  return t < 0.5 ? from : to
}

/**
 * The in-between scene at `progress` (0..1, eased by the caller).
 * `fromTime` is the outgoing scene's local time (its held last frame);
 * `toTime` is the incoming scene's local time when the morph ends.
 */
export function getMorphScene(from: Scene, to: Scene, progress: number, fromTime: number, toTime: number): Scene {
  const p = Math.max(0, Math.min(1, progress))
  const fromEls = from.elements.filter(e => e.type !== 'audio' && e.visible)
  const toEls = [...to.elements].sort((a, b) => a.zIndex - b.zIndex)
  const matches = matchElements(fromEls, toEls.filter(e => e.type !== 'audio'))
  const matchedFrom = new Set([...matches.values()].map(e => e.id))

  // Old-only elements sit underneath and fade out. A video among them carries on
  // from where the outgoing scene ended (the morph scene runs on the incoming
  // scene's clock, which would otherwise restart it).
  const out: EditorElement[] = fromEls
    .filter(e => !matchedFrom.has(e.id))
    .sort((a, b) => a.zIndex - b.zIndex)
    .map(e => {
      const b = bake(e, fromTime)
      if (b.type === 'video') {
        const played = Math.max(0, from.duration - (b.timelineX ?? 0)) * (b.playbackRate || 1)
        return { ...b, opacity: b.opacity * (1 - p), timelineX: 0, startTime: (b.startTime ?? 0) + played, duration: Math.max(0.1, to.duration) } as EditorElement
      }
      return { ...b, opacity: b.opacity * (1 - p) } as EditorElement
    })

  for (const el of toEls) {
    if (el.type === 'audio' || !el.visible) { out.push({ ...el }); continue }
    const target = bake(el, toTime)
    const source = matches.get(el.id)
    if (!source) { out.push({ ...target, opacity: target.opacity * p } as EditorElement); continue }

    const start = bake(source, fromTime)
    const morphed = interpolate(start, target, p)
    if (contentSignature(source) === contentSignature(el)) {
      out.push(morphed)
    } else {
      // Same object, different content (e.g. edited text): cross-dissolve the
      // two versions inside the moving box.
      out.push(withGeometryOf(start, morphed, start.opacity * (1 - p)))
      out.push(withGeometryOf(target, morphed, target.opacity * p))
    }
  }

  out.forEach((el, i) => { el.zIndex = i })
  return { ...to, background: blendBackground(from.background, to.background, p), elements: out }
}

/** The morph frame at global `time`, or null when no morph transition is running. */
export function getMorphFrame(project: Project, time: number): { scene: Scene; localTime: number } | null {
  if (project.scenes.length < 2) return null
  const timeline = buildTransitionTimeline(project.scenes)
  const state = getTransitionFrameState(timeline, time)
  if (state.kind !== 'transition' || state.transition.type !== 'morph') return null

  if (state.phase !== 'cut') return null
  const fromEntry = timeline[state.fromSceneIndex]
  const toEntry = timeline[state.toSceneIndex]
  const from = project.scenes[state.fromSceneIndex]
  const to = project.scenes[state.toSceneIndex]
  return {
    scene: getMorphScene(
      from, to, easeInOutCubic(state.progress),
      // Elements are morphed from how the outgoing scene looked as it ended.
      Math.min(state.fromLocalTime, fromEntry.duration),
      getEffectiveTransitionDuration(toEntry),
    ),
    localTime: state.toLocalTime,
  }
}
