import { useEffect, useState } from 'react'
import { Plus, Puzzle, Trash2, Unlink } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { addonCommand, listBlocks, getBlock, type SmartBlock } from '../../blocks/registry'
import type { BlockField } from '../../blocks/fields'
import { useEditorStore } from '../../store/editorStore'
import type { SceneGroup } from '../../types/editor'
import { cn } from '../../utils/cn'
import { ColorInput, NumberInput, PanelHeader } from './TextPanel'

/**
 * Smart blocks: the catalogue to add one, and — when a smart group is selected —
 * its settings. Every change rebuilds the block in place.
 */
export default function BlocksPanel() {
  const { project, currentSceneId, selectedIds } = useEditorStore(useShallow(s => ({
    project: s.project, currentSceneId: s.currentSceneId, selectedIds: s.selectedIds,
  })))
  const scene = project?.scenes.find(sc => sc.id === currentSceneId)
  const first = scene?.elements.find(el => el.id === selectedIds[0])
  const group = first?.groupId ? scene?.groups?.[first.groupId] : undefined
  const block = group?.smart ? getBlock(group.smart.blockId) : undefined

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PanelHeader icon={<Puzzle size={12} />} title="Add-ons" />
      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-3">
        {group && block ? <BlockSettings group={group} block={block} /> : <Catalogue />}
      </div>
    </div>
  )
}

function Catalogue() {
  const insertBlock = useEditorStore(s => s.insertBlock)
  const sections: Array<{ title: string; blocks: SmartBlock[] }> = [
    { title: 'Creators', blocks: listBlocks('ugc') },
    { title: 'Explainers', blocks: listBlocks('technical') },
  ].filter(section => section.blocks.length)
  return (
    <>
      <p className="text-[11px] leading-relaxed text-editor-text-secondary">
        Ready-made pieces you set up with a few settings. Select one on the canvas later to change it — it rebuilds in place. In the AI Agent, type / to name one.
      </p>
      {sections.map(section => (
        <section key={section.title} className="flex flex-col gap-2">
          <h3 className="text-[10px] uppercase tracking-wide text-editor-text-secondary">{section.title}</h3>
          {section.blocks.map(block => (
            <div key={block.id} className="rounded border border-editor-border bg-editor-elevated-highlight px-2.5 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 text-xs font-medium text-editor-text">{block.title} <span className="font-mono text-[10px] text-violet-300">/{addonCommand(block)}</span></span>
                <button type="button" onClick={() => insertBlock(block.id)}
                  className="flex items-center gap-1 rounded bg-editor-accent px-2 py-1 text-[11px] text-white hover:bg-editor-accent-hover">
                  <Plus size={11} /> Add
                </button>
              </div>
              <p className="mt-1 text-[10px] leading-relaxed text-editor-text-secondary">{block.description}</p>
            </div>
          ))}
        </section>
      ))}
    </>
  )
}

function BlockSettings({ group, block }: { group: SceneGroup; block: SmartBlock }) {
  const { rebuildBlock, detachBlock, removeElement, deselectAll, project, currentSceneId } = useEditorStore(useShallow(s => ({
    rebuildBlock: s.rebuildBlock, detachBlock: s.detachBlock, removeElement: s.removeElement, deselectAll: s.deselectAll,
    project: s.project, currentSceneId: s.currentSceneId,
  })))
  const params = group.smart!.params
  const set = (key: string, value: unknown) => rebuildBlock(group.id, { [key]: value })

  function remove() {
    const scene = project?.scenes.find(sc => sc.id === currentSceneId)
    const ids = scene?.elements.filter(el => el.groupId === group.id).map(el => el.id) ?? []
    deselectAll()
    ids.forEach(id => removeElement(id))
  }

  return (
    <>
      <div className="rounded border border-editor-accent/40 bg-editor-elevated-highlight px-2.5 py-2">
        <div className="text-xs font-medium text-editor-text">✦ {group.name}</div>
        <p className="mt-0.5 text-[10px] leading-relaxed text-editor-text-secondary">
          {block.description} Changes rebuild it; hand edits to its parts are replaced — use Detach to keep them.
        </p>
      </div>
      {block.fields.map(field => (
        <FieldInput key={field.key} field={field} value={params[field.key]} onChange={value => set(field.key, value)} />
      ))}
      <div className="flex gap-1.5 border-t border-editor-border pt-2.5">
        <button type="button" onClick={() => detachBlock(group.id)} title="Keep these items as a normal group that no longer rebuilds"
          className="flex flex-1 items-center justify-center gap-1 rounded border border-editor-border py-1.5 text-[11px] text-editor-text hover:border-editor-accent hover:text-editor-accent">
          <Unlink size={12} /> Detach
        </button>
        <button type="button" onClick={remove} title="Delete this add-on"
          className="flex-none rounded border border-editor-border px-2.5 text-editor-text-secondary hover:border-red-400 hover:text-red-400">
          <Trash2 size={13} />
        </button>
      </div>
    </>
  )
}

function FieldInput({ field, value, onChange }: { field: BlockField; value: unknown; onChange: (value: unknown) => void }) {
  const label = <span className="text-[10px] text-editor-text-secondary">{field.label}</span>
  switch (field.type) {
    case 'text':
      return <label className="flex flex-col gap-1">{label}<TextField value={String(value ?? '')} multiline={field.multiline || field.keepLines} rows={field.code ? 8 : field.keepLines ? 4 : 2} mono={field.code} placeholder={field.placeholder} onCommit={onChange} /></label>
    case 'list': {
      // Edited as text ("3, 4, 2" / "Load → Clean" / one per line); the block splits it back into items.
      const joiner = field.joiner ?? (field.of === 'number' ? ', ' : ' → ')
      const shown = Array.isArray(value) ? value.join(joiner) : String(value ?? '')
      const lines = joiner.includes('\n')
      return <label className="flex flex-col gap-1">{label}<TextField value={shown} multiline={lines} rows={lines ? 4 : 2} mono={lines} placeholder={field.placeholder} onCommit={onChange} /></label>
    }
    case 'number':
      return <label className="flex flex-col gap-1">{label}<NumberInput value={Number(value ?? field.min)} min={field.min} max={field.max} step={field.step ?? 1} onChange={onChange} /></label>
    case 'color':
      return <label className="flex flex-col gap-1">{label}<ColorInput value={String(value ?? '#ffffff')} onChange={onChange} /></label>
    case 'toggle':
      return (
        <label className="flex cursor-pointer items-center justify-between text-xs text-editor-text">
          {field.label}
          <input type="checkbox" checked={Boolean(value)} onChange={e => onChange(e.target.checked)} className="h-3.5 w-3.5 accent-editor-accent" />
        </label>
      )
    case 'select':
      return (
        <div className="flex flex-col gap-1">
          {label}
          <div className={cn('grid gap-1', field.options.length <= 3 ? 'grid-cols-3' : 'grid-cols-2')}>
            {field.options.map(option => (
              <button key={option.value} type="button" onClick={() => onChange(option.value)}
                className={cn('h-7 truncate rounded border px-1 text-[11px]', value === option.value
                  ? 'border-editor-accent bg-editor-accent/20 text-editor-accent'
                  : 'border-editor-border text-editor-text hover:border-editor-accent/60')}>
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )
  }
}

/** Typing edits a local copy; the block rebuilds a moment after typing stops (and on blur). */
function TextField({ value, multiline, rows = 2, mono, placeholder, onCommit }: { value: string; multiline?: boolean; rows?: number; mono?: boolean; placeholder?: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  useEffect(() => {
    if (draft === value) return
    const timer = setTimeout(() => onCommit(draft), 350)
    return () => clearTimeout(timer)
  }, [draft]) // eslint-disable-line react-hooks/exhaustive-deps
  const className = cn('w-full rounded border border-editor-border bg-editor-elevated-highlight px-2 py-1 text-xs text-editor-text', mono && 'font-mono whitespace-pre')
  return multiline
    ? <textarea rows={rows} spellCheck={!mono} value={draft} placeholder={placeholder} onChange={e => setDraft(e.target.value)} onBlur={() => draft !== value && onCommit(draft)} className={cn(className, 'resize-none')} />
    : <input value={draft} placeholder={placeholder} onChange={e => setDraft(e.target.value)} onBlur={() => draft !== value && onCommit(draft)} className={className} />
}
