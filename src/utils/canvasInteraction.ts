import type { ActiveTool, ElementType } from '../types/editor'

export function getCanvasElementInteraction(activeTool: ActiveTool, locked: boolean, type: ElementType) {
  const listening = activeTool === 'select' && !locked
  return { listening, draggable: listening && type !== 'handDraw' }
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
