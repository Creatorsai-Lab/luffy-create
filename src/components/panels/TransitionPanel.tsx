import { Shuffle } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import type { SlideDir } from '../../types/editor'
import { PanelHeader, Row, Slider } from './TextPanel'
import { cn } from '../../utils/cn'
import { TRANSITIONS, getTransitionCapabilities } from '../../utils/transitions'

export default function TransitionPanel() {
  const { project, currentSceneId, setTransition } = useEditorStore()
  const scene = project?.scenes.find(s => s.id === currentSceneId)

  if (!scene || !project) return null

  const sceneIndex = project.scenes.findIndex(s => s.id === scene.id)
  const tr = scene.transition
  const capabilities = getTransitionCapabilities(tr.type)
  const activeDef = TRANSITIONS.find(t => t.value === tr.type)

  return (
    <div className="flex flex-col overflow-y-auto flex-1">
      <PanelHeader icon={<Shuffle size={12} />} title="Scene Transition" />

      <div className="flex flex-col px-3 py-2 gap-2">
        {/* Which scene this applies to */}
        <div className="flex items-center gap-2 bg-editor-elevated rounded px-2.5 py-2 border border-editor-border">
          <span
            className="w-3 h-3 rounded-sm flex-none"
            style={{ background: activeDef?.color ?? '#6b7280' }}
          />
          <div className="flex flex-col leading-tight">
            <span className="text-xs text-editor-text font-medium">
              Scene {sceneIndex + 1}: {scene.name}
            </span>
            <span className="text-[10px] text-editor-secondary">
              Plays at the <strong>start</strong> of this scene
            </span>
          </div>
        </div>

        {/* Transition type grid — each chip carries its fixed color */}
        <div className="grid grid-cols-2 gap-1.5">
          {TRANSITIONS.map(t => {
            const active = tr.type === t.value
            return (
              <button
                key={t.value}
                onClick={() => setTransition(scene.id, { ...tr, type: t.value })}
                title={t.desc}
                className={cn(
                  'flex items-center gap-2 text-xs px-2.5 py-2 rounded border transition-colors text-left',
                  active
                    ? 'border-editor-accent text-editor-text'
                    : 'bg-editor-elevated border-editor-border text-[#c1c1c1] hover:text-editor-text hover:border-editor-border-strong'
                )}
                style={active ? { background: t.color + '22', borderColor: t.color } : undefined}
              >
                <span className="w-2.5 h-2.5 rounded-full flex-none" style={{ background: t.color }} />
                {t.label}
              </button>
            )
          })}
        </div>

        {tr.type !== 'none' && (
          <>
            <Row label="Duration">
              <Slider value={tr.duration} min={0.1} max={2} step={0.1}
                onChange={v => setTransition(scene.id, { ...tr, duration: v })}
                display={`${tr.duration.toFixed(1)}s`} />
            </Row>

            {capabilities.direction && (
              <Row label="Direction">
                <select
                  value={tr.direction ?? 'right'}
                  onChange={e => setTransition(scene.id, { ...tr, direction: e.target.value as SlideDir })}
                  className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1"
                >
                  <option value="right">From Right →</option>
                  <option value="left">From Left ←</option>
                  <option value="down">From Bottom ↓</option>
                  <option value="up">From Top ↑</option>
                </select>
              </Row>
            )}

            {capabilities.style && (
              <>
                <Row label="Speed">
                  <Slider value={tr.speed ?? 1} min={0.25} max={3} step={0.05}
                    onChange={speed => setTransition(scene.id, { ...tr, speed })}
                    display={`${(tr.speed ?? 1).toFixed(2)}×`} />
                </Row>
                <Row label="Hardness">
                  <Slider value={tr.hardness ?? 50} min={0} max={100} step={1}
                    onChange={hardness => setTransition(scene.id, { ...tr, hardness })}
                    display={`${Math.round(tr.hardness ?? 50)}%`} />
                </Row>
              </>
            )}

            <p className="text-2xs text-[#c1c1c1] bg-editor-elevated rounded px-2 py-1.5">
              {activeDef?.desc}
            </p>
          </>
        )}

        {sceneIndex === 0 && (
          <p className="text-[10px] text-editor-secondary px-1">
            Note: the first scene has no preceding scene, so its transition only
            shows when it follows another scene during playback.
          </p>
        )}
      </div>
    </div>
  )
}
