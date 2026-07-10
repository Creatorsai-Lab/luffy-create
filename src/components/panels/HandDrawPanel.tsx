import { Pencil, Eraser, Brush, SprayCan } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import type { HandDrawTool } from '../../types/editor'
import { cn } from '../../utils/cn'

const TOOLS: Array<{ id: HandDrawTool; label: string; icon: React.ReactNode }> = [
  { id: 'pen', label: 'Pen', icon: <Pencil size={17} /> },
  { id: 'paint', label: 'Paint', icon: <Brush size={17} /> },
  { id: 'spray', label: 'Spray', icon: <SprayCan size={17} /> },
  { id: 'eraser', label: 'Eraser', icon: <Eraser size={17} /> },
]

export default function HandDrawPanel() {
  const { handDrawSettings, setHandDrawSettings } = useEditorStore()
  const tool = handDrawSettings.tool

  return (
    <div className="h-full overflow-y-auto p-4 text-[#f2f2f2]">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-editor-text">Hand Draw</h2>
        <p className="mt-1 text-xs leading-relaxed text-editor-secondary">
          Draw directly on the scene with the mouse cursor.
        </p>
      </div>

      <div className="grid grid-cols-4 gap-1 rounded border border-editor-border bg-editor-elevated p-1">
        {TOOLS.map(item => (
          <button
            key={item.id}
            onClick={() => setHandDrawSettings({ tool: item.id })}
            className={cn(
              'flex h-10 items-center justify-center rounded transition-colors',
              tool === item.id
                ? 'bg-editor-accent text-white'
                : 'text-editor-secondary hover:bg-editor-hover hover:text-editor-text'
            )}
            title={item.label}
          >
            {item.icon}
          </button>
        ))}
      </div>

      {tool !== 'eraser' ? (
        <div className="mt-4 space-y-4">
          <RangeField
            label="Stroke width"
            value={handDrawSettings.strokeWidth}
            min={3}
            max={160}
            step={1}
            suffix="px"
            onChange={strokeWidth => setHandDrawSettings({ strokeWidth })}
          />

          <RangeField
            label="Hardness"
            value={Math.round(handDrawSettings.strokeOpacity * 100)}
            min={5}
            max={100}
            step={1}
            suffix="%"
            onChange={value => setHandDrawSettings({ strokeOpacity: value / 100 })}
          />

          <ColorField
            label="Stroke color"
            value={handDrawSettings.strokeColor}
            onChange={strokeColor => setHandDrawSettings({ strokeColor })}
          />

          {tool === 'paint' && (
            <ColorField
              label="Grain color"
              value={handDrawSettings.paintGrainColor}
              onChange={paintGrainColor => setHandDrawSettings({ paintGrainColor })}
            />
          )}

          {tool === 'spray' && (
            <>
              <RangeField
                label="Spray spread"
                value={handDrawSettings.spraySpread}
                min={20}
                max={250}
                step={1}
                suffix="px"
                onChange={spraySpread => setHandDrawSettings({ spraySpread })}
              />
            </>
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <RangeField
            label="Size"
            value={handDrawSettings.eraserSize}
            min={4}
            max={250}
            step={1}
            suffix="px"
            onChange={eraserSize => setHandDrawSettings({ eraserSize })}
          />
          <RangeField
            label="Hardness"
            value={Math.round(handDrawSettings.eraserHardness * 100)}
            min={5}
            max={100}
            step={1}
            suffix="%"
            onChange={value => setHandDrawSettings({ eraserHardness: value / 100 })}
          />
        </div>
      )}
    </div>
  )
}

function RangeField({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  suffix: string
  onChange: (value: number) => void
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-editor-secondary">{label}</span>
        <span className="tabular-nums text-editor-text">{value}{suffix}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full"
      />
    </label>
  )
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="block">
      <div className="mb-1 text-xs text-editor-secondary">{label}</div>
      <div className="flex items-center gap-2 rounded border border-editor-border bg-editor-elevated p-2">
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="h-7 w-8 rounded border border-editor-border bg-transparent"
        />
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          className="min-w-0 flex-1 rounded border border-editor-border bg-editor-panel px-2 py-1 text-xs text-editor-text"
        />
      </div>
    </label>
  )
}
