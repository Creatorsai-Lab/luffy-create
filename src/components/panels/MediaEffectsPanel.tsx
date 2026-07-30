import { Sparkles, RotateCcw } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import type { ImageElement, MediaEffectAxis, MediaEffectDirection, MediaEffectTarget, MediaEffectType, VideoElement } from '../../types/editor'
import { DEFAULT_MEDIA_EFFECT } from '../../utils/defaults'
import { normalizeMediaEffect } from '../../engine/mediaEffects'
import { cn } from '../../utils/cn'
import { ColorInput, PanelHeader, Row, Slider } from './TextPanel'

type MediaElement = ImageElement | VideoElement

const EFFECTS: { label: string; value: MediaEffectType; desc: string }[] = [
  { label: 'None', value: 'none', desc: 'No media effect' },
  { label: 'Subtle Hover', value: 'subtleHover', desc: 'Smooth floating camera motion' },
  { label: 'Wiggle', value: 'wiggle', desc: 'Small elastic rotation and drift' },
  { label: 'Doodle Drift', value: 'doodleDrift', desc: 'Handmade living motion' },
  { label: 'Shake', value: 'shake', desc: 'Impact camera shake' },
  { label: 'Vibration Distort', value: 'vibrationDistort', desc: 'Fast sliced distortion' },
  { label: 'God Rays', value: 'godRays', desc: 'Animated directional light beams' },
  { label: 'Light Sweep', value: 'lightSweep', desc: 'Glossy moving light pass' },
  { label: 'Glitch', value: 'glitch', desc: 'Digital slice and color-channel glitch' },
  { label: 'Rain', value: 'rain', desc: 'Animated transparent rain streaks' },
  { label: 'Snow', value: 'snow', desc: 'Animated falling snow particles' },
]

const DIRECTIONS: { label: string; value: MediaEffectDirection }[] = [
  { label: 'Left', value: 'left' },
  { label: 'Right', value: 'right' },
  { label: 'Up', value: 'up' },
  { label: 'Down', value: 'down' },
  { label: 'Diagonal', value: 'diagonal' },
]

const TARGETS: { label: string; value: MediaEffectTarget }[] = [
  { label: 'Whole Media', value: 'wholeMedia' },
  { label: 'Center Subject', value: 'centerSubject' },
  { label: 'Manual Focus', value: 'manualFocus' },
]

export default function MediaEffectsPanel() {
  const { getSelectedEls, updateElement } = useEditorStore()
  const el = getSelectedEls().find(e => e.type === 'image' || e.type === 'video') as MediaElement | undefined

  function upd(patch: Partial<MediaElement>) {
    if (!el) return
    updateElement(el.id, patch)
  }

  if (!el) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <PanelHeader icon={<Sparkles size={12} />} title="Effects" />
        <p className="text-xs text-[#f2f2f2] px-3 py-3">
          Select an image or video element to add dynamic media effects.
        </p>
      </div>
    )
  }

  const effect = normalizeMediaEffect(el.mediaEffect ?? DEFAULT_MEDIA_EFFECT.mediaEffect)
  const selectedEffect = EFFECTS.find(item => item.value === effect)
  const showDirection = effect === 'lightSweep' || effect === 'godRays' || effect === 'rain'
  const showColor = effect === 'lightSweep' || effect === 'godRays' || effect === 'rain' || effect === 'snow'
  const showColorOpacity = showColor
  const showSize = effect === 'lightSweep' || effect === 'glitch' || effect === 'rain' || effect === 'snow'
  const showTarget = effect === 'lightSweep' || effect === 'godRays' || effect === 'subtleHover'

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PanelHeader icon={<Sparkles size={12} />} title="Effects" />

      <div className="flex-1 overflow-y-auto px-3 py-2">
        <div className="flex flex-col gap-0.5">
          <Row label="Selected">
            <div className="text-xs text-editor-text bg-editor-elevated border border-editor-border rounded px-2 py-1.5 truncate">
              {el.type === 'image' ? 'Image' : 'Video'} - {el.name}
            </div>
          </Row>

          <Row label="Effect">
            <select
              value={effect}
              onChange={e => upd({ mediaEffect: e.target.value as MediaEffectType })}
              className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1"
            >
              {EFFECTS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </Row>

          {selectedEffect && effect !== 'none' && (
            <div className="text-[10px] text-editor-secondary bg-editor-elevated/70 border border-editor-border rounded px-2 py-1 mb-1">
              {selectedEffect.desc}
            </div>
          )}

          {effect !== 'none' && (
            <>
              <Row label="Intensity">
                <Slider
                  value={Math.round((el.mediaEffectIntensity ?? DEFAULT_MEDIA_EFFECT.mediaEffectIntensity) * 100)}
                  min={0}
                  max={100}
                  step={1}
                  onChange={v => upd({ mediaEffectIntensity: v / 100 })}
                  display={`${Math.round((el.mediaEffectIntensity ?? DEFAULT_MEDIA_EFFECT.mediaEffectIntensity) * 100)}%`}
                />
              </Row>

              <Row label="Speed">
                <Slider
                  value={el.mediaEffectSpeed ?? DEFAULT_MEDIA_EFFECT.mediaEffectSpeed}
                  min={0.1}
                  max={5}
                  step={0.1}
                  onChange={v => upd({ mediaEffectSpeed: v })}
                  display={`${(el.mediaEffectSpeed ?? DEFAULT_MEDIA_EFFECT.mediaEffectSpeed).toFixed(1)}x`}
                />
              </Row>

              <Row label="Hardness">
                <Slider
                  value={Math.round((el.mediaEffectHardness ?? DEFAULT_MEDIA_EFFECT.mediaEffectHardness) * 100)}
                  min={0}
                  max={100}
                  step={1}
                  onChange={v => upd({ mediaEffectHardness: v / 100 })}
                  display={`${Math.round((el.mediaEffectHardness ?? DEFAULT_MEDIA_EFFECT.mediaEffectHardness) * 100)}%`}
                />
              </Row>

              <Row label="Blend">
                <Slider
                  value={Math.round((el.mediaEffectBlend ?? DEFAULT_MEDIA_EFFECT.mediaEffectBlend) * 100)}
                  min={0}
                  max={100}
                  step={1}
                  onChange={v => upd({ mediaEffectBlend: v / 100 })}
                  display={`${Math.round((el.mediaEffectBlend ?? DEFAULT_MEDIA_EFFECT.mediaEffectBlend) * 100)}%`}
                />
              </Row>

              {effect === 'glitch' && (
                <Row label="Direction">
                  <div className="grid grid-cols-2 gap-1">
                    {(['horizontal', 'vertical'] as MediaEffectAxis[]).map(axis => (
                      <button
                        key={axis}
                        type="button"
                        onClick={() => upd({ mediaEffectAxis: axis })}
                        className={cn(
                          'px-2 py-1 rounded border text-[11px] capitalize transition-colors',
                          (el.mediaEffectAxis ?? DEFAULT_MEDIA_EFFECT.mediaEffectAxis) === axis
                            ? 'bg-editor-accent border-editor-accent text-white'
                            : 'bg-editor-elevated border-editor-border text-editor-text hover:border-editor-accent/60',
                        )}
                      >
                        {axis}
                      </button>
                    ))}
                  </div>
                </Row>
              )}

              {showDirection && (
                <Row label="Direction">
                  <div className="grid grid-cols-3 gap-1">
                    {DIRECTIONS.map(item => {
                      const active = (el.mediaEffectDirection ?? DEFAULT_MEDIA_EFFECT.mediaEffectDirection) === item.value
                      return (
                        <button
                          key={item.value}
                          type="button"
                          onClick={() => upd({ mediaEffectDirection: item.value })}
                          className={cn(
                            'px-2 py-1 rounded border text-[11px] transition-colors',
                            active
                              ? 'bg-editor-accent border-editor-accent text-white'
                              : 'bg-editor-elevated border-editor-border text-editor-text hover:border-editor-accent/60',
                          )}
                        >
                          {item.label}
                        </button>
                      )
                    })}
                  </div>
                </Row>
              )}

              {showColor && (
                <Row label={effect === 'rain' || effect === 'snow' ? 'Effect Color' : 'Light Color'}>
                  <ColorInput
                    value={el.mediaEffectColor ?? DEFAULT_MEDIA_EFFECT.mediaEffectColor}
                    onChange={v => upd({ mediaEffectColor: v })}
                  />
                </Row>
              )}

              {showColorOpacity && (
                <Row label="Color Opacity">
                  <Slider
                    value={Math.round((el.mediaEffectColorOpacity ?? DEFAULT_MEDIA_EFFECT.mediaEffectColorOpacity) * 100)}
                    min={0}
                    max={100}
                    step={1}
                    onChange={v => upd({ mediaEffectColorOpacity: v / 100 })}
                    display={`${Math.round((el.mediaEffectColorOpacity ?? DEFAULT_MEDIA_EFFECT.mediaEffectColorOpacity) * 100)}%`}
                  />
                </Row>
              )}

              {showSize && (
                <Row label={effect === 'lightSweep' ? 'Light Width' : 'Size'}>
                  <Slider
                    value={Math.round((el.mediaEffectSize ?? DEFAULT_MEDIA_EFFECT.mediaEffectSize) * 100)}
                    min={0}
                    max={100}
                    step={1}
                    onChange={v => upd({ mediaEffectSize: v / 100 })}
                    display={`${Math.round((el.mediaEffectSize ?? DEFAULT_MEDIA_EFFECT.mediaEffectSize) * 100)}%`}
                  />
                </Row>
              )}

              {showTarget && (
                <Row label="Target">
                  <select
                    value={el.mediaEffectTarget ?? DEFAULT_MEDIA_EFFECT.mediaEffectTarget}
                    onChange={e => upd({ mediaEffectTarget: e.target.value as MediaEffectTarget })}
                    className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1"
                  >
                    {TARGETS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </Row>
              )}

              {(el.mediaEffectTarget ?? DEFAULT_MEDIA_EFFECT.mediaEffectTarget) === 'manualFocus' && showTarget && (
                <>
                  <Row label="Focus X">
                    <Slider
                      value={Math.round((el.mediaEffectFocusX ?? DEFAULT_MEDIA_EFFECT.mediaEffectFocusX) * 100)}
                      min={0}
                      max={100}
                      step={1}
                      onChange={v => upd({ mediaEffectFocusX: v / 100 })}
                      display={`${Math.round((el.mediaEffectFocusX ?? DEFAULT_MEDIA_EFFECT.mediaEffectFocusX) * 100)}%`}
                    />
                  </Row>
                  <Row label="Focus Y">
                    <Slider
                      value={Math.round((el.mediaEffectFocusY ?? DEFAULT_MEDIA_EFFECT.mediaEffectFocusY) * 100)}
                      min={0}
                      max={100}
                      step={1}
                      onChange={v => upd({ mediaEffectFocusY: v / 100 })}
                      display={`${Math.round((el.mediaEffectFocusY ?? DEFAULT_MEDIA_EFFECT.mediaEffectFocusY) * 100)}%`}
                    />
                  </Row>
                </>
              )}

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => upd({ ...DEFAULT_MEDIA_EFFECT })}
                  className="flex items-center gap-1.5 px-2 py-1 rounded text-xs bg-editor-elevated text-[#f2f2f2] hover:text-editor-text border border-editor-border transition-colors"
                >
                  <RotateCcw size={10} />
                  Reset Effect
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
