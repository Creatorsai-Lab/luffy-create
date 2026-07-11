import { useState } from 'react'
import { Settings2 } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import type { Background, BgType, AnimatedBg, GradientBg, GradientKind } from '../../types/editor'
import { PanelHeader, Row, ColorInput, Slider, NumberInput } from './TextPanel'
import { cn } from '../../utils/cn'

const BG_TYPES: { label: string; value: BgType }[] = [
  { label: 'Solid',       value: 'solid' },
  { label: 'Gradient',    value: 'gradient' },
  { label: 'Grid',        value: 'grid' },
  { label: 'Dots',        value: 'dots' },
  { label: 'Animated',    value: 'animated' },
  { label: 'Transparent', value: 'transparent' },
]

export default function BackgroundPanel() {
  const { project, currentSceneId, setBackground } = useEditorStore()
  const scene = project?.scenes.find(s => s.id === currentSceneId)

  if (!scene) return (
    <div className="flex-1 flex items-center justify-center p-4">
      <p className="text-xs text-[#f2f2f2]">No scene selected.</p>
    </div>
  )

  const bg = scene.background

  function setBg(patch: Partial<Background>) {
    setBackground(scene!.id, { ...bg, ...patch } as Background)
  }

  function animatedDefaults(variant: AnimatedBg['variant']) {
    if (variant === 'sand-grain-gradient') return ['#d8b46a', '#f0d9a0', '#8f6b3e']
    if (variant === 'three-color-drift') return ['#6366f1', '#22d3ee', '#f97316']
    return ['#6366f1', '#d6d6fc', '#22d3ee']
  }

  function setAnimatedVariant(variant: AnimatedBg['variant']) {
    if (bg.type !== 'animated') return
    const needsThreeColors = variant === 'three-color-drift' || variant === 'sand-grain-gradient'
    const defaults = animatedDefaults(variant)
    const colors = needsThreeColors
      ? [bg.colors[0] ?? defaults[0], bg.colors[1] ?? defaults[1], bg.colors[2] ?? defaults[2]]
      : bg.colors
    setBg({ variant, colors })
  }

  function changeBgType(type: BgType) {
    const defaults: Record<BgType, Background> = {
      solid:    { type: 'solid', color: '#1a1a2e' },
      gradient: { type: 'gradient', from: '#6366f1', to: '#f5f5ff', angle: 290, fromStop: 0, toStop: 1, gradientType: 'linear' },
      grid:     { type: 'grid', bgColor: '#0f0f1a', lineColor: '#2a2a2a', cellSize: 40 },
      dots:     { type: 'dots', bgColor: '#0f0f1a', dotColor: '#2a2a2a', spacing: 64, radius: 3.5 },
      animated: { type: 'animated', variant: 'gradient-flow', colors: ['#6366f1', '#d6d6fc', '#22d3ee'], speed: 3 },
      transparent: { type: 'transparent' },
    }
    setBackground(scene!.id, defaults[type])
  }

  return (
    <div className="flex flex-col overflow-y-auto flex-1">
      <PanelHeader icon={<Settings2 size={12} />} title="Background" />

      {bg.type === 'image' && (
        <div className="px-3 py-2 border-b border-editor-border flex flex-col gap-2">
          <p className="text-xs text-editor-accent">Image background active</p>
          <p className="text-2xs text-[#f2f2f2]">Set via right-click → Set Background on an image element.</p>
          <button
            onClick={() => setBackground(scene.id, { type: 'solid', color: '#1a1a2e' })}
            className="text-xs px-2 py-1 rounded bg-editor-elevated border border-editor-border text-[#f2f2f2] hover:text-editor-text transition-colors"
          >
            Reset to Solid
          </button>
        </div>
      )}

      {bg.type !== 'image' && (
      <div className="px-3 py-2 border-b border-editor-border">
        <span className="label block mb-1.5">Type</span>
        <div className="flex flex-wrap gap-1">
          {BG_TYPES.map(t => (
            <button
              key={t.value}
              onClick={() => changeBgType(t.value)}
              className={cn(
                'text-xs px-2 py-1 rounded border transition-colors',
                bg.type === t.value
                  ? 'bg-editor-accent-dim border-editor-accent text-editor-accent'
                  : 'bg-editor-elevated border-editor-border text-[#f2f2f2] hover:text-editor-text'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      )}

      <div className="flex flex-col px-3 py-2 gap-0.5">
        {bg.type === 'solid' && (
          <Row label="Color"><ColorInput value={bg.color} onChange={c => setBg({ color: c })} /></Row>
        )}

        {bg.type === 'gradient' && (
          <>
            <Row label="Gradient Type">
              <select
                value={(bg as GradientBg).gradientType ?? 'linear'}
                onChange={e => setBg({ gradientType: e.target.value as GradientKind } as Partial<GradientBg>)}
                className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1"
              >
                <option value="linear">Linear</option>
                <option value="radial">Radial</option>
                <option value="conic">Conic</option>
              </select>
            </Row>
            <Row label="From"><ColorInput value={bg.from} onChange={c => setBg({ from: c })} /></Row>
            <Row label="Middle">
              <div className="flex items-center gap-1">
                <ColorInput value={(bg as GradientBg).via || '#ffffff'} onChange={c => setBg({ via: c } as Partial<GradientBg>)} disabled={!(bg as GradientBg).via} />
                <button
                  onClick={() => setBg({ via: (bg as GradientBg).via ? undefined : '#ffffff' } as Partial<GradientBg>)}
                  className={cn('px-2 py-1 text-2xs rounded border transition-colors',
                    (bg as GradientBg).via ? 'bg-editor-accent-dim border-editor-accent text-editor-accent'
                      : 'bg-editor-elevated border-editor-border text-[#f2f2f2] hover:text-editor-text')}
                  title="Toggle a middle color stop"
                >
                  {(bg as GradientBg).via ? 'On' : 'Off'}
                </button>
              </div>
            </Row>
            <Row label="To"><ColorInput value={bg.to} onChange={c => setBg({ to: c })} /></Row>
            <Row label="Angle">
              <Slider value={bg.angle} min={0} max={360} step={1}
                onChange={v => setBg({ angle: v })} display={`${bg.angle}°`} />
            </Row>
            <Row label="Start Stop">
              <Slider value={(bg as GradientBg).fromStop ?? 0} min={0} max={1} step={0.01}
                onChange={v => setBg({ fromStop: v } as Partial<GradientBg>)} display={`${Math.round(((bg as GradientBg).fromStop ?? 0) * 100)}%`} />
            </Row>
            <Row label="End Stop">
              <Slider value={(bg as GradientBg).toStop ?? 1} min={0} max={1} step={0.01}
                onChange={v => setBg({ toStop: v } as Partial<GradientBg>)} display={`${Math.round(((bg as GradientBg).toStop ?? 1) * 100)}%`} />
            </Row>
          </>
        )}

        {bg.type === 'grid' && (
          <>
            <Row label="Background"><ColorInput value={bg.bgColor} onChange={c => setBg({ bgColor: c })} /></Row>
            <Row label="Line Color"><ColorInput value={bg.lineColor} onChange={c => setBg({ lineColor: c })} /></Row>
            <Row label="Cell Size">
              <Slider value={bg.cellSize} min={10} max={200} step={5}
                onChange={v => setBg({ cellSize: v })} display={`${bg.cellSize}px`} />
            </Row>
          </>
        )}

        {bg.type === 'dots' && (
          <>
            <Row label="Background"><ColorInput value={bg.bgColor} onChange={c => setBg({ bgColor: c })} /></Row>
            <Row label="Dot Color"><ColorInput value={bg.dotColor} onChange={c => setBg({ dotColor: c })} /></Row>
            <Row label="Spacing">
              <Slider value={bg.spacing} min={8} max={80} step={2}
                onChange={v => setBg({ spacing: v })} display={`${bg.spacing}px`} />
            </Row>
            <Row label="Radius">
              <Slider value={bg.radius} min={0.5} max={8} step={0.5}
                onChange={v => setBg({ radius: v })} display={`${bg.radius}px`} />
            </Row>
          </>
        )}

        {bg.type === 'animated' && (
          <>
            <Row label="Variant">
              <select
                value={bg.variant}
                onChange={e => setAnimatedVariant(e.target.value as AnimatedBg['variant'])}
                className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1"
              >
                <option value="gradient-flow">Gradient Flow</option>
                <option value="gradient-shift">Gradient Shift</option>
                <option value="three-color-drift">Three Color Drift</option>
                <option value="sand-grain-gradient">Grainy Sand Gradient</option>
                <option value="conic-rotate">Conic Rotate</option>
                <option value="aurora">Aurora</option>
                <option value="wave">Wave</option>
              </select>
            </Row>
            <Row label="Color 1">
              <ColorInput value={bg.colors[0] ?? '#6366f1'} onChange={c => {
                const colors = [...bg.colors]; colors[0] = c; setBg({ colors })
              }} />
            </Row>
            <Row label="Color 2">
              <ColorInput value={bg.colors[1] ?? '#0f0f1a'} onChange={c => {
                const colors = [...bg.colors]; colors[1] = c; setBg({ colors })
              }} />
            </Row>
            {(bg.variant === 'three-color-drift' || bg.variant === 'sand-grain-gradient') && (
              <Row label="Color 3">
                <ColorInput value={bg.colors[2] ?? animatedDefaults(bg.variant)[2]} onChange={c => {
                  const colors = [...bg.colors]; colors[2] = c; setBg({ colors })
                }} />
              </Row>
            )}
            <Row label="Speed">
              <Slider value={bg.speed} min={0.5} max={10} step={0.5}
                onChange={v => setBg({ speed: v })} display={`${bg.speed}x`} />
            </Row>
          </>
        )}

        {bg.type === 'transparent' && (
          <div className="flex flex-col gap-1.5 py-1">
            <p className="text-xs text-editor-accent">Transparent background</p>
            <p className="text-2xs text-[#a99fc9] leading-relaxed">
              The checkerboard marks transparency — it is not part of the output.
              PNG / WebP image export keeps the transparency. MP4 video cannot store
              transparency (H.264 has no alpha channel); it will render on black.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
