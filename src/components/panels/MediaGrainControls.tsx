import type { MediaGrainControls as GrainValue } from '../../types/editor'
import { Row, Slider } from './TextPanel'

interface Props {
  value: GrainValue
  onChange: (patch: Partial<GrainValue>) => void
}

export default function MediaGrainControls({ value, onChange }: Props) {
  const opacity = Math.round((value.grainOpacity ?? 0) * 100)
  return (
    <>
      <Row label="Grain Color">
        <input
          type="color"
          value={value.grainColor ?? '#000000'}
          onChange={event => onChange({ grainColor: event.target.value })}
          className="w-7 h-6 rounded bg-transparent cursor-pointer"
        />
      </Row>
      <Row label="Grain Size">
        <Slider value={value.grainSize ?? 1} min={1} max={8} step={0.5}
          onChange={grainSize => onChange({ grainSize })} display={`${value.grainSize ?? 1}px`} />
      </Row>
      <Row label="Grain Hardness">
        <Slider value={opacity} min={0} max={100} step={1}
          onChange={value => onChange({ grainOpacity: value / 100 })} display={`${opacity}%`} />
      </Row>
    </>
  )
}
