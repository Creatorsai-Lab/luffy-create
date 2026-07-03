import { Table2 } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import type { TableElement } from '../../types/editor'
import { PanelHeader, Row, NumberInput, Slider, ColorInput } from './TextPanel'

export default function TablePanel() {
  const { getSelectedEls, updateElement } = useEditorStore()
  const el = getSelectedEls().find(e => e.type === 'table') as TableElement | undefined

  function upd(patch: Partial<TableElement>) {
    if (!el) return
    // Resize cells array when rows/cols change
    let cells = el.cells
    const newRows = (patch.rows ?? el.rows)
    const newCols = (patch.cols ?? el.cols)
    if (patch.rows !== undefined || patch.cols !== undefined) {
      cells = Array.from({ length: newRows }, (_, r) =>
        Array.from({ length: newCols }, (_, c) => el.cells[r]?.[c] ?? '')
      )
    }
    updateElement(el.id, { ...patch, cells, width: newCols * (patch.cellWidth ?? el.cellWidth), height: newRows * (patch.cellHeight ?? el.cellHeight) })
  }

  function setCell(r: number, c: number, val: string) {
    if (!el) return
    const cells = el.cells.map((row, ri) => row.map((cell, ci) => ri === r && ci === c ? val : cell))
    updateElement(el.id, { cells })
  }

  return (
    <div className="flex flex-col overflow-y-auto flex-1">
      <PanelHeader icon={<Table2 size={12} />} title="Table" />

      {!el && (
        <p className="text-sm text-[#f2f2f2] px-3 py-3">
          Table tool is selected, please click on the scene first to add <b>Table</b>, then edit it
        </p>
      )}

      {el && (
        <div className="flex flex-col px-3 py-2 gap-0.5">
          {/* Dimensions */}
          <Row label="Rows">
            <NumberInput value={el.rows} min={1} max={20} onChange={v => upd({ rows: v })} />
          </Row>
          <Row label="Columns">
            <NumberInput value={el.cols} min={1} max={20} onChange={v => upd({ cols: v })} />
          </Row>
          <Row label="Cell Width">
            <NumberInput value={el.cellWidth} min={40} max={400} onChange={v => upd({ cellWidth: v })} />
          </Row>
          <Row label="Cell Height">
            <NumberInput value={el.cellHeight} min={24} max={200} onChange={v => upd({ cellHeight: v })} />
          </Row>

          {/* Style */}
          <Row label="Header Bg">
            <ColorInput value={el.headerBg} onChange={v => upd({ headerBg: v })} />
          </Row>
          <Row label="Cell Bg">
            <ColorInput value={el.cellBg} onChange={v => upd({ cellBg: v })} />
          </Row>
          <Row label="Border Color">
            <ColorInput value={el.borderColor} onChange={v => upd({ borderColor: v })} />
          </Row>
          <Row label="Border Width">
            <Slider value={el.borderWidth} min={0} max={8} step={0.5}
              onChange={v => upd({ borderWidth: v })} display={`${el.borderWidth}px`} />
          </Row>
          <Row label="Text Color">
            <ColorInput value={el.textColor} onChange={v => upd({ textColor: v })} />
          </Row>
          <Row label="Font Size">
            <NumberInput value={el.fontSize} min={15} max={50} onChange={v => upd({ fontSize: v })} />
          </Row>

          {/* Cell editor */}
          <div className="mt-2">
            <span className="label block mb-1.5">Cell Content</span>
            <div className="overflow-auto max-h-40 border border-editor-border rounded">
              <table className="w-full border-collapse text-xs">
                <tbody>
                  {el.cells.map((row, r) => (
                    <tr key={r}>
                      {row.map((cell, c) => (
                        <td key={c} className="border border-editor-border p-0">
                          <input
                            value={cell}
                            onChange={e => setCell(r, c, e.target.value)}
                            className="w-full px-1.5 py-1 bg-editor-elevated text-editor-text text-xs nodrag min-w-[60px]"
                            placeholder={r === 0 ? `Header ${c + 1}` : `${r},${c}`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
