import { useRef, useEffect } from 'react'
import { Film, Lock, Unlock, Plus, Trash2, Scissors, X } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import type { VideoElement, AnimationType, EasingType, SlideDir, ElementAnimation } from '../../types/editor'
import { PanelHeader, Row, Slider, NumberInput } from './TextPanel'
import { cn } from '../../utils/cn'
import { makeAnimation } from '../../utils/defaults'
import { sourceVideoClipDuration } from '../../utils/videoClip'
import BoxShadowControls, { InnerShadowControls } from './BoxShadowControls'
import { ScaleSizeControl } from './AnimationParamControls'
import BorderControls from './BorderControls'
import MediaVignetteControls from './MediaVignetteControls'

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

const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2]

export default function VideoPanel() {
  const { project, currentSceneId, getSelectedEls, updateElement, addAnimation, setCropElement } = useEditorStore()
  const el = getSelectedEls().find(e => e.type === 'video') as VideoElement | undefined
  const scene = project?.scenes.find(sc => sc.elements.some(item => item.id === el?.id))
    ?? project?.scenes.find(sc => sc.id === currentSceneId)

  const ratioRef = useRef(16 / 9)

  useEffect(() => {
    if (el) ratioRef.current = el.width / el.height
  }, [el?.id])

  const lockRatio = el?.lockRatio ?? true

  function upd(patch: Partial<VideoElement>) {
    if (el) updateElement(el.id, patch)
  }

  function toggleLoop() {
    if (!el) return
    if (!el.loop) {
      const remainingScene = scene ? Math.max(0.1, scene.duration - (el.timelineX ?? 0)) : undefined
      upd({
        loop: true,
        duration: remainingScene ? Math.max(el.duration ?? 0, remainingScene) : el.duration,
      })
    } else {
      upd({
        loop: false,
        duration: Math.min(el.duration ?? sourceVideoClipDuration(el), sourceVideoClipDuration(el)),
      })
    }
  }

  function toggleLock() {
    if (!lockRatio && el) ratioRef.current = el.width / el.height
    upd({ lockRatio: !lockRatio })
  }

  function handleWidth(newW: number) {
    if (!el) return
    upd(lockRatio ? { width: newW, height: Math.round(newW / ratioRef.current) } : { width: newW })
  }

  function handleHeight(newH: number) {
    if (!el) return
    upd(lockRatio ? { height: newH, width: Math.round(newH * ratioRef.current) } : { height: newH })
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PanelHeader icon={<Film size={12} />} title="Video" />

      <div className="flex-1 overflow-y-auto">
        {!el && (
          <p className="text-xs text-[#f2f2f2] px-3 py-3">Select a video element to edit.</p>
        )}

        {el && (
          <>
            {/* ── Dimensions ──────────────────────────────────────── */}
            <div className="px-3 py-2 border-b border-editor-border flex flex-col gap-0.5">
              <span className="text-xs font-medium text-editor-text block mb-1">Dimensions</span>
              <Row label="Width">
                <NumberInput value={Math.round(el.width)} min={10} max={9999} onChange={handleWidth} />
              </Row>
              <Row label="Height">
                <NumberInput value={Math.round(el.height)} min={10} max={9999} onChange={handleHeight} />
              </Row>
              <Row label="Crop">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCropElement(el.id)}
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-xs bg-editor-elevated text-[#f2f2f2] border border-editor-border hover:text-editor-text transition-colors"
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
              </Row>
              <Row label="Lock Ratio">
                <button
                  onClick={toggleLock}
                  className={cn(
                    'flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors',
                    lockRatio
                      ? 'bg-editor-accent text-white'
                      : 'bg-editor-elevated text-[#f2f2f2] hover:text-editor-text border border-editor-border'
                  )}
                >
                  {lockRatio ? <Lock size={10} /> : <Unlock size={10} />}
                  {lockRatio ? 'Locked' : 'Unlocked'}
                </button>
              </Row>
              <Row label="Corner Radius">
                <Slider value={el.cornerRadius} min={0} max={200} step={1}
                  onChange={v => upd({ cornerRadius: v })} display={`${el.cornerRadius}px`} />
              </Row>
              <BorderControls value={el} onChange={upd} />
            </div>

            <div className="px-3 py-2">
              <BoxShadowControls value={el.boxShadow} onChange={boxShadow => upd({ boxShadow })} />
              <InnerShadowControls value={el.innerShadow} onChange={innerShadow => upd({ innerShadow })} />
            </div>

            {/* ── Playback ─────────────────────────────────────────── */}
            <div className="px-3 py-2 border-b border-editor-border flex flex-col gap-0.5">
              <span className="text-xs font-medium text-editor-text block mb-1">Playback</span>
              <Row label="Volume">
                <Slider value={Math.round(el.volume * 100)} min={0} max={100} step={1}
                  onChange={v => upd({ volume: v / 100 })} display={`${Math.round(el.volume * 100)}%`} />
              </Row>
              <Row label="Speed">
                <select
                  value={el.playbackRate}
                  onChange={e => {
                    const newRate = Number(e.target.value)
                    const rawS = (el.duration ?? el.sourceDuration ?? 10) * (el.playbackRate ?? 1)
                    upd({ playbackRate: newRate, duration: rawS / newRate })
                  }}
                  className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1"
                >
                  {PLAYBACK_RATES.map(r => (
                    <option key={r} value={r}>{r}×</option>
                  ))}
                </select>
              </Row>
              <Row label="Loop">
                <button
                  onClick={toggleLoop}
                  className={cn(
                    'px-2 py-1 rounded text-xs transition-colors',
                    el.loop
                      ? 'bg-editor-accent text-white'
                      : 'bg-editor-elevated text-[#f2f2f2] hover:text-editor-text border border-editor-border'
                  )}
                >
                  {el.loop ? 'On' : 'Off'}
                </button>
              </Row>
              <Row label="Muted">
                <button
                  onClick={() => upd({ muted: !el.muted })}
                  className={cn(
                    'px-2 py-1 rounded text-xs transition-colors',
                    el.muted
                      ? 'bg-editor-accent text-white'
                      : 'bg-editor-elevated text-[#f2f2f2] hover:text-editor-text border border-editor-border'
                  )}
                >
                  {el.muted ? 'On' : 'Off'}
                </button>
              </Row>
            </div>

            {/* ── Adjustments ─────────────────────────────────────────── */}
            <div className="px-3 py-2 border-b border-editor-border flex flex-col gap-0.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-editor-text">Adjustments</span>
                <button
                  onClick={() => upd({
                    brightness: undefined, contrast: undefined, saturation: undefined,
                    hueRotate: undefined, blur: undefined, exposure: undefined,
                    highlights: undefined, shadows: undefined, whites: undefined,
                    blacks: undefined, temperature: undefined, tint: undefined, vibrance: undefined,
                    vignetteEnabled: false, vignetteColor: '#000000', vignetteAmount: 0.5,
                    vignetteSize: 0.5, vignetteFade: 0.65,
                  })}
                  className="text-[10px] text-editor-secondary hover:text-editor-text transition-colors"
                >Reset</button>
              </div>
              <Row label="Opacity">
                <Slider value={Math.round(el.opacity * 100)} min={0} max={100} step={1}
                  onChange={v => upd({ opacity: v / 100 })} display={`${Math.round(el.opacity * 100)}%`} />
              </Row>
              <Row label="Brightness">
                <Slider value={el.brightness ?? 100} min={0} max={200} step={1}
                  onChange={v => upd({ brightness: v })} display={`${el.brightness ?? 100}`} />
              </Row>
              <Row label="Contrast">
                <Slider value={el.contrast ?? 100} min={0} max={200} step={1}
                  onChange={v => upd({ contrast: v })} display={`${el.contrast ?? 100}`} />
              </Row>
              <Row label="Saturation">
                <Slider value={el.saturation ?? 100} min={0} max={200} step={1}
                  onChange={v => upd({ saturation: v })} display={`${el.saturation ?? 100}`} />
              </Row>
              <Row label="Exposure">
                <Slider value={el.exposure ?? 0} min={-100} max={100} step={1}
                  onChange={v => upd({ exposure: v })} display={`${el.exposure ?? 0}`} />
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
              <Row label="Temperature">
                <Slider value={el.temperature ?? 0} min={-100} max={100} step={1}
                  onChange={v => upd({ temperature: v })} display={`${el.temperature ?? 0}`} />
              </Row>
              <Row label="Tint">
                <Slider value={el.tint ?? 0} min={-100} max={100} step={1}
                  onChange={v => upd({ tint: v })} display={`${el.tint ?? 0}`} />
              </Row>
              <Row label="Vibrance">
                <Slider value={el.vibrance ?? 0} min={-100} max={100} step={1}
                  onChange={v => upd({ vibrance: v })} display={`${el.vibrance ?? 0}`} />
              </Row>
              <Row label="Hue Rotate">
                <Slider value={el.hueRotate ?? 0} min={-180} max={180} step={1}
                  onChange={v => upd({ hueRotate: v })} display={`${el.hueRotate ?? 0}°`} />
              </Row>
              <Row label="Blur">
                <Slider value={el.blur ?? 0} min={0} max={20} step={0.5}
                  onChange={v => upd({ blur: v })} display={`${el.blur ?? 0}px`} />
              </Row>
              <MediaVignetteControls value={el} onChange={upd} />
            </div>

            {/* ── Cinematic & Effects ─────────────────────────────── */}
            <div className="px-3 py-2 border-b border-editor-border flex flex-col gap-0.5">
              <span className="text-xs font-medium text-editor-text block mb-1">Cinematic & Effects</span>
              
              {/* Color Grading Preset */}
              <Row label="Color Grade">
                <select
                  value={el.colorGrading ?? 'none'}
                  onChange={e => upd({ colorGrading: e.target.value as any })}
                  className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1"
                >
                  <option value="none">Normal (None)</option>
                  <option value="warm">Warm Preset</option>
                  <option value="cool">Cool Preset</option>
                  <option value="vintage">Vintage Sepia</option>
                  <option value="cyberpunk">Cyberpunk Neon</option>
                  <option value="cinematic">Cinematic Teal & Orange</option>
                  <option value="monochrome">Grayscale (B&W)</option>
                  <option value="noir">Noir High-Contrast</option>
                  <option value="sunset">Sunset Glow</option>
                </select>
              </Row>

              {/* Video Effects */}
              <Row label="Video Effect">
                <select
                  value={el.videoEffect ?? 'none'}
                  onChange={e => upd({ videoEffect: e.target.value as any })}
                  className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1"
                >
                  <option value="none">No Effect</option>
                  <option value="lensBlur">Lens & Blur</option>
                  <option value="distortion">Wave Distortion</option>
                  <option value="shake">Camera Shake</option>
                  <option value="comic">Comic Effects</option>
                  <option value="retro">Retro Scanlines</option>
                  <option value="flash">Strobe Flash</option>
                </select>
              </Row>

              {/* Effect Intensity */}
              {el.videoEffect && el.videoEffect !== 'none' && (
                <Row label="Intensity">
                  <Slider
                    value={el.videoEffectIntensity ?? 0.5}
                    min={0.1}
                    max={1.0}
                    step={0.05}
                    onChange={v => upd({ videoEffectIntensity: v })}
                    display={`${Math.round((el.videoEffectIntensity ?? 0.5) * 100)}%`}
                  />
                </Row>
              )}

              {/* Framing / Masking */}
              <Row label="Frame mask">
                <select
                  value={el.frameType ?? 'none'}
                  onChange={e => upd({ frameType: e.target.value as any })}
                  className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1"
                >
                  <option value="none">Rectangle (No Mask)</option>
                  <option value="circle">Circle Frame</option>
                  <option value="triangle">Triangle Frame</option>
                </select>
              </Row>
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
    </div>
  )
}

function AnimSection({ label, color, anims, types, onAdd, elId, isLoop }: {
  label: string; color: string
  anims: ElementAnimation[]
  types: { label: string; value: AnimationType }[]
  onAdd: () => void
  elId: string; isLoop: boolean
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

function AnimBlock({ anim, index, elId, types, isLoop }: {
  anim: ElementAnimation; index: number; elId: string
  types: { label: string; value: AnimationType }[]
  isLoop: boolean
}) {
  const { updateAnimation, removeAnimation } = useEditorStore()

  function upd(patch: Partial<ElementAnimation>) { updateAnimation(elId, anim.id, patch) }

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
        <select value={anim.type} onChange={e => upd({ type: e.target.value as AnimationType })}
          className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1">
          {types.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </Row>

      {isLoop && (
        <div className="text-[10px] text-editor-accent bg-editor-accent-dim rounded px-2 py-0.5 w-fit">∞ Loops continuously</div>
      )}

      {hasDir && (
        <Row label="Direction">
          <select value={anim.params?.direction ?? 'left'}
            onChange={e => upd({ params: { ...anim.params, direction: e.target.value as SlideDir } })}
            className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1">
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
        <input type="number" min={0} max={60} step={0.1} value={anim.startTime}
          onChange={e => upd({ startTime: Number(e.target.value) })}
          className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1 nodrag"
        />
      </Row>

      <Row label={isLoop ? 'Period (s)' : 'Duration (s)'}>
        <input type="number" min={0.1} max={30} step={0.1} value={anim.duration}
          onChange={e => upd({ duration: Number(e.target.value) })}
          className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1 nodrag"
        />
      </Row>

      <Row label="Delay (s)">
        <input type="number" min={0} max={60} step={0.1} value={anim.delay}
          onChange={e => upd({ delay: Number(e.target.value) })}
          className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1 nodrag"
        />
      </Row>

      {!isLoop && (
        <Row label="Easing">
          <select value={anim.easing} onChange={e => upd({ easing: e.target.value as EasingType })}
            className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1">
            {EASINGS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
          </select>
        </Row>
      )}
    </div>
  )
}
