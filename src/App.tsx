import { useEffect, useRef, useCallback, useState, Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { useEditorStore } from './store/editorStore'
import { makeProject } from './utils/defaults'
import Header from './components/layout/Header'
import AISidebar from './components/layout/AISidebar'
import MenuSideBar from './components/layout/MenuSideBar'
import OptionsSidebar from './components/layout/OptionsSidebar'
import EditorCanvas from './components/canvas/EditorCanvas'
import Timeline from './components/layout/Timeline'
import CodeEditorModal from './components/modals/CodeEditorModal'
import PreviewModal from './components/modals/PreviewModal'
import ExportModal from './components/modals/ExportModal'
import UserGuideModal from './components/modals/UserGuideModal'
import SubtitleModal from './subtitle/SubtitleModal'
import { PythonSandboxModal } from './pythonSandbox'

const AUTO_SAVE_DELAY = 2500

// ── Error boundary ─────────────────────────────────────────────────────────────
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught render error:', error, info.componentStack)
  }
  render() {
    if (this.state.error) {
      return (
        <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#0f0f0f] gap-4">
          <p className="text-red-400 text-sm font-medium">Something went wrong</p>
          <p className="text-[#888] text-xs max-w-sm text-center">{(this.state.error as Error).message}</p>
          <button
            onClick={() => this.setState({ error: null })}
            className="px-4 py-2 bg-editor-accent text-white text-xs rounded hover:bg-editor-accent-hover transition-colors"
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  const {
    project, isDirty, markClean, loadProject,
    codeModalOpen, previewOpen, exportOpen, userGuideOpen, subtitleOpen, pythonSandboxOpen
  } = useEditorStore()

  const [ready, setReady] = useState(false)
  const [optionsWidth, setOptionsWidth] = useState(256)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isDragging = useRef(false)

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current) return
      const newWidth = window.innerWidth - ev.clientX - 10
      setOptionsWidth(Math.min(480, Math.max(180, newWidth)))
    }

    const onMouseUp = () => {
      isDragging.current = false
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [])

  useEffect(() => {
    async function boot() {
      try {
        const list = await window.api.projects.list()
        if (list.length > 0) {
          const data = await window.api.projects.load(list[0].id)
          loadProject(data as ReturnType<typeof makeProject>)
        } else {
          const record = await window.api.projects.create('My Project')
          const proj   = makeProject(record.id, record.name)
          proj.width   = 1080
          proj.height  = 1920
          await window.api.projects.save(record.id, JSON.stringify(proj))
          loadProject(proj)
        }
      } catch (err) {
        console.warn('Project IPC unavailable, using in-memory project', err)
        const proj  = makeProject('default', 'My Project')
        proj.width  = 1080
        proj.height = 1920
        loadProject(proj)
      }
      setReady(true)
    }
    boot()
  }, [])

  const doSave = useCallback(async () => {
    if (!project || project.id === 'default') return
    try {
      await window.api.projects.save(project.id, JSON.stringify(project))
      markClean()
    } catch (e) {
      console.error('Auto-save failed', e)
    }
  }, [project, markClean])

  useEffect(() => {
    if (!isDirty || !project) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(doSave, AUTO_SAVE_DELAY)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [isDirty, project, doSave])

  if (!ready) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-black">
        <div className="flex flex-col items-center gap-3">
          <div className="w-5 h-5 border-2 border-editor-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-[#f2f2f2]">Loading project…</span>
        </div>
      </div>
    )
  }

  return (
    <ErrorBoundary>
      <div className="h-screen w-screen flex flex-col bg-black overflow-hidden gap-1.5">
        <Header />

        {/* Main layout: MenuSideBar + Canvas + OptionsSidebar + AISidebar */}
        <div className="flex flex-1 min-h-0 overflow-hidden gap-1.5 px-2">
          {/* MenuSideBar on the left */}
          <div className="flex-none border border-editor-border bg-[#171717] rounded-lg overflow-hidden shadow-[0_1px_6px_rgba(0,0,0,0.4)]">
            <MenuSideBar />
          </div>

          {/* Canvas in the middle */}
          <EditorCanvas />

          {/* Drag handle for OptionsSidebar */}
          <div
            className="flex-none w-0.5 cursor-ew-resize hover:bg-editor-accent/40 transition-colors rounded"
            onMouseDown={handleDragStart}
          />

          {/* OptionsSidebar on the right */}
          <div
            className="flex-none border border-editor-border bg-[#171717] rounded-lg overflow-hidden shadow-[0_1px_6px_rgba(0,0,0,0.4)]"
            style={{ width: optionsWidth }}
          >
            <OptionsSidebar />
          </div>

          {/* AI assistant sidebar — rightmost (placeholder) */}
          <div className="flex-none border border-editor-border bg-[#171717] rounded-lg overflow-hidden shadow-[0_1px_6px_rgba(0,0,0,0.4)]">
            <AISidebar />
          </div>
        </div>

        {/* Timeline at the bottom */}
        <div className="mx-2 mb-2 flex-none border border-editor-border rounded-lg overflow-hidden shadow-[0_-1px_6px_rgba(0,0,0,0.4)]">
          <Timeline />
        </div>

        {codeModalOpen && <CodeEditorModal />}
        {previewOpen   && <PreviewModal />}
        {exportOpen    && <ExportModal />}
        {userGuideOpen && <UserGuideModal />}
        {subtitleOpen  && <SubtitleModal />}
        {pythonSandboxOpen && <PythonSandboxModal />}
      </div>
    </ErrorBoundary>
  )
}
