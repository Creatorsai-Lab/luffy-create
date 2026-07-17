import { Mic2, Volume2, Zap, Sliders, X } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import type { AudioElement } from '../../types/editor'
import { clampAudioEffect, clampAudioVolume } from '../../utils/audioEffects'
import { clampFadeVolume } from '../../utils/audioFade'

const AUDIO_SPEED_OPTIONS = [
  0.25,
  ...Array.from({ length: 17 }, (_, index) => Number((0.3 + index * 0.1).toFixed(2))),
  2,
]

interface AudioPropertiesPanelProps {
  element: AudioElement | null
  onClose?: () => void
}

export default function AudioPropertiesPanel({ element, onClose }: AudioPropertiesPanelProps) {
  const { updateElement } = useEditorStore()

  if (!element || element.type !== 'audio') {
    return null
  }

  const handleVolumeChange = (volume: number) => {
    updateElement(element.id, { volume: clampAudioVolume(volume) })
  }

  const currentSpeed = Number((element.speed ?? 1).toFixed(2))
  const speedOptions = AUDIO_SPEED_OPTIONS.includes(currentSpeed)
    ? AUDIO_SPEED_OPTIONS
    : [...AUDIO_SPEED_OPTIONS, currentSpeed].sort((a, b) => a - b)

  const formatSpeed = (speed: number) => speed === 1 ? '1x' : `${speed.toFixed(2)}x`

  const handleSpeedChange = (speed: number) => {
    const nextSpeed = Math.max(0.25, Math.min(2, speed))
    const rawAudioSeconds = (element.duration ?? 0.1) * (element.speed ?? 1)
    updateElement(element.id, {
      speed: nextSpeed,
      duration: Math.max(0.1, rawAudioSeconds / nextSpeed),
    })
  }

  const maxFadeDuration = Math.max(10, Math.min(60, element.duration ?? 30))

  const handleFadeIn = (fadeIn: number) => {
    updateElement(element.id, { fadeIn: Math.max(0, Math.min(maxFadeDuration, fadeIn)) })
  }

  const handleFadeOut = (fadeOut: number) => {
    updateElement(element.id, { fadeOut: Math.max(0, Math.min(maxFadeDuration, fadeOut)) })
  }

  const handleFadeInVolume = (fadeInVolume: number) => {
    updateElement(element.id, { fadeInVolume: clampFadeVolume(fadeInVolume) })
  }

  const handleFadeOutVolume = (fadeOutVolume: number) => {
    updateElement(element.id, { fadeOutVolume: clampFadeVolume(fadeOutVolume) })
  }

  const handleVoiceEffectChange = (
    key: 'voice' | 'pitch' | 'bass' | 'saturation',
    value: number,
    min: number,
    max: number
  ) => {
    updateElement(element.id, { [key]: clampAudioEffect(value, min, max) })
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-editor-panel border-l border-editor-border">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-editor-border bg-editor-elevated/50">
        <h3 className="text-xs font-semibold text-white">{element.name}</h3>
        {onClose && (
          <button
            onClick={onClose}
            className="text-[#888888] hover:text-white transition-colors"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Properties */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        {/* Volume Control */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Volume2 size={13} className="text-editor-accent flex-none" />
            <label className="text-xs font-medium text-white flex-1">Volume</label>
            <span className="text-2xs text-[#888888]">{Math.round(clampAudioVolume(element.volume) * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={clampAudioVolume(element.volume)}
            onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
            className="w-full h-1.5 bg-editor-border rounded-lg appearance-none cursor-pointer"
          />
        </div>

        {/* Speed Control */}
        <div className="space-y-1.5 border-t border-editor-border pt-2">
          <div className="flex items-center gap-2">
            <Sliders size={13} className="text-editor-accent flex-none" />
            <label className="text-xs font-medium text-white flex-1">Speed</label>
            <span className="text-2xs text-[#888888]">{formatSpeed(currentSpeed)}</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0.25}
              max={2}
              step={0.01}
              value={currentSpeed}
              onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
              className="flex-1 min-w-0 h-1.5 bg-editor-border rounded-lg appearance-none cursor-pointer"
            />
            <select
              value={currentSpeed}
              onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
              className="w-20 bg-editor-border text-white text-2xs px-2 py-1 rounded border border-editor-border-strong"
            >
              {speedOptions.map(speed => (
                <option key={speed} value={speed}>{formatSpeed(speed)}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Voice / Tone */}
        <div className="space-y-2 border-t border-editor-border pt-2">
          <div className="flex items-center gap-2">
            <Mic2 size={13} className="text-editor-accent flex-none" />
            <label className="text-xs font-medium text-white flex-1">Voice</label>
            <button
              onClick={() => updateElement(element.id, { voice: 0, pitch: 0, bass: 0, saturation: 0 })}
              className="text-2xs text-[#888888] hover:text-white transition-colors"
            >
              Reset
            </button>
          </div>

          <EffectSlider
            label="Voice Tone"
            value={element.voice ?? 0}
            min={-100}
            max={100}
            step={1}
            unit="%"
            onChange={value => handleVoiceEffectChange('voice', value, -100, 100)}
          />
          <EffectSlider
            label="Pitch"
            value={element.pitch ?? 0}
            min={-12}
            max={12}
            step={1}
            unit=" st"
            onChange={value => handleVoiceEffectChange('pitch', value, -12, 12)}
          />
          <EffectSlider
            label="Bass"
            value={element.bass ?? 0}
            min={-12}
            max={12}
            step={1}
            unit=" dB"
            onChange={value => handleVoiceEffectChange('bass', value, -12, 12)}
          />
          <EffectSlider
            label="Saturation"
            value={element.saturation ?? 0}
            min={-100}
            max={100}
            step={1}
            unit="%"
            onChange={value => handleVoiceEffectChange('saturation', value, -100, 100)}
          />
        </div>

        {/* Fade In/Out */}
        <div className="space-y-2 border-t border-editor-border pt-2">
          <div className="flex items-center gap-2">
            <Zap size={13} className="text-editor-accent flex-none" />
            <label className="text-xs font-medium text-white">Fades</label>
          </div>

          <FadeControl
            title="Fade In"
            duration={element.fadeIn ?? 0}
            multiplier={element.fadeInVolume ?? 1}
            multiplierLabel="Target"
            maxDuration={maxFadeDuration}
            onDurationChange={handleFadeIn}
            onMultiplierChange={handleFadeInVolume}
          />

          <FadeControl
            title="Fade Out"
            duration={element.fadeOut ?? 0}
            multiplier={element.fadeOutVolume ?? 0}
            multiplierLabel="End"
            maxDuration={maxFadeDuration}
            onDurationChange={handleFadeOut}
            onMultiplierChange={handleFadeOutVolume}
          />
        </div>

      </div>
    </div>
  )
}

function FadeControl({
  title,
  duration,
  multiplier,
  multiplierLabel,
  maxDuration,
  onDurationChange,
  onMultiplierChange,
}: {
  title: string
  duration: number
  multiplier: number
  multiplierLabel: string
  maxDuration: number
  onDurationChange: (value: number) => void
  onMultiplierChange: (value: number) => void
}) {
  return (
    <div className="space-y-2 rounded border border-editor-border/60 bg-editor-elevated/20 p-2">
      <div className="flex items-center justify-between text-2xs">
        <span className="font-medium text-white">{title}</span>
        <span className="text-[#888888]">
          {duration.toFixed(1)}s · {multiplier.toFixed(2)}x
        </span>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2 text-2xs text-[#888888]">
          <span>Duration</span>
          <input
            type="number"
            min={0}
            max={maxDuration}
            step={0.1}
            value={Number(duration.toFixed(1))}
            onChange={e => onDurationChange(parseFloat(e.target.value) || 0)}
            className="w-16 rounded border border-editor-border-strong bg-editor-border px-1 py-0.5 text-right text-white"
          />
        </div>
        <input
          type="range"
          min={0}
          max={maxDuration}
          step={0.1}
          value={duration}
          onChange={e => onDurationChange(parseFloat(e.target.value))}
          className="w-full h-1.5 bg-editor-border rounded-lg appearance-none cursor-pointer"
        />
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2 text-2xs text-[#888888]">
          <span>{multiplierLabel} Volume</span>
          <input
            type="number"
            min={0}
            max={2}
            step={0.05}
            value={Number(multiplier.toFixed(2))}
            onChange={e => onMultiplierChange(parseFloat(e.target.value) || 0)}
            className="w-16 rounded border border-editor-border-strong bg-editor-border px-1 py-0.5 text-right text-white"
          />
        </div>
        <input
          type="range"
          min={0}
          max={2}
          step={0.05}
          value={multiplier}
          onChange={e => onMultiplierChange(parseFloat(e.target.value))}
          className="w-full h-1.5 bg-editor-border rounded-lg appearance-none cursor-pointer"
        />
      </div>
    </div>
  )
}

function EffectSlider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  onChange: (value: number) => void
}) {
  const display = value === 0 ? `0${unit}` : `${value > 0 ? '+' : ''}${value}${unit}`

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-2xs text-[#888888]">
        <span>{label}</span>
        <span className="text-white tabular-nums">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-editor-border rounded-lg appearance-none cursor-pointer"
      />
    </div>
  )
}
