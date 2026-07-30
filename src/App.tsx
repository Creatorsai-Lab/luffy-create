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
const OPTIONS_MIN_WIDTH = 220
const OPTIONS_MAX_WIDTH = 380
const AI_MIN_WIDTH = 320
const AI_MAX_WIDTH = 480

function clampPanelWidth(width: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(width)))
}

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
  const [optionsWidth, setOptionsWidth] = useState(280)
  const [aiWidth, setAiWidth] = useState(380)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const startPanelResize = useCallback((
    e: React.MouseEvent,
    currentWidth: number,
    setWidth: (width: number) => void,
    minWidth: number,
    maxWidth: number,
  ) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX

    const onMouseMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX
      setWidth(clampPanelWidth(currentWidth + delta, minWidth, maxWidth))
    }

    const onMouseUp = () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    document.body.style.cursor = 'ew-resize'
    document.body.style.userSelect = 'none'
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
        <div className="flex flex-1 min-h-0 overflow-hidden gap-1.5 px-1">
          {/* MenuSideBar on the left */}
          <div className="flex-none border border-editor-border bg-[#171717] rounded-lg overflow-hidden shadow-[0_1px_6px_rgba(0,0,0,0.4)]">
            <MenuSideBar />
            
          </div>

          {/* Canvas in the middle */}
          <EditorCanvas />

          {/* OptionsSidebar on the right */}
          <div
            className="relative flex-none border border-editor-border bg-[#171717] rounded-lg overflow-hidden shadow-[0_1px_6px_rgba(0,0,0,0.4)]"
            style={{ width: optionsWidth }}
          >
            <div
              onMouseDown={e => startPanelResize(e, optionsWidth, setOptionsWidth, OPTIONS_MIN_WIDTH, OPTIONS_MAX_WIDTH)}
              className="mx-0.1 absolute left-0 top-1/2 z-30 flex h-18 w-3 -translate-y-1/2 cursor-ew-resize items-center justify-center group"
              title="Drag to resize properties panel"
            >
              <div className="h-16 w-1 rounded-full bg-editor-border group-hover:bg-editor-accent transition-colors" />
            </div>
            <OptionsSidebar />
          </div>

          {/* AI assistant sidebar — rightmost */}
          <div
            className="relative flex-none border border-editor-border bg-[#171717] rounded-lg overflow-hidden shadow-[0_1px_6px_rgba(0,0,0,0.4)]"
            style={{ width: aiWidth }}
          >
            <div
              onMouseDown={e => startPanelResize(e, aiWidth, setAiWidth, AI_MIN_WIDTH, AI_MAX_WIDTH)}
              className="absolute left-0 top-1/2 z-30 flex h-18 w-3 -translate-y-1/2 cursor-ew-resize items-center justify-center group"
              title="Drag to resize AI panel"
            >
              <div className="h-16 w-1 rounded-full bg-editor-border group-hover:bg-editor-accent transition-colors" />
            </div>
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
