import type { ActiveTool, ElementType } from '../types/editor'

export function getCanvasElementInteraction(activeTool: ActiveTool, locked: boolean, type: ElementType) {
  // Locked items still take clicks (to select them, see the lock and right-click
  // → Unlock) but can't be dragged or resized.
  const listening = activeTool === 'select'
  return { listening, draggable: listening && !locked && type !== 'handDraw' }
}

export function getCanvasCursor(
  activeTool: ActiveTool,
  state: 'canvas' | 'selected' | 'dragging' = 'canvas',
  movable = false,
) {
  if (activeTool !== 'select') return 'crosshair'
  if (!movable) return 'default'
  return state === 'selected' || state === 'dragging' ? 'move' : 'default'
}

export function shouldShowSelectionHandles(activeTool: ActiveTool) {
  return activeTool === 'select'
}
