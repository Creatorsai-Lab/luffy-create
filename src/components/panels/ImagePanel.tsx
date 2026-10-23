import { useRef, useEffect } from 'react'
import { Scissors, Lock, Unlock, RotateCcw, X } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import type { ImageElement, AnimationType } from '../../types/editor'
import { PanelHeader, Row, Slider, NumberInput, AnimSection } from './TextPanel'
import { cn } from '../../utils/cn'
import { makeAnimation } from '../../utils/defaults'
import BoxShadowControls from './BoxShadowControls'
import KeyingControl from './KeyingControl'
import { effectStack } from '../../engine/fx/stack'
import BorderControls from './BorderControls'
import { isMotionAnimation } from '../../utils/moveAnimation'
import { isLoopAnimation } from '../../utils/animationTypes'
import { useShallow } from 'zustand/react/shallow'

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
]

const EXIT_ANIMS: { label: string; value: AnimationType }[] = [
  { label: 'Slide Out', value: 'slideOut' },
  { label: 'Fade Out',  value: 'fadeOut'  },
  { label: 'Scale In',  value: 'scaleIn'  },
  { label: 'Scale Out', value: 'scaleOut' },
  { label: 'Wipe Out',  value: 'wipeOut'  },
]

export default function ImagePanel() {
  const { getSelectedEls, updateElement, addAnimation, setCropElement } = useEditorStore(useShallow(s => ({ getSelectedEls: s.getSelectedEls, updateElement: s.updateElement, addAnimation: s.addAnimation, setCropElement: s.setCropElement, project: s.project, currentSceneId: s.currentSceneId, selectedIds: s.selectedIds })))
  const selected = getSelectedEls()
  const el = selected.find(e => e.type === 'image') as ImageElement | undefined

  const ratioRef = useRef(1)

  useEffect(() => {
    if (el) ratioRef.current = el.width / el.height
  }, [el?.id])

  const lockRatio = el?.lockRatio ?? true

  function upd(patch: Partial<ImageElement>) {
    if (el) updateElement(el.id, patch)
  }

  function toggleLock() {
    if (!lockRatio && el) ratioRef.current = el.width / el.height
    upd({ lockRatio: !lockRatio })
  }

  function handleWidth(newW: number) {
    if (!el) return
    if (lockRatio) upd({ width: newW, height: Math.round(newW / ratioRef.current) })
    else upd({ width: newW })
  }

  function handleHeight(newH: number) {
    if (!el) return
    if (lockRatio) upd({ height: newH, width: Math.round(newH * ratioRef.current) })
    else upd({ height: newH })
  }

  function resetFilters() {
    upd({
      brightness: 100, contrast: 100, saturation: 100, hueRotate: 0, blur: 0, glass: false,
      exposure: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0,
      temperature: 0, tint: 0, vibrance: 0,
      vignetteEnabled: false, vignetteColor: '#000000', vignetteAmount: 0.5,
      vignetteSize: 0.5, vignetteFade: 0.65,
      grainColor: '#000000', grainSize: 1, grainOpacity: 0,
    })
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PanelHeader icon={<Scissors size={12} />} title="Image" />

      <div className="flex-1 overflow-y-auto">
        {!el && (
          <p className="text-xs text-[#f2f2f2] px-3 py-3">
            Select an image element to edit its properties.
          </p>
        )}

        {el && (
          <>
            <KeyingControl element={el} />
            <div className="flex flex-col gap-0.5 px-3 py-2">

              {/* ── Dimensions ──────────────────────────────────────── */}
              <div className="pb-2 mb-1 border-b border-editor-border">
                <span className="text-xs font-medium text-editor-text block mb-1">Dimensions</span>

                <Row label="Width">
                  <NumberInput value={Math.round(el.width)} min={10} max={9999} onChange={handleWidth} />
                </Row>

                <Row label="Height">
                  <NumberInput value={Math.round(el.height)} min={10} max={9999} onChange={handleHeight} />
                </Row>

                <Row label="Lock Ratio">
                  <button
                    onClick={toggleLock}
                    className={cn(
                      'flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors',
                      lockRatio
                        ? 'bg-editor-accent text-white'
                        : 'bg-editor-elevated-highlight text-[#f2f2f2] hover:text-editor-text border border-editor-border'
                    )}
                  >
                    {lockRatio ? <Lock size={10} /> : <Unlock size={10} />}
                    {lockRatio ? 'Locked' : 'Unlocked'}
                  </button>
                </Row>

                <Row label="Corner Radius">
                  <Slider
                    value={el.cornerRadius}
                    min={0} max={200} step={1}
                    onChange={v => upd({ cornerRadius: v })}
                    display={`${el.cornerRadius}px`}
                  />
                </Row>
                <BorderControls value={el} onChange={upd} />
              </div>

              <BoxShadowControls value={el.boxShadow} onChange={boxShadow => upd({ boxShadow })} />

              {/* ── Crop ────────────────────────────────────────────── */}
              <div className="pb-2 mb-1 border-b border-editor-border">
                <span className="text-xs font-medium text-editor-text block mb-1">Crop</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCropElement(el.id)}
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-xs bg-editor-elevated-highlight text-[#f2f2f2] border border-editor-border hover:text-editor-text transition-colors"
                  >
                    <Scissors size={10} /> Edit Crop
                  </button>
                  {el.crop && (
                    <button
                      onClick={() => upd({ crop: undefined })}
                      className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-red-900/30 text-red-400 border border-red-900/50 hover:bg-red-900/50 transition-colors"
                    >
                      <X size={10} /> Reset
                    </button>
                  )}
                </div>
              </div>

              {/* ── Adjustments ─────────────────────────────────────── */}
              <div className="pb-2 mb-1 border-b border-editor-border">
                <span className="text-xs font-medium text-editor-text block mb-1">Adjustments</span>

                <Row label="Opacity">
                  <Slider value={Math.round((el.opacity ?? 1) * 100)} min={0} max={100} step={1}
                    onChange={v => upd({ opacity: v / 100 })} display={`${Math.round((el.opacity ?? 1) * 100)}%`} />
                </Row>
                <Row label="Exposure">
                  <Slider value={el.exposure ?? 0} min={-100} max={100} step={1}
                    onChange={v => upd({ exposure: v })} display={`${el.exposure ?? 0}`} />
                </Row>
                <Row label="Brightness">
                  <Slider value={el.brightness ?? 100} min={0} max={200} step={1}
                    onChange={v => upd({ brightness: v })} display={`${el.brightness ?? 100}`} />
                </Row>
                <Row label="Contrast">
                  <Slider value={el.contrast ?? 100} min={0} max={200} step={1}
                    onChange={v => upd({ contrast: v })} display={`${el.contrast ?? 100}`} />
                </Row>
                <Row label="Highlights">
                  <Slider value={el.highlights ?? 0} min={-100} max={100} step={1}
                    onChange={v => upd({ highlights: v })} display={`${el.highlights ?? 0}`} />
                </Row>
                <Row label="Shadows">
                  <Slider value={el.shadows ?? 0} min={-100} max={100} step={1}
                    onChange={v => upd({ shadows: v })} display={`${el.shadows ?? 0}`} />
                </Row>
                <Row label="Whites">
                  <Slider value={el.whites ?? 0} min={-100} max={100} step={1}
                    onChange={v => upd({ whites: v })} display={`${el.whites ?? 0}`} />
                </Row>
                <Row label="Blacks">
                  <Slider value={el.blacks ?? 0} min={-100} max={100} step={1}
                    onChange={v => upd({ blacks: v })} display={`${el.blacks ?? 0}`} />
                </Row>
                <Row label="Saturation">
                  <Slider value={el.saturation ?? 100} min={0} max={200} step={1}
                    onChange={v => upd({ saturation: v })} display={`${el.saturation ?? 100}`} />
                </Row>
                <Row label="Vibrance">
                  <Slider value={el.vibrance ?? 0} min={-100} max={100} step={1}
                    onChange={v => upd({ vibrance: v })} display={`${el.vibrance ?? 0}`} />
                </Row>
                <Row label="Temperature">
                  <Slider value={el.temperature ?? 0} min={-100} max={100} step={1}
                    onChange={v => upd({ temperature: v })} display={`${el.temperature ?? 0}`} />
                </Row>
                <Row label="Tint">
                  <Slider value={el.tint ?? 0} min={-100} max={100} step={1}
                    onChange={v => upd({ tint: v })} display={`${el.tint ?? 0}`} />
                </Row>
                <Row label="Hue Rotate">
                  <Slider value={el.hueRotate ?? 0} min={-180} max={180} step={1}
                    onChange={v => upd({ hueRotate: v })} display={`${el.hueRotate ?? 0}°`} />
                </Row>
                <Row label="Blur">
                  <Slider value={el.blur ?? 0} min={0} max={20} step={0.5}
                    onChange={v => upd({ blur: v })} display={`${el.blur ?? 0}px`} />
                </Row>
              </div>

              {/* ── Effects ─────────────────────────────────────────── */}
              <div className="pb-2">
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-xs font-medium text-editor-text">Effects</span>
                  <span className="text-[10px] text-editor-text-secondary">{effectStack(el).length} on this image</span>
                  <button type="button" onClick={() => useEditorStore.getState().setActivePanel('effects')}
                    className="ml-auto rounded border border-editor-border bg-editor-elevated-highlight px-2 py-0.5 text-[11px] text-editor-text hover:border-editor-accent">
                    Open Effects
                  </button>
                </div>
                <p className="mb-1 text-[10px] leading-relaxed text-editor-text-secondary">Colour looks, film grain, vignette, glitch, retro, neon, light and more are in the Effects panel.</p>

                <Row label="Glassmorphism">
                  <button
                    onClick={() => upd({ glass: !el.glass })}
                    className={cn(
                      'flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors',
                      el.glass
                        ? 'bg-editor-accent text-white'
                        : 'bg-editor-elevated-highlight text-[#f2f2f2] hover:text-editor-text border border-editor-border'
                    )}
                  >
                    {el.glass ? 'On' : 'Off'}
                  </button>
                </Row>

                <div className="mt-2">
                  <button
                    onClick={resetFilters}
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-xs bg-editor-elevated-highlight text-[#f2f2f2] hover:text-editor-text border border-editor-border transition-colors"
                  >
                    <RotateCcw size={10} />
                    Reset Adjustments
                  </button>
                </div>
              </div>
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
    </div>
  )
}

