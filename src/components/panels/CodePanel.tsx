import { Code2 } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import type { CodeElement } from '../../types/editor'
import { LANGUAGES } from '../../types/editor'
import { PanelHeader, Row, NumberInput, Slider, ColorInput } from './TextPanel'
import { cn } from '../../utils/cn'

export default function CodePanel() {
  const { getSelectedEls, updateElement, openCodeModal } = useEditorStore()
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

          <Row label="Line Numbers">
            <button
              onClick={() => upd({ showLineNumbers: !el.showLineNumbers })}
              className={cn(
                'text-xs px-3 py-1 rounded border transition-colors',
                el.showLineNumbers
                  ? 'bg-editor-accent-dim border-editor-accent text-editor-accent'
                  : 'bg-editor-elevated-highlight border-editor-border text-[#f2f2f2] hover:text-editor-text'
              )}
            >
              {el.showLineNumbers ? 'Shown ✓' : 'Hidden'}
            </button>
          </Row>

          <Row label="Opacity">
            <Slider value={el.opacity} min={0} max={1} step={0.01}
              onChange={v => upd({ opacity: v })} display={`${Math.round(el.opacity * 100)}%`} />
          </Row>
        </div>
      )}
    </div>
  )
}
