import { useState } from 'react'
import type { ElementAnimation } from '../../types/editor'

function clampScale(value: number) {
  return Math.max(1, Math.min(20, value))
}

export function defaultScaleAmount(anim: ElementAnimation) {
  if (anim.params?.scaleAmount != null && Number.isFinite(anim.params.scaleAmount)) {
    return clampScale(anim.params.scaleAmount)
  }
  return anim.type === 'scaleOut' && anim.timing === 'onEnter' ? 2.5 : 1
}

function formatScale(value: number) {
  return Number.isInteger(value) ? `${value}x` : `${value.toFixed(2)}x`
}

export function ScaleSizeControl({
  anim,
  onChange,
}: {
  anim: ElementAnimation
  onChange: (patch: Partial<ElementAnimation>) => void
}) {
  if (anim.type !== 'scaleIn' && anim.type !== 'scaleOut') return null

  const value = defaultScaleAmount(anim)
  const label = anim.type === 'scaleIn'
    ? 'Final Size'
    : anim.timing === 'onEnter'
      ? 'Start Size'
      : 'Decrease By'

  return (
    <ScaleSliderRow
      label={label}
      value={value}
      display={anim.type === 'scaleOut' && anim.timing !== 'onEnter'
        ? `-${formatScale(value)}`
        : formatScale(value)}
      onChange={scaleAmount => onChange({ params: { ...anim.params, scaleAmount } })}
    />
  )
}

function ScaleSliderRow({
  label,
  value,
  display,
  onChange,
}: {
  label: string
  value: number
  display: string
  onChange: (value: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [editVal, setEditVal] = useState('')

  function commit() {
    const n = Number.parseFloat(editVal)
    if (Number.isFinite(n)) onChange(clampScale(n))
    setEditing(false)
  }

  return (
    <div className="flex flex-col gap-0.5 py-1.5">
      <span className="label">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={1}
          max={20}
          step={0.50}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="flex-1 accent-editor-accent h-1"
        />
        {editing ? (
          <input
            type="number"
            autoFocus
            value={editVal}
            min={1}
            max={20}
            step={0.5}
            onChange={e => setEditVal(e.target.value)}
            onBlur={commit}
            onKeyDown={e => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') setEditing(false)
            }}
            className="text-xs text-[#c1c1c1] w-12 text-right bg-editor-elevated border border-editor-accent rounded px-1 nodrag"
          />
        ) : (
          <span
            onClick={() => { setEditing(true); setEditVal(String(value)) }}
            className="text-xs text-[#c1c1c1] w-12 text-right tabular-nums cursor-text hover:text-white"
          >
            {display}
          </span>
        )}
      </div>
    </div>
  )
}
