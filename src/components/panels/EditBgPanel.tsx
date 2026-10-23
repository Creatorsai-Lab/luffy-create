import { useState } from 'react'
import { Droplets, Eraser, Film, ImageIcon, Loader2, Palette, RotateCcw, ScanFace } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useEditorStore } from '../../store/editorStore'
import type { ImageElement, MediaKeying, VideoElement } from '../../types/editor'
import { KEYING_DEFAULTS } from '../../utils/keying'
import { cn } from '../../utils/cn'
import { PanelHeader } from './TextPanel'
import { AllPartsToggle, applyKeying, greenScreenFor, KeyingSettings, useAllParts } from './KeyingControl'

type Media = VideoElement | ImageElement
type Action = 'remove' | 'blur' | 'color' | 'chroma' | 'restore'

const ACTIONS: Array<{ id: Action; label: string; hint: string; icon: React.ReactNode }> = [
  { id: 'remove', label: 'Remove background', hint: 'Keep the person, remove the rest (AI, on this computer)', icon: <ScanFace size={14} /> },
  { id: 'blur', label: 'Blur background', hint: 'Keep the person sharp and blur the room — portrait look', icon: <Droplets size={14} /> },
  { id: 'color', label: 'Colour background', hint: 'Keep the person on a solid colour', icon: <Palette size={14} /> },
  { id: 'chroma', label: 'Green screen', hint: 'Remove a green or blue screen colour', icon: <Eraser size={14} /> },
  { id: 'restore', label: 'Original', hint: 'Show the clip as it was', icon: <RotateCcw size={14} /> },
]

function activeAction(keying: MediaKeying | undefined): Action {
  if (!keying) return 'restore'
  if (keying.mode === 'chroma') return 'chroma'
  return keying.background === 'blur' ? 'blur' : keying.background === 'color' ? 'color' : 'remove'
}

/**
 * Edit BG (left menu): remove, blur or replace the background of a video or
 * image in one click, then fine-tune. Works on the selected clip; with nothing
 * selected it lists the scene's videos and images.
 */
export default function EditBgPanel() {
  const { project, currentSceneId, selectedIds } = useEditorStore(useShallow(s => ({ project: s.project, currentSceneId: s.currentSceneId, selectedIds: s.selectedIds })))
  const scene = project?.scenes.find(sc => sc.id === currentSceneId)
  const media = (scene?.elements.filter(el => el.type === 'video' || el.type === 'image') ?? []) as Media[]
  const element = media.find(el => selectedIds.includes(el.id))
  const [allParts, setAllParts] = useAllParts()
  const [busy, setBusy] = useState(false)

  const run = async (action: Action) => {
    if (!element || busy) return
    const keying = element.keying
    const person = (background: 'none' | 'blur' | 'color'): MediaKeying => ({
      mode: 'person',
      feather: keying?.mode === 'person' ? keying.feather ?? KEYING_DEFAULTS.feather : KEYING_DEFAULTS.feather,
      background,
      ...(background === 'blur' && { backgroundBlur: keying?.backgroundBlur ?? KEYING_DEFAULTS.backgroundBlur }),
      ...(background === 'color' && { backgroundColor: keying?.backgroundColor ?? KEYING_DEFAULTS.backgroundColor }),
    })
    setBusy(true)
    try {
      if (action === 'restore') applyKeying(element, undefined, allParts)
      else if (action === 'chroma') applyKeying(element, await greenScreenFor(element), allParts)
      else applyKeying(element, person(action === 'remove' ? 'none' : action), allParts)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PanelHeader icon={<Eraser size={12} />} title="Edit BG" />
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {!element ? (
          <div className="flex flex-col gap-2">
            <p className="text-[11px] leading-relaxed text-editor-text-secondary">
              Remove or blur the background of a video or image. Pick one on this scene:
            </p>
            {media.length ? media.map(el => (
              <button key={el.id} type="button" onClick={() => useEditorStore.getState().selectElement(el.id, false)}
                className="flex items-center gap-2 rounded border border-editor-border bg-editor-elevated-highlight px-2 py-1.5 text-left text-[11px] text-editor-text hover:border-editor-accent">
                {el.type === 'video' ? <Film size={12} className="flex-none text-sky-300" /> : <ImageIcon size={12} className="flex-none text-emerald-300" />}
                <span className="truncate">{el.name}</span>
                {el.keying && <span className="ml-auto text-[10px] text-sky-300">{el.keying.mode === 'chroma' ? 'Green screen' : 'Cut-out'}</span>}
              </button>
            )) : (
              <p className="text-[11px] text-amber-300">There is no video or image on this scene. Add one from Video or Images.</p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-[11px] text-editor-text">
              {element.type === 'video' ? <Film size={12} className="text-sky-300" /> : <ImageIcon size={12} className="text-emerald-300" />}
              <span className="truncate font-medium">{element.name}</span>
              {busy && <Loader2 size={12} className="ml-auto animate-spin text-editor-text-secondary" />}
            </div>
            <AllPartsToggle element={element} allParts={allParts} setAllParts={setAllParts} />
            <div className="grid grid-cols-2 gap-1.5">
              {ACTIONS.map(a => {
                const active = activeAction(element.keying) === a.id
                return (
                  <button key={a.id} type="button" title={a.hint} onClick={() => run(a.id)}
                    className={cn('flex items-center gap-1.5 rounded border px-2 py-2 text-left text-[11px]',
                      a.id === 'restore' && 'col-span-2 justify-center',
                      active ? 'border-editor-accent bg-editor-accent/20 text-editor-text' : 'border-editor-border bg-editor-elevated-highlight text-editor-text-secondary hover:text-editor-text hover:border-editor-accent')}>
                    {a.icon}{a.label}
                  </button>
                )
              })}
            </div>
            {element.keying && (
              <div className="border-t border-editor-border pt-2">
                <span className="mb-1.5 block text-[10px] uppercase tracking-wide text-editor-text-secondary">Fine-tune</span>
                <KeyingSettings element={element} allParts={allParts} showModes={false} />
              </div>
            )}
            <p className="text-[10px] leading-relaxed text-editor-text-secondary">
              The AI cut-out runs on this computer; edges follow the person but are not pixel-perfect. Whatever is behind the clip shows through — use Put behind for an image or video.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
