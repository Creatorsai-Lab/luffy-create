import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Captions, Wand2, Plus, Trash2, Download, Mic, FileText } from 'lucide-react'
import { useEditorStore } from '../store/editorStore'
import { FONT_FAMILIES } from '../types/editor'
import type { AudioElement, FontWeight, Project, SubtitleCue, SubtitleLanguage, SubtitleStyle, SubtitleTrack } from '../types/editor'
import { ColorInput, Slider } from '../components/panels/TextPanel'
import { makeCue, makeSubtitleTrack, normalizeSubtitleStyle, normalizeSubtitleTrack } from './types'
import { mergeCueTranslation, setCueReviewed, updateCueSource } from './translation'
import { cuesToSrt, type SubtitleSrtMode } from './srt'
import { transcriber } from './transcriber'
import { getSceneGlobalStart, splitLongSubtitleCues, splitScriptIntoCueTexts } from './timeline'
import { FONT_WEIGHT_OPTIONS, normalizeFontWeightForControl } from '../utils/fontWeight'
import SubtitleStylePreview from './SubtitleStylePreview'
import SubtitleTranslationPanel, { type SubtitleTranslationPanelHandle } from './SubtitleTranslationPanel'

interface TimelineAudioClip {
  id: string
  label: string
  audio: AudioElement
  absStart: number
  sceneName: string
}

type CaptionSourceId = 'all' | 'voiceover' | 'background' | string

const CAPTION_ANIMATIONS: { label: string; value: NonNullable<SubtitleStyle['animation']> }[] = [
  { label: 'None', value: 'none' },
  { label: 'Word Pop', value: 'wordPop' },
  { label: 'Word Rise', value: 'wordRise' },
  { label: 'Karaoke Pulse', value: 'karaokePulse' },
  { label: 'Smooth Reveal', value: 'smoothReveal' },
]

export default function SubtitleModal() {
  const { project, setSubtitleOpen, upsertSubtitleTrack, removeSubtitleTrack } = useEditorStore()

  const audioClips = useMemo(() => collectTimelineAudioClips(project), [project])
  const existingTrack = project?.subtitleTracks?.[0] ?? null
  const [track, setTrack] = useState<SubtitleTrack>(() => normalizeSubtitleTrack(existingTrack ?? makeSubtitleTrack()))
  const [sourceId, setSourceId] = useState<CaptionSourceId>('all')
  const [script, setScript] = useState('')
  const [status, setStatus] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [srtMode, setSrtMode] = useState<SubtitleSrtMode>('bilingual')
  const translationRef = useRef<SubtitleTranslationPanelHandle>(null)

  useEffect(() => {
    setTrack(normalizeSubtitleTrack(existingTrack ?? makeSubtitleTrack()))
  }, [existingTrack?.id])

  const hasVoiceover = audioClips.some(c => c.audio.track === 'voiceover')
  const hasBackground = audioClips.some(c => c.audio.track === 'background')
  const selectedClips = selectAudioClips(audioClips, sourceId)

  function commit(next = track) {
    upsertSubtitleTrack(normalizeSubtitleTrack(next))
    setStatus(`Saved ${next.cues.length} captions to project.`)
  }

  function patchStyle(patch: Partial<SubtitleStyle>) {
    setTrack(t => ({ ...t, style: { ...normalizeSubtitleStyle(t.style), ...patch } }))
  }

  function updateCue(id: string, patch: Partial<SubtitleCue>) {
    setTrack(t => ({ ...t, cues: t.cues.map(c => (c.id === id ? { ...c, ...patch } : c)) }))
  }

  function patchTranslation(patch: Partial<NonNullable<SubtitleTrack['translation']>>) {
    setTrack(current => {
      const normalized = normalizeSubtitleTrack(current)
      return { ...normalized, translation: { ...normalized.translation!, ...patch } }
    })
  }

  function patchTranslatedStyle(patch: Partial<NonNullable<SubtitleTrack['translation']>['style']>) {
    setTrack(current => {
      const normalized = normalizeSubtitleTrack(current)
      return { ...normalized, translation: { ...normalized.translation!, style: { ...normalized.translation!.style, ...patch } } }
    })
  }

  function updateCueText(id: string, text: string) {
    setTrack(current => ({
      ...current,
      cues: current.cues.map(cue => cue.id === id ? updateCueSource(cue, text) : cue),
    }))
  }

  function addCue() {
    const last = track.cues[track.cues.length - 1]
    const start = last ? last.end : 0
    setTrack(t => ({ ...t, cues: [...t.cues, makeCue(start, start + 2, '')] }))
  }

  function removeCue(id: string) {
    setTrack(t => ({ ...t, cues: t.cues.filter(c => c.id !== id) }))
  }

  async function autoGenerate() {
    if (selectedClips.length === 0) {
      setStatus('Add an audio clip to the timeline first.')
      return
    }

    setBusy(true)
    setStatus('Analyzing timeline audio...')

    try {
      const generated: SubtitleCue[] = []
      for (let i = 0; i < selectedClips.length; i++) {
        const clip = selectedClips[i]
        const audio = clip.audio
        const speed = audio.speed ?? 1
        const sourceStart = audio.startTime ?? 0
        const timelineDuration = audio.duration ?? 0
        const sourceEnd = sourceStart + timelineDuration * speed

        setStatus(`Analyzing ${clip.label} (${i + 1}/${selectedClips.length})...`)
        const localCues = await transcriber.transcribe({
          sourceSrc: audio.src,
          language: track.language,
          onProgress: (_pct, msg) => setStatus(`${clip.label}: ${msg}`),
        })

        for (const cue of localCues) {
          const overlapStart = Math.max(cue.start, sourceStart)
          const overlapEnd = Math.min(cue.end, sourceEnd)
          if (overlapEnd - overlapStart < 0.15) continue

          generated.push({
            id: crypto.randomUUID(),
            start: clip.absStart + (overlapStart - sourceStart) / speed,
            end: clip.absStart + (overlapEnd - sourceStart) / speed,
            text: cue.text,
          })
        }
      }

      const sorted = splitLongSubtitleCues(generated.sort((a, b) => a.start - b.start))
      const scriptTexts = splitScriptIntoCueTexts(script, sorted.length)
      const cues = sorted.map((cue, index) => ({
        ...cue,
        text: scriptTexts[index] || cue.text || '',
      }))

      const next: SubtitleTrack = {
        ...track,
        name: track.name || 'Timeline Captions',
        sourceAudioIds: selectedClips.map(c => c.audio.id),
        cues,
      }
      setTrack(next)
      upsertSubtitleTrack(next)
      const textCueCount = cues.filter(cue => cue.text.trim()).length
      setStatus(textCueCount > 0
        ? `Generated ${textCueCount} timeline-synced text captions.`
        : `Generated ${cues.length} speech-timing cues. Install local Whisper or paste a script to sync text.`
      )
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Caption generation failed.')
    } finally {
      setBusy(false)
    }
  }

  function exportSrt() {
    if (track.cues.length === 0) { setStatus('No captions to export.'); return }
    const targetLanguage = track.translation?.targetLanguage ?? (track.language === 'en' ? 'hi' : 'en')
    const hasTranslation = track.cues.some(cue => cue.translations?.[targetLanguage]?.text.trim())
    if (srtMode === 'translated' && !hasTranslation) { setStatus('No translated captions to export.'); return }
    const blob = new Blob([cuesToSrt(track.cues, { sourceLanguage: track.language, targetLanguage, mode: srtMode })], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const suffix = srtMode === 'bilingual' ? 'bilingual' : srtMode === 'source' ? track.language : targetLanguage
    a.download = `${project?.name ?? 'captions'}-${suffix}.srt`
    a.click()
    URL.revokeObjectURL(url)
    setStatus('Exported .srt file.')
  }

  function deleteTrack() {
    if (existingTrack) removeSubtitleTrack(existingTrack.id)
    const next = makeSubtitleTrack()
    setTrack(next)
    setStatus('Removed captions from the project.')
  }

  function toggleEnabled() {
    const next = normalizeSubtitleTrack({ ...track, enabled: !track.enabled })
    setTrack(next)
    upsertSubtitleTrack(next)
    setStatus(next.enabled ? 'Captions enabled.' : 'Captions hidden.')
  }

  const style = normalizeSubtitleStyle(track.style)
  const exportTarget = track.translation?.targetLanguage ?? (track.language === 'en' ? 'hi' : 'en')
  const canExportTranslation = track.cues.some(cue => cue.translations?.[exportTarget]?.text.trim())

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#171717]/80 backdrop-blur-xs"
      onClick={e => { if (e.target === e.currentTarget) setSubtitleOpen(false) }}>
      <div className="bg-editor-panel border border-editor-border rounded-xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: '92vw', height: '90vh' }}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-editor-border flex-none">
          <div className="flex items-center gap-2">
            <Captions size={16} className="text-editor-accent" />
            <span className="text-base font-medium text-editor-text">Automatic Captions</span>
          </div>
          <button onClick={() => setSubtitleOpen(false)} className="text-[#c9c4dd] hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          <div className="w-85 flex-none border-r border-editor-border p-4 flex flex-col gap-3 overflow-y-auto">
            <label className="block">
              <span className="text-sm uppercase tracking-wider text-editor-text-secondary">Timeline audio source:</span>
              {audioClips.length === 0 ? (
                <p className="text-sm text-red-400 mt-2">No timeline audio found. Add an audio clip to the timeline first.</p>
              ) : (
                <select
                  value={sourceId}
                  onChange={e => setSourceId(e.target.value)}
                  className="w-full mt-1.5 bg-editor-elevated-highlight border border-editor-border rounded text-xs text-editor-text px-2 py-1.5"
                >
                  <option value="all">All timeline audio</option>
                  {hasVoiceover && <option value="voiceover">All voiceover clips</option>}
                  {hasBackground && <option value="background">All background clips</option>}
                  <optgroup label="Individual clips">
                    {audioClips.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                  </optgroup>
                </select>
              )}
            </label>

            {selectedClips.length > 0 && (
              <div className="flex items-center gap-2 text-xs text-[#c9c4dd] bg-editor-elevated-highlight rounded px-2.5 py-2">
                <Mic size={13} /> {selectedClips.length} clip{selectedClips.length === 1 ? '' : 's'} selected
              </div>
            )}

            <label className="block">
              <span className="flex items-center gap-1 mt-4 text-[11px] uppercase tracking-wider text-editor-text-secondary">
                <FileText size={12} /> caption text
              </span>
              <textarea
                value={script}
                onChange={e => setScript(e.target.value)}
                rows={7}
                placeholder="Optional: paste the audio script here. The tool will distribute it across detected speech timings."
                className="w-full mt-1.5 bg-editor-elevated-highlight border border-editor-border rounded text-xs text-editor-text px-2 py-2 resize-none"
              />
            </label>

            <button
              onClick={autoGenerate}
              disabled={busy || selectedClips.length === 0}
              className="flex items-center justify-center gap-2 text-sm py-2.5 rounded bg-editor-accent text-white hover:bg-editor-accent-hover transition-colors disabled:opacity-50"
            >
              <Wand2 size={14} /> {busy ? 'Working...' : 'Generate from audio'}
            </button>
            <SubtitleTranslationPanel ref={translationRef} track={track} onChange={setTrack} status={status} setStatus={setStatus} />
            <div className="border-t border-editor-border mt-8 grid grid-cols-[1fr_auto] gap-2 pt-3">
              <div className="flex min-w-0">
                <select value={srtMode} onChange={event => setSrtMode(event.target.value as SubtitleSrtMode)}
                  className="min-w-0 flex-1 bg-editor-elevated-highlight border border-editor-border rounded-l text-[11px] text-editor-text px-1">
                  <option value="source">Source SRT</option>
                  <option value="translated" disabled={!canExportTranslation}>Translated SRT</option>
                  <option value="bilingual">Bilingual SRT</option>
                </select>
                <button onClick={exportSrt} title="Export SRT"
                  className="flex items-center justify-center px-2 rounded-r bg-editor-elevated-highlight border border-l-0 border-editor-border text-editor-text hover:bg-editor-hover transition-colors">
                  <Download size={13} />
                </button>
              </div>
              <button onClick={addCue}
                className="flex items-center justify-center gap-1 text-xs px-2 py-2 rounded bg-editor-elevated-highlight border border-editor-border text-editor-text hover:bg-editor-hover transition-colors">
                <Plus size={13} /> Add
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button onClick={toggleEnabled}
                className="flex items-center justify-center gap-2 text-xs py-2 rounded bg-editor-elevated-highlight border border-editor-border text-editor-text hover:bg-editor-hover transition-colors">
                {track.enabled ? 'Hide captions' : 'Show captions'}
              </button>
              <button onClick={deleteTrack}
                className="flex items-center justify-center gap-2 text-xs py-2 rounded bg-red-500/12 border border-red-500/30 text-red-200 hover:bg-red-500/20 transition-colors">
                Remove all
              </button>
            </div>

            {status && <p className="text-[11px] text-[#c9c4dd] mt-1">{status}</p>}
          </div>

          <div className="flex-1 min-w-0 overflow-y-auto p-4">
            {track.cues.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <p className="text-sm text-editor-text-secondary text-center">
                  No captions yet.<br />Generate from timeline audio or add cues manually.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2 max-w-5xl">
                {track.cues.slice().sort((a, b) => a.start - b.start).map((c, i) => {
                  const target = track.translation?.targetLanguage ?? (track.language === 'en' ? 'hi' : 'en')
                  const translation = c.translations?.[target]
                  const languageText = (language: SubtitleLanguage) => language === track.language ? c.text : c.translations?.[language]?.text ?? ''
                  const editLanguage = (language: SubtitleLanguage, text: string) => language === track.language
                    ? updateCueText(c.id, text)
                    : setTrack(current => ({ ...current, cues: current.cues.map(cue => cue.id === c.id ? mergeCueTranslation(cue, language, text, cue.translations?.[language]?.warnings) : cue) }))
                  return (
                  <div key={c.id} className="flex items-start gap-2 bg-editor-elevated-highlight border border-editor-border rounded-lg p-2.5">
                    <span className="text-[11px] text-editor-text-secondary w-8 pt-1 text-right tabular-nums">{i + 1}</span>
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-1 text-[10px] text-editor-text-secondary whitespace-nowrap">
                        <span>[Start (</span>
                        <input aria-label="Caption start time" type="number" min={0} step={0.1} value={roundTime(c.start)}
                          onChange={e => updateCue(c.id, { start: Math.max(0, parseFloat(e.target.value) || 0) })}
                          className="w-14 bg-editor-base border border-editor-border rounded text-center text-[10px] text-editor-text px-1 py-0.5 tabular-nums" />
                        <span>) - End (</span>
                        <input aria-label="Caption end time" type="number" min={0} step={0.1} value={roundTime(c.end)}
                          onChange={e => updateCue(c.id, { end: Math.max(0, parseFloat(e.target.value) || 0) })}
                          className="w-14 bg-editor-base border border-editor-border rounded text-center text-[10px] text-editor-text px-1 py-0.5 tabular-nums" />
                        <span>)]</span>
                      </div>
                      {(['en', 'hi'] as const).map(language => (
                        <label key={language} className="grid grid-cols-[42px_1fr] items-start gap-2">
                          <span className="pt-2 text-[10px] uppercase text-editor-text-secondary">{language}</span>
                          <textarea value={languageText(language)} rows={2} placeholder={`${language === 'en' ? 'English' : 'Hindi'} caption…`}
                            onChange={event => editLanguage(language, event.target.value)}
                            className="w-full bg-editor-base border border-editor-border rounded text-sm text-editor-text px-2 py-1.5 resize-none" />
                        </label>
                      ))}
                      <div className="flex flex-wrap items-center gap-3 pl-[50px] text-[10px] text-editor-text-secondary">
                        {translation && <>
                          <label className="flex items-center gap-1"><input type="checkbox" checked={Boolean(translation.reviewed)}
                            onChange={event => setTrack(current => ({ ...current, cues: current.cues.map(cue => cue.id === c.id ? setCueReviewed(cue, target, event.target.checked) : cue) }))} /> Reviewed</label>
                          {translation.warnings?.map(warning => <span key={warning} className="text-amber-300">{warning}</span>)}
                        </>}
                        <button onClick={() => translationRef.current?.retranslate(c.id)} className="text-editor-accent">Retranslate</button>
                      </div>
                    </div>
                    <button onClick={() => removeCue(c.id)} className="text-[#c9c4dd] hover:text-red-400 transition-colors pt-1.5"><Trash2 size={14} /></button>
                  </div>
                )})}
              </div>
            )}
          </div>

          <div className="w-96 flex-none border-l border-editor-border p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-editor-text-secondary">Caption style</span>
              <button
                onClick={() => commit({ ...track, style })}
                className="text-[11px] px-2 py-1 rounded bg-editor-accent text-white hover:bg-editor-accent-hover transition-colors"
              >
                Save style
              </button>
            </div>

            <SubtitleStylePreview style={style} />

            <SectionLabel>Position &amp; animation</SectionLabel>
            <StyleRow label="Position X">
              <Slider value={style.positionX} min={0} max={100} step={1}
                onChange={positionX => patchStyle({ positionX })} display={`${style.positionX}%`} />
            </StyleRow>
            <StyleRow label="Position Y">
              <Slider value={style.positionY} min={0} max={100} step={1}
                onChange={positionY => patchStyle({ positionY })} display={`${style.positionY}%`} />
            </StyleRow>
            <StyleRow label="Animation">
              <select
                value={style.animation ?? 'wordPop'}
                onChange={e => patchStyle({ animation: e.target.value as SubtitleStyle['animation'] })}
                className="w-full bg-editor-elevated-highlight border border-editor-border rounded text-xs text-editor-text px-2 py-1"
              >
                {CAPTION_ANIMATIONS.map(animation => (
                  <option key={animation.value} value={animation.value}>{animation.label}</option>
                ))}
              </select>
            </StyleRow>
            <StyleRow label="Max width">
              <Slider value={style.maxWidthPct} min={20} max={100} step={1}
                onChange={maxWidthPct => patchStyle({ maxWidthPct })} display={`${style.maxWidthPct}%`} />
            </StyleRow>
            <div className="border-t border-editor-border my-3" />

            <SectionLabel>Caption warp</SectionLabel>
            <StyleRow label="Style">
              <select
                value={style.captionLook ?? 'normal'}
                onChange={e => patchStyle({ captionLook: e.target.value as SubtitleStyle['captionLook'] })}
                className="w-full bg-editor-elevated-highlight border border-editor-border rounded text-xs text-editor-text px-2 py-1"
              >
                <option value="normal">Normal</option>
                <option value="bulge">Bulge Warp</option>
                <option value="inflate">Inflate Warp</option>
              </select>
            </StyleRow>
            {(style.captionLook ?? 'normal') !== 'normal' && (
              <StyleRow label="Warp intensity">
                <Slider value={style.warpIntensity ?? 50} min={0} max={100} step={1}
                  onChange={warpIntensity => patchStyle({ warpIntensity })} display={`${style.warpIntensity ?? 50}%`} />
              </StyleRow>
            )}

            <div className="border-t border-editor-border my-3" />
            <SectionLabel>Typography &amp; appearance</SectionLabel>

            <StyleRow label="Font family">
              <select
                value={style.fontFamily}
                onChange={e => patchStyle({ fontFamily: e.target.value })}
                className="w-full bg-editor-elevated-highlight border border-editor-border rounded text-xs text-editor-text px-2 py-1"
              >
                {FONT_FAMILIES.map(font => <option key={font} value={font}>{font}</option>)}
              </select>
            </StyleRow>

            <StyleRow label="Size">
              <Slider value={style.fontSize} min={20} max={140} step={1}
                onChange={fontSize => patchStyle({ fontSize })} display={`${style.fontSize}px`} />
            </StyleRow>

            <StyleRow label="Weight">
              <select
                value={normalizeFontWeightForControl(style.fontWeight)}
                onChange={e => patchStyle({ fontWeight: e.target.value as FontWeight })}
                className="w-full bg-editor-elevated-highlight border border-editor-border rounded text-xs text-editor-text px-2 py-1"
              >
                {FONT_WEIGHT_OPTIONS.map(weight => (
                  <option key={weight.value} value={weight.value}>{weight.label}</option>
                ))}
              </select>
            </StyleRow>

            <StyleRow label="Style">
              <button
                onClick={() => patchStyle({ italic: !style.italic })}
                className={`px-2 py-1 rounded text-xs border transition-colors ${style.italic ? 'bg-editor-accent text-white border-editor-accent' : 'bg-editor-elevated-highlight text-editor-text border-editor-border hover:bg-editor-hover'}`}
              >
                Italic
              </button>
            </StyleRow>

            <StyleRow label="Text fill">
              <select
                value={style.fillMode ?? 'solid'}
                onChange={e => patchStyle({ fillMode: e.target.value as SubtitleStyle['fillMode'] })}
                className="w-full bg-editor-elevated-highlight border border-editor-border rounded text-xs text-editor-text px-2 py-1"
              >
                <option value="solid">Solid</option>
                <option value="linearGradient">Gradient</option>
              </select>
            </StyleRow>

            {(style.fillMode ?? 'solid') === 'solid' ? (
              <StyleRow label="Color">
                <ColorInput value={style.color} onChange={color => patchStyle({ color })} />
              </StyleRow>
            ) : (
              <>
                <StyleRow label="Color 1">
                  <ColorInput value={style.gradientColor1 ?? style.color} onChange={gradientColor1 => patchStyle({ gradientColor1 })} />
                </StyleRow>
                <StyleRow label="Color 1 opacity">
                  <Slider value={Math.round((style.gradientOpacity1 ?? 1) * 100)} min={0} max={100} step={1}
                    onChange={value => patchStyle({ gradientOpacity1: value / 100 })} display={`${Math.round((style.gradientOpacity1 ?? 1) * 100)}%`} />
                </StyleRow>
                <StyleRow label="Color 2">
                  <ColorInput value={style.gradientColor2 ?? '#8b5cf6'} onChange={gradientColor2 => patchStyle({ gradientColor2 })} />
                </StyleRow>
                <StyleRow label="Color 2 opacity">
                  <Slider value={Math.round((style.gradientOpacity2 ?? 1) * 100)} min={0} max={100} step={1}
                    onChange={value => patchStyle({ gradientOpacity2: value / 100 })} display={`${Math.round((style.gradientOpacity2 ?? 1) * 100)}%`} />
                </StyleRow>
                <StyleRow label="Third color">
                  <button
                    onClick={() => patchStyle({ gradientUseColor3: !style.gradientUseColor3 })}
                    className={`px-2 py-1 rounded text-xs border transition-colors ${style.gradientUseColor3 ? 'bg-editor-accent text-white border-editor-accent' : 'bg-editor-elevated-highlight text-editor-text border-editor-border hover:bg-editor-hover'}`}
                  >
                    {style.gradientUseColor3 ? 'On' : 'Off'}
                  </button>
                </StyleRow>
                {style.gradientUseColor3 && (
                  <>
                    <StyleRow label="Color 3">
                      <ColorInput value={style.gradientColor3 ?? '#22d3ee'} onChange={gradientColor3 => patchStyle({ gradientColor3 })} />
                    </StyleRow>
                    <StyleRow label="Color 3 opacity">
                      <Slider value={Math.round((style.gradientOpacity3 ?? 1) * 100)} min={0} max={100} step={1}
                        onChange={value => patchStyle({ gradientOpacity3: value / 100 })} display={`${Math.round((style.gradientOpacity3 ?? 1) * 100)}%`} />
                    </StyleRow>
                  </>
                )}
              </>
            )}

            <div className="border-t border-editor-border my-3" />
            <SectionLabel>Translated row</SectionLabel>
            <StyleRow label="Show translation">
              <button onClick={() => patchTranslation({ visible: !track.translation?.visible })}
                className={`px-2 py-1 rounded text-xs border ${track.translation?.visible ? 'bg-editor-accent text-white border-editor-accent' : 'bg-editor-elevated-highlight text-editor-text border-editor-border'}`}>
                {track.translation?.visible ? 'On' : 'Off'}
              </button>
            </StyleRow>
            <StyleRow label="Translated font">
              <select value={track.translation?.style.fontFamily ?? ''} onChange={event => patchTranslatedStyle({ fontFamily: event.target.value || undefined })}
                className="w-full bg-editor-elevated-highlight border border-editor-border rounded text-xs text-editor-text px-2 py-1">
                <option value="">Inherit main font</option>
                {FONT_FAMILIES.map(font => <option key={font} value={font}>{font}</option>)}
              </select>
            </StyleRow>
            <StyleRow label="Translated size">
              <Slider value={track.translation?.style.sizePct ?? 90} min={50} max={120} step={1}
                onChange={sizePct => patchTranslatedStyle({ sizePct })} display={`${track.translation?.style.sizePct ?? 90}%`} />
            </StyleRow>
            <StyleRow label="Translated color">
              <div className="flex items-center gap-2">
                <ColorInput value={track.translation?.style.color ?? style.color} onChange={color => patchTranslatedStyle({ color })} />
                {track.translation?.style.color && <button onClick={() => patchTranslatedStyle({ color: undefined })} className="text-[10px] text-editor-accent">Inherit</button>}
              </div>
            </StyleRow>
            <StyleRow label="Row gap">
              <Slider value={track.translation?.style.rowGap ?? 8} min={0} max={40} step={1}
                onChange={rowGap => patchTranslatedStyle({ rowGap })} display={`${track.translation?.style.rowGap ?? 8}px`} />
            </StyleRow>

          </div>
        </div>
      </div>
    </div>
  )
}

function selectAudioClips(clips: TimelineAudioClip[], sourceId: CaptionSourceId) {
  if (sourceId === 'all') return clips
  if (sourceId === 'voiceover') return clips.filter(c => c.audio.track === 'voiceover')
  if (sourceId === 'background') return clips.filter(c => c.audio.track === 'background')
  return clips.filter(c => c.id === sourceId)
}

function collectTimelineAudioClips(project: Project | null): TimelineAudioClip[] {
  if (!project) return []
  const clips: TimelineAudioClip[] = []
  for (const scene of project.scenes) {
    const sceneStart = getSceneGlobalStart(project, scene.id)
    for (const el of scene.elements) {
      if (el.type !== 'audio') continue
      const audio = el as AudioElement
      const absStart = sceneStart + (audio.x ?? 0)
      const trackLabel = audio.track === 'voiceover' ? 'Voiceover' : 'Audio'
      clips.push({
        id: audio.id,
        audio,
        absStart,
        sceneName: scene.name,
        label: `${audio.name || trackLabel} - ${scene.name} @ ${fmt(absStart)} (${trackLabel})`,
      })
    }
  }
  return clips.sort((a, b) => a.absStart - b.absStart)
}

function roundTime(value: number) {
  return Math.round(value * 100) / 100
}

function StyleRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-2.5">
      <span className="block text-[10px] uppercase tracking-wider text-editor-text-secondary mb-1">{label}</span>
      {children}
    </label>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-editor-accent">{children}</div>
}
