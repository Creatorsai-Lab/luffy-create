import { useRef, useState } from 'react'
import { Eye, EyeOff, Lock, Unlock, ArrowUp, ArrowDown, Layers, Trash2, Type, Shapes, Code, Image, Video, Music, Hash, Calculator, Pencil } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import { cn } from '../../utils/cn'
import type { EditorElement, TextElement, ShapeElement, ArrowElement, CodeElement, ImageElement, VideoElement, AudioElement, IconElement, LatexElement, ChartElement, TableElement, CounterElement, HandDrawElement } from '../../types/editor'
import { useShallow } from 'zustand/react/shallow'

// ── Shape SVG thumbnails by shapeType ───────────────────────────────────────

function ShapeThumbnail({ shapeType, fill, stroke, size = 14 }: { shapeType: string; fill: string; stroke: string; size?: number }) {
  const sw = stroke && stroke !== 'transparent' ? 1.5 : 0
  const common = { fill: fill || '#888', stroke: stroke || 'none', strokeWidth: sw }

  switch (shapeType) {
    case 'circle':
    case 'ellipse':
      return <svg width={size} height={size} viewBox="0 0 20 20"><ellipse cx={10} cy={10} rx={8} ry={8} {...common} /></svg>
    case 'triangle':
      return <svg width={size} height={size} viewBox="0 0 20 20"><polygon points="10,2 18,18 2,18" {...common} /></svg>
    case 'star':
      return <svg width={size} height={size} viewBox="0 0 20 20"><polygon points="10,1 12.5,7 19,8 14,13 15.5,19 10,16 4.5,19 6,13 1,8 7.5,7" {...common} /></svg>
    case 'pentagon':
      return <svg width={size} height={size} viewBox="0 0 20 20"><polygon points="10,1 18.5,7 16,17 4,17 1.5,7" {...common} /></svg>
    case 'hexagon':
      return <svg width={size} height={size} viewBox="0 0 20 20"><polygon points="5,2 15,2 19,10 15,18 5,18 1,10" {...common} /></svg>
    case 'diamond':
      return <svg width={size} height={size} viewBox="0 0 20 20"><polygon points="10,1 19,10 10,19 1,10" {...common} /></svg>
    case 'cross':
      return <svg width={size} height={size} viewBox="0 0 20 20"><polygon points="7,2 13,2 13,7 18,7 18,13 13,13 13,18 7,18 7,13 2,13 2,7 7,7" {...common} /></svg>
    case 'heart':
      return <svg width={size} height={size} viewBox="0 0 20 20"><path d="M10,18 C5,13 2,10 2,6 C2,3 4,1 7,1 C8.5,1 9.5,1.5 10,2.5 C10.5,1.5 11.5,1 13,1 C16,1 18,3 18,6 C18,10 15,13 10,18 Z" {...common} /></svg>
    default: // rect, roundedRect, etc.
      return <svg width={size} height={size} viewBox="0 0 20 20"><rect x={2} y={2} width={16} height={16} rx={shapeType === 'roundedRect' ? 4 : 1} {...common} /></svg>
  }
}

// ── Arrow SVG thumbnail ─────────────────────────────────────────────────────

function ArrowThumbnail({ stroke, size = 14 }: { stroke: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20">
      <line x1={2} y1={14} x2={16} y2={4} stroke={stroke || '#888'} strokeWidth={2} />
      <polygon points="16,4 10,5 14,9" fill={stroke || '#888'} />
    </svg>
  )
}

// ── Type icons mapping ───────────────────────────────────────────────────────

function getTypeIcon(type: string, color?: string) {
  const iconProps = { size: 14, style: { color: color || '#888' } }
  
  switch (type) {
    case 'text':    return <Type {...iconProps} />
    case 'shape':   return <Shapes {...iconProps} />
    case 'arrow':   return <Type {...iconProps} /> // Placeholder, will be replaced with thumbnail
    case 'code':    return <Code {...iconProps} />
    case 'image':   return <Image {...iconProps} />
    case 'video':   return <Video {...iconProps} />
    case 'audio':   return <Music {...iconProps} />
    case 'icon':    return <Shapes {...iconProps} />
    case 'latex':   return <Hash {...iconProps} />
    case 'table':   return <Type {...iconProps} />
    case 'chart':   return <Type {...iconProps} />
    case 'counter': return <Calculator {...iconProps} />
    case 'handDraw': return <Pencil {...iconProps} />
    default:        return <Type {...iconProps} />
  }
}

// ── Descriptive label for each element ──────────────────────────────────────

function getLayerLabel(el: EditorElement): { text: string; color?: string } {
  switch (el.type) {
    case 'text': {
      const t = el as TextElement
      const preview = t.content.replace(/\n/g, ' ').trim()
      const label = preview.length > 20 ? preview.slice(0, 20) + '…' : preview
      return { text: label || 'Empty Text', color: t.color }
    }
    case 'shape': {
      const s = el as ShapeElement
      const shapeName = s.shapeType.charAt(0).toUpperCase() + s.shapeType.slice(1)
      return { text: shapeName, color: s.fill || s.stroke }
    }
    case 'arrow': {
      const a = el as ArrowElement
      return { text: 'Arrow', color: a.stroke }
    }
    case 'code': {
      const c = el as CodeElement
      const preview = c.code.split('\n')[0]?.trim() ?? ''
      return { text: preview.length > 20 ? preview.slice(0, 20) + '…' : preview || `Code (${c.language})` }
    }
    case 'image': {
      const img = el as ImageElement
      const filename = img.src.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, '') ?? 'Image'
      return { text: filename.length > 20 ? filename.slice(0, 20) + '…' : filename }
    }
    case 'video': {
      const vid = el as VideoElement
      const filename = vid.src.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, '') ?? 'Video'
      return { text: filename.length > 20 ? filename.slice(0, 20) + '…' : filename }
    }
    case 'audio': {
      const aud = el as AudioElement
      const trackLabel = aud.track === 'voiceover' ? 'VO' : 'BG'
      return { text: `${aud.name || 'Audio'} (${trackLabel})` }
    }
    case 'icon': {
      return { text: el.name || 'Icon' }
    }
    case 'latex': {
      const l = el as LatexElement
      const preview = l.latex?.trim() ?? ''
      return { text: preview.length > 20 ? preview.slice(0, 20) + '…' : preview || 'LaTeX' }
    }
    case 'table': {
      const t = el as TableElement
      return { text: `Table ${t.rows}×${t.cols}` }
    }
    case 'chart': {
      const c = el as ChartElement
      return { text: `${c.chartType.charAt(0).toUpperCase() + c.chartType.slice(1)} Chart` }
    }
    case 'counter': {
      return { text: 'Counter' }
    }
    case 'handDraw': {
      const h = el as HandDrawElement
      return { text: h.name || 'Drawing' }
    }
    default:
      return { text: el.name || el.type }
  }
}

// ── Component ───────────────────────────────────────────────────────────────

export default function LayersPanel() {
  const {
    project, currentSceneId, selectedIds,
    selectElement, updateElement, removeElement,
    bringForward, sendBackward, reorderElementLayer
  } = useEditorStore(useShallow(s => ({ project: s.project, currentSceneId: s.currentSceneId, selectedIds: s.selectedIds, selectElement: s.selectElement, updateElement: s.updateElement, removeElement: s.removeElement, bringForward: s.bringForward, sendBackward: s.sendBackward, reorderElementLayer: s.reorderElementLayer })))
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const dragTargetRef = useRef<string | null>(null)
  const suppressNextClickRef = useRef(false)

  const scene = project?.scenes.find(s => s.id === currentSceneId)
  if (!scene) return null

  // Filter out audio elements - they don't show on canvas
  const visibleElements = scene.elements.filter(el => el.type !== 'audio')
  const sorted = [...visibleElements].sort((a, b) => b.zIndex - a.zIndex)

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
        <span className="text-xs text-[#f2f2f2] ml-auto">{sorted.length}</span>
      </div>

      {sorted.length === 0 && (
        <p className="text-xs text-[#f2f2f2] px-3 py-4 text-center">No elements in this scene.</p>
      )}

      {sorted.map(el => {
        const isSelected = selectedIds.includes(el.id)
        const isDragging = draggingId === el.id
        const isDropTarget = draggingId !== null && dragOverId === el.id && draggingId !== el.id
        const layerInfo = getLayerLabel(el)
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
              'group flex items-center gap-2 px-3 py-2 cursor-pointer border-b border-editor-border transition-colors',
              isSelected ? 'bg-editor-accent-dim' : 'hover:bg-editor-hover',
              isDragging && 'opacity-45',
              isDropTarget && 'ring-1 ring-editor-accent bg-editor-hover'
            )}
            title="Shift+drag to reorder"
          >
            {/* Type icon with color */}
            <span className="flex-none w-4 h-4 flex items-center justify-center">
              {getTypeIcon(el.type, layerInfo.color)}
            </span>

            {/* Type label */}
            <span className={cn(
              'text-[10px] font-mono flex-none',
              isSelected ? 'text-editor-accent' : 'text-[#888]'
            )}>
              {el.type.charAt(0).toUpperCase() + el.type.slice(1)}:
            </span>

            {/* Name / preview */}
            <span className={cn(
              'text-[12px] truncate',
              isSelected ? 'text-editor-accent' : 'text-editor-text-secondary'
            )}>
              {layerInfo.text}
            </span>
            
            {/* Shape/Arrow thumbnail after text */}
            {el.type === 'shape' && (
              <span className="flex-none ml-1">
                <ShapeThumbnail 
                  shapeType={(el as ShapeElement).shapeType} 
                  fill={(el as ShapeElement).fill} 
                  stroke={(el as ShapeElement).stroke}
                  size={14}
                />
              </span>
            )}
            
            {el.type === 'arrow' && (
              <span className="flex-none ml-1">
                <ArrowThumbnail 
                  stroke={(el as ArrowElement).stroke}
                  size={14}
                />
              </span>
            )}

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
