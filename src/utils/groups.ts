/**
 * Groups: members share `groupId`; the scene keeps each group's name and, for
 * smart groups, the block settings (Scene.groups). Pure helpers over a scene.
 */
import type { EditorElement, GroupPerspective, Scene } from '../types/editor'

export interface Box { x: number; y: number; width: number; height: number }

export function groupMembers(scene: Scene, groupId: string): EditorElement[] {
  return scene.elements.filter(el => el.groupId === groupId)
}

/** The ids plus every member of any group they belong to, first-seen order kept. */
export function expandToGroups(scene: Scene, ids: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const add = (id: string) => { if (!seen.has(id)) { seen.add(id); out.push(id) } }
  for (const id of ids) {
    const el = scene.elements.find(e => e.id === id)
    if (!el) continue
    if (el.groupId) groupMembers(scene, el.groupId).forEach(member => add(member.id))
    else add(id)
  }
  return out
}

/** Bounding box of elements (arrows by their end points). */
export function elementsBox(elements: EditorElement[]): Box {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const el of elements) {
    const [x1, y1, x2, y2] = el.type === 'arrow'
      ? [Math.min(el.x1, el.x2), Math.min(el.y1, el.y2), Math.max(el.x1, el.x2), Math.max(el.y1, el.y2)]
      : [el.x, el.y, el.x + (el.width ?? 0), el.y + (el.height ?? 0)]
    minX = Math.min(minX, x1); minY = Math.min(minY, y1); maxX = Math.max(maxX, x2); maxY = Math.max(maxY, y2)
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/** Moves elements by (dx, dy) in place. */
export function translateElements(elements: EditorElement[], dx: number, dy: number) {
  for (const el of elements) {
    el.x += dx
    el.y += dy
    if (el.type === 'arrow') { el.x1 += dx; el.y1 += dy; el.x2 += dx; el.y2 += dy }
  }
}

/**
 * Keeps groups tidy after edits: a group needs at least two members (a lone
 * member is released) and its record is dropped once it has none. Mutates.
 */
export function pruneGroups(scene: Scene) {
  const counts = new Map<string, number>()
  for (const el of scene.elements) if (el.groupId) counts.set(el.groupId, (counts.get(el.groupId) ?? 0) + 1)
  for (const el of scene.elements) {
    if (el.groupId && (counts.get(el.groupId) ?? 0) < 2 && !scene.groups?.[el.groupId]?.smart) el.groupId = undefined
  }
  if (!scene.groups) return
  for (const id of Object.keys(scene.groups)) {
    if (!scene.elements.some(el => el.groupId === id)) delete scene.groups[id]
  }
}

/** "Group 3": the next free number on the scene. */
export function nextGroupName(scene: Scene, base = 'Group') {
  const used = new Set(Object.values(scene.groups ?? {}).map(g => g.name))
  let n = Object.keys(scene.groups ?? {}).length + 1
  while (used.has(`${base} ${n}`)) n++
  return `${base} ${n}`
}

/** A group's perspective corners in px, relative to its bounding box's top-left. */
export function groupPerspectivePts(perspective: GroupPerspective, box: Box) {
  const at = ([u, v]: [number, number]): [number, number] => [u * box.width, v * box.height]
  const { tl, tr, br, bl } = perspective.pts
  return { tl: at(tl), tr: at(tr), br: at(br), bl: at(bl) }
}

/** The fractions stored on the group for px corners over `box`. */
export function toGroupPerspective(pts: { tl: [number, number]; tr: [number, number]; br: [number, number]; bl: [number, number] }, box: Box, controls?: GroupPerspective['controls']): GroupPerspective {
  const frac = ([x, y]: [number, number]): [number, number] => [x / Math.max(1, box.width), y / Math.max(1, box.height)]
  return { pts: { tl: frac(pts.tl), tr: frac(pts.tr), br: frac(pts.br), bl: frac(pts.bl) }, ...(controls ? { controls } : {}) }
}

/** Groups on a scene that are drawn in perspective, with their visible members in layer order. */
export function warpedGroups(scene: Scene): Map<string, EditorElement[]> {
  const out = new Map<string, EditorElement[]>()
  for (const group of Object.values(scene.groups ?? {})) {
    if (!group.perspective) continue
    const members = scene.elements.filter(el => el.groupId === group.id && el.visible && el.type !== 'audio').sort((a, b) => a.zIndex - b.zIndex)
    if (members.length) out.set(group.id, members)
  }
  return out
}

/** The group these ids are, when they are exactly one whole group of two or more items (else null). */
export function selectedWholeGroup(scene: Scene, ids: string[]): string | null {
  const first = scene.elements.find(el => el.id === ids[0])
  const groupId = first?.groupId
  if (!groupId || !scene.groups?.[groupId]) return null
  const members = scene.elements.filter(el => el.groupId === groupId && el.type !== 'audio').map(el => el.id)
  const chosen = new Set(ids)
  return members.length >= 2 && members.length === chosen.size && members.every(id => chosen.has(id)) ? groupId : null
}
