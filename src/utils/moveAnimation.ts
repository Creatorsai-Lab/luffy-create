import type { EditorElement, ElementAnimation, MoveDirection, Project } from '../types/editor'

export const MOVE_ANIMATION_TYPE = 'move' as const

export const MOVE_DIRECTIONS: { label: string; value: MoveDirection }[] = [
  { label: 'Left', value: 'left' },
  { label: 'Right', value: 'right' },
  { label: 'Top', value: 'top' },
  { label: 'Bottom', value: 'bottom' },
  { label: 'Top Left', value: 'topLeft' },
  { label: 'Top Right', value: 'topRight' },
  { label: 'Bottom Right', value: 'bottomRight' },
  { label: 'Bottom Left', value: 'bottomLeft' },
]

export function isMoveAnimation(anim: ElementAnimation) {
  return anim.type === MOVE_ANIMATION_TYPE
}

export function elementMoveBounds(el: EditorElement) {
  if (el.type === 'arrow') {
    const minX = Math.min(el.x1, el.x2)
    const minY = Math.min(el.y1, el.y2)
    const maxX = Math.max(el.x1, el.x2)
    const maxY = Math.max(el.y1, el.y2)
    return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) }
  }

  return {
    x: el.x,
    y: el.y,
    width: 'width' in el ? Math.max(1, el.width) : 1,
    height: 'height' in el ? Math.max(1, el.height) : 1,
  }
}

export function computeMoveDelta(
  project: Project,
  el: EditorElement,
  direction: MoveDirection,
  moveOutside: boolean,
) {
  const b = elementMoveBounds(el)
  let targetX = b.x
  let targetY = b.y

  if (direction === 'left' || direction === 'topLeft' || direction === 'bottomLeft') {
    targetX = moveOutside ? -b.width : 0
  }
  if (direction === 'right' || direction === 'topRight' || direction === 'bottomRight') {
    targetX = moveOutside ? project.width : project.width - b.width
  }
  if (direction === 'top' || direction === 'topLeft' || direction === 'topRight') {
    targetY = moveOutside ? -b.height : 0
  }
  if (direction === 'bottom' || direction === 'bottomLeft' || direction === 'bottomRight') {
    targetY = moveOutside ? project.height : project.height - b.height
  }

  return {
    deltaX: Math.round(targetX - b.x),
    deltaY: Math.round(targetY - b.y),
  }
}

export function elementCenter(el: EditorElement) {
  const b = elementMoveBounds(el)
  return {
    x: Math.round(b.x + b.width / 2),
    y: Math.round(b.y + b.height / 2),
  }
}

export function computeCenterMoveDelta(
  el: EditorElement,
  startCenterX: number,
  startCenterY: number,
  endCenterX: number,
  endCenterY: number,
) {
  const b = elementMoveBounds(el)
  const centerX = b.x + b.width / 2
  const centerY = b.y + b.height / 2
  const startX = startCenterX - b.width / 2
  const startY = startCenterY - b.height / 2
  const endX = endCenterX - b.width / 2
  const endY = endCenterY - b.height / 2

  return {
    startOffsetX: Math.round(startX - b.x),
    startOffsetY: Math.round(startY - b.y),
    deltaX: Math.round(endX - startX),
    deltaY: Math.round(endY - startY),
    startCenterX: Math.round(startCenterX),
    startCenterY: Math.round(startCenterY),
    endCenterX: Math.round(endCenterX),
    endCenterY: Math.round(endCenterY),
    currentCenterX: Math.round(centerX),
    currentCenterY: Math.round(centerY),
  }
}

export function durationFromMove(deltaX: number, deltaY: number, speed: number) {
  const distance = Math.hypot(deltaX, deltaY)
  return Math.max(0.1, Number((distance / Math.max(1, speed)).toFixed(2)))
}
