import { useState } from 'react'
import {
  Type, Square, ArrowRight, Code2, Table2, Layers, Shuffle, ImagePlus, BarChart3, Music,
  Play, Download, Monitor, ChevronDown, Undo2, Redo2, PaintBucket, Shapes, PointerOff, SquareDashedMousePointer, SquarePlay, Sigma, BookOpen, Captions, Timer, Move
} from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import { useHistoryStore } from '../../store/historyStore'
import { CANVAS_PRESETS } from '../../types/editor'
import type { ActiveTool, ActivePanel } from '../../types/editor'
import { cn } from '../../utils/cn'

interface ToolItem {
  icon: React.ReactNode
  label: string
  tool?: ActiveTool
  panel: ActivePanel
}
const TOOLS: ToolItem[] = [
  { icon: <PaintBucket size={15} />, label: 'Background', panel: 'background' },
  { icon: <Shuffle size={15} />, label: 'Transitions', panel: 'transitions' },
  { icon: <Layers size={15} />, label: 'Layers', panel: 'layers' },
  { icon: <Type size={15} />, label: 'Text', tool: 'text', panel: 'text' },
  { icon: <Square size={15} />, label: 'Shapes', tool: 'select', panel: 'shapes' },
  { icon: <ArrowRight size={15} />, label: 'Arrow', tool: 'arrow', panel: 'arrows' },
  { icon: <Code2 size={15} />, label: 'Code', tool: 'code', panel: 'code' },
  { icon: <Sigma size={15} />, label: 'LaTeX', panel: 'latex' },
  { icon: <Table2 size={15} />, label: 'Table', tool: 'table', panel: 'table' },
  { icon: <BarChart3 size={15} />, label: 'Charts', tool: 'chart', panel: 'charts' },
  { icon: <Shapes size={15} />, label: 'Icons', panel: 'icons' },
  { icon: <ImagePlus size={15} />, label: 'Images', tool: 'image', panel: 'upload' },
  { icon: <SquarePlay size={15} />, label: 'Video', tool: 'video', panel: 'video' },
  { icon: <Music size={15} />, label: 'Audio', panel: 'audio' },
  { icon: <SquareDashedMousePointer size={15} />, label: 'Perspective', panel: 'perspective' },
  { icon: <Move size={15} />, label: 'Move', panel: 'move' },
  { icon: <Timer size={15} />, label: 'Counter', tool: 'counter', panel: 'counter' },
]

export default function MenuSideBar() {
  const {
    project, activeTool, activePanel,
    setActiveTool, setActivePanel,
    setProjectName, setCanvasSize,
    setPreviewOpen, setExportOpen,
    setUserGuideOpen, setSubtitleOpen,
    openCodeModal,
    deselectAll,
    undo, redo
  } = useEditorStore()

  const { canUndo, canRedo } = useHistoryStore()
  const [editingName, setEditingName] = useState(false)
  const [sizeOpen, setSizeOpen] = useState(false)

  const disabled = !project
  const preset = project ? CANVAS_PRESETS.find(p => p.width === project.width && p.height === project.height) : null
  const sizeLabel = project ? (preset?.label ?? `${project.width}x${project.height}`) : '—'

  async function commitProjectName(raw: string) {
    if (!project) return
    const name = raw.trim()
    if (!name || name === project.name) return
    setProjectName(name)
    if (project.id === 'default') return
    try {
      await window.api.projects.rename(project.id, name)
      const latest = useEditorStore.getState().project
      if (latest) {
        await window.api.projects.save(latest.id, JSON.stringify(latest))
        useEditorStore.getState().markClean()
      }
    } catch (e) {
      console.error('Failed to rename project', e)
    }
  }

  return (
    <aside className="w-56 flex-none bg-[#171717] flex flex-col h-full overflow-y-auto no-scrollbar border-r border-editor-border">
      {/* Top Bar Actions */}
      <div className="flex flex-col gap-2 p-3 border-b border-editor-border">
        {/* Project Name */}
        {project && editingName ? (
          <input
            autoFocus
            className="border border-white text-[#f2f2f2] text-[0.78rem] px-2 py-1 rounded w-full"
            defaultValue={project.name}
            onBlur={e => { commitProjectName(e.target.value); setEditingName(false) }}
            onKeyDown={e => {
              if (e.key === 'Enter') { commitProjectName(e.currentTarget.value); setEditingName(false) }
              if (e.key === 'Escape') setEditingName(false)
            }}
          />
        ) : (
          <button
            onClick={() => project && setEditingName(true)}
            disabled={disabled}
            className="text-[0.78rem] font-semibold border-b text-[#f2f2f2] border-[#363636] hover:text-purple-400 py-1 text-left truncate disabled:text-[#f2f2f2] w-full transition-colors"
          >
            {project?.name ?? 'No project'}
          </button>
        )}

        {/* Canvas Size */}
        <div className="relative bg-[#2a282b] p-1 rounded-sm">
          <button
            disabled={disabled}
            onClick={() => setSizeOpen(v => !v)}
            className="flex items-center justify-between w-full text-[0.78rem] text-[#f2f2f2] hover:text-purple-400 py-1.5 transition-colors disabled:text-[#f2f2f2]"
          >
            <div className="flex items-center gap-2">
              <Monitor size={15} />
              <span className="truncate">{sizeLabel}</span>
            </div>
            {project && <ChevronDown size={15} />}
          </button>

          {sizeOpen && project && (
            <div className="absolute top-full left-0 mt-1 bg-editor-elevated border border-editor-border rounded shadow-lg z-50 w-full">
              {CANVAS_PRESETS.map(p => (
                <button
                  key={p.label}
                  onClick={() => { setCanvasSize(p.width, p.height); setSizeOpen(false) }}
                  className={cn(
                    'w-full text-left px-3 py-2 text-[0.78rem] hover:bg-editor-hover transition-colors flex items-center justify-between',
                    p.width === project.width && p.height === project.height
                      ? 'text-purple-400' : 'text-[#f2f2f2]'
                  )}
                >
                  <span>{p.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Undo / Redo */}
        <div className="flex items-center gap-2 mt-1">
          <button
            onClick={undo}
            disabled={!canUndo}
            className="flex-1 flex justify-center items-center py-1.5 rounded transition-colors text-[#f2f2f2] hover:text-purple-400 hover:bg-editor-hover disabled:text-[#f2f2f2] disabled:bg-transparent"
            title="Undo"
          >
            <Undo2 size={15} />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            className="flex-1 flex justify-center items-center py-1.5 rounded transition-colors text-[#f2f2f2] hover:text-purple-400 hover:bg-editor-hover disabled:text-[#f2f2f2] disabled:bg-transparent"
            title="Redo"
          >
            <Redo2 size={15} />
          </button>
        </div>

        {/* Preview / Export */}
        <div className="grid grid-cols-2 gap-2 mt-1">
          <button
            disabled={disabled}
            onClick={() => setPreviewOpen(true)}
            className="flex flex-col items-center gap-1 text-[0.78rem] py-2 rounded transition-colors text-[#f2f2f2] hover:text-purple-400 hover:bg-editor-hover disabled:text-[#f2f2f2] disabled:bg-transparent"
          >
            <Play size={15} />
            <span>Preview</span>
          </button>
          <button
            disabled={disabled}
            onClick={() => setExportOpen(true)}
            className="flex flex-col items-center gap-1 text-[0.78rem] py-2 rounded transition-colors text-red hover:text-purple-400 hover:bg-editor-hover disabled:text-[#f2f2f2] disabled:bg-transparent"
          >
            <Download size={15} />
            <span>Export</span>
          </button>
        </div>

      </div>

      {/* Menu Bar Tools Grid (2 items per row) */}
      <div className="p-3">
        <div className="text-[0.75rem] text-[#f2f2f2] uppercase tracking-wider mb-3 px-1 font-semibold">Tools</div>

        <div className="grid grid-cols-2 gap-2">
          <button
            disabled={disabled}
            onClick={() => {
              if (disabled) return
              setActiveTool('select')
              deselectAll()
              setActivePanel(null)
            }}
            className={cn(
              'flex flex-col items-center justify-center gap-1.5 p-2 rounded transition-all',
              disabled ? 'text-editor-accent cursor-not-allowed' :
                activeTool === 'select' && activePanel === null
                  ? 'bg-editor-accent/10 text-editor-accent'
                  : 'text-[#f2f2f2] hover:bg-editor-hover'
            )}
          >
            <PointerOff size={15} />
            <span className="text-[0.78rem] whitespace-nowrap overflow-hidden text-ellipsis w-full text-center">Free Cursor</span>
          </button>
          {TOOLS.map((item, i) => {
            const isActive = activePanel === item.panel
            return (
              <button
                key={i}
                disabled={disabled}
                onClick={() => {
                  if (disabled) return
                  if (item.tool === 'code') { openCodeModal(); setActivePanel('code'); return }
                  // For shapes panel, just open it without setting a specific shape tool
                  // This allows the user to choose a shape from the panel first
                  if (item.panel === 'shapes') {
                    setActivePanel(activePanel === 'shapes' ? null : 'shapes')
                    // Don't set a shape tool - user needs to pick one from the panel
                    return
                  }
                  if (item.panel === 'perspective' || item.panel === 'move') {
                    setActiveTool('select')
                  }
                  if (item.tool) setActiveTool(item.tool)
                  setActivePanel(activePanel === item.panel ? null : item.panel)
                }}
                className={cn(
                  'flex flex-col items-center justify-center gap-1.5 p-2 rounded transition-all',
                  disabled ? 'text-editor-accent cursor-not-allowed' :
                    isActive ? 'text-editor-accent' : 'text-[#f2f2f2] hover:bg-editor-hover'
                )}
              >
                {item.icon}
                <span className="text-[0.78rem] whitespace-nowrap overflow-hidden text-ellipsis w-full text-center">{item.label}</span>
              </button>
            )
          })}

          {/* Less-frequent tools — open as modals */}
          <button
            disabled={disabled}
            onClick={() => { if (!disabled) setSubtitleOpen(true) }}
            className={cn(
              'flex flex-col items-center justify-center gap-1.5 p-2 rounded transition-all',
              disabled ? 'text-editor-accent cursor-not-allowed' : 'text-[#f2f2f2] hover:bg-editor-hover'
            )}
          >
            <Captions size={15} />
            <span className="text-[0.78rem] whitespace-nowrap overflow-hidden text-ellipsis w-full text-center">Subtitle</span>
          </button>
          <button
            onClick={() => setUserGuideOpen(true)}
            className="flex flex-col items-center justify-center gap-1.5 p-2 rounded transition-all text-[#f2f2f2] hover:bg-editor-hover"
          >
            <BookOpen size={15} />
            <span className="text-[0.78rem] whitespace-nowrap overflow-hidden text-ellipsis w-full text-center">User Guide</span>
          </button>
        </div>
      </div>
    </aside>
  )
}
