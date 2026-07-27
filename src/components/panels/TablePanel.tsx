import { AlignCenter, AlignLeft, AlignRight, Table2 } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import type { AlignType, AnimationType, ElementAnimation, TableElement } from '../../types/editor'
import { makeAnimation } from '../../utils/defaults'
import { AnimSection, isLoopAnim, PanelHeader, Row, NumberInput, Slider, ColorInput } from './TextPanel'

const ENTER_ANIMS: { label: string; value: AnimationType }[] = [
  { label: 'Fade In',   value: 'fadeIn'   },
  { label: 'Slide In',  value: 'slideIn'  },
  { label: 'Scale In',  value: 'scaleIn'  },
  { label: 'Wipe In',   value: 'wipeIn'   },
]

const LOOP_ANIMS: { label: string; value: AnimationType }[] = [
  { label: 'Pulse',     value: 'pulse'      },
  { label: 'Bounce',    value: 'bounceLoop' },
  { label: 'Rotate',    value: 'rotateLoop' },
  { label: 'Fade Loop', value: 'fadeLoop'   },
]

const EXIT_ANIMS: { label: string; value: AnimationType }[] = [
  { label: 'Fade Out',  value: 'fadeOut'  },
  { label: 'Slide Out', value: 'slideOut' },
  { label: 'Scale Out', value: 'scaleOut' },
  { label: 'Wipe Out',  value: 'wipeOut'  },
]

function nonMoveAnimations(anims: ElementAnimation[]) {
  return anims.filter(a => a.type !== 'move')
}

export default function TablePanel() {
  const { getSelectedEls, updateElement, addAnimation } = useEditorStore()
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
        <div className="flex flex-col px-1 py-1 gap-0.5">
          <div className='bg-[#2a2b2c] p-2 rounded mb-2'>
          {/* Dimensions */}
          <Row label="Cell Width">
            <NumberInput value={el.cellWidth} min={40} max={400} onChange={v => upd({ cellWidth: v })} />
          </Row>
          <Row label="Cell Height">
            <NumberInput value={el.cellHeight} min={24} max={200} onChange={v => upd({ cellHeight: v })} />
          </Row>
          <Row label="Radius">
            <Slider value={el.borderRadius ?? 0} min={0} max={80} step={1}
              onChange={v => upd({ borderRadius: v })} display={`${el.borderRadius ?? 0}px`} />
          </Row>

          {/* Style */}
          <Row label="Header Bg">
            <ColorInput value={el.headerBg} onChange={v => upd({ headerBg: v })} />
          </Row>
          <Row label="Cell Bg">
            <ColorInput value={el.cellBg} onChange={v => upd({ cellBg: v })} />
          </Row>
          <Row label="Wrapper Border Color">
            <ColorInput value={el.borderColor} onChange={v => upd({ borderColor: v })} />
          </Row>
          <Row label="Border Width">
            <Slider value={el.borderWidth} min={0} max={8} step={0.5}
              onChange={v => upd({ borderWidth: v })} display={`${el.borderWidth}px`} />
          </Row>
          </div>
          <div className='bg-[#2a2b2c] p-2 rounded'>
          <Row label="Cell Border Color">
            <ColorInput value={el.cellBorderColor ?? el.borderColor} onChange={v => upd({ cellBorderColor: v })} />
          </Row>
          <Row label="Cell Border Width">
            <Slider value={el.cellBorderWidth ?? el.borderWidth} min={0} max={8} step={0.5}
              onChange={v => upd({ cellBorderWidth: v })} display={`${el.cellBorderWidth ?? el.borderWidth}px`} />
          </Row>
          
          <Row label="Rows">
            <NumberInput value={el.rows} min={1} max={20} onChange={v => upd({ rows: v })} />
          </Row>
          <Row label="Columns">
            <NumberInput value={el.cols} min={1} max={20} onChange={v => upd({ cols: v })} />
          </Row>
          <Row label="Text Color">
            <ColorInput value={el.textColor} onChange={v => upd({ textColor: v })} />
          </Row>
          <Row label="Font Size">
            <NumberInput value={el.fontSize} min={15} max={50} onChange={v => upd({ fontSize: v })} />
          </Row>
          <Row label="Text Align">
            <div className="flex gap-1">
              {(['left','center','right'] as AlignType[]).map(a => (
                <button
                  key={a}
                  type="button"
                  onClick={() => upd({ textAlign: a })}
                  className={`flex h-7 w-8 items-center justify-center rounded border text-xs transition-colors ${
                    (el.textAlign ?? 'center') === a
                      ? 'border-editor-accent bg-editor-accent text-white'
                      : 'border-editor-border bg-editor-elevated text-editor-text hover:border-editor-accent/60'
                  }`}
                  title={`Align ${a}`}
                >
                  {a === 'left' ? <AlignLeft size={12} /> : a === 'center' ? <AlignCenter size={12} /> : <AlignRight size={12} />}
                </button>
              ))}
            </div>
          </Row>
          </div>

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

          <div className="-mx-3 mt-2">
            <AnimSection
              label="On Enter" color="text-green-400"
              anims={nonMoveAnimations(el.animations).filter(a => !isLoopAnim(a) && a.timing === 'onEnter')}
              types={ENTER_ANIMS}
              onAdd={() => addAnimation(el.id, { ...makeAnimation(), type: 'fadeIn', timing: 'onEnter' })}
              elId={el.id} isLoop={false}
            />
            <AnimSection
              label="Loop" color="text-editor-accent"
              anims={nonMoveAnimations(el.animations).filter(a => isLoopAnim(a))}
              types={LOOP_ANIMS}
              onAdd={() => addAnimation(el.id, { ...makeAnimation(), type: 'pulse', timing: 'loop', duration: 1 })}
              elId={el.id} isLoop={true}
            />
            <AnimSection
              label="On Exit" color="text-red-400"
              anims={nonMoveAnimations(el.animations).filter(a => !isLoopAnim(a) && a.timing === 'onExit')}
              types={EXIT_ANIMS}
              onAdd={() => addAnimation(el.id, { ...makeAnimation(), type: 'fadeOut', timing: 'onExit' })}
              elId={el.id} isLoop={false}
            />
          </div>
        </div>
      )}
    </div>
  )
}
