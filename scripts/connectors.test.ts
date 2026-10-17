// Connectors: arrows whose ends attach to elements and follow them through
// moves, resizes, deletes, scene splits and duplicates.
import assert from 'node:assert/strict'
import { useEditorStore } from '../src/store/editorStore'
import type { ArrowElement, EditorElement } from '../src/types/editor'
import { anchorPoint, connectionPairs, copyElements, makeConnector } from '../src/utils/connectors'
import { makeProject, makeScene, makeShape } from '../src/utils/defaults'

const st = () => useEditorStore.getState()
const scene = (i = 0) => st().project!.scenes[i]
const find = <T extends EditorElement = EditorElement>(id: string, i = 0) => scene(i).elements.find(e => e.id === id) as T | undefined

{ // anchors face the other end
  const box = { x: 0, y: 0, width: 100, height: 100 }
  assert.deepEqual(anchorPoint(box, 'auto', { x: 300, y: 50 }), { x: 100, y: 50 })
  assert.deepEqual(anchorPoint(box, 'auto', { x: -300, y: 80 }), { x: 0, y: 50 })
  assert.deepEqual(anchorPoint(box, 'auto', { x: 50, y: -200 }), { x: 50, y: 0 })
  assert.deepEqual(anchorPoint(box, 'bottom'), { x: 50, y: 100 })
  assert.deepEqual(anchorPoint(box, 'center'), { x: 50, y: 50 })
}

{ // which pairs get linked
  const net = [3, 4, 2].flatMap((n, layer) => Array.from({ length: n }, (_, i) => ({ id: `${layer}-${i}`, x: layer * 200, y: i * 80, width: 40, height: 40 })))
  assert.equal(connectionPairs(net, 'columns').length, 3 * 4 + 4 * 2)
  assert.deepEqual(connectionPairs(net.slice(0, 3), 'chain'), [['0-0', '0-1'], ['0-1', '0-2']])
  assert.deepEqual(connectionPairs(net.slice(0, 3), 'hub'), [['0-0', '0-1'], ['0-0', '0-2']])
}

function setup() {
  const p = makeProject('p', 'connectors')
  const s1 = makeScene(1); s1.duration = 6
  const a = Object.assign(makeShape('circle', 100, 100), { width: 100, height: 100 })
  const b = Object.assign(makeShape('circle', 500, 100), { width: 100, height: 100 })
  s1.elements = [a, b]
  p.scenes = [s1, makeScene(2)]
  st().loadProject(p)
  const arrow = makeConnector(a, b)
  st().addElements([arrow], { behind: true })
  return { a, b, arrowId: arrow.id }
}

{ // attached ends sit on the facing edges, and the connector goes behind
  const { a, b, arrowId } = setup()
  const arrow = find<ArrowElement>(arrowId)!
  assert.deepEqual([arrow.x1, arrow.y1, arrow.x2, arrow.y2], [200, 150, 500, 150])
  assert.ok(arrow.zIndex < find(a.id)!.zIndex && arrow.zIndex < find(b.id)!.zIndex, 'behind the shapes')
}

{ // moving or resizing an element moves the attached end
  const { b, arrowId } = setup()
  st().updateElement(b.id, { x: 500, y: 400 })
  let arrow = find<ArrowElement>(arrowId)!
  // b is further right (400px) than down (300px): arrive at its left edge
  assert.deepEqual([arrow.x2, arrow.y2], [500, 450])
  st().updateElement(b.id, { width: 200 })
  arrow = find<ArrowElement>(arrowId)!
  // wider b: now mostly below a, so arrive at its top centre
  assert.deepEqual([arrow.x2, arrow.y2], [600, 400])
}

{ // deleting an element releases the end but keeps the arrow where it was
  const { b, arrowId } = setup()
  st().removeElement(b.id)
  const arrow = find<ArrowElement>(arrowId)!
  assert.equal(arrow.endAttach, undefined)
  assert.ok(arrow.startAttach)
  assert.deepEqual([arrow.x2, arrow.y2], [500, 150])
}

{ // dragging an arrow keeps attached ends on their item; only the free end moves
  const { arrowId } = setup()
  st().updateElement(arrowId, { endAttach: undefined } as Partial<ArrowElement>) // release the end
  const before = find<ArrowElement>(arrowId)!
  // the canvas reports a drag as all four points shifted by the drag distance
  st().updateElement(arrowId, { x1: before.x1 + 100, y1: before.y1 + 300, x2: before.x2 + 100, y2: before.y2 + 300 } as Partial<ArrowElement>)
  const arrow = find<ArrowElement>(arrowId)!
  assert.ok(arrow.startAttach, 'still attached')
  assert.deepEqual([arrow.x2, arrow.y2], [600, 450], 'free end moved')
  // the attached start stays on circle a, on the side facing the moved end (more right than down)
  assert.deepEqual([arrow.x1, arrow.y1], [200, 150])
}

{ // with both ends attached, a drag leaves the arrow on its items
  const { arrowId } = setup()
  const before = find<ArrowElement>(arrowId)!
  st().updateElement(arrowId, { x1: before.x1 + 50, y1: before.y1 + 50, x2: before.x2 + 50, y2: before.y2 + 50 } as Partial<ArrowElement>)
  const arrow = find<ArrowElement>(arrowId)!
  assert.ok(arrow.startAttach && arrow.endAttach)
  assert.deepEqual([arrow.x1, arrow.y1, arrow.x2, arrow.y2], [before.x1, before.y1, before.x2, before.y2])
}

{ // copies of a connected group stay connected to each other; lone arrows are released
  const { a, b, arrowId } = setup()
  const arrow = find<ArrowElement>(arrowId)!
  const [copyA, copyB, copyArrow] = copyElements([find(a.id)!, find(b.id)!, arrow], 20) as [EditorElement, EditorElement, ArrowElement]
  assert.equal(copyArrow.startAttach?.elementId, copyA.id)
  assert.equal(copyArrow.endAttach?.elementId, copyB.id)
  assert.equal(copyArrow.x1, arrow.x1 + 20)
  const [loneArrow] = copyElements([arrow], 20) as [ArrowElement]
  assert.equal(loneArrow.startAttach, undefined)
  assert.equal(loneArrow.endAttach, undefined)
}

{ // a duplicated scene's connectors attach to the duplicated shapes
  const { a } = setup()
  st().duplicateScene(scene(0).id)
  const copy = scene(1)
  const copyArrow = copy.elements.find(e => e.type === 'arrow') as ArrowElement
  const copyIds = new Set(copy.elements.map(e => e.id))
  assert.ok(copyIds.has(copyArrow.startAttach!.elementId) && copyIds.has(copyArrow.endAttach!.elementId))
  assert.notEqual(copyArrow.startAttach!.elementId, a.id)
  // moving a shape in the copy moves only the copy's arrow
  const copyA = copy.elements.find(e => e.id === copyArrow.startAttach!.elementId)!
  st().updateElement(copyA.id, { x: 100, y: 500 })
  assert.equal((scene(0).elements.find(e => e.type === 'arrow') as ArrowElement).y1, 150)
}

{ // after a scene split, the second part's arrow follows the second part's shapes
  setup()
  st().splitScene(scene(0).id, 3)
  const second = scene(1)
  const arrow = second.elements.find(e => e.type === 'arrow') as ArrowElement
  const ids = new Set(second.elements.map(e => e.id))
  assert.ok(ids.has(arrow.startAttach!.elementId) && ids.has(arrow.endAttach!.elementId))
}

console.log('connector tests passed')
