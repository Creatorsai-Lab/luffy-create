// Groups (select, merge, ungroup, lock, copy, prune) and smart blocks
// (insert, rebuild in place keeping ids and position, detach).
import assert from 'node:assert/strict'
import { registerBlock } from '../src/blocks/registry'
import { useEditorStore } from '../src/store/editorStore'
import type { ArrowElement, EditorElement } from '../src/types/editor'
import { makeConnector } from '../src/utils/connectors'
import { makeProject, makeScene, makeShape } from '../src/utils/defaults'

const st = () => useEditorStore.getState()
const scene = (i = 0) => st().project!.scenes[i]
const el = (id: string, i = 0) => scene(i).elements.find(e => e.id === id)

function setup() {
  const p = makeProject('p', 'groups')
  const s1 = makeScene(1)
  const shapes = [0, 1, 2, 3].map(i => Object.assign(makeShape('circle', 100 + i * 200, 100), { width: 100, height: 100 }))
  s1.elements = shapes
  p.scenes = [s1, makeScene(2)]
  st().loadProject(p)
  return shapes.map(s => s.id)
}

{ // grouping: a name, selection of all members, click selects the group
  const [a, b, c] = setup()
  const groupId = st().groupElements([a, b])!
  assert.equal(el(a)!.groupId, groupId)
  assert.equal(scene().groups![groupId].name, 'Group 1')
  assert.deepEqual(st().selectedIds, [a, b])

  st().selectElement(c, false)
  st().selectElement(a, false)
  assert.deepEqual(st().selectedIds, [a, b], 'clicking a member selects the whole group')
  st().selectElement(a, false, { member: true })
  assert.deepEqual(st().selectedIds, [a], 'Alt-click selects one member')
  st().selectElement(c, false)
  st().selectElement(b, true)
  assert.deepEqual([...st().selectedIds].sort(), [a, b, c].sort(), 'Shift-click adds the whole group')
  st().selectElement(a, true)
  assert.deepEqual(st().selectedIds, [c], 'and removes it again')
}

{ // grouping a group with more items merges them into one new group
  const [a, b, c] = setup()
  const first = st().groupElements([a, b])!
  const merged = st().groupElements([a, c], 'Layer 1')!
  assert.notEqual(merged, first)
  assert.deepEqual([a, b, c].map(id => el(id)!.groupId), [merged, merged, merged])
  assert.equal(scene().groups![first], undefined, 'the old group record is gone')
  assert.equal(scene().groups![merged].name, 'Layer 1')
}

{ // ungroup
  const [a, b] = setup()
  const groupId = st().groupElements([a, b])!
  st().ungroupElements([b])
  assert.equal(el(a)!.groupId, undefined)
  assert.equal(scene().groups?.[groupId], undefined)
}

{ // locking a member locks the group and drops it from the selection
  const [a, b, c] = setup()
  st().groupElements([a, b])
  st().selectElement(c, true)
  st().setLocked([a], true)
  assert.ok(el(a)!.locked && el(b)!.locked && !el(c)!.locked)
  assert.deepEqual(st().selectedIds, [c])
  st().setLocked([b], false)
  assert.ok(!el(a)!.locked && !el(b)!.locked)
}

{ // copies of a group form a new group, wired to each other
  const [a, b] = setup()
  st().addElements([makeConnector(el(a)!, el(b)!)])
  const arrow = scene().elements.find(e => e.type === 'arrow')!
  const groupId = st().groupElements([a, b, arrow.id])!
  st().insertCopies([el(a)!, el(b)!, el(arrow.id)!], { offset: 20 })
  const copies = st().selectedIds.map(id => el(id)!)
  const copyGroup = copies[0].groupId!
  assert.notEqual(copyGroup, groupId)
  assert.ok(copies.every(c => c.groupId === copyGroup))
  assert.equal(scene().groups![copyGroup].name, 'Group 1 copy')
  const copyArrow = copies.find(c => c.type === 'arrow') as ArrowElement
  assert.equal(copyArrow.startAttach?.elementId, copies[0].id)
}

{ // deleting members down to one releases the group
  const [a, b, c] = setup()
  const groupId = st().groupElements([a, b, c])!
  st().removeElement(b)
  assert.equal(el(a)!.groupId, groupId, 'two members left: still a group')
  st().removeElement(c)
  assert.equal(el(a)!.groupId, undefined)
  assert.equal(scene().groups?.[groupId], undefined)
}

{ // a duplicated scene keeps its groups
  const [a, b] = setup()
  const groupId = st().groupElements([a, b])!
  st().duplicateScene(scene(0).id)
  assert.equal(scene(1).groups?.[groupId]?.name, 'Group 1')
  assert.equal(scene(1).elements.filter(e => e.groupId === groupId).length, 2)
}

// ─── Smart blocks ─────────────────────────────────────────────────────────────

/** Test block: `count` circles in a row, chained with connectors. */
registerBlock<{ count: number; size: number }>({
  id: 'testRow',
  title: 'Row',
  description: 'circles in a row',
  category: 'test',
  fields: [],
  defaults: { count: 3, size: 60 },
  normalize: p => ({ count: Math.max(1, Math.min(20, Math.round(Number(p.count) || 3))), size: Number(p.size) || 60 }),
  build: ({ count, size }) => {
    const circles: EditorElement[] = Array.from({ length: count }, (_, i) =>
      Object.assign(makeShape('circle', 100 + i * size * 2, 300), { width: size, height: size, blockKey: `circle-${i}` }))
    const links = circles.slice(1).map((c, i) => Object.assign(makeConnector(circles[i], c), { blockKey: `link-${i}` }))
    return [...circles, ...links]
  },
})

{
  setup()
  const groupId = st().insertBlock('testRow', { count: 3 })!
  const members = () => scene().elements.filter(e => e.groupId === groupId)
  assert.equal(members().length, 5)
  assert.equal(scene().groups![groupId].smart?.params.count, 3)
  const firstIds = members().filter(e => e.type === 'shape').map(e => e.id)

  // An outside arrow attached to the first circle.
  const outside = makeShape('rect', 100, 700)
  st().addElements([outside])
  st().addElements([makeConnector(outside, el(firstIds[0])!)])
  const outsideArrowId = scene().elements.find(e => e.type === 'arrow' && !e.groupId)!.id

  // The user moves the whole block 50 px right, 40 px down.
  for (const m of members()) {
    if (m.type === 'arrow') continue
    st().updateElement(m.id, { x: m.x + 50, y: m.y + 40 })
  }
  const movedX = el(firstIds[0])!.x

  st().rebuildBlock(groupId, { count: 5 })
  const circles = members().filter(e => e.type === 'shape').sort((p, q) => p.x - q.x)
  assert.equal(circles.length, 5)
  assert.equal(members().filter(e => e.type === 'arrow').length, 4)
  assert.deepEqual(circles.slice(0, 3).map(c => c.id), firstIds, 'the same parts keep their ids')
  assert.equal(circles[0].x, movedX, 'the move is kept')
  assert.equal(circles[0].y, 340)
  assert.equal(scene().groups![groupId].smart?.params.count, 5)
  const outsideArrow = el(outsideArrowId) as ArrowElement
  assert.equal(outsideArrow.endAttach?.elementId, firstIds[0], 'outside connector still attached')
  assert.equal(outsideArrow.y2, 400, 'and follows the rebuilt circle (arriving at its bottom, facing the box below)')

  st().rebuildBlock(groupId, { count: 2 })
  assert.equal(members().filter(e => e.type === 'shape').length, 2)
  st().detachBlock(groupId)
  assert.equal(scene().groups![groupId].smart, undefined)
  assert.equal(scene().groups![groupId].name, 'Row', 'still a group')
}

console.log('group tests passed')
