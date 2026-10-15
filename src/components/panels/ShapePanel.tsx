import { Shapes, Square, Circle, Triangle, Star, Pentagon, Hexagon, Octagon, Diamond, MessageCircle, MessageSquare, Cone, Box, Heart, SquareDashedBottom } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import type { Face3D, ShapeElement, ShapeType, ShapeFillMode, AnimationType } from '../../types/editor'
import { PanelHeader, Row, ColorInput, Slider, NumberInput, AnimSection } from './TextPanel'
import { cn } from '../../utils/cn'
import { makeAnimation, makeShape } from '../../utils/defaults'
import BoxShadowControls, { InnerShadowControls } from './BoxShadowControls'
import BorderControls from './BorderControls'
import { isMotionAnimation } from '../../utils/moveAnimation'
import { CONE_FACES, CUBE_FACES, cuboidDepth, faceFill, get3DRotation } from '../../engine/shape3d'
import { isLoopAnimation } from '../../utils/animationTypes'
import { useShallow } from 'zustand/react/shallow'

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

export default function ShapePanel() {
  const { getSelectedEls, updateElement, addElement, addAnimation, project } = useEditorStore(useShallow(s => ({ getSelectedEls: s.getSelectedEls, updateElement: s.updateElement, addElement: s.addElement, addAnimation: s.addAnimation, project: s.project, currentSceneId: s.currentSceneId, selectedIds: s.selectedIds })))
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
        <p className="text-[10px] text-editor-text-secondary mb-2">Click a shape to add to canvas</p>
        <div className="grid grid-cols-4 gap-1.5">
          {SHAPES.map(s => (
            <button
              key={s.type}
              onClick={() => handleAddShape(s.type)}
              disabled={!project}
              title={s.label}
              className={cn(
                'flex items-center justify-center w-full h-9 rounded border cursor-pointer transition-all',
                'bg-editor-elevated-highlight border-editor-border text-editor-text',
                'hover:bg-editor-accent-dim hover:border-editor-accent hover:text-editor-accent active:scale-95',
                'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-editor-elevated-highlight disabled:hover:border-editor-border',
                el?.shapeType === s.type && 'bg-editor-accent-dim border-editor-accent text-editor-accent ring-1 ring-editor-accent/50'
              )}
            >
              {s.icon}
            </button>
          ))}
        </div>
      </div>

      {!el && (
        <p className="text-sm text-editor-text-secondary px-3 py-3">
          Select a shape on the canvas to edit it.
        </p>
      )}

      {el && (
        <>
          <div className="flex flex-col px-3 py-2 gap-0.5 bg-red">
            {SHAPES_3D.has(el.shapeType) ? (
              <Solid3DControls el={el} upd={upd} />
            ) : (
              <>
              <Row label="Fill Mode">
                <select
                  value={el.fillMode ?? 'solid'}
                  onChange={e => upd({ fillMode: e.target.value as ShapeFillMode })}
                  className="w-full bg-editor-elevated-highlight border border-editor-border rounded text-xs text-editor-text px-2 py-1"
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
                            : 'bg-editor-elevated-highlight border-editor-border text-[#f2f2f2] hover:text-editor-text'
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
              </>
            )}
            <BorderControls value={el} onChange={upd} />
            {el.shapeType === 'rect' && (
              <Row label="Corner Radius">
                <Slider value={el.cornerRadius} min={0} max={250} step={1}
                  onChange={v => upd({ cornerRadius: v })} display={`${el.cornerRadius}px`} />
              </Row>
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
            anims={el.animations.filter(a => !isMotionAnimation(a) && !isLoopAnimation(a) && a.timing === 'onEnter')}
            types={ENTER_ANIMS}
            onAdd={() => addAnimation(el.id, { ...makeAnimation(), type: 'fadeIn', timing: 'onEnter' })}
            elId={el.id} isLoop={false}
          />
          <AnimSection
            label="Loop" color="text-editor-accent"
            anims={el.animations.filter(a => !isMotionAnimation(a) && isLoopAnimation(a))}
            types={LOOP_ANIMS}
            onAdd={() => addAnimation(el.id, { ...makeAnimation(), type: 'pulse', timing: 'loop', duration: 1 })}
            elId={el.id} isLoop={true}
          />
          <AnimSection
            label="On Exit" color="text-red-400"
            anims={el.animations.filter(a => !isMotionAnimation(a) && !isLoopAnimation(a) && a.timing === 'onExit')}
            types={EXIT_ANIMS}
            onAdd={() => addAnimation(el.id, { ...makeAnimation(), type: 'fadeOut', timing: 'onExit' })}
            elId={el.id} isLoop={false}
          />
        </>
      )}
    </div>
  )
}

// ── 3D cube / cone ───────────────────────────────────────────────────────────

const FACE_LABELS: Record<Face3D, string> = {
  front: 'Front', back: 'Back', top: 'Top', bottom: 'Bottom', left: 'Left', right: 'Right',
  slant: 'Slant', base: 'Base',
}

const ROTATION_KEY = { x: 'rotateX', y: 'rotateY', z: 'rotateZ' } as const

function Solid3DControls({ el, upd }: { el: ShapeElement; upd: (patch: Partial<ShapeElement>) => void }) {
  const rotation = get3DRotation(el)
  const faces: readonly Face3D[] = el.shapeType === 'cone' ? CONE_FACES : CUBE_FACES
  // Store only what the user changed, so untouched properties keep following the base color.
  const setFace = (face: Face3D, patch: { color?: string; opacity?: number }) =>
    upd({ faces3d: { ...el.faces3d, [face]: { ...el.faces3d?.[face], ...patch } } })
  const resetButton = (onClick: () => void) => (
    <button onClick={onClick} className="text-2xs text-editor-text-secondary hover:text-editor-text">Reset</button>
  )

  return (
    <>
      <Row label="Base Color">
        <ColorInput value={el.fill === 'transparent' ? '#6366f1' : el.fill} onChange={v => upd({ fill: v })} />
      </Row>
      {el.shapeType === 'cube' && (
        // Width and height follow the element box; depth is set here.
        <Row label="Depth">
          <Slider value={Math.round(cuboidDepth(el))} min={10} max={2000} step={1}
            onChange={v => upd({ depth3d: v })} display={`${Math.round(cuboidDepth(el))}px`} />
        </Row>
      )}

      <div className="flex items-center justify-between pt-2">
        <span className="label">Rotation</span>
        {resetButton(() => upd({ rotateX: undefined, rotateY: undefined, rotateZ: undefined }))}
      </div>
      {(['x', 'y', 'z'] as const).map(axis => (
        <Row key={axis} label={`Rotate ${axis.toUpperCase()}`}>
          <Slider value={Math.round(rotation[axis])} min={-180} max={180} step={1}
            onChange={v => upd({ [ROTATION_KEY[axis]]: v })}
            display={`${Math.round(rotation[axis])}°`} />
        </Row>
      ))}

      <div className="flex items-center justify-between pt-2">
        <span className="label">Faces</span>
        {resetButton(() => upd({ faces3d: undefined }))}
      </div>
      {faces.map(face => {
        const fill = faceFill(el, face)
        return (
          <Row key={face} label={FACE_LABELS[face]}>
            <div className="flex flex-col gap-1">
              <ColorInput value={fill.color} onChange={color => setFace(face, { color })} />
              <Slider value={Math.round(fill.opacity * 100)} min={0} max={100} step={1}
                onChange={v => setFace(face, { opacity: v / 100 })}
                display={`${Math.round(fill.opacity * 100)}%`} />
            </div>
          </Row>
        )
      })}
    </>
  )
}
