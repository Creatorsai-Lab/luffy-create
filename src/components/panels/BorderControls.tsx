import type { BorderFillMode, ImageElement, ShapeElement, VideoElement } from '../../types/editor'
import { cn } from '../../utils/cn'
import { ColorInput, Row, Slider } from './TextPanel'
import { DEFAULT_BORDER_COLOR, isInvisibleColor } from '../../engine/borderRenderer'

type BorderTarget = ShapeElement | ImageElement | VideoElement

interface Props<T extends BorderTarget> {
  value: T
  onChange: (patch: Partial<T>) => void
}

export default function BorderControls<T extends BorderTarget>({ value, onChange }: Props<T>) {
  const width = value.type === 'shape' ? value.strokeWidth : value.borderWidth
  const color = value.type === 'shape' ? value.stroke : value.borderColor
  const shownColor = isInvisibleColor(color) ? DEFAULT_BORDER_COLOR : color
  const fillMode = value.borderFillMode ?? 'solid'
  const gradientFrom = value.borderGradientFrom ?? shownColor
  const gradientTo = value.borderGradientTo ?? '#22d3ee'
  const animated = fillMode === 'linearGradient' && (value.borderAnimate ?? false)
  const speed = value.borderAnimationSpeed ?? 1

  // Shapes store their border as stroke/strokeWidth, images and videos as
  // borderColor/borderWidth. `value.type` picks the right names at runtime,
  // which TypeScript can't narrow a generic T from — hence the single cast here.
  const emit = (patch: Partial<ShapeElement> | Partial<ImageElement | VideoElement>) => onChange(patch as Partial<T>)

  // Giving the border a width also commits the color the picker shows, so the
  // border appears right away instead of being drawn in "transparent".
  const patchWidth = (borderWidth: number) => {
    const fillColor = borderWidth > 0 && isInvisibleColor(color) ? DEFAULT_BORDER_COLOR : null
    if (value.type === 'shape') emit({ strokeWidth: borderWidth, ...(fillColor && { stroke: fillColor }) })
    else emit({ borderWidth, ...(fillColor && { borderColor: fillColor }) })
  }

  const patchColor = (borderColor: string) => {
    if (value.type === 'shape') emit({ stroke: borderColor, borderGradientFrom: borderColor })
    else emit({ borderColor, borderGradientFrom: borderColor })
  }

  const patchMode = (borderFillMode: BorderFillMode) => {
    onChange({
      borderFillMode,
      borderAnimate: borderFillMode === 'linearGradient' ? value.borderAnimate : false,
      borderGradientFrom: gradientFrom,
      borderGradientTo: gradientTo,
    } as Partial<T>)
  }

  const patchAnimate = (borderAnimate: boolean) => {
    onChange({
      borderAnimate,
      borderFillMode: borderAnimate ? 'linearGradient' : fillMode,
      borderGradientFrom: gradientFrom,
      borderGradientTo: gradientTo,
      borderAnimationSpeed: speed,
    } as Partial<T>)
  }

  return (
    <div className="pb-2 mb-1 border-b border-editor-border">
      <span className="text-xs font-medium text-editor-text block mb-1">Border</span>
      <Row label="Width">
        <Slider value={width} min={0} max={60} step={0.5}
          onChange={patchWidth} display={`${width}px`} />
      </Row>
      <Row label="Fill">
        <select
          value={fillMode}
          onChange={e => patchMode(e.target.value as BorderFillMode)}
          className="w-full bg-editor-elevated-highlight border border-editor-border rounded text-xs text-editor-text px-2 py-1"
        >
          <option value="solid">Solid</option>
          <option value="linearGradient">Gradient</option>
        </select>
      </Row>
      {fillMode === 'solid' ? (
        <Row label="Color">
          <ColorInput value={shownColor} onChange={patchColor} />
        </Row>
      ) : (
        <>
          <Row label="Color 1">
            <ColorInput value={gradientFrom} onChange={borderGradientFrom => onChange({ borderGradientFrom } as Partial<T>)} />
          </Row>
          <Row label="Color 2">
            <ColorInput value={gradientTo} onChange={borderGradientTo => onChange({ borderGradientTo } as Partial<T>)} />
          </Row>
          <Row label="Angle">
            <Slider value={value.borderGradientAngle ?? 135} min={0} max={360} step={1}
              onChange={borderGradientAngle => onChange({ borderGradientAngle } as Partial<T>)}
              display={`${value.borderGradientAngle ?? 135}°`} />
          </Row>
          <Row label="Animate">
            <button
              onClick={() => patchAnimate(!animated)}
              className={cn(
                'px-2 py-1 rounded text-xs transition-colors',
                animated
                  ? 'bg-editor-accent text-white'
                  : 'bg-editor-elevated-highlight text-[#f2f2f2] hover:text-editor-text border border-editor-border'
              )}
            >
              {animated ? 'On' : 'Off'}
            </button>
          </Row>
          {animated && (
            <Row label="Speed">
              <Slider value={speed} min={0.1} max={5} step={0.1}
                onChange={borderAnimationSpeed => onChange({ borderAnimationSpeed } as Partial<T>)}
                display={`${speed.toFixed(1)}x`} />
            </Row>
          )}
        </>
      )}
    </div>
  )
}
