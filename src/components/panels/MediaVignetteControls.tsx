import type { MediaVignetteControls as VignetteSettings } from '../../types/editor'
import { cn } from '../../utils/cn'
import { ColorInput, Row, Slider } from './TextPanel'

interface Props {
  value: VignetteSettings
  onChange: (patch: Partial<VignetteSettings>) => void
}

export default function MediaVignetteControls({ value, onChange }: Props) {
  const enabled = value.vignetteEnabled ?? false

  return (
    <>
      <Row label="Vignette">
        <button
          type="button"
          onClick={() => onChange({ vignetteEnabled: !enabled })}
          className={cn(
            'px-2 py-1 rounded border text-[11px] transition-colors',
            enabled
              ? 'bg-editor-accent border-editor-accent text-white'
              : 'bg-editor-elevated border-editor-border text-editor-text hover:border-editor-accent/60',
          )}
        >
          {enabled ? 'On' : 'Off'}
        </button>
      </Row>

      {enabled && (
        <>
          <Row label="Color">
            <ColorInput
              value={value.vignetteColor ?? '#000000'}
              onChange={vignetteColor => onChange({ vignetteColor })}
            />
          </Row>
          <VignetteSlider label="Size" value={value.vignetteSize ?? 0.5} onChange={vignetteSize => onChange({ vignetteSize })} />
          <VignetteSlider label="Hardness" value={value.vignetteAmount ?? 0.5} onChange={vignetteAmount => onChange({ vignetteAmount })} />
          <VignetteSlider label="Fade" value={value.vignetteFade ?? 0.65} onChange={vignetteFade => onChange({ vignetteFade })} />
        </>
      )}
    </>
  )
}

function VignetteSlider({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <Row label={label}>
      <Slider
        value={Math.round(value * 100)}
        min={0}
        max={100}
        step={1}
        onChange={next => onChange(next / 100)}
        display={`${Math.round(value * 100)}%`}
      />
    </Row>
  )
}
