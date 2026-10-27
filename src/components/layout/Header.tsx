import { useState } from 'react'
import { Minus, Square, ChevronDown, X, BriefcaseBusiness, NotebookPen, Settings } from 'lucide-react'
import luffyLogo from '/images/luffy_create_logo.webp'
import { useEditorStore } from '../../store/editorStore'
import { cn } from '../../utils/cn'
import ProjectsArchiveModal from '../modals/ProjectsArchiveModal'
import PlannerModal from '../modals/PlannerModal'
import SettingsModal from '../modals/SettingsModal'
import { useShallow } from 'zustand/react/shallow'

export default function Header() {
  const { project, isDirty } = useEditorStore(useShallow(s => ({ project: s.project, isDirty: s.isDirty })))
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [plannerOpen, setPlannerOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const minimize = () => window.api.win.minimize()
  const maximize = () => window.api.win.maximize()
  const close    = () => window.api.win.close()

  return (
    <>
      <header className="drag flex items-center justify-between h-8 bg-[#050505] px-3 flex-none relative z-50">
        <div className="nodrag flex items-center gap-2">
          <img src={luffyLogo} alt="Luffy" className="w-7 h-7 rounded-sm flex-none object-cover" />
          <span className="text-xs font-semibold text-white tracking-wide">Luffy Create</span>

          <button
            onClick={() => setArchiveOpen(true)}
            className={cn(
              'flex items-center gap-1.5 text-[13px] px-3 py-0.5 border-b max-w-[200px]',
              archiveOpen
                ? 'bg-editor-accent-dim text-editor-accent'
                : 'text-editor-text-secondary hover:text-editor-text rounded hover:bg-editor-hover border-gray-500',
            )}
          >
            <BriefcaseBusiness size={12} className="flex-none" />
            <span className="truncate">{project?.name ?? 'No project'}</span>
            {isDirty && <span className="text-editor-accent">•</span>}
            <ChevronDown size={11} className="flex-none" />
          </button>

          {/* The Planner belongs to the app, like the project switcher next to it: the same notes in every project. */}
          <button
            onClick={() => setPlannerOpen(true)}
            title="ContentPlanner - Write your ideas and notes, at a central place"
            className={cn(
              'flex items-center gap-1.5 text-[13px] px-2.5 py-0.5 rounded',
              plannerOpen ? 'bg-editor-accent-dim text-editor-accent' : 'text-editor-text-secondary hover:text-editor-text hover:bg-editor-hover',
            )}
          >
            <NotebookPen size={14} className="flex-none" />
            <span>Planner</span>
          </button>
        </div>

        <div className="nodrag flex items-center">
          <button onClick={() => setSettingsOpen(true)} title="Settings: Luffy Create"
            className={cn('flex items-center justify-center w-8 h-8 transition-colors', settingsOpen ? 'text-editor-accent' : 'text-editor-text-secondary hover:text-editor-text hover:bg-editor-hover')}>
            <Settings size={15} />
          </button>
          <button onClick={minimize} className="flex items-center justify-center w-8 h-8 text-[#2cff00] hover:text-editor-text hover:bg-editor-hover transition-colors">
            <Minus size={12} />
          </button>
          <button onClick={maximize} className="flex items-center justify-center w-8 h-8 text-[#ffbb52] hover:text-editor-text hover:bg-editor-hover transition-colors">
            <Square size={11} />
          </button>
          <button onClick={close} className="flex items-center justify-center w-9 h-9 text-[#ff483b] hover:text-white hover:bg-red-600 transition-colors">
            <X size={13} />
          </button>
        </div>
      </header>

      {archiveOpen && <ProjectsArchiveModal onClose={() => setArchiveOpen(false)} />}
      {plannerOpen && <PlannerModal onClose={() => setPlannerOpen(false)} />}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </>
  )
}
