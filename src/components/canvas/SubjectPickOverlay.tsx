import { useEffect } from 'react'
import type Konva from 'konva'
import { usePickMode } from '../../engine/cutout/pickMode'
import { videoRegistry } from '../../engine/videoRegistry'
import { useEditorStore } from '../../store/editorStore'
import type { ImageElement, VideoElement } from '../../types/editor'
import { addKeyingPick } from '../panels/KeyingControl'
import { toast } from '../ui/Toast'

/**
 * While picking a subject for the AI cut-out: a click on the canvas becomes a
 * keep/remove point on the clip's picture (instead of selecting or dragging).
 * Esc or Done ends picking.
 */
export default function SubjectPickOverlay({ getStage }: { getStage: () => Konva.Stage | null }) {
  const mode = usePickMode(s => s.mode)
  const setMode = usePickMode(s => s.setMode)
  const stage = getStage()

  useEffect(() => {
    if (!mode) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setMode(null) } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [mode, setMode])

  if (!mode || !stage) return null

  const click = (e: React.MouseEvent<HTMLDivElement>) => {
    const project = useEditorStore.getState().project
    const el = project?.scenes.flatMap(s => s.elements).find(x => x.id === mode.elementId) as VideoElement | ImageElement | undefined
    const node = stage.findOne(`#${mode.elementId}`)
    if (!el || !node) { setMode(null); return }
    const box = stage.container().getBoundingClientRect()
    const local = node.getAbsoluteTransform().copy().invert().point({ x: e.clientX - box.left, y: e.clientY - box.top })
    if (local.x < 0 || local.y < 0 || local.x > el.width || local.y > el.height) {
      toast.info(`Click on ${el.name} itself.`)
      return
    }
    // The point on the source picture: the clip shows its crop of the picture, stretched to its box.
    const crop = el.crop ?? { x: 0, y: 0, w: 1, h: 1 }
    const x = crop.x + (local.x / el.width) * crop.w
    const y = crop.y + (local.y / el.height) * crop.h
    const t = el.type === 'video' ? videoRegistry.get(el.id)?.currentTime : undefined
    addKeyingPick(el, { x, y, keep: mode.keep, ...(t != null && { t }) }, mode.allParts)
  }

  return (
    <div onClick={click} style={{ position: 'absolute', inset: 0, cursor: 'crosshair', zIndex: 20 }}>
      <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', pointerEvents: 'auto' }}
        className="flex items-center gap-2 rounded-full border border-editor-border bg-black/75 px-3 py-1 text-[11px] text-white shadow-lg"
        onClick={e => e.stopPropagation()}>
        <span className={mode.keep ? 'text-emerald-300' : 'text-rose-300'}>{mode.keep ? 'Click who or what to keep' : 'Click who or what to remove'}</span>
        <button type="button" onClick={() => setMode(null)} className="rounded-full bg-editor-accent px-2 py-0.5 text-white hover:bg-editor-accent-hover">Done (Esc)</button>
      </div>
    </div>
  )
}
