import { Grid3x3, Eye, EyeOff, Eraser } from 'lucide-react'
import { useCanvasStore } from '../../store/canvasStore'
import { useEditorStore } from '../../store/editorStore'
import Tooltip from '../ui/Tooltip'
import { cn } from '../../utils/cn'
import { useShallow } from 'zustand/react/shallow'

export default function CanvasToolbar() {
  const {
    showGrid, setShowGrid,
    showSafeArea, setShowSafeArea,
  } = useCanvasStore()
  const { currentSceneId, clearSceneAnimations, project } = useEditorStore(useShallow(s => ({ currentSceneId: s.currentSceneId, clearSceneAnimations: s.clearSceneAnimations, project: s.project })))

  const sceneHasAnim = !!project?.scenes
    .find(s => s.id === currentSceneId)
    ?.elements.some(e => e.animations.length > 0)

  return (
    <div className="absolute top-2 right-2 bg-editor-panel border border-editor-border rounded-lg shadow-lg flex items-center gap-1 p-1 z-10">
      {/* Grid toggle */}
      <Tooltip text="Toggle Grid (Ctrl+')">
        <button
          onClick={() => setShowGrid(!showGrid)}
          className={cn(
            'p-1.5 rounded transition-colors',
            showGrid
              ? 'bg-red text-white'
              : 'text-[#f2f2f2] hover:text-editor-text hover:bg-editor-hover'
          )}
        >
          <Grid3x3 size={14} />
        </button>
      </Tooltip>

      {/* Safe area toggle */}
      <Tooltip text="Toggle Safe Area">
        <button
          onClick={() => setShowSafeArea(!showSafeArea)}
          className={cn(
            'p-1.5 rounded transition-colors',
            showSafeArea
              ? 'bg-editor-accent text-white'
              : 'text-[#f2f2f2] hover:text-editor-text hover:bg-editor-hover'
          )}
        >
          {showSafeArea ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>
      </Tooltip>

      {/* Remove all animations from the current slide */}
      <Tooltip text="Clear all animations on this slide">
        <button
          onClick={() => { if (currentSceneId && sceneHasAnim) clearSceneAnimations(currentSceneId) }}
          disabled={!sceneHasAnim}
          className={cn(
            'p-1.5 rounded transition-colors',
            sceneHasAnim
              ? 'text-[#f2f2f2] hover:text-white hover:bg-red-600'
              : 'text-[#555] cursor-not-allowed'
          )}
        >
          <Eraser size={14} />
        </button>
      </Tooltip>
    </div>
  )
}
