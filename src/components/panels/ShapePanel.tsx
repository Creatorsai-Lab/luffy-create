import { Shapes, Square, Circle, Triangle, Star, Pentagon, Hexagon, Octagon, Diamond, MessageCircle, MessageSquare, Cone, Box, Plus, Trash2, Heart, SquareDashedBottom } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import type { ShapeElement, ShapeType, ShapeFillMode, AnimationType, EasingType, SlideDir, ElementAnimation } from '../../types/editor'
import { PanelHeader, Row, ColorInput, Slider, NumberInput } from './TextPanel'
import { cn } from '../../utils/cn'
import { makeAnimation, makeShape } from '../../utils/defaults'
import BoxShadowControls, { InnerShadowControls } from './BoxShadowControls'
import { ScaleSizeControl } from './AnimationParamControls'
import BorderControls from './BorderControls'



const SHAPES: { icon: React.ReactNode; type: ShapeType; label: string }[] = [
  { icon: <Square size={14} />,        type: 'rect',          label: 'Rectangle'    },
  { icon: <Circle size={14} />,        type: 'circle',        label: 'Circle'       },
  { icon: <Triangle size={14} />,      type: 'triangle',      label: 'Triangle'     },
  { icon: <Star size={14} />,          type: 'star',          label: 'Star'         },
  { icon: <Pentagon size={14} />,      type: 'pentagon',      label: 'Pentagon'     },
  { icon: <Hexagon size={14} />,       type: 'hexagon',       label: 'Hexagon'      },
  { icon: <Octagon size={14} />,       type: 'octagon',       label: 'Octagon'      },
  { icon: <Diamond size={14} />,       type: 'diamond',       label: 'Diamond'      },
  { icon: <MessageSquare size={14} />, type: 'speechBubble',  label: 'Speech Box'   },
  { icon: <MessageCircle size={14} />, type: 'roundedSpeech', label: 'Casual Speech'},
  { icon: <Cone size={14} />,          type: 'cone',          label: '3D Cone'      },
  { icon: <Box size={14} />,           type: 'cube',          label: '3D Cube'      },
  { icon: <Heart size={14} />,         type: 'heart',         label: 'Heart'        },
  { icon: <SquareDashedBottom size={14} />,    type: 'rect-sketch',   label: 'Sketch Box'   },
]

const SHAPES_3D = new Set<ShapeType>(['cone', 'cube'])

const ENTER_ANIMS: { label: string; value: AnimationType }[] = [
  { label: 'Slide In',  value: 'slideIn'  },
  { label: 'Fade In',   value: 'fadeIn'   },
  { label: 'Scale In',  value: 'scaleIn'  },
  { label: 'Scale Out', value: 'scaleOut' },
  { label: 'Wipe In',   value: 'wipeIn'   },
]

const LOOP_ANIMS: { label: string; value: AnimationType }[] = [
  { label: 'Pulse',     value: 'pulse'      },
  { label: 'Bounce',    value: 'bounceLoop' },
  { label: 'Rotate',    value: 'rotateLoop' },
  { label: 'Fade Loop', value: 'fadeLoop'   },
  { label: 'Flow',      value: 'flowLoop'   },
]

const EXIT_ANIMS: { label: string; value: AnimationType }[] = [
  { label: 'Slide Out', value: 'slideOut' },
  { label: 'Fade Out',  value: 'fadeOut'  },
  { label: 'Scale In',  value: 'scaleIn'  },
  { label: 'Scale Out', value: 'scaleOut' },
  { label: 'Wipe Out',  value: 'wipeOut'  },
]

const EASINGS: { label: string; value: EasingType }[] = [
  { label: 'Linear',     value: 'linear'   },
  { label: 'Ease In',    value: 'easeIn'   },
  { label: 'Ease Out',   value: 'easeOut'  },
  { label: 'Ease InOut', value: 'easeInOut'},
  { label: 'Bounce',     value: 'bounce'   },
]

const DIRECTIONS: { label: string; value: SlideDir }[] = [
  { label: '← Left',  value: 'left'  },
  { label: '→ Right', value: 'right' },
  { label: '↑ Up',    value: 'up'    },
  { label: '↓ Down',  value: 'down'  },
]

const LOOP_TYPE_SET = new Set<string>(['pulse', 'bounceLoop', 'rotateLoop', 'flowLoop', 'fadeLoop'])
const isLoopAnim = (a: ElementAnimation) => LOOP_TYPE_SET.has(a.type) || a.timing === 'loop'

export default function ShapePanel() {
  const { getSelectedEls, updateElement, addElement, addAnimation, project } = useEditorStore()
  const el = getSelectedEls().find(e => e.type === 'shape') as ShapeElement | undefined

  function upd(patch: Partial<ShapeElement>) {
    if (el) updateElement(el.id, patch)
  }

  function handleAddShape(type: ShapeType) {
    if (!project) return
    const size = type === 'cube' ? 300 : 280
    addElement(makeShape(type, project.width / 2 - size / 2, project.height / 2 - size / 2))
  }

  return (
    <div className="flex flex-col overflow-y-auto flex-1">
      <PanelHeader icon={<Shapes size={14} />} title="Shape" />

      {/* Shape picker — click to add immediately */}
      <div className="px-3 py-2 border-b border-editor-border">
        <p className="text-[10px] text-editor-secondary mb-2">Click a shape to add to canvas</p>
        <div className="grid grid-cols-4 gap-1.5">
          {SHAPES.map(s => (
            <button
              key={s.type}
              onClick={() => handleAddShape(s.type)}
              disabled={!project}
              title={s.label}
              className={cn(
                'flex items-center justify-center w-full h-9 rounded border cursor-pointer transition-all',
                'bg-editor-elevated border-editor-border text-editor-text',
                'hover:bg-editor-accent-dim hover:border-editor-accent hover:text-editor-accent active:scale-95',
                'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-editor-elevated disabled:hover:border-editor-border',
                el?.shapeType === s.type && 'bg-editor-accent-dim border-editor-accent text-editor-accent ring-1 ring-editor-accent/50'
              )}
            >
              {s.icon}
            </button>
          ))}
        </div>
      </div>

      {!el && (
        <p className="text-sm text-editor-secondary px-3 py-3">
          Select a shape on the canvas to edit it.
        </p>
      )}

      {el && (
        <>
          <div className="flex flex-col px-3 py-2 gap-0.5">
            <Row label="Fill Mode">
              <select
                value={el.fillMode ?? 'solid'}
                onChange={e => upd({ fillMode: e.target.value as ShapeFillMode })}
                className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1"
              >
                <option value="solid">Solid</option>
                <option value="linearGradient">Linear Gradient</option>
                <option value="radialGradient">Radial Gradient</option>
              </select>
            </Row>

            {(el.fillMode ?? 'solid') === 'solid' ? (
              <>
                <Row label="Fill">
                  <div className="flex items-center gap-1">
                    <ColorInput value={el.fill === 'transparent' ? '#6366f1' : el.fill} onChange={v => upd({ fill: v })} disabled={el.fill === 'transparent'} />
                    <button
                      onClick={() => upd({ fill: el.fill === 'transparent' ? '#6366f1' : 'transparent' })}
                      className={cn(
                        'px-2 py-1 text-2xs rounded border transition-colors',
                        el.fill === 'transparent'
                          ? 'bg-editor-accent-dim border-editor-accent text-editor-accent'
                          : 'bg-editor-elevated border-editor-border text-[#f2f2f2] hover:text-editor-text'
                      )}
                      title="Toggle transparent fill"
                    >
                      {el.fill === 'transparent' ? 'No Fill' : 'Filled'}
                    </button>
                  </div>
                </Row>
                <Row label="Fill Opacity">
                  <Slider value={Math.round((el.fillOpacity ?? 1) * 100)} min={0} max={100} step={1}
                    onChange={v => upd({ fillOpacity: v / 100 })} display={`${Math.round((el.fillOpacity ?? 1) * 100)}%`} />
                </Row>
              </>
            ) : (
              <>
                <Row label="Color 1">
                  <ColorInput value={el.gradientFrom ?? (el.fill === 'transparent' ? '#6366f1' : el.fill)} onChange={v => upd({ gradientFrom: v })} />
                </Row>
                <Row label="Color 1 Opacity">
                  <Slider value={Math.round((el.gradientFromOpacity ?? 1) * 100)} min={0} max={100} step={1}
                    onChange={v => upd({ gradientFromOpacity: v / 100 })} display={`${Math.round((el.gradientFromOpacity ?? 1) * 100)}%`} />
                </Row>
                <Row label="Color 2">
                  <ColorInput value={el.gradientTo ?? '#22d3ee'} onChange={v => upd({ gradientTo: v })} />
                </Row>
                <Row label="Color 2 Opacity">
                  <Slider value={Math.round((el.gradientToOpacity ?? 1) * 100)} min={0} max={100} step={1}
                    onChange={v => upd({ gradientToOpacity: v / 100 })} display={`${Math.round((el.gradientToOpacity ?? 1) * 100)}%`} />
                </Row>
                {(el.fillMode ?? 'solid') === 'linearGradient' && (
                  <Row label="Gradient Angle">
                    <Slider value={el.gradientAngle ?? 135} min={0} max={360} step={1}
                      onChange={v => upd({ gradientAngle: v })} display={`${el.gradientAngle ?? 135}°`} />
                  </Row>
                )}
              </>
            )}
            <BorderControls value={el} onChange={upd} />
            {el.shapeType === 'rect' && (
              <Row label="Corner Radius">
                <Slider value={el.cornerRadius} min={0} max={250} step={1}
                  onChange={v => upd({ cornerRadius: v })} display={`${el.cornerRadius}px`} />
              </Row>
            )}
            {SHAPES_3D.has(el.shapeType) && (
              <>
                <Row label="Depth">
                  <Slider
                    value={el.depth ?? 55}
                    min={10} max={300} step={1}
                    onChange={v => upd({ depth: v })}
                    display={`${el.depth ?? 55}px`}
                  />
                </Row>
                <Row label="Face Color">
                  <div className="flex items-center gap-1">
                    <ColorInput
                      value={el.faceColor || '#808080'}
                      onChange={v => upd({ faceColor: v })}
                      disabled={!el.faceColor}
                    />
                    <button
                      onClick={() => upd({ faceColor: el.faceColor ? '' : '#808080' })}
                      className={cn(
                        'px-2 py-1 text-2xs rounded border transition-colors',
                        el.faceColor
                          ? 'bg-editor-accent-dim border-editor-accent text-editor-accent'
                          : 'bg-editor-elevated border-editor-border text-[#f2f2f2] hover:text-editor-text'
                      )}
                      title="Toggle custom face color"
                    >
                      {el.faceColor ? 'Custom' : 'Auto'}
                    </button>
                  </div>
                </Row>
              </>
            )}
            <Row label="Width">
              <NumberInput value={Math.round(el.width)} min={4} max={4000} onChange={v => upd({ width: v })} />
            </Row>
            <Row label="Height">
              <NumberInput value={Math.round(el.height)} min={4} max={4000} onChange={v => upd({ height: v })} />
            </Row>
            <BoxShadowControls value={el.boxShadow} onChange={boxShadow => upd({ boxShadow })} />
            <InnerShadowControls value={el.innerShadow} onChange={innerShadow => upd({ innerShadow })} />
          </div>

          {/* ── Animations ──────────────────────────────────────────── */}
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
  )
}

function AnimSection({
  label, color, anims, types, onAdd, elId, isLoop
}: {
  label: string
  color: string
  anims: ElementAnimation[]
  types: { label: string; value: AnimationType }[]
  onAdd: () => void
  elId: string
  isLoop: boolean
}) {
  return (
    <div className="border-t border-editor-border">
      <div className="px-3 py-1.5 flex items-center justify-between">
        <span className={cn('text-[10px] font-semibold uppercase tracking-wider', color)}>{label}</span>
        <button
          onClick={onAdd}
          className="flex items-center gap-1 text-[10px] px-2 py-0.5 bg-editor-elevated text-[#f2f2f2] border border-editor-border rounded hover:text-editor-text transition-colors"
        >
          <Plus size={8} /> Add
        </button>
      </div>
      {anims.length === 0 && (
        <p className="text-[10px] text-[#d9d9d9] px-3 pb-2">None — click Add to create one.</p>
      )}
      {anims.map((anim, i) => (
        <AnimBlock key={anim.id} anim={anim} index={i} elId={elId} types={types} isLoop={isLoop} />
      ))}
    </div>
  )
}

function AnimBlock({
  anim, index, elId, types, isLoop
}: {
  anim: ElementAnimation; index: number; elId: string
  types: { label: string; value: AnimationType }[]
  isLoop: boolean
}) {
  const { updateAnimation, removeAnimation } = useEditorStore()

  function upd(patch: Partial<ElementAnimation>) {
    updateAnimation(elId, anim.id, patch)
  }

  const hasDir  = ['slideIn', 'slideOut', 'wipeIn', 'wipeOut'].includes(anim.type)
  const hasDist = anim.type === 'bounceLoop'

  return (
    <div className="border-t border-editor-border px-3 py-2 flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-editor-secondary font-medium">#{index + 1}</span>
        <button onClick={() => removeAnimation(elId, anim.id)} className="text-[#d9d9d9] hover:text-red-400 transition-colors">
          <Trash2 size={10} />
        </button>
      </div>

      <Row label="Type">
        <select
          value={anim.type}
          onChange={e => upd({ type: e.target.value as AnimationType })}
          className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1"
        >
          {types.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </Row>

      {isLoop && (
        <div className="text-[10px] text-editor-accent bg-editor-accent-dim rounded px-2 py-0.5 w-fit">
          ∞ Loops continuously
        </div>
      )}

      {hasDir && (
        <Row label="Direction">
          <select
            value={anim.params?.direction ?? 'left'}
            onChange={e => upd({ params: { ...anim.params, direction: e.target.value as SlideDir } })}
            className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1"
          >
            {DIRECTIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </Row>
      )}

      {hasDist && (
        <Row label="Distance (px)">
          <input type="number" min={4} max={200} step={2}
            value={anim.params?.distance ?? 24}
            onChange={e => upd({ params: { ...anim.params, distance: Number(e.target.value) } })}
            className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1 nodrag"
          />
        </Row>
      )}

      <ScaleSizeControl anim={anim} onChange={upd} />

      <Row label="Start (s)">
        <input type="number" min={0} max={60} step={0.1}
          value={anim.startTime}
          onChange={e => upd({ startTime: Number(e.target.value) })}
          className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1 nodrag"
        />
      </Row>

      <Row label={isLoop ? 'Period (s)' : 'Duration (s)'}>
        <input type="number" min={0.1} max={30} step={0.1}
          value={anim.duration}
          onChange={e => upd({ duration: Number(e.target.value) })}
          className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1 nodrag"
        />
      </Row>

      <Row label="Delay (s)">
        <input type="number" min={0} max={60} step={0.1}
          value={anim.delay}
          onChange={e => upd({ delay: Number(e.target.value) })}
          className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1 nodrag"
        />
      </Row>

      {!isLoop && (
        <Row label="Easing">
          <select
            value={anim.easing}
            onChange={e => upd({ easing: e.target.value as EasingType })}
            className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1"
          >
            {EASINGS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
          </select>
        </Row>
      )}
    </div>
  )
}
