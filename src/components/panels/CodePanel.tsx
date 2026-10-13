import { Code2, Plus, Trash2 } from 'lucide-react'
import { v4 as uuid } from 'uuid'
import { useEditorStore } from '../../store/editorStore'
import type { AnimationType, CodeAnimationBlock, CodeElement } from '../../types/editor'
import { LANGUAGES } from '../../types/editor'
import { AnimSection, PanelHeader, Row, NumberInput, ColorInput } from './TextPanel'
import { cn } from '../../utils/cn'
import { makeAnimation } from '../../utils/defaults'
import { isMotionAnimation } from '../../utils/moveAnimation'

const CODE_ENTER_ANIMS: { label: string; value: AnimationType }[] = [
  { label: 'Fade In', value: 'fadeIn' },
  { label: 'Slide In', value: 'slideIn' },
  { label: 'Scale In', value: 'scaleIn' },
  { label: 'Scale Out', value: 'scaleOut' },
  { label: 'Wipe In', value: 'wipeIn' },
]

const CODE_REVEALS = [
  { label: 'None', value: 'none' },
  { label: 'Character typing', value: 'characters' },
  { label: 'Line typing', value: 'lines' },
  { label: 'Block reveal', value: 'blocks' },
] as const

export default function CodePanel() {
  const { project, getSelectedEls, updateElement, openCodeModal, addAnimation } = useEditorStore()
  const el = getSelectedEls().find(e => e.type === 'code') as CodeElement | undefined

  function upd(patch: Partial<CodeElement>) {
    if (el) updateElement(el.id, patch)
  }

  return (
    <div className="flex flex-col overflow-y-auto flex-1">
      <PanelHeader icon={<Code2 size={12} />} title="Code Block" />

      {!el && (
        <p className="text-xs text-[#f2f2f2] px-3 py-3">
          Click <strong className="text-editor-text-secondary">Code</strong> in the menu bar to add a code block.
        </p>
      )}

      {el && (
        <div className="flex flex-col px-3 py-2 gap-0.5">
          <button
            onClick={() => openCodeModal(el.id)}
            className="w-full text-xs py-2 bg-editor-accent-dim text-editor-accent border border-editor-accent rounded hover:bg-editor-accent hover:text-white transition-colors mb-2"
          >
            Edit Code…
          </button>

          <Row label="Language">
            <select
              value={el.language}
              onChange={e => upd({ language: e.target.value })}
              className="w-full bg-editor-elevated-highlight border border-editor-border rounded text-xs text-editor-text px-2 py-1"
            >
              {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </Row>

          <Row label="Font Size">
            <NumberInput value={el.fontSize} min={8} max={32} onChange={v => upd({ fontSize: v })} />
          </Row>

          <Row label="Background">
            <ColorInput
              value={el.bgColor ?? '#0d1117'}
              onChange={v => upd({ bgColor: v })}
            />
          </Row>

          <CheckRow label="Show line counts" checked={el.showLineNumbers}
            onChange={checked => upd({ showLineNumbers: checked })} />
          <CheckRow label="Fit scene width" checked={!!el.fitSceneWidth}
            onChange={checked => upd({ fitSceneWidth: checked, ...(checked ? { x: 0, width: project?.width ?? el.width } : {}) })} />
          <CheckRow label="Wrap text" checked={!!el.wrapLines}
            onChange={checked => upd({ wrapLines: checked })} />

          <AnimSection
            label="On Enter"
            color="text-green-400"
            anims={el.animations.filter(animation => animation.timing === 'onEnter' && !isMotionAnimation(animation))}
            types={CODE_ENTER_ANIMS}
            onAdd={() => addAnimation(el.id, { ...makeAnimation(), type: 'fadeIn', timing: 'onEnter' })}
            elId={el.id}
            isLoop={false}
          />

          <div className="border-t border-editor-border pt-2 mt-1">
            <Row label="Code typing animation">
              <select
                value={el.codeAnimation ?? 'none'}
                onChange={event => upd({ codeAnimation: event.target.value as CodeElement['codeAnimation'] })}
                className="w-full bg-editor-elevated-highlight border border-editor-border rounded text-xs text-editor-text px-2 py-1"
              >
                {CODE_REVEALS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </Row>

            {(el.codeAnimation === 'characters' || el.codeAnimation === 'lines') && (
              <div className="grid grid-cols-2 gap-2">
                <Row label="Delay (s)">
                  <NumberInput value={el.codeAnimationDelay ?? 0} min={0} max={60} step={0.1}
                    onChange={value => upd({ codeAnimationDelay: Math.max(0, value) })} />
                </Row>
                <Row label="Duration (s)">
                  <NumberInput value={el.codeAnimationDuration ?? 2} min={0.1} max={60} step={0.1}
                    onChange={value => upd({ codeAnimationDuration: Math.max(0.1, value) })} />
                </Row>
              </div>
            )}

            {el.codeAnimation === 'blocks' && (
              <CodeBlocks blocks={el.codeAnimationBlocks ?? []} code={el.code}
                onChange={blocks => upd({ codeAnimationBlocks: blocks })} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function CheckRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 py-2 text-xs text-editor-text cursor-pointer">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)}
        className="h-3.5 w-3.5 accent-editor-accent" />
    </label>
  )
}

function CodeBlocks({ blocks, code, onChange }: {
  blocks: CodeAnimationBlock[]
  code: string
  onChange: (blocks: CodeAnimationBlock[]) => void
}) {
  const lineCount = Math.max(1, code.split('\n').length)

  function updateBlock(id: string, patch: Partial<CodeAnimationBlock>) {
    onChange(blocks.map(block => block.id === id ? { ...block, ...patch } : block))
  }

  function addBlock() {
    const previous = blocks[blocks.length - 1]
    const delay = previous ? previous.delay + previous.duration : 0
    const fromLine = previous ? Math.min(lineCount, previous.toLine + 1) : 1
    onChange([...blocks, {
      id: uuid(),
      fromLine,
      toLine: Math.min(lineCount, Math.max(fromLine, fromLine + 7)),
      delay,
      duration: 1,
    }])
  }

  return (
    <div className="flex flex-col gap-2 pt-1">
      {blocks.map((block, index) => (
        <div key={block.id} className="rounded border border-editor-border bg-editor-elevated-highlight p-2">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-medium text-editor-text-secondary">Block {index + 1}</span>
            <button type="button" onClick={() => onChange(blocks.filter(item => item.id !== block.id))}
              title="Remove block" className="text-[#f2f2f2] hover:text-red-400">
              <Trash2 size={11} />
            </button>
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-1.5">
            <Row label="From line">
              <NumberInput value={block.fromLine} min={1} max={lineCount}
                onChange={value => updateBlock(block.id, { fromLine: Math.max(1, Math.min(lineCount, value)) })} />
            </Row>
            <span className="pb-1.5 text-xs text-editor-text-secondary">to</span>
            <Row label="To line">
              <NumberInput value={block.toLine} min={1} max={lineCount}
                onChange={value => updateBlock(block.id, { toLine: Math.max(block.fromLine, Math.min(lineCount, value)) })} />
            </Row>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Row label="Delay (s)">
              <NumberInput value={block.delay} min={0} max={60} step={0.1}
                onChange={value => updateBlock(block.id, { delay: Math.max(0, value) })} />
            </Row>
            <Row label="Duration (s)">
              <NumberInput value={block.duration} min={0.1} max={60} step={0.1}
                onChange={value => updateBlock(block.id, { duration: Math.max(0.1, value) })} />
            </Row>
          </div>
        </div>
      ))}
      <button type="button" onClick={addBlock}
        className={cn('flex items-center justify-center gap-1 rounded border border-editor-border bg-editor-elevated-highlight py-1.5 text-xs text-editor-text hover:border-editor-accent hover:text-editor-accent transition-colors')}>
        <Plus size={12} /> Add new block
      </button>
    </div>
  )
}
