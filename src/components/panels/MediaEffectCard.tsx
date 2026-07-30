import { Trash2 } from 'lucide-react'
import type {
  MediaEffectAxis, MediaEffectClip, MediaEffectDirection, MediaEffectTarget,
} from '../../types/editor'
import { DEFAULT_MEDIA_EFFECT } from '../../utils/defaults'
import { cn } from '../../utils/cn'
import { ColorInput, NumberInput, Row, Slider } from './TextPanel'

const DIRECTIONS: { label: string; value: MediaEffectDirection }[] = [
  { label: 'Left', value: 'left' },
  { label: 'Right', value: 'right' },
  { label: 'Up', value: 'up' },
  { label: 'Down', value: 'down' },
  { label: 'Diagonal', value: 'diagonal' },
]

const TARGETS: { label: string; value: MediaEffectTarget }[] = [
  { label: 'Whole Media', value: 'wholeMedia' },
  { label: 'Center Subject', value: 'centerSubject' },
  { label: 'Manual Focus', value: 'manualFocus' },
]

interface Props {
  clip: MediaEffectClip
  label: string
  description: string
  sceneDuration: number
  onChange: (clip: MediaEffectClip) => void
  onRemove: () => void
}

export default function MediaEffectCard({
  clip, label, description, sceneDuration, onChange, onRemove,
}: Props) {
  const change = (patch: Partial<MediaEffectClip>) => onChange({ ...clip, ...patch })
  const percent = (value: number | undefined, fallback: number) => Math.round((value ?? fallback) * 100)
  const showDirection = clip.type === 'lightSweep' || clip.type === 'godRays' || clip.type === 'rain'
  const showColor = showDirection || clip.type === 'snow'
  const showSize = clip.type === 'lightSweep' || clip.type === 'glitch' || clip.type === 'rain' || clip.type === 'snow'
  const showTarget = clip.type === 'lightSweep' || clip.type === 'godRays' || clip.type === 'subtleHover'

  return (
    <section className="rounded border border-editor-border bg-editor-elevated/35 p-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-medium text-editor-text">{label}</div>
          <div className="text-[10px] leading-4 text-editor-secondary">{description}</div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="flex shrink-0 items-center gap-1 rounded border border-editor-border px-1.5 py-1 text-[10px] text-editor-secondary transition-colors hover:border-red-400/60 hover:text-red-400"
        >
          <Trash2 size={10} /> Remove
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Row label="Start At (s)">
          <NumberInput
            value={clip.startAt}
            min={0}
            max={clip.endAt}
            step={0.1}
            onChange={value => change({ startAt: clamp(value, 0, Math.min(clip.endAt, sceneDuration)) })}
          />
        </Row>
        <Row label="End At (s)">
          <NumberInput
            value={clip.endAt}
            min={clip.startAt}
            max={sceneDuration}
            step={0.1}
            onChange={value => change({ endAt: clamp(value, clip.startAt, sceneDuration) })}
          />
        </Row>
      </div>

      <EffectSlider
        label="Intensity"
        value={percent(clip.mediaEffectIntensity, DEFAULT_MEDIA_EFFECT.mediaEffectIntensity)}
        onChange={value => change({ mediaEffectIntensity: value / 100 })}
      />
      <Row label="Speed">
        <Slider
          value={clip.mediaEffectSpeed ?? DEFAULT_MEDIA_EFFECT.mediaEffectSpeed}
          min={0.1}
          max={5}
          step={0.1}
          onChange={value => change({ mediaEffectSpeed: value })}
          display={`${(clip.mediaEffectSpeed ?? DEFAULT_MEDIA_EFFECT.mediaEffectSpeed).toFixed(1)}x`}
        />
      </Row>
      <EffectSlider
        label="Hardness"
        value={percent(clip.mediaEffectHardness, DEFAULT_MEDIA_EFFECT.mediaEffectHardness)}
        onChange={value => change({ mediaEffectHardness: value / 100 })}
      />
      <EffectSlider
        label="Blend"
        value={percent(clip.mediaEffectBlend, DEFAULT_MEDIA_EFFECT.mediaEffectBlend)}
        onChange={value => change({ mediaEffectBlend: value / 100 })}
      />

      {clip.type === 'glitch' && (
        <Row label="Direction">
          <div className="grid grid-cols-2 gap-1">
            {(['horizontal', 'vertical'] as MediaEffectAxis[]).map(axis => (
              <ChoiceButton
                key={axis}
                active={(clip.mediaEffectAxis ?? DEFAULT_MEDIA_EFFECT.mediaEffectAxis) === axis}
                label={axis}
                onClick={() => change({ mediaEffectAxis: axis })}
              />
            ))}
          </div>
        </Row>
      )}

      {showDirection && (
        <Row label="Direction">
          <div className="grid grid-cols-3 gap-1">
            {DIRECTIONS.map(item => (
              <ChoiceButton
                key={item.value}
                active={(clip.mediaEffectDirection ?? DEFAULT_MEDIA_EFFECT.mediaEffectDirection) === item.value}
                label={item.label}
                onClick={() => change({ mediaEffectDirection: item.value })}
              />
            ))}
          </div>
        </Row>
      )}

      {showColor && (
        <>
          <Row label={clip.type === 'rain' || clip.type === 'snow' ? 'Effect Color' : 'Light Color'}>
            <ColorInput
              value={clip.mediaEffectColor ?? DEFAULT_MEDIA_EFFECT.mediaEffectColor}
              onChange={value => change({ mediaEffectColor: value })}
            />
          </Row>
          <EffectSlider
            label="Color Opacity"
            value={percent(clip.mediaEffectColorOpacity, DEFAULT_MEDIA_EFFECT.mediaEffectColorOpacity)}
            onChange={value => change({ mediaEffectColorOpacity: value / 100 })}
          />
        </>
      )}

      {showSize && (
        <EffectSlider
          label={clip.type === 'lightSweep' ? 'Light Width' : 'Size'}
          value={percent(clip.mediaEffectSize, DEFAULT_MEDIA_EFFECT.mediaEffectSize)}
          onChange={value => change({ mediaEffectSize: value / 100 })}
        />
      )}

      {showTarget && (
        <Row label="Target">
          <select
            value={clip.mediaEffectTarget ?? DEFAULT_MEDIA_EFFECT.mediaEffectTarget}
            onChange={event => change({ mediaEffectTarget: event.target.value as MediaEffectTarget })}
            className="w-full rounded border border-editor-border bg-editor-elevated px-2 py-1 text-xs text-editor-text"
          >
            {TARGETS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </Row>
      )}

      {showTarget && (clip.mediaEffectTarget ?? DEFAULT_MEDIA_EFFECT.mediaEffectTarget) === 'manualFocus' && (
        <>
          <EffectSlider
            label="Focus X"
            value={percent(clip.mediaEffectFocusX, DEFAULT_MEDIA_EFFECT.mediaEffectFocusX)}
            onChange={value => change({ mediaEffectFocusX: value / 100 })}
          />
          <EffectSlider
            label="Focus Y"
            value={percent(clip.mediaEffectFocusY, DEFAULT_MEDIA_EFFECT.mediaEffectFocusY)}
            onChange={value => change({ mediaEffectFocusY: value / 100 })}
          />
        </>
      )}
    </section>
  )
}

function EffectSlider({ label, value, onChange }: {
  label: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <Row label={label}>
      <Slider value={value} min={0} max={100} step={1} onChange={onChange} display={`${value}%`} />
    </Row>
  )
}

function ChoiceButton({ active, label, onClick }: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded border px-2 py-1 text-[11px] capitalize transition-colors',
        active
          ? 'border-editor-accent bg-editor-accent text-white'
          : 'border-editor-border bg-editor-elevated text-editor-text hover:border-editor-accent/60',
      )}
    >
      {label}
    </button>
  )
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min))
}
