import { Sparkles } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import type { ImageElement, MediaEffectClip, VideoElement } from '../../types/editor'
import { getMediaEffectClips } from '../../engine/mediaEffects'
import { makeMediaEffectClip } from '../../utils/defaults'
import MediaEffectCard from './MediaEffectCard'
import { PanelHeader, Row } from './TextPanel'

type MediaElement = ImageElement | VideoElement

const EFFECTS: { label: string; value: MediaEffectClip['type']; description: string }[] = [
  { label: 'Subtle Hover', value: 'subtleHover', description: 'Smooth floating camera motion' },
  { label: 'Wiggle', value: 'wiggle', description: 'Small elastic rotation and drift' },
  { label: 'Doodle Drift', value: 'doodleDrift', description: 'Handmade living motion' },
  { label: 'Shake', value: 'shake', description: 'Impact camera shake' },
  { label: 'Vibration Distort', value: 'vibrationDistort', description: 'Fast sliced distortion' },
  { label: 'God Rays', value: 'godRays', description: 'Animated directional light beams' },
  { label: 'Light Sweep', value: 'lightSweep', description: 'Glossy moving light pass' },
  { label: 'Light Flicker', value: 'lightFlicker', description: 'Irregular wide thunder-light flashes' },
  { label: 'Glitch', value: 'glitch', description: 'Digital slice and color-channel glitch' },
  { label: 'Rain', value: 'rain', description: 'Animated transparent rain streaks' },
  { label: 'Snow', value: 'snow', description: 'Animated falling snow particles' },
]

export default function MediaEffectsPanel() {
  const { getCurrentScene, getSelectedEls, updateElement } = useEditorStore()
  const el = getSelectedEls().find(item => item.type === 'image' || item.type === 'video') as MediaElement | undefined
  const sceneDuration = Math.max(0, getCurrentScene()?.duration ?? 5)

  if (!el) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <PanelHeader icon={<Sparkles size={12} />} title="Effects" />
        <p className="px-3 py-3 text-xs text-[#f2f2f2]">
          Select an image or video element to add dynamic media effects.
        </p>
      </div>
    )
  }

  const clips = getMediaEffectClips(el).map(clip => fitToScene(clip, sceneDuration))
  const used = new Set(clips.map(clip => clip.type))

  function save(next: MediaEffectClip[]) {
    const shared = { mediaEffects: next, mediaEffect: 'none' as const }
    updateElement(el!.id, el!.type === 'video' ? { ...shared, videoEffect: 'none' } : shared)
  }

  function add(type: MediaEffectClip['type']) {
    if (!used.has(type)) save([...clips, makeMediaEffectClip(type, sceneDuration)])
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PanelHeader icon={<Sparkles size={12} />} title="Effects" />

      <div className="flex-1 overflow-y-auto px-3 py-2">
        <Row label="Selected">
          <div className="truncate rounded border border-editor-border bg-editor-elevated px-2 py-1.5 text-xs text-editor-text">
            {el.type === 'image' ? 'Image' : 'Video'} - {el.name}
          </div>
        </Row>

        <Row label="Add Effect">
          <select
            value=""
            onChange={event => add(event.target.value as MediaEffectClip['type'])}
            className="w-full rounded border border-editor-border bg-editor-elevated px-2 py-1 text-xs text-editor-text"
          >
            <option value="" disabled>Select an effect…</option>
            {EFFECTS.map(effect => (
              <option key={effect.value} value={effect.value} disabled={used.has(effect.value)}>
                {effect.label}{used.has(effect.value) ? ' (Added)' : ''}
              </option>
            ))}
          </select>
        </Row>

        {clips.length === 0 ? (
          <p className="rounded border border-dashed border-editor-border px-2 py-3 text-center text-[11px] text-editor-secondary">
            Add an effect to begin.
          </p>
        ) : (
          <div className="flex flex-col gap-2 pt-1">
            {clips.map((clip, index) => {
              const effect = EFFECTS.find(item => item.value === clip.type)!
              return (
                <MediaEffectCard
                  key={clip.type}
                  clip={clip}
                  label={effect.label}
                  description={effect.description}
                  sceneDuration={sceneDuration}
                  onChange={next => save(clips.map((item, itemIndex) => itemIndex === index ? next : item))}
                  onRemove={() => save(clips.filter((_, itemIndex) => itemIndex !== index))}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function fitToScene(clip: MediaEffectClip, duration: number): MediaEffectClip {
  const startAt = Math.min(duration, clip.startAt)
  const endAt = Math.max(startAt, Math.min(duration, Number.isFinite(clip.endAt) ? clip.endAt : duration))
  return { ...clip, startAt, endAt }
}
