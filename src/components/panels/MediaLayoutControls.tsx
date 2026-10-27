import { useState } from 'react'
import { useEditorStore } from '../../store/editorStore'
import { applyMediaLayout } from '../../utils/arrangeMedia'
import { cn } from '../../utils/cn'
import type { MediaLayout } from '../../utils/mediaLayout'

/** Split screen for two or more videos/images: side by side, stacked or a grid, cropped to fill. */
export default function MediaLayoutControls({ ids }: { ids: string[] }) {
  const project = useEditorStore(s => s.project)
  const [gap, setGap] = useState(0)
  const portrait = (project?.height ?? 0) > (project?.width ?? 1)

  const layouts: Array<{ value: MediaLayout; label: string; hint: string; show: boolean }> = [
    { value: 'sideBySide', label: 'Side by side', hint: 'Left and right, cropped to fill', show: true },
    { value: 'stacked', label: 'Stacked', hint: 'Top and bottom, cropped to fill', show: true },
    { value: 'grid', label: 'Grid', hint: 'Rows and columns', show: ids.length >= 3 },
  ]

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-1">
        {layouts.filter(l => l.show).map(l => (
          <button key={l.value} type="button" title={l.hint} onClick={() => applyMediaLayout(ids, l.value, { gap })}
            className={cn('rounded border border-editor-border bg-editor-elevated-highlight px-2 py-1.5 text-[11px] text-editor-text hover:border-editor-accent hover:text-editor-accent',
              l.value === (portrait ? 'stacked' : 'sideBySide') && 'border-editor-accent/60')}>
            {l.label}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-[11px] text-editor-text-secondary">
        <span className="w-14 flex-none">Gap</span>
        <input type="range" min={0} max={80} step={1} value={gap} onChange={e => setGap(Number(e.target.value))}
          className="flex-1 h-1.5 bg-editor-border rounded-lg appearance-none cursor-pointer" />
        <span className="w-10 text-right tabular-nums text-editor-text">{gap}px</span>
      </label>
      <p className="text-[10px] leading-relaxed text-editor-text-secondary">
        For anything else, ask the AI Agent — e.g. "make video 1 full screen and video 2 bottom right at 400x300".
      </p>
    </div>
  )
}
