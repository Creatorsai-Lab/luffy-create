import { useState } from 'react'
import {
  Type, Square, ArrowRight, Code2, Table2, Layers, Shuffle, ImagePlus, BarChart3, Music,
  Play, Download, Monitor, ChevronDown, Undo2, Redo2, PaintBucket, Shapes, PointerOff, SquareDashedMousePointer, SquarePlay, Sigma, BookOpen, Captions, Timer, Route, SquareTerminal, PenTool, Sparkles, Blocks, LayoutTemplate
} from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import { useHistoryStore } from '../../store/historyStore'
import { CANVAS_PRESETS } from '../../types/editor'
import type { ActiveTool, ActivePanel, EditorElement } from '../../types/editor'
import { cn } from '../../utils/cn'
import { makeCenteredArrow, makeCenteredTable, makeCenteredText } from '../../utils/defaults'
import { toast } from '../ui/Toast'
import { useShallow } from 'zustand/react/shallow'
import { saveCurrentProject } from '../../store/projectSave'

type ToolModal = 'subtitle' | 'pythonSandbox' | 'userGuide'

interface ToolItem {
  icon: React.ReactNode
  label: string
  tool?: ActiveTool
  panel: ActivePanel
  /** Insert this element on the current scene immediately, then open its properties. */
  insert?: (canvasW: number, canvasH: number) => EditorElement
  /** Opens a modal instead of a sidebar panel. */
  modal?: ToolModal
}

// Alphabetical. "Free Cursor" is rendered separately, always first.
const TOOLS: ToolItem[] = [
  { icon: <ArrowRight size={15} />, label: 'Arrow', panel: 'arrows', insert: makeCenteredArrow },
  { icon: <Music size={15} />, label: 'Audio', panel: 'audio' },
  { icon: <PaintBucket size={15} />, label: 'Background', panel: 'background' },
  { icon: <LayoutTemplate size={15} />, label: 'Blocks', panel: 'blocks' },
  { icon: <BarChart3 size={15} />, label: 'Charts', tool: 'chart', panel: 'charts' },
  { icon: <Code2 size={15} />, label: 'Code', tool: 'code', panel: 'code' },
  { icon: <Timer size={15} />, label: 'Counter', tool: 'counter', panel: 'counter' },
  { icon: <Sparkles size={15} />, label: 'Effects', panel: 'effects' },
  { icon: <Blocks size={15} />, label: 'Group Effects', panel: 'groupEffects' },
  { icon: <PenTool size={15} />, label: 'Hand Draw', tool: 'handDraw', panel: 'handDraw' },
  { icon: <Shapes size={15} />, label: 'Icons', panel: 'icons' },
  { icon: <ImagePlus size={15} />, label: 'Images', tool: 'image', panel: 'upload' },
  { icon: <Sigma size={15} />, label: 'LaTeX', panel: 'latex' },
  { icon: <Layers size={15} />, label: 'Layers', panel: 'layers' },
  { icon: <Route size={15} />, label: 'Motion', panel: 'motion' },
  { icon: <SquareDashedMousePointer size={15} />, label: 'Perspective', panel: 'perspective' },
  { icon: <SquareTerminal size={15} />, label: 'Python Sandbox', panel: null, modal: 'pythonSandbox' },
  { icon: <Square size={15} />, label: 'Shapes', tool: 'select', panel: 'shapes' },
  { icon: <Captions size={15} />, label: 'Subtitle', panel: null, modal: 'subtitle' },
  { icon: <Table2 size={15} />, label: 'Table', panel: 'table', insert: makeCenteredTable },
  { icon: <Type size={15} />, label: 'Text', panel: 'text', insert: makeCenteredText },
  { icon: <Shuffle size={15} />, label: 'Transitions', panel: 'transitions' },
  { icon: <BookOpen size={15} />, label: 'User Guide', panel: null, modal: 'userGuide' },
  { icon: <SquarePlay size={15} />, label: 'Video', tool: 'video', panel: 'video' },
]

export default function MenuSideBar() {
  const {
    project, activeTool, activePanel,
    setActiveTool, setActivePanel,
    setProjectName, setCanvasSize,
    setPreviewOpen, setExportOpen,
    setUserGuideOpen, setSubtitleOpen,
    setPythonSandboxOpen,
    openCodeModal,
    addElement, deselectAll,
    undo, redo
  } = useEditorStore(useShallow(s => ({ project: s.project, activeTool: s.activeTool, activePanel: s.activePanel, setActiveTool: s.setActiveTool, setActivePanel: s.setActivePanel, setProjectName: s.setProjectName, setCanvasSize: s.setCanvasSize, setPreviewOpen: s.setPreviewOpen, setExportOpen: s.setExportOpen, setUserGuideOpen: s.setUserGuideOpen, setSubtitleOpen: s.setSubtitleOpen, setPythonSandboxOpen: s.setPythonSandboxOpen, openCodeModal: s.openCodeModal, addElement: s.addElement, deselectAll: s.deselectAll, undo: s.undo, redo: s.redo })))

  const openModal: Record<ToolModal, (open: boolean) => void> = {
    subtitle: setSubtitleOpen,
    pythonSandbox: setPythonSandboxOpen,
    userGuide: setUserGuideOpen,
  }

  const canUndo = useHistoryStore((state) => state.canUndo)
  const canRedo = useHistoryStore((state) => state.canRedo)
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
      await saveCurrentProject()
      toast.success('Project renamed successfully')
    } catch (e) {
      console.error('Failed to rename project', e)
      toast.error('Failed to rename project')
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
            <div className="absolute top-full left-0 mt-1 bg-editor-elevated-highlight border border-editor-border rounded shadow-lg z-50 w-full">
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
          {TOOLS.map(item => {
            const isActive = item.panel !== null && activePanel === item.panel
            // The user guide is useful even before a project is open.
            const itemDisabled = disabled && item.modal !== 'userGuide'
            return (
              <button
                key={item.label}
                disabled={itemDisabled}
                onClick={() => {
                  if (itemDisabled) return
                  if (item.modal) {
                    openModal[item.modal](true)
                    return
                  }
                  // Insert tools add a new element on every click (no toggle-off),
                  // and the new element's properties open alongside it.
                  if (item.insert) {
                    if (!project) return
                    setActiveTool('select')
                    addElement(item.insert(project.width, project.height))
                    setActivePanel(item.panel)
                    return
                  }
                  if (activePanel === item.panel) {
                    setActivePanel(null)
                    if (item.tool === 'handDraw') setActiveTool('select')
                    return
                  }
                  if (item.tool === 'code') { openCodeModal(); setActivePanel('code'); return }
                  // For shapes panel, just open it without setting a specific shape tool
                  // This allows the user to choose a shape from the panel first
                  if (item.panel === 'shapes') {
                    setActivePanel(activePanel === 'shapes' ? null : 'shapes')
                    // Don't set a shape tool - user needs to pick one from the panel
                    return
                  }
                  if (item.panel === 'perspective' || item.panel === 'motion') {
                    setActiveTool('select')
                  }
                  if (item.tool) setActiveTool(item.tool)
                  setActivePanel(item.panel)
                }}
                className={cn(
                  'flex flex-col items-center justify-center gap-1.5 p-2 rounded transition-all',
                  itemDisabled ? 'text-editor-accent cursor-not-allowed' :
                    isActive ? 'text-editor-accent' : 'text-[#f2f2f2] hover:bg-editor-hover'
                )}
              >
                {item.icon}
                <span className="text-[0.78rem] whitespace-nowrap overflow-hidden text-ellipsis w-full text-center">{item.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </aside>
  )
}
