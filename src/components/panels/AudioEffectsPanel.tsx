import { useState } from 'react'
import { Settings2, Volume2, Zap, Filter, AudioWaveform, X, ChevronDown } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import type { AudioElement } from '../../types/editor'

interface AudioEffectsPanelProps {
  element: AudioElement | null
  onClose?: () => void
}

export default function AudioEffectsPanel({ element, onClose }: AudioEffectsPanelProps) {
  const { updateElement } = useEditorStore()
  const [expandedSection, setExpandedSection] = useState<string | null>(null)

  if (!element || element.type !== 'audio') {
    return null
  }

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-editor-panel border-l border-editor-border">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-editor-border bg-editor-elevated/50">
        <div className="flex items-center gap-2">
          <Settings2 size={14} className="text-editor-accent" />
          <h3 className="text-xs font-semibold text-white">Audio Effects</h3>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-[#888888] hover:text-white transition-colors"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Effects Content */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {/* Volume & Dynamics */}
        <EffectSection
          title="Volume & Dynamics"
          icon={<Volume2 size={13} />}
          expanded={expandedSection === 'volume'}
          onToggle={() => toggleSection('volume')}
        >
          <div className="space-y-2">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-2xs">
                <span className="text-[#888888]">Peak Meter</span>
                <span className="text-white">-3.2dB</span>
              </div>
              <div className="w-full h-1.5 bg-editor-border rounded-full overflow-hidden">
                <div className="w-1/2 h-full bg-gradient-to-r from-green-500 to-yellow-500" />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-2xs text-[#888888]">
                <span>Normalize Audio</span>
              </div>
              <button className="w-full px-2 py-1 bg-editor-border hover:bg-editor-border-strong text-white text-2xs rounded transition-colors">
                Auto Normalize
              </button>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-2xs text-[#888888]">
                <span>Compression Ratio</span>
                <span className="text-white">4:1</span>
              </div>
              <input
                type="range"
                min={1}
                max={10}
                step={0.5}
                defaultValue={4}
                className="w-full h-1.5 bg-editor-border rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>
        </EffectSection>

        {/* EQ & Tone */}
        <EffectSection
          title="EQ & Tone"
          icon={<AudioWaveform size={13} />}
          expanded={expandedSection === 'eq'}
          onToggle={() => toggleSection('eq')}
        >
          <div className="space-y-2">
            <div className="text-2xs text-[#888888] space-y-1.5">
              <div>
                <span>Treble</span>
                <input type="range" min={-12} max={12} defaultValue={0} className="w-full h-1 mt-0.5" />
              </div>
              <div>
                <span>Mid</span>
                <input type="range" min={-12} max={12} defaultValue={0} className="w-full h-1 mt-0.5" />
              </div>
              <div>
                <span>Bass</span>
                <input type="range" min={-12} max={12} defaultValue={0} className="w-full h-1 mt-0.5" />
              </div>
            </div>

            <button className="w-full px-2 py-1 bg-editor-border hover:bg-editor-border-strong text-white text-2xs rounded transition-colors">
              Preset: Bright
            </button>
            <button className="w-full px-2 py-1 bg-editor-border hover:bg-editor-border-strong text-white text-2xs rounded transition-colors">
              Preset: Warm
            </button>
          </div>
        </EffectSection>

        {/* Effects */}
        <EffectSection
          title="Audio Effects"
          icon={<Filter size={13} />}
          expanded={expandedSection === 'effects'}
          onToggle={() => toggleSection('effects')}
        >
          <div className="space-y-2">
            <EffectToggle label="Noise Gate" desc="Remove background noise" />
            <EffectToggle label="De-esser" desc="Reduce sibilance" />
            <EffectToggle label="Echo" desc="Add spatial depth" />
            <EffectToggle label="Reverb" desc="Room reverb effect" />
            <EffectToggle label="Distortion" desc="Add grit and character" />
            <EffectToggle label="Chorus" desc="Rich, thick sound" />
          </div>
        </EffectSection>

        {/* Advanced Settings */}
        <EffectSection
          title="Advanced"
          icon={<Zap size={13} />}
          expanded={expandedSection === 'advanced'}
          onToggle={() => toggleSection('advanced')}
        >
          <div className="space-y-1.5 text-2xs">
            <div>
              <label className="text-[#888888]">Pitch Shift (semitones)</label>
              <input type="range" min={-12} max={12} step={1} defaultValue={0} className="w-full h-1 mt-0.5" />
            </div>
            <div>
              <label className="text-[#888888]">Speed Change (%)</label>
              <input type="range" min={50} max={150} step={5} defaultValue={100} className="w-full h-1 mt-0.5" />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="preservePitch" className="w-3 h-3" />
              <label htmlFor="preservePitch" className="text-[#888888]">Preserve Pitch</label>
            </div>
          </div>
        </EffectSection>
      </div>

      {/* Reset All */}
      <div className="border-t border-editor-border p-2 bg-editor-elevated/30">
        <button
          onClick={() => {
            updateElement(element.id, {
              volume: 1,
              fadeIn: 0,
              fadeInVolume: 1,
              fadeOut: 0,
              fadeOutVolume: 0
            })
          }}
          className="w-full px-2 py-1.5 bg-editor-border hover:bg-editor-border-strong text-[#888888] hover:text-white rounded text-2xs transition-colors"
        >
          Reset All Effects
        </button>
      </div>
    </div>
  )
}

function EffectSection({
  title,
  icon,
  expanded,
  onToggle,
  children
}: {
  title: string
  icon: React.ReactNode
  expanded: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="border border-editor-border/50 rounded-lg overflow-hidden bg-editor-elevated/20">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-editor-border/30 transition-colors"
      >
        <div className="text-editor-accent flex-none">{icon}</div>
        <span className="text-xs font-medium text-white flex-1 text-left">{title}</span>
        <ChevronDown
          size={12}
          className={`flex-none text-[#888888] transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded && (
        <div className="px-2 py-2 border-t border-editor-border/50 bg-editor-panel/30 space-y-1.5">
          {children}
        </div>
      )}
    </div>
  )
}

function EffectToggle({ label, desc }: { label: string; desc: string }) {
  const [enabled, setEnabled] = useState(false)

  return (
    <div className="flex items-center justify-between p-1.5 rounded bg-editor-border/20 hover:bg-editor-border/40 transition-colors">
      <div className="flex-1 min-w-0">
        <p className="text-2xs font-medium text-white">{label}</p>
        <p className="text-2xs text-[#888888] line-clamp-1">{desc}</p>
      </div>
      <button
        onClick={() => setEnabled(!enabled)}
        className={`flex-none ml-2 px-2 py-0.5 rounded text-2xs font-medium transition-colors ${
          enabled
            ? 'bg-editor-accent text-white'
            : 'bg-editor-border text-[#888888]'
        }`}
      >
        {enabled ? 'On' : 'Off'}
      </button>
    </div>
  )
}
