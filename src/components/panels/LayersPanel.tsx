import { useRef, useState } from 'react'
import { Eye, EyeOff, Lock, Unlock, ArrowUp, ArrowDown, Layers, Trash2 } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import { cn } from '../../utils/cn'

export default function LayersPanel() {
  const {
    project, currentSceneId, selectedIds,
    selectElement, updateElement, removeElement,
    bringForward, sendBackward, reorderElementLayer
  } = useEditorStore()
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const dragTargetRef = useRef<string | null>(null)
  const suppressNextClickRef = useRef(false)

  const scene = project?.scenes.find(s => s.id === currentSceneId)
  if (!scene) return null

  const sorted = [...scene.elements].sort((a, b) => b.zIndex - a.zIndex)

  const clearDrag = () => {
    setDraggingId(null)
    setDragOverId(null)
    dragTargetRef.current = null
  }

  const startLayerDrag = (id: string, e: React.MouseEvent<HTMLDivElement>) => {
    if (!e.shiftKey || e.button !== 0) return

    e.preventDefault()
    e.stopPropagation()

    const orderAtDragStart = sorted.map(item => item.id)
    suppressNextClickRef.current = true
    setDraggingId(id)
    setDragOverId(id)
    dragTargetRef.current = id

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const node = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)
      const row = node instanceof HTMLElement ? node.closest<HTMLElement>('[data-layer-id]') : null
      const targetId = row?.dataset.layerId ?? null
      dragTargetRef.current = targetId
      setDragOverId(targetId)
    }

    const handleMouseUp = () => {
      const targetId = dragTargetRef.current
      if (targetId && targetId !== id) {
        const targetIndex = orderAtDragStart.findIndex(itemId => itemId === targetId)
        if (targetIndex >= 0) reorderElementLayer(id, targetIndex)
      }

      clearDrag()
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  return (
    <div className="flex flex-col overflow-y-auto flex-1">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-editor-border">
        <Layers size={15} className="text-editor-accent" />
        <span className="text-xs font-medium text-editor-text">Layers</span>
        <span className="text-xs text-[#f2f2f2] ml-auto">{scene.elements.length}</span>
      </div>

      {sorted.length === 0 && (
        <p className="text-xs text-[#f2f2f2] px-3 py-4 text-center">No elements in this scene.</p>
      )}

      {sorted.map(el => {
        const isSelected = selectedIds.includes(el.id)
        const isDragging = draggingId === el.id
        const isDropTarget = draggingId !== null && dragOverId === el.id && draggingId !== el.id
        return (
          <div
            key={el.id}
            data-layer-id={el.id}
            onClick={e => {
              if (e.shiftKey || suppressNextClickRef.current) {
                e.preventDefault()
                e.stopPropagation()
                suppressNextClickRef.current = false
                return
              }
              selectElement(el.id)
            }}
            onMouseDown={e => startLayerDrag(el.id, e)}
            className={cn(
              'group flex items-center gap-1.5 px-3 py-2 cursor-pointer border-b border-editor-border transition-colors',
              isSelected ? 'bg-editor-accent-dim' : 'hover:bg-editor-hover',
              isDragging && 'opacity-45',
              isDropTarget && 'ring-1 ring-editor-accent bg-editor-hover'
            )}
            title="Shift+drag to reorder"
          >
            {/* Type indicator */}
            <span className={cn(
              'text-xs font-mono w-4 text-center flex-none',
              isSelected ? 'text-editor-accent' : 'text-[#f2f2f2]'
            )}>
              {el.type[0].toUpperCase()}
            </span>

            {/* Name */}
            <span className={cn(
              'flex-1 text-[12px] truncate',
              isSelected ? 'text-editor-accent' : 'text-editor-secondary'
            )}>
              {el.name}
            </span>

            {/* Controls */}
            <div
              className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              onMouseDown={e => e.stopPropagation()}
            >
              <button
                onClick={e => { e.stopPropagation(); bringForward(el.id) }}
                className="text-[#f2f2f2] hover:text-editor-text p-0.5"
                title="Bring forward"
              >
                <ArrowUp size={14} />
              </button>
              <button
                onClick={e => { e.stopPropagation(); sendBackward(el.id) }}
                className="text-[#f2f2f2] hover:text-editor-text p-0.5"
                title="Send backward"
              >
                <ArrowDown size={14} />
              </button>
              <button
                onClick={e => { e.stopPropagation(); updateElement(el.id, { visible: !el.visible }) }}
                className="text-[#f2f2f2] hover:text-editor-text p-0.5"
                title={el.visible ? 'Hide' : 'Show'}
              >
                {el.visible ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
              <button
                onClick={e => { e.stopPropagation(); updateElement(el.id, { locked: !el.locked }) }}
                className="text-[#f2f2f2] hover:text-editor-text p-0.5"
                title={el.locked ? 'Unlock' : 'Lock'}
              >
                {el.locked ? <Lock size={15} /> : <Unlock size={13} />}
              </button>
              <button
                onClick={e => { e.stopPropagation(); removeElement(el.id) }}
                className="text-[#f2f2f2] hover:text-red-400 p-0.5"
                title="Delete"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
