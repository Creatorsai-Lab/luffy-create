/**
 * Connectors: an arrow end can be attached to an element so it follows it.
 * Attached ends are recomputed in the store whenever an element moves or
 * resizes (`syncConnectors`), so rendering, export and undo just read x1…y2.
 */
import type { ArrowElement, ConnectorAnchor, EditorElement } from '../types/editor'
import { makeArrow } from './defaults'
import { rowTolerance, staggerGroups } from './stagger'

interface Box { x: number; y: number; width: number; height: number }
interface Point { x: number; y: number }

const center = (b: Box): Point => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })

/**
 * Where an attached end sits on an element. 'auto' picks the side facing
 * `toward` (the other end), so a left-to-right link leaves from the right edge
 * and arrives at the left edge — on a circle these midpoints lie on the circle.
 */
export function anchorPoint(box: Box, anchor: ConnectorAnchor = 'auto', toward?: Point): Point {
  const c = center(box)
  let side = anchor
  if (anchor === 'auto') {
    if (!toward) return c
    const dx = (toward.x - c.x) / Math.max(1, box.width)
    const dy = (toward.y - c.y) / Math.max(1, box.height)
    side = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'bottom' : 'top')
  }
  switch (side) {
    case 'top': return { x: c.x, y: box.y }
    case 'bottom': return { x: c.x, y: box.y + box.height }
    case 'left': return { x: box.x, y: c.y }
    case 'right': return { x: box.x + box.width, y: c.y }
    default: return c
  }
}

/** True when the arrow has an end attached to `elementId`. */
export function isAttachedTo(arrow: EditorElement, elementId: string) {
  return arrow.type === 'arrow' && (arrow.startAttach?.elementId === elementId || arrow.endAttach?.elementId === elementId)
}

/**
 * Recomputes attached arrow ends from the elements they are attached to. Ends
 * whose element is gone are released (the arrow keeps its last position).
 * Only arrows touching `changedIds` are updated when given. Mutates in place.
 */
export function syncConnectors(elements: EditorElement[], changedIds?: Set<string>) {
  const byId = new Map(elements.map(el => [el.id, el]))
  for (const el of elements) {
    if (el.type !== 'arrow' || (!el.startAttach && !el.endAttach)) continue
    if (changedIds && !changedIds.has(el.id) &&
      !(el.startAttach && changedIds.has(el.startAttach.elementId)) &&
      !(el.endAttach && changedIds.has(el.endAttach.elementId))) continue
    syncArrow(el, byId)
  }
}

function syncArrow(arrow: ArrowElement, byId: Map<string, EditorElement>) {
  const target = (id?: string) => {
    const el = id ? byId.get(id) : undefined
    return el && el.type !== 'arrow' && el.type !== 'audio' ? el : undefined
  }
  const from = target(arrow.startAttach?.elementId)
  const to = target(arrow.endAttach?.elementId)
  if (arrow.startAttach && !from) arrow.startAttach = undefined
  if (arrow.endAttach && !to) arrow.endAttach = undefined

  // Each end faces the other end: the other element's centre, or the free point.
  const otherForStart = to ? center(to) : { x: arrow.x2, y: arrow.y2 }
  const otherForEnd = from ? center(from) : { x: arrow.x1, y: arrow.y1 }
  if (from && arrow.startAttach) {
    const p = anchorPoint(from, arrow.startAttach.anchor, otherForStart)
    arrow.x1 = round(p.x); arrow.y1 = round(p.y)
  }
  if (to && arrow.endAttach) {
    const p = anchorPoint(to, arrow.endAttach.anchor, otherForEnd)
    arrow.x2 = round(p.x); arrow.y2 = round(p.y)
  }
  // Keep the arrow's box in step with its ends.
  arrow.x = Math.min(arrow.x1, arrow.x2)
  arrow.y = Math.min(arrow.y1, arrow.y2)
  arrow.width = Math.abs(arrow.x2 - arrow.x1) || 1
  arrow.height = Math.abs(arrow.y2 - arrow.y1) || 1
}

export type ConnectMode = 'chain' | 'columns' | 'hub'

/**
 * Which items to link: `chain` = each to the next (in the given order),
 * `columns` = every item to every item in the next column (a dense network
 * layer), `hub` = the first item to every other.
 */
export function connectionPairs(items: Array<Box & { id: string }>, mode: ConnectMode): Array<[string, string]> {
  if (items.length < 2) return []
  if (mode === 'hub') return items.slice(1).map(item => [items[0].id, item.id])
  if (mode === 'chain') return items.slice(1).map((item, i) => [items[i].id, item.id])
  const columns = staggerGroups(items, { order: 'leftToRight', step: 0, together: rowTolerance(items) })
  const pairs: Array<[string, string]> = []
  for (let c = 0; c + 1 < columns.length; c++) {
    for (const from of columns[c]) for (const to of columns[c + 1]) pairs.push([from.id, to.id])
  }
  return pairs
}

/** A new arrow attached from one element to another, already in place. */
export function makeConnector(from: EditorElement, to: EditorElement, style: Partial<ArrowElement> = {}): ArrowElement {
  const arrow = makeArrow(0, 0, 1, 1)
  Object.assign(arrow, { name: 'Connector' }, style, {
    startAttach: { elementId: from.id, anchor: style.startAttach?.anchor ?? 'auto' },
    endAttach: { elementId: to.id, anchor: style.endAttach?.anchor ?? 'auto' },
  })
  syncConnectors([from, to, arrow])
  return arrow
}

/**
 * After elements were copied with new ids (scene duplicate/split), point the
 * copied arrows at the copied elements.
 */
export function remapConnectors(elements: EditorElement[], idMap: Map<string, string>) {
  for (const el of elements) {
    if (el.type !== 'arrow') continue
    if (el.startAttach && idMap.has(el.startAttach.elementId)) el.startAttach = { ...el.startAttach, elementId: idMap.get(el.startAttach.elementId)! }
    if (el.endAttach && idMap.has(el.endAttach.elementId)) el.endAttach = { ...el.endAttach, elementId: idMap.get(el.endAttach.elementId)! }
  }
  syncConnectors(elements)
}

/**
 * Copies of elements with new ids, offset by `offset`. Arrows copied together
 * with the items they attach to are attached to the copies; ends whose item
 * was not copied are released so the copy stays where it was put.
 */
export function copyElements(
  elements: EditorElement[],
  offset = 0,
  newId: () => string = () => crypto.randomUUID(),
  /** Filled with old group id → new group id, so copied groups become new groups. */
  groupIds = new Map<string, string>(),
): EditorElement[] {
  const ids = new Map<string, string>()
  const copies = elements.map(el => {
    const copy = JSON.parse(JSON.stringify(el)) as EditorElement
    copy.id = newId()
    ids.set(el.id, copy.id)
    if (copy.groupId) {
      if (!groupIds.has(copy.groupId)) groupIds.set(copy.groupId, newId())
      copy.groupId = groupIds.get(copy.groupId)
    }
    copy.x += offset
    copy.y += offset
    if (copy.type === 'arrow') {
      copy.x1 += offset; copy.y1 += offset; copy.x2 += offset; copy.y2 += offset
    }
    return copy
  })
  for (const copy of copies) {
    if (copy.type !== 'arrow') continue
    copy.startAttach = copy.startAttach && ids.has(copy.startAttach.elementId) ? { ...copy.startAttach, elementId: ids.get(copy.startAttach.elementId)! } : undefined
    copy.endAttach = copy.endAttach && ids.has(copy.endAttach.elementId) ? { ...copy.endAttach, elementId: ids.get(copy.endAttach.elementId)! } : undefined
  }
  return copies
}

function round(n: number) {
  return Math.round(n * 100) / 100
}
