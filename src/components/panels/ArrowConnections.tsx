import { useState } from 'react'
import { Link2, Unlink } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useEditorStore } from '../../store/editorStore'
import type { ArrowAttachment, ArrowElement, ConnectorAnchor, EditorElement } from '../../types/editor'
import { cn } from '../../utils/cn'
import { connectionPairs, makeConnector, type ConnectMode } from '../../utils/connectors'
import { ColorInput, NumberInput, Row } from './TextPanel'

const MODES: Array<{ value: ConnectMode; label: string; hint: string }> = [
  { value: 'chain', label: 'Chain', hint: 'Each item to the next, in selection order' },
  { value: 'columns', label: 'Columns', hint: 'Every item to every item in the next column — a network layer' },
  { value: 'hub', label: 'Hub', hint: 'The first selected item to all the others' },
]

const ANCHORS: Array<{ value: ConnectorAnchor; label: string }> = [
  { value: 'auto', label: 'Auto' }, { value: 'top', label: 'Top' }, { value: 'right', label: 'Right' },
  { value: 'bottom', label: 'Bottom' }, { value: 'left', label: 'Left' }, { value: 'center', label: 'Centre' },
]

/** Labels an end by what is drawn there, so "head" is always the arrow tip. */
function endLabel(arrow: ArrowElement, end: 'start' | 'end') {
  const head = arrow.arrowHead
  if (head === 'both') return end === 'start' ? 'Start head attached to' : 'End head attached to'
  if (head === 'none') return end === 'start' ? 'Line start attached to' : 'Line end attached to'
  const isHead = (head === 'end') === (end === 'end')
  return isHead ? 'Head (arrow tip) attached to' : 'Tail attached to'
}

/** Several items selected: link them with arrows that stay attached. */
export function ConnectSelected({ items }: { items: EditorElement[] }) {
  const addElements = useEditorStore(s => s.addElements)
  const [mode, setMode] = useState<ConnectMode>('chain')
  const [heads, setHeads] = useState(true)
  const [behind, setBehind] = useState(true)
  const [color, setColor] = useState('#9ca3af')
  const [width, setWidth] = useState(2)
  const byId = new Map(items.map(el => [el.id, el]))
  const pairs = connectionPairs(items, mode)

  function connect() {
    const arrows = pairs.map(([from, to]) => makeConnector(byId.get(from)!, byId.get(to)!, {
      stroke: color, arrowHeadColor: color, strokeWidth: width, arrowHead: heads ? 'end' : 'none',
      pointerLength: Math.max(6, width * 4), pointerWidth: Math.max(6, width * 4),
    }))
    addElements(arrows, { behind })
  }

  return (
    <div className="rounded border border-editor-accent/40 bg-editor-elevated-highlight px-2.5 py-2 flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-editor-text">
        <Link2 size={12} className="text-editor-accent" /> Connect {items.length} selected items
      </div>
      <div className="grid grid-cols-3 gap-1">
        {MODES.map(m => (
          <button key={m.value} type="button" title={m.hint} onClick={() => setMode(m.value)}
            className={cn('h-7 rounded border text-[11px]', mode === m.value
              ? 'border-editor-accent bg-editor-accent/20 text-editor-accent'
              : 'border-editor-border text-editor-text hover:border-editor-accent/60')}>
            {m.label}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-editor-text-secondary">{MODES.find(m => m.value === mode)?.hint}</p>
      <div className="grid grid-cols-2 gap-2">
        <Row label="Colour"><ColorInput value={color} onChange={setColor} /></Row>
        <Row label="Width"><NumberInput value={width} min={1} max={20} onChange={v => setWidth(Math.max(1, v))} /></Row>
      </div>
      <label className="flex items-center justify-between text-xs text-editor-text cursor-pointer">
        Arrow heads <input type="checkbox" checked={heads} onChange={e => setHeads(e.target.checked)} className="h-3.5 w-3.5 accent-editor-accent" />
      </label>
      <label className="flex items-center justify-between text-xs text-editor-text cursor-pointer">
        Behind the items <input type="checkbox" checked={behind} onChange={e => setBehind(e.target.checked)} className="h-3.5 w-3.5 accent-editor-accent" />
      </label>
      <button type="button" onClick={connect} disabled={!pairs.length}
        className="w-full rounded bg-editor-accent py-1.5 text-xs text-white hover:bg-editor-accent-hover disabled:opacity-40">
        Create {pairs.length} connector{pairs.length === 1 ? '' : 's'}
      </button>
    </div>
  )
}

/** One arrow selected: attach or release each end. */
export function ArrowAttachments({ arrow }: { arrow: ArrowElement }) {
  const { project, currentSceneId, updateElement } = useEditorStore(useShallow(s => ({
    project: s.project, currentSceneId: s.currentSceneId, updateElement: s.updateElement,
  })))
  const targets = (project?.scenes.find(sc => sc.id === currentSceneId)?.elements ?? [])
    .filter(el => el.type !== 'arrow' && el.type !== 'audio')

  const end = (key: 'startAttach' | 'endAttach', label: string) => {
    const value = arrow[key]
    const set = (next?: ArrowAttachment) => updateElement(arrow.id, { [key]: next } as Partial<ArrowElement>)
    return (
      <div className="grid grid-cols-[1fr_84px] gap-1.5 items-end">
        <Row label={label}>
          <select value={value?.elementId ?? ''} onChange={e => set(e.target.value ? { elementId: e.target.value, anchor: value?.anchor ?? 'auto' } : undefined)}
            className="w-full rounded border border-editor-border bg-editor-elevated-highlight px-2 py-1 text-xs text-editor-text">
            <option value="">Free point</option>
            {targets.map(el => <option key={el.id} value={el.id}>{el.name}</option>)}
          </select>
        </Row>
        <Row label="Side">
          <select value={value?.anchor ?? 'auto'} disabled={!value} onChange={e => value && set({ ...value, anchor: e.target.value as ConnectorAnchor })}
            className="w-full rounded border border-editor-border bg-editor-elevated-highlight px-2 py-1 text-xs text-editor-text disabled:opacity-40">
            {ANCHORS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </Row>
      </div>
    )
  }

  return (
    <div className="border-b border-editor-border px-3 py-2 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-editor-text"><Link2 size={12} className="text-editor-accent" /> Connections</span>
        {(arrow.startAttach || arrow.endAttach) && (
          <button type="button" onClick={() => updateElement(arrow.id, { startAttach: undefined, endAttach: undefined })}
            className="flex items-center gap-1 text-[10px] text-editor-text-secondary hover:text-editor-text">
            <Unlink size={11} /> Release both
          </button>
        )}
      </div>
      {end('startAttach', endLabel(arrow, 'start'))}
      {end('endAttach', endLabel(arrow, 'end'))}
      <p className="text-[10px] text-editor-text-secondary">Attached ends stay on their item and follow it. Moving the arrow only moves its free end; choose "Free point" to release an end.</p>
    </div>
  )
}
