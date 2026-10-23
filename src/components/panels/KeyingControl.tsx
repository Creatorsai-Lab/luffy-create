import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Eraser, Loader2, Pipette, Wand2 } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import { videoRegistry } from '../../engine/videoRegistry'
import { pauseKeying, personKeyingError, prepareKeying } from '../../engine/keying'
import type { ImageElement, MediaKeying, VideoElement } from '../../types/editor'
import { detectScreenColor, KEYING_DEFAULTS } from '../../utils/keying'
import { clipParts, putMediaBehind } from '../../utils/keyingBackground'
import { toFileUrl } from '../../utils/pathUtils'
import { cn } from '../../utils/cn'
import { Slider } from './TextPanel'
import { toast } from '../ui/Toast'

type Media = VideoElement | ImageElement
type Mode = 'off' | 'chroma' | 'person'

const MODES: Array<{ value: Mode; label: string; hint: string }> = [
  { value: 'off', label: 'Off', hint: 'Show the clip as it is' },
  { value: 'chroma', label: 'Green screen', hint: 'Remove a colour — green or blue screen' },
  { value: 'person', label: 'AI cut-out', hint: 'Keep the person, remove the rest — no green screen needed (on this computer)' },
]

type EyeDropperApi = new () => { open: () => Promise<{ sRGBHex: string }> }

const ALL_PARTS_KEY = 'luffy.keying.allParts'

/** Whether background changes go to every part of a clip that was cut into parts (remembered; on by default). */
export function useAllParts(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => {
    try { return localStorage.getItem(ALL_PARTS_KEY) !== 'false' } catch { return true }
  })
  const set = (next: boolean) => {
    setOn(next)
    try { localStorage.setItem(ALL_PARTS_KEY, String(next)) } catch { /* private window */ }
  }
  return [on, set]
}

/** Sets (or with undefined removes) the background removal of an element, or of every part of its clip. */
export function applyKeying(element: Media, keying: MediaKeying | undefined, allParts: boolean) {
  const { project, updateElement } = useEditorStore.getState()
  const ids = allParts && project ? clipParts(project, element).map(el => el.id) : [element.id]
  for (const id of ids) updateElement(id, { keying })
  if (keying?.mode === 'person') {
    prepareKeying([{ keying }]).catch(error => toast.error(error instanceof Error ? error.message : String(error)))
  }
}

/** The element's picture right now: the playing video frame, or the image file. */
async function currentPicture(el: Media): Promise<{ source: CanvasImageSource; width: number; height: number } | null> {
  if (el.type === 'video') {
    const video = videoRegistry.get(el.id)
    return video?.videoWidth ? { source: video, width: video.videoWidth, height: video.videoHeight } : null
  }
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.src = toFileUrl(el.src)
  try {
    await img.decode()
    return { source: img, width: img.naturalWidth, height: img.naturalHeight }
  } catch {
    return null
  }
}

/** The screen colour of the element's current picture, or null. */
export async function findScreenColor(el: Media): Promise<string | null> {
  const picture = await currentPicture(el)
  if (!picture) return null
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 36
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const crop = el.crop ?? { x: 0, y: 0, w: 1, h: 1 }
  try {
    ctx.drawImage(picture.source, crop.x * picture.width, crop.y * picture.height, crop.w * picture.width, crop.h * picture.height, 0, 0, 64, 36)
    return detectScreenColor(ctx.getImageData(0, 0, 64, 36).data, 64, 36)
  } catch {
    return null
  }
}

/** A green-screen keying with the colour found in the picture (or the usual green). */
export async function greenScreenFor(el: Media): Promise<MediaKeying> {
  const color = (await findScreenColor(el)) ?? el.keying?.color ?? KEYING_DEFAULTS.color
  return { mode: 'chroma', color, strength: KEYING_DEFAULTS.strength, softness: KEYING_DEFAULTS.softness, spill: KEYING_DEFAULTS.spill }
}

/** "All N parts of this clip" — shown when the clip was cut into parts. */
export function AllPartsToggle({ element, allParts, setAllParts }: { element: Media; allParts: boolean; setAllParts: (on: boolean) => void }) {
  const count = useEditorStore(s => (s.project ? clipParts(s.project, element).length : 1))
  if (count < 2) return null
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-editor-text-secondary" title="This clip was cut into parts (e.g. by jump cuts). Change the background of all of them, or only the selected part.">
      <input type="checkbox" checked={allParts} onChange={e => setAllParts(e.target.checked)} className="accent-[var(--color-editor-accent,#7c3aed)]" />
      All {count} parts of this clip
    </label>
  )
}

/**
 * The background settings of a video or image: mode, green-screen colour and
 * sliders, cut-out feather and background, and "put behind". `showModes`
 * hides the Off / Green screen / AI cut-out row (the Edit BG panel has its own).
 */
export function KeyingSettings({ element, allParts, showModes = true }: { element: Media; allParts: boolean; showModes?: boolean }) {
  const keying = element.keying
  const mode: Mode = keying?.mode ?? 'off'
  const [loading, setLoading] = useState(false)
  const assets = useEditorStore(s => s.project?.assets)
  const backgrounds = (assets ?? []).filter(a => a.type === 'image' || a.type === 'video')

  const set = (patch: Partial<MediaKeying> | null) => {
    applyKeying(element, patch === null ? undefined : { ...(keying ?? { mode: 'chroma' }), ...patch } as MediaKeying, allParts)
  }

  const chooseMode = async (value: Mode) => {
    if (value === mode) return
    if (value === 'off') return set(null)
    if (value === 'chroma') return applyKeying(element, await greenScreenFor(element), allParts)
    setLoading(true)
    applyKeying(element, { mode: 'person', feather: KEYING_DEFAULTS.feather, background: 'none' }, allParts)
    prepareKeying([{ keying: { mode: 'person' } }]).catch(() => {}).finally(() => setLoading(false))
  }

  const pick = async () => {
    const EyeDropper = (window as unknown as { EyeDropper?: EyeDropperApi }).EyeDropper
    if (!EyeDropper) {
      toast.info('Colour picking is not available here — use the colour box instead.')
      return
    }
    // Show the original picture while picking, so the screen colour can be clicked.
    pauseKeying(element.id, true)
    try {
      const { sRGBHex } = await new EyeDropper().open()
      set({ color: sRGBHex.toLowerCase() })
    } catch {
      // picking cancelled
    } finally {
      pauseKeying(element.id, false)
    }
  }

  const auto = async () => {
    const color = await findScreenColor(element)
    if (color) set({ color })
    else toast.info('No clear green or blue screen colour at the edges of the picture. Pick it instead.')
  }

  const addBehind = async (assetId: string) => {
    const asset = backgrounds.find(a => a.id === assetId)
    if (!asset) return
    const ids = await putMediaBehind(element, asset, allParts)
    if (ids.length) toast.success(`${asset.name} is now behind ${element.name}${ids.length > 1 ? ` (all ${ids.length} parts)` : ''}.`)
  }

  const error = mode === 'person' ? personKeyingError() : null

  return (
    <div className="flex flex-col gap-2">
      {showModes && (
        <div className="grid grid-cols-3 gap-1 rounded bg-editor-elevated-highlight p-0.5">
          {MODES.map(m => (
            <button key={m.value} type="button" title={m.hint} onClick={() => chooseMode(m.value)}
              className={cn('rounded py-1 text-[11px]', mode === m.value ? 'bg-editor-accent text-white' : 'text-editor-text-secondary hover:text-editor-text')}>
              {m.label}
            </button>
          ))}
        </div>
      )}

      {keying?.mode === 'chroma' && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <span className="w-16 text-[10px] text-editor-text-secondary">Key colour</span>
            <input type="color" value={keying.color ?? KEYING_DEFAULTS.color} onChange={e => set({ color: e.target.value })}
              className="h-6 w-8 cursor-pointer rounded border border-editor-border bg-transparent" />
            <button type="button" onClick={pick} title="Click the screen colour anywhere on the canvas"
              className="flex items-center gap-1 rounded border border-editor-border px-1.5 py-1 text-[11px] text-editor-text-secondary hover:text-editor-text">
              <Pipette size={11} /> Pick
            </button>
            <button type="button" onClick={auto} title="Find the screen colour from the picture's edges"
              className="flex items-center gap-1 rounded border border-editor-border px-1.5 py-1 text-[11px] text-editor-text-secondary hover:text-editor-text">
              <Wand2 size={11} /> Auto
            </button>
          </div>
          <Labeled label="Strength" hint="How much of the screen's shades are removed">
            <Slider value={pct(keying.strength, KEYING_DEFAULTS.strength)} min={0} max={100} step={1} display={`${pct(keying.strength, KEYING_DEFAULTS.strength)}%`} onChange={v => set({ strength: v / 100 })} />
          </Labeled>
          <Labeled label="Edge softness">
            <Slider value={pct(keying.softness, KEYING_DEFAULTS.softness)} min={0} max={100} step={1} display={`${pct(keying.softness, KEYING_DEFAULTS.softness)}%`} onChange={v => set({ softness: v / 100 })} />
          </Labeled>
          <Labeled label="Spill removal" hint="Takes the screen's colour cast off hair and edges">
            <Slider value={pct(keying.spill, KEYING_DEFAULTS.spill)} min={0} max={100} step={1} display={`${pct(keying.spill, KEYING_DEFAULTS.spill)}%`} onChange={v => set({ spill: v / 100 })} />
          </Labeled>
        </div>
      )}

      {keying?.mode === 'person' && (
        <div className="flex flex-col gap-1.5">
          {loading && (
            <div className="flex items-center gap-1.5 text-[11px] text-editor-text-secondary">
              <Loader2 size={12} className="animate-spin" /> Loading the cut-out model…
            </div>
          )}
          {error && <p className="text-[11px] text-amber-300">{error}</p>}
          <Labeled label="Edge feather">
            <Slider value={pct(keying.feather, KEYING_DEFAULTS.feather)} min={0} max={100} step={1} display={`${pct(keying.feather, KEYING_DEFAULTS.feather)}%`} onChange={v => set({ feather: v / 100 })} />
          </Labeled>
          {showModes && (
            <Labeled label="Background">
              <div className="grid grid-cols-3 gap-1 rounded bg-editor-elevated-highlight p-0.5">
                {(['none', 'blur', 'color'] as const).map(b => (
                  <button key={b} type="button" onClick={() => set({ background: b })}
                    title={b === 'none' ? 'See through to what is behind the clip' : b === 'blur' ? 'Keep the room, blurred (portrait look)' : 'A solid colour'}
                    className={cn('rounded py-1 text-[11px]', (keying.background ?? 'none') === b ? 'bg-editor-accent text-white' : 'text-editor-text-secondary hover:text-editor-text')}>
                    {b === 'none' ? 'Remove' : b === 'blur' ? 'Blur' : 'Colour'}
                  </button>
                ))}
              </div>
            </Labeled>
          )}
          {keying.background === 'blur' && (
            <Labeled label="Blur">
              <Slider value={pct(keying.backgroundBlur, KEYING_DEFAULTS.backgroundBlur)} min={0} max={100} step={1} display={`${pct(keying.backgroundBlur, KEYING_DEFAULTS.backgroundBlur)}%`} onChange={v => set({ backgroundBlur: v / 100 })} />
            </Labeled>
          )}
          {keying.background === 'color' && (
            <div className="flex items-center gap-1.5">
              <span className="w-16 text-[10px] text-editor-text-secondary">Colour</span>
              <input type="color" value={keying.backgroundColor ?? KEYING_DEFAULTS.backgroundColor} onChange={e => set({ backgroundColor: e.target.value })}
                className="h-6 w-8 cursor-pointer rounded border border-editor-border bg-transparent" />
            </div>
          )}
        </div>
      )}

      {mode !== 'off' && (keying?.mode === 'chroma' || (keying?.background ?? 'none') === 'none') && (
        <Labeled label="Put behind" hint="An image or video from the project, placed right behind this clip and filling its box">
          <select value="" onChange={e => { if (e.target.value) addBehind(e.target.value) }}
            className="w-full rounded border border-editor-border bg-editor-elevated-highlight px-2 py-1 text-xs text-editor-text">
            <option value="">{backgrounds.length ? 'Choose an image or video…' : 'Import an image or video first'}</option>
            {backgrounds.filter(a => a.path !== element.src).map(a => (
              <option key={a.id} value={a.id}>{a.type === 'video' ? '🎬' : '🖼'} {a.name}</option>
            ))}
          </select>
        </Labeled>
      )}
    </div>
  )
}

/** Green screen and AI background removal for a video or image (collapsible section of its panel). */
export default function KeyingControl({ element }: { element: Media }) {
  const mode: Mode = element.keying?.mode ?? 'off'
  const [open, setOpen] = useState(mode !== 'off')
  const [allParts, setAllParts] = useAllParts()

  useEffect(() => { if (mode !== 'off') setOpen(true) }, [mode])

  return (
    <div className="px-3 py-2 border-b border-editor-border flex flex-col gap-2">
      <button type="button" onClick={() => setOpen(o => !o)} className="flex items-center gap-2 text-left">
        <Eraser size={13} className="text-editor-accent flex-none" />
        <span className="text-xs font-medium text-editor-text">Remove background</span>
        {mode !== 'off' && <span className="text-2xs text-sky-300">{mode === 'chroma' ? 'Green screen' : 'AI cut-out'}</span>}
        <span className="ml-auto text-editor-text-secondary">{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</span>
      </button>
      {open && (
        <>
          <AllPartsToggle element={element} allParts={allParts} setAllParts={setAllParts} />
          <KeyingSettings element={element} allParts={allParts} />
        </>
      )}
    </div>
  )
}

function Labeled({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5" title={hint}>
      <span className="text-[10px] text-editor-text-secondary">{label}</span>
      {children}
    </div>
  )
}

function pct(value: number | undefined, fallback: number) {
  return Math.round((value ?? fallback) * 100)
}
