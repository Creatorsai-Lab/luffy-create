import { useEffect, useMemo, useState } from 'react'
import { X, Captions, Wand2, Plus, Trash2, Download, Mic, Save, FileText } from 'lucide-react'
import { useEditorStore } from '../store/editorStore'
import { FONT_FAMILIES } from '../types/editor'
import type { AlignType, AudioElement, FontWeight, Project, SubtitleCue, SubtitleStyle, SubtitleTrack } from '../types/editor'
import { ColorInput, Slider } from '../components/panels/TextPanel'
import { makeCue, makeSubtitleTrack, normalizeSubtitleStyle } from './types'
import { cuesToSrt, fmt } from './srt'
import { transcriber } from './transcriber'
import { getSceneGlobalStart, splitScriptIntoCueTexts } from './timeline'
import { FONT_WEIGHT_OPTIONS, normalizeFontWeightForControl } from '../utils/fontWeight'

interface TimelineAudioClip {
  id: string
  label: string
  audio: AudioElement
  absStart: number
  sceneName: string
}

type CaptionSourceId = 'all' | 'voiceover' | 'background' | string

export default function SubtitleModal() {
  const { project, setSubtitleOpen, upsertSubtitleTrack, removeSubtitleTrack } = useEditorStore()

  const audioClips = useMemo(() => collectTimelineAudioClips(project), [project])
  const existingTrack = project?.subtitleTracks?.[0] ?? null
  const [track, setTrack] = useState<SubtitleTrack>(() => normalizeTrack(existingTrack ?? makeSubtitleTrack()))
  const [sourceId, setSourceId] = useState<CaptionSourceId>('all')
  const [script, setScript] = useState('')
  const [status, setStatus] = useState<string>('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setTrack(normalizeTrack(existingTrack ?? makeSubtitleTrack()))
  }, [existingTrack?.id])

  const hasVoiceover = audioClips.some(c => c.audio.track === 'voiceover')
  const hasBackground = audioClips.some(c => c.audio.track === 'background')
  const selectedClips = selectAudioClips(audioClips, sourceId)

  function commit(next = track) {
    upsertSubtitleTrack(normalizeTrack(next))
    setStatus(`Saved ${next.cues.length} captions to project.`)
  }

  function patchTrack(patch: Partial<SubtitleTrack>) {
    setTrack(t => ({ ...t, ...patch }))
  }

  function patchStyle(patch: Partial<SubtitleStyle>) {
    setTrack(t => ({ ...t, style: { ...normalizeSubtitleStyle(t.style), ...patch } }))
  }

  function updateCue(id: string, patch: Partial<SubtitleCue>) {
    setTrack(t => ({ ...t, cues: t.cues.map(c => (c.id === id ? { ...c, ...patch } : c)) }))
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

      const sorted = generated.sort((a, b) => a.start - b.start)
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
    const blob = new Blob([cuesToSrt(track.cues)], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${project?.name ?? 'captions'}.srt`
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
    const next = normalizeTrack({ ...track, enabled: !track.enabled })
    setTrack(next)
    upsertSubtitleTrack(next)
    setStatus(next.enabled ? 'Captions enabled.' : 'Captions hidden.')
  }

  const style = normalizeSubtitleStyle(track.style)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) setSubtitleOpen(false) }}>
      <div className="bg-editor-panel border border-editor-border rounded-xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: '92vw', height: '90vh' }}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-editor-border flex-none">
          <div className="flex items-center gap-2">
            <Captions size={16} className="text-editor-accent" />
            <span className="text-base font-medium text-editor-text">Auto Captions</span>
            <span className="text-[10px] uppercase tracking-wider text-editor-secondary bg-editor-elevated px-1.5 py-0.5 rounded">timeline audio</span>
          </div>
          <button onClick={() => setSubtitleOpen(false)} className="text-[#c9c4dd] hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          <div className="w-80 flex-none border-r border-editor-border p-4 flex flex-col gap-3 overflow-y-auto">
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-editor-secondary">Caption track</span>
              <input
                value={track.name}
                onChange={e => patchTrack({ name: e.target.value })}
                className="w-full mt-1.5 bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1.5"
              />
            </label>

            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-editor-secondary">Language</span>
              <input
                value={track.language}
                onChange={e => patchTrack({ language: e.target.value.trim() || 'en' })}
                placeholder="en"
                className="w-full mt-1.5 bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1.5"
              />
            </label>

            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-editor-secondary">Timeline audio source</span>
              {audioClips.length === 0 ? (
                <p className="text-xs text-[#c9c4dd] mt-2">No timeline audio found. Add an audio clip to the timeline first.</p>
              ) : (
                <select
                  value={sourceId}
                  onChange={e => setSourceId(e.target.value)}
                  className="w-full mt-1.5 bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1.5"
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
              <div className="flex items-center gap-2 text-xs text-[#c9c4dd] bg-editor-elevated rounded px-2.5 py-2">
                <Mic size={13} /> {selectedClips.length} clip{selectedClips.length === 1 ? '' : 's'} selected
              </div>
            )}

            <label className="block">
              <span className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-editor-secondary">
                <FileText size={12} /> Script text
              </span>
              <textarea
                value={script}
                onChange={e => setScript(e.target.value)}
                rows={7}
                placeholder="Optional: paste the audio script here. The tool will distribute it across detected speech timings."
                className="w-full mt-1.5 bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-2 resize-none"
              />
            </label>

            <button
              onClick={autoGenerate}
              disabled={busy || selectedClips.length === 0}
              className="flex items-center justify-center gap-2 text-sm py-2.5 rounded bg-editor-accent text-white hover:bg-editor-accent-hover transition-colors disabled:opacity-50"
            >
              <Wand2 size={14} /> {busy ? 'Working...' : 'Generate from audio'}
            </button>

            <p className="text-[11px] text-yellow-500/90 leading-relaxed">
              Automatic text extraction uses local Whisper when bundled. Without it, the local engine detects timing and syncs pasted script text.
            </p>

            <div className="border-t border-editor-border pt-3 grid grid-cols-2 gap-2">
              <button onClick={addCue}
                className="flex items-center justify-center gap-2 text-xs py-2 rounded bg-editor-elevated border border-editor-border text-editor-text hover:bg-editor-hover transition-colors">
                <Plus size={13} /> Add
              </button>
              <button onClick={() => commit()}
                className="flex items-center justify-center gap-2 text-xs py-2 rounded bg-editor-elevated border border-editor-border text-editor-text hover:bg-editor-hover transition-colors">
                <Save size={13} /> Save
              </button>
              <button onClick={exportSrt}
                className="flex items-center justify-center gap-2 text-xs py-2 rounded bg-editor-elevated border border-editor-border text-editor-text hover:bg-editor-hover transition-colors">
                <Download size={13} /> SRT
              </button>
              <button onClick={deleteTrack}
                className="flex items-center justify-center gap-2 text-xs py-2 rounded bg-editor-elevated border border-editor-border text-red-300 hover:bg-editor-hover transition-colors">
                <Trash2 size={13} /> Remove
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button onClick={toggleEnabled}
                className="flex items-center justify-center gap-2 text-xs py-2 rounded bg-editor-elevated border border-editor-border text-editor-text hover:bg-editor-hover transition-colors">
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
                <p className="text-sm text-editor-secondary text-center">
                  No captions yet.<br />Generate from timeline audio or add cues manually.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2 max-w-4xl">
                {track.cues.slice().sort((a, b) => a.start - b.start).map((c, i) => (
                  <div key={c.id} className="flex items-start gap-2 bg-editor-elevated border border-editor-border rounded-lg p-2.5">
                    <span className="text-[11px] text-editor-secondary w-8 pt-2 text-right tabular-nums">{i + 1}</span>
                    <div className="flex flex-col gap-1.5 w-32 flex-none">
                      <label className="text-[10px] text-editor-secondary">Start ({fmt(c.start)})</label>
                      <input type="number" min={0} step={0.1} value={roundTime(c.start)}
                        onChange={e => updateCue(c.id, { start: Math.max(0, parseFloat(e.target.value) || 0) })}
                        className="bg-editor-base border border-editor-border rounded text-xs text-editor-text px-2 py-1" />
                      <label className="text-[10px] text-editor-secondary">End ({fmt(c.end)})</label>
                      <input type="number" min={0} step={0.1} value={roundTime(c.end)}
                        onChange={e => updateCue(c.id, { end: Math.max(0, parseFloat(e.target.value) || 0) })}
                        className="bg-editor-base border border-editor-border rounded text-xs text-editor-text px-2 py-1" />
                    </div>
                    <textarea value={c.text} rows={3} placeholder="Caption text..."
                      onChange={e => updateCue(c.id, { text: e.target.value })}
                      className="flex-1 bg-editor-base border border-editor-border rounded text-sm text-editor-text px-2 py-1.5 resize-none" />
                    <button onClick={() => removeCue(c.id)} className="text-[#c9c4dd] hover:text-red-400 transition-colors pt-1.5">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="w-96 flex-none border-l border-editor-border p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-editor-secondary">Caption style</span>
              <button
                onClick={() => commit({ ...track, style })}
                className="text-[11px] px-2 py-1 rounded bg-editor-accent text-white hover:bg-editor-accent-hover transition-colors"
              >
                Save style
              </button>
            </div>

            <StyleRow label="Font family">
              <select
                value={style.fontFamily}
                onChange={e => patchStyle({ fontFamily: e.target.value })}
                className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1"
              >
                {FONT_FAMILIES.map(font => <option key={font} value={font}>{font}</option>)}
              </select>
            </StyleRow>

            <StyleRow label="Size">
              <Slider value={style.fontSize} min={14} max={160} step={1}
                onChange={fontSize => patchStyle({ fontSize })} display={`${style.fontSize}px`} />
            </StyleRow>

            <StyleRow label="Weight">
              <select
                value={normalizeFontWeightForControl(style.fontWeight)}
                onChange={e => patchStyle({ fontWeight: e.target.value as FontWeight })}
                className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1"
              >
                {FONT_WEIGHT_OPTIONS.map(weight => (
                  <option key={weight.value} value={weight.value}>{weight.label}</option>
                ))}
              </select>
            </StyleRow>

            <StyleRow label="Style">
              <button
                onClick={() => patchStyle({ italic: !style.italic })}
                className={`px-2 py-1 rounded text-xs border transition-colors ${style.italic ? 'bg-editor-accent text-white border-editor-accent' : 'bg-editor-elevated text-editor-text border-editor-border hover:bg-editor-hover'}`}
              >
                Italic
              </button>
            </StyleRow>

            <StyleRow label="Text fill">
              <select
                value={style.fillMode ?? 'solid'}
                onChange={e => patchStyle({ fillMode: e.target.value as SubtitleStyle['fillMode'] })}
                className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1"
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
                    className={`px-2 py-1 rounded text-xs border transition-colors ${style.gradientUseColor3 ? 'bg-editor-accent text-white border-editor-accent' : 'bg-editor-elevated text-editor-text border-editor-border hover:bg-editor-hover'}`}
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

            <StyleRow label="Text background">
              <button
                onClick={() => patchStyle({ backgroundEnabled: !style.backgroundEnabled })}
                className={`px-2 py-1 rounded text-xs border transition-colors ${style.backgroundEnabled ? 'bg-editor-accent text-white border-editor-accent' : 'bg-editor-elevated text-editor-text border-editor-border hover:bg-editor-hover'}`}
              >
                {style.backgroundEnabled ? 'On' : 'Off'}
              </button>
            </StyleRow>
            {style.backgroundEnabled && (
              <>
                <StyleRow label="Background color">
                  <ColorInput value={style.backgroundColor} onChange={backgroundColor => patchStyle({ backgroundColor })} />
                </StyleRow>
                <StyleRow label="Background opacity">
                  <Slider value={Math.round(style.backgroundOpacity * 100)} min={0} max={100} step={1}
                    onChange={value => patchStyle({ backgroundOpacity: value / 100 })} display={`${Math.round(style.backgroundOpacity * 100)}%`} />
                </StyleRow>
                <StyleRow label="Padding X">
                  <Slider value={style.paddingX} min={0} max={100} step={1}
                    onChange={paddingX => patchStyle({ paddingX })} display={`${style.paddingX}px`} />
                </StyleRow>
                <StyleRow label="Padding Y">
                  <Slider value={style.paddingY} min={0} max={80} step={1}
                    onChange={paddingY => patchStyle({ paddingY })} display={`${style.paddingY}px`} />
                </StyleRow>
                <StyleRow label="Corner radius">
                  <Slider value={style.radius} min={0} max={80} step={1}
                    onChange={radius => patchStyle({ radius })} display={`${style.radius}px`} />
                </StyleRow>
              </>
            )}

            <div className="border-t border-editor-border my-3" />

            <StyleRow label="Position">
              <select
                value={style.position}
                onChange={e => patchStyle({ position: e.target.value as SubtitleStyle['position'] })}
                className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1"
              >
                <option value="top">Top</option>
                <option value="middle">Middle</option>
                <option value="bottom">Bottom</option>
              </select>
            </StyleRow>
            <StyleRow label="Align">
              <select
                value={style.align}
                onChange={e => patchStyle({ align: e.target.value as AlignType })}
                className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1"
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </StyleRow>
            <StyleRow label="Max width">
              <Slider value={style.maxWidthPct} min={20} max={100} step={1}
                onChange={maxWidthPct => patchStyle({ maxWidthPct })} display={`${style.maxWidthPct}%`} />
            </StyleRow>
            <div className="grid grid-cols-2 gap-2">
              <StyleRow label="Top margin">
                <input type="number" min={0} max={1000} value={style.marginTop ?? 80}
                  onChange={e => patchStyle({ marginTop: Math.max(0, Number(e.target.value) || 0) })}
                  className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1" />
              </StyleRow>
              <StyleRow label="Right margin">
                <input type="number" min={0} max={1000} value={style.marginRight ?? 120}
                  onChange={e => patchStyle({ marginRight: Math.max(0, Number(e.target.value) || 0) })}
                  className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1" />
              </StyleRow>
              <StyleRow label="Bottom margin">
                <input type="number" min={0} max={1000} value={style.marginBottom ?? 80}
                  onChange={e => patchStyle({ marginBottom: Math.max(0, Number(e.target.value) || 0) })}
                  className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1" />
              </StyleRow>
              <StyleRow label="Left margin">
                <input type="number" min={0} max={1000} value={style.marginLeft ?? 120}
                  onChange={e => patchStyle({ marginLeft: Math.max(0, Number(e.target.value) || 0) })}
                  className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1" />
              </StyleRow>
            </div>

            <StyleRow label="Subtitle animation">
              <select
                value={style.animation ?? 'fade'}
                onChange={e => patchStyle({ animation: e.target.value as SubtitleStyle['animation'] })}
                className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1"
              >
                <option value="none">None</option>
                <option value="fade">Fade</option>
                <option value="slideUp">Slide up</option>
                <option value="pop">Pop</option>
              </select>
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

function normalizeTrack(track: SubtitleTrack): SubtitleTrack {
  return { ...track, style: normalizeSubtitleStyle(track.style) }
}

function StyleRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-2.5">
      <span className="block text-[10px] uppercase tracking-wider text-editor-secondary mb-1">{label}</span>
      {children}
    </label>
  )
}
