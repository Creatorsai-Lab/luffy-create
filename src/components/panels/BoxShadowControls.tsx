import type { BoxShadow, InnerShadow } from '../../types/editor'
import { DEFAULT_BOX_SHADOW, DEFAULT_INNER_SHADOW } from '../../utils/defaults'
import { cn } from '../../utils/cn'
import { Row, ColorInput, Slider } from './TextPanel'

interface Props {
  value?: BoxShadow
  onChange: (next: BoxShadow) => void
}

export default function BoxShadowControls({ value, onChange }: Props) {
  const shadow = { ...DEFAULT_BOX_SHADOW, ...value }

  function upd(patch: Partial<BoxShadow>) {
    onChange({ ...shadow, ...patch })
  }

  return (
    <div className="pb-2 mb-1 border-b border-editor-border">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-editor-text">Box Shadow</span>
        <button
          onClick={() => upd({ enabled: !shadow.enabled })}
          className={cn(
            'px-2 py-1 rounded text-xs transition-colors',
            shadow.enabled
              ? 'bg-editor-accent text-white'
              : 'bg-editor-elevated text-[#f2f2f2] hover:text-editor-text border border-editor-border'
          )}
        >
          {shadow.enabled ? 'On' : 'Off'}
        </button>
      </div>

      {shadow.enabled && (
        <div className="flex flex-col gap-0.5">
          <Row label="Color">
            <ColorInput value={shadow.color} onChange={v => upd({ color: v })} />
          </Row>

          <Row label="Opacity">
            <Slider
              value={Math.round(shadow.opacity * 100)}
              min={0}
              max={100}
              step={1}
              onChange={v => upd({ opacity: v / 100 })}
              display={`${Math.round(shadow.opacity * 100)}%`}
            />
          </Row>

          <Row label="Blur">
            <Slider
              value={shadow.blur}
              min={0}
              max={120}
              step={1}
              onChange={v => upd({ blur: v })}
              display={`${shadow.blur}px`}
            />
          </Row>

          <Row label="Spread">
            <Slider
              value={shadow.spread}
              min={-40}
              max={120}
              step={1}
              onChange={v => upd({ spread: v })}
              display={`${shadow.spread}px`}
            />
          </Row>

          <Row label="Angle">
            <Slider
              value={shadow.angle}
              min={0}
              max={360}
              step={1}
              onChange={v => upd({ angle: v })}
              display={`${shadow.angle}°`}
            />
          </Row>

          <Row label="Distance">
            <Slider
              value={shadow.distance}
              min={0}
              max={160}
              step={1}
              onChange={v => upd({ distance: v })}
              display={`${shadow.distance}px`}
            />
          </Row>
        </div>
      )}
    </div>
  )
}

interface InnerProps {
  value?: InnerShadow
  onChange: (next: InnerShadow) => void
}

export function InnerShadowControls({ value, onChange }: InnerProps) {
  const shadow = { ...DEFAULT_INNER_SHADOW, ...value }

  function upd(patch: Partial<InnerShadow>) {
    onChange({ ...shadow, ...patch })
  }

  return (
    <div className="pb-2 mb-1 border-b border-editor-border">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-editor-text">Inner Shadow</span>
        <button
          onClick={() => upd({ enabled: !shadow.enabled })}
          className={cn(
            'px-2 py-1 rounded text-xs transition-colors',
            shadow.enabled
              ? 'bg-editor-accent text-white'
              : 'bg-editor-elevated text-[#f2f2f2] hover:text-editor-text border border-editor-border'
          )}
        >
          {shadow.enabled ? 'On' : 'Off'}
        </button>
      </div>

      {shadow.enabled && (
        <div className="flex flex-col gap-0.5">
          <Row label="Color">
            <ColorInput value={shadow.color} onChange={v => upd({ color: v })} />
          </Row>
          <Row label="Opacity">
            <Slider
              value={Math.round(shadow.opacity * 100)}
              min={0}
              max={100}
              step={1}
              onChange={v => upd({ opacity: v / 100 })}
              display={`${Math.round(shadow.opacity * 100)}%`}
            />
          </Row>
          <Row label="Blur">
            <Slider
              value={shadow.blur}
              min={0}
              max={80}
              step={1}
              onChange={v => upd({ blur: v })}
              display={`${shadow.blur}px`}
            />
          </Row>
          <Row label="Angle">
            <Slider
              value={shadow.angle}
              min={0}
              max={360}
              step={1}
              onChange={v => upd({ angle: v })}
              display={`${shadow.angle}°`}
            />
          </Row>
          <Row label="Distance">
            <Slider
              value={shadow.distance}
              min={0}
              max={80}
              step={1}
              onChange={v => upd({ distance: v })}
              display={`${shadow.distance}px`}
            />
          </Row>
        </div>
      )}
    </div>
  )
}
