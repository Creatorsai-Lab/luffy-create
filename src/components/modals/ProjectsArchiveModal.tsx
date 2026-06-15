import { useEffect, useState } from 'react'
import { X, Plus, Trash2, Check, BriefcaseBusiness, Clock } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import { makeProject } from '../../utils/defaults'
import type { ProjectRecord } from '../../types/global'
import { cn } from '../../utils/cn'

interface Props {
  onClose: () => void
}

function fmtDate(ts: number) {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function ProjectsArchiveModal({ onClose }: Props) {
  const { project, isDirty, loadProject, closeProject } = useEditorStore()
  const [projects, setProjects] = useState<ProjectRecord[]>([])
  const [creating, setCreating] = useState(false)
  const [loadingId, setLoadingId] = useState<string | null>(null)

  useEffect(() => {
    window.api.projects.list().then(setProjects)
  }, [])

  async function refreshList() {
    setProjects(await window.api.projects.list())
  }

  async function saveCurrentIfNeeded() {
    const state = useEditorStore.getState()
    if (!state.project || !state.isDirty || state.project.id === 'default') return
    try {
      await window.api.projects.save(state.project.id, JSON.stringify(state.project))
      state.markClean()
    } catch (e) {
      console.error('Failed to save before switch', e)
    }
  }

  async function createProject() {
    if (creating) return
    setCreating(true)
    try {
      await saveCurrentIfNeeded()
      const record = await window.api.projects.create(`Project ${projects.length + 1}`)
      const proj = makeProject(record.id, record.name)
      proj.width = 1080
      proj.height = 1920
      await window.api.projects.save(record.id, JSON.stringify(proj))
      loadProject(proj)
      await refreshList()
      onClose()
    } finally {
      setCreating(false)
    }
  }

  async function openProject(id: string) {
    if (project?.id === id) { onClose(); return }
    setLoadingId(id)
    try {
      await saveCurrentIfNeeded()
      const data = await window.api.projects.load(id)
      loadProject(data as ReturnType<typeof makeProject>)
      await refreshList()
      onClose()
    } catch (e) {
      console.error('Failed to load project', e)
    } finally {
      setLoadingId(null)
    }
  }

  async function deleteProject(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    if (!confirm('Delete this project permanently?')) return
    await window.api.projects.delete(id)
    if (project?.id === id) closeProject()
    await refreshList()
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        className="bg-[#171717] border border-editor-border rounded-xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: '70vw', height: '70vh', maxWidth: 960 }}
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-editor-border flex-none">
          <div className="flex items-center gap-2">
            <BriefcaseBusiness size={18} className="text-editor-accent" />
            <h2 className="text-sm font-semibold text-editor-text">Project Archive</h2>
          </div>
          <button
            onClick={onClose}
            className="text-editor-secondary hover:text-editor-text transition-colors p-1"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-editor-border flex-none">
          <button
            onClick={createProject}
            disabled={creating}
            className="flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg bg-editor-accent text-white hover:bg-editor-accent-hover transition-colors disabled:opacity-50"
          >
            <Plus size={14} />
            {creating ? 'Creating…' : 'New Project'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2">
          {projects.length === 0 && (
            <p className="text-sm text-editor-secondary text-center py-12">No saved projects yet.</p>
          )}
          <div className="flex flex-col gap-1">
            {projects.map(p => {
              const isActive = project?.id === p.id
              const isLoading = loadingId === p.id
              return (
                <div
                  key={p.id}
                  onClick={() => !isLoading && openProject(p.id)}
                  className={cn(
                    'group flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-colors',
                    isActive
                      ? 'bg-editor-accent-dim border border-editor-accent/40'
                      : 'hover:bg-editor-elevated border border-transparent',
                    isLoading && 'opacity-60 pointer-events-none',
                  )}
                >
                  <div className={cn(
                    'flex-none w-8 h-8 rounded-lg flex items-center justify-center',
                    isActive ? 'bg-editor-accent text-white' : 'bg-editor-elevated text-editor-secondary',
                  )}>
                    {isActive ? <Check size={14} /> : <BriefcaseBusiness size={14} />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      'text-sm font-medium truncate',
                      isActive ? 'text-editor-accent' : 'text-editor-text',
                    )}>
                      {p.name}
                      {isActive && isDirty && <span className="text-editor-accent ml-1">•</span>}
                    </p>
                    <p className="text-[11px] text-editor-secondary flex items-center gap-1 mt-0.5">
                      <Clock size={10} className="flex-none" />
                      Last updated {fmtDate(p.updatedAt)}
                    </p>
                  </div>

                  <button
                    onClick={e => deleteProject(e, p.id)}
                    className="flex-none p-2 rounded-lg text-editor-secondary opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-red-950/30 transition-all"
                    title="Delete project"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
