import { useState } from 'react'
import { Timer, Italic } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import { FONT_FAMILIES } from '../../types/editor'
import type { CounterElement, FontWeight } from '../../types/editor'
import { cn } from '../../utils/cn'
import { makeAnimation, makeCounter } from '../../utils/defaults'
import { PanelHeader, Row, ColorInput, Slider, NumberInput, AnimSection, isLoopAnim } from './TextPanel'
import { ENTER_ANIMS, LOOP_ANIMS, EXIT_ANIMS } from './TextPanel'
import { FONT_WEIGHT_OPTIONS, normalizeFontWeightForControl } from '../../utils/fontWeight'

type CounterMode = 'number' | 'english' | 'hindi'

export default function CounterPanel() {
  const { getSelectedEls, updateElement, addAnimation, addElement, project } = useEditorStore()
  const selected = getSelectedEls()
  const el = selected.find(e => e.type === 'counter') as CounterElement | undefined

  // Configuration state for "Add Counter" button
  const [counterConfig, setCounterConfig] = useState({
    mode: 'number' as CounterMode,
    start: 1,
    end: 20,
    speedMs: 100
  })

  function upd(patch: Partial<CounterElement>) {
    if (el) updateElement(el.id, patch)
  }

  function handleAddCounter() {
    if (!project) return
    const counter = makeCounter(project.width / 2 - 150, project.height / 2 - 50)
    counter.mode = counterConfig.mode
    counter.start = counterConfig.start
    counter.end = counterConfig.end
    counter.speedMs = counterConfig.speedMs
    addElement(counter)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PanelHeader icon={<Timer size={12} />} title="Counter" />
      <div className="px-3 py-2 flex flex-col gap-2">
        <button
          disabled={!project}
          onClick={handleAddCounter}
          className="w-full text-xs py-2 text-editor-text bg-editor-accent rounded hover:bg-editor-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
          + Add Counter
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {el && (
          <>
            {/* Counter-specific properties */}
            <div className="border-b border-editor-border px-3 py-2 flex flex-col gap-0.5">
              <Row label="Mode">
                <select
                  value={el.mode}
                  onChange={e => {
                    const newMode = e.target.value as CounterMode
                    const patch: Partial<CounterElement> = { mode: newMode }
                    if (newMode === 'number') {
                      patch.start = 1
                      patch.end = 50
                    } else if (newMode === 'english') {
                      patch.start = 'A'
                      patch.end = 'Z'
                    } else if (newMode === 'hindi') {
                      patch.start = 'अ'
                      patch.end = 'त्र'
                    }
                    upd(patch)
                  }}
                  className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1"
                >
                  <option value="number">Numbers (1, 2, 3...)</option>
                  <option value="english">Letters (A, B, C...)</option>
                  <option value="hindi">Hindi (क, ख, ग...)</option>
                </select>
              </Row>

              <Row label="Range">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <span className="text-[10px] text-editor-secondary block mb-1">Start</span>
                    {el.mode === 'number' ? (
                      <input
                        type="number"
                        value={el.start}
                        onChange={e => upd({ start: Number(e.target.value) })}
                        className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1"
                      />
                    ) : (
                      <input
                        type="text"
                        value={String(el.start)}
                        onChange={e => upd({ start: e.target.value })}
                        className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1"
                        placeholder={el.mode === 'english' ? 'A' : 'क'}
                        maxLength={1}
                      />
                    )}
                  </div>
                  <div className="flex-1">
                    <span className="text-[10px] text-editor-secondary block mb-1">End</span>
                    {el.mode === 'number' ? (
                      <input
                        type="number"
                        value={el.end}
                        onChange={e => upd({ end: Number(e.target.value) })}
                        className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1"
                      />
                    ) : (
                      <input
                        type="text"
                        value={String(el.end)}
                        onChange={e => upd({ end: e.target.value })}
                        className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1"
                        placeholder={el.mode === 'english' ? 'Z' : 'ज्ञ'}
                        maxLength={1}
                      />
                    )}
                  </div>
                </div>
              </Row>

              <Row label="Speed (seconds per change)">
              <Slider
                value={el.speedMs / 1000}
                min={0.05}
                max={5}
                step={0.05}
                onChange={v => upd({ speedMs: Math.round(v * 1000) })}
                display={`${(el.speedMs / 1000).toFixed(2)}s`}
              />
              </Row>
            </div>

            {/* Text properties */}
            <div className="flex flex-col gap-0.5 px-3 py-2">
              <Row label="Font">
                <select
                  value={el.fontFamily}
                  onChange={e => upd({ fontFamily: e.target.value })}
                  className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1"
                >
                  {FONT_FAMILIES.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </Row>
              <div className='flex justify-between'>
              <Row label="Size">
                <NumberInput value={el.fontSize} min={8} max={400} onChange={v => upd({ fontSize: v })} />
              </Row>

              <Row label="Weight">
                <select
                  value={normalizeFontWeightForControl(el.fontWeight)}
                  onChange={e => upd({ fontWeight: e.target.value as FontWeight })}
                  className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1"
                >
                  {FONT_WEIGHT_OPTIONS.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
                </select>
              </Row>

              <Row label="Italic">
                <div className="flex gap-1">
                  <ToggleBtn active={el.italic} onClick={() => upd({ italic: !el.italic })}>
                    <Italic size={11} />
                  </ToggleBtn>
                </div>
              </Row>
              </div>

              <Row label="Color">
                <ColorInput value={el.color} onChange={v => upd({ color: v })} />
              </Row>

              <Row label="Line Height">
                <Slider value={el.lineHeight} min={0.8} max={5} step={0.05}
                  onChange={v => upd({ lineHeight: v })} display={el.lineHeight.toFixed(2)} />
              </Row>

              <Row label="Opacity">
                <Slider value={el.opacity} min={0} max={1} step={0.01}
                  onChange={v => upd({ opacity: v })} display={`${Math.round(el.opacity * 100)}%`} />
              </Row>
              <Row label="Shadow Color">
                <ColorInput value={el.shadowColor || '#000000'} onChange={v => upd({ shadowColor: v })} />
              </Row>

              <Row label="Shadow Blur">
                <Slider value={el.shadowBlur ?? 0} min={0} max={80} step={1}
                  onChange={v => upd({ shadowBlur: v })} display={`${el.shadowBlur ?? 0}`} />
              </Row>

              <Row label="Shadow Offset">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <span className="label block">X</span>
                    <NumberInput value={el.shadowOffsetX ?? 0} min={-50} max={50} onChange={v => upd({ shadowOffsetX: v })} />
                  </div>
                  <div className="flex-1">
                    <span className="label block">Y</span>
                    <NumberInput value={el.shadowOffsetY ?? 0} min={-50} max={50} onChange={v => upd({ shadowOffsetY: v })} />
                  </div>
                </div>
              </Row>
            </div>

            {/* Background */}
            <div className="border-t border-editor-border px-3 py-2 flex flex-col gap-0.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-ms font-medium text-editor-text">Counter Text Background</span>
                <button
                  onClick={() => upd({ bgEnabled: !el.bgEnabled })}
                  className={cn(
                    'px-2 py-0.5 rounded text-[11px] transition-colors',
                    el.bgEnabled
                      ? 'bg-editor-accent text-white'
                      : 'bg-editor-elevated text-[#f2f2f2] border border-editor-border hover:text-editor-text'
                  )}
                >
                  {el.bgEnabled ? 'On' : 'Off'}
                </button>
              </div>

              {el.bgEnabled && (
                <>
                  <Row label="Color">
                    <ColorInput value={el.bgColor || '#000000'} onChange={v => upd({ bgColor: v })} />
                  </Row>
                  <Row label="Transparency">
                    <Slider value={el.bgOpacity ?? 1} min={0} max={1} step={0.01}
                      onChange={v => upd({ bgOpacity: v })} display={`${Math.round((el.bgOpacity ?? 1) * 100)}%`} />
                  </Row>
                  <Row label="Padding X">
                    <Slider value={el.bgPadX ?? 16} min={0} max={120} step={1}
                      onChange={v => upd({ bgPadX: v })} display={`${el.bgPadX ?? 16}px`} />
                  </Row>
                  <Row label="Padding Y">
                    <Slider value={el.bgPadY ?? 10} min={0} max={120} step={1}
                      onChange={v => upd({ bgPadY: v })} display={`${el.bgPadY ?? 10}px`} />
                  </Row>
                  <Row label="Corner Radius">
                    <Slider value={el.bgRadius ?? 0} min={0} max={100} step={1}
                      onChange={v => upd({ bgRadius: v })} display={`${el.bgRadius ?? 0}px`} />
                  </Row>
                  <Row label="Shadow Color">
                    <ColorInput value={el.bgShadowColor || '#000000'} onChange={v => upd({ bgShadowColor: v })} />
                  </Row>
                  <Row label="Shadow Blur">
                    <Slider value={el.bgShadowBlur ?? 0} min={0} max={80} step={1}
                      onChange={v => upd({ bgShadowBlur: v })} display={`${el.bgShadowBlur ?? 0}`} />
                  </Row>
                  <Row label="Shadow Offset">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <span className="label block">X</span>
                        <NumberInput value={el.bgShadowOffsetX ?? 0} min={-50} max={50} onChange={v => upd({ bgShadowOffsetX: v })} />
                      </div>
                      <div className="flex-1">
                        <span className="label block">Y</span>
                        <NumberInput value={el.bgShadowOffsetY ?? 0} min={-50} max={50} onChange={v => upd({ bgShadowOffsetY: v })} />
                      </div>
                    </div>
                  </Row>
                </>
              )}
            </div>

            {/* Animations */}
            <AnimSection
              label="On Enter" color="text-green-400"
              anims={el.animations.filter(a => a.type !== 'move' && !isLoopAnim(a) && a.timing === 'onEnter')}
              types={ENTER_ANIMS}
              onAdd={() => addAnimation(el.id, { ...makeAnimation(), type: 'fadeIn', timing: 'onEnter' })}
              elId={el.id} isLoop={false}
            />
            <AnimSection
              label="Loop" color="text-editor-accent"
              anims={el.animations.filter(a => a.type !== 'move' && isLoopAnim(a))}
              types={LOOP_ANIMS}
              onAdd={() => addAnimation(el.id, { ...makeAnimation(), type: 'pulse', timing: 'loop', duration: 1 })}
              elId={el.id} isLoop={true}
            />
            <AnimSection
              label="On Exit" color="text-red-400"
              anims={el.animations.filter(a => a.type !== 'move' && !isLoopAnim(a) && a.timing === 'onExit')}
              types={EXIT_ANIMS}
              onAdd={() => addAnimation(el.id, { ...makeAnimation(), type: 'fadeOut', timing: 'onExit' })}
              elId={el.id} isLoop={false}
            />
          </>
        )}
      </div>
    </div>
  )
}

function ToggleBtn({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center justify-center w-7 h-7 rounded transition-colors',
        active ? 'bg-editor-accent text-white' : 'bg-editor-elevated text-[#c1c1c1] hover:text-editor-text'
      )}
    >
      {children}
    </button>
  )
}
