import { useEffect, useMemo, useState } from 'react'
import { X, Captions, Wand2, Plus, Trash2, Download, Mic, Save, FileText } from 'lucide-react'
import { useEditorStore } from '../store/editorStore'
import type { AudioElement, Project, SubtitleCue, SubtitleTrack } from '../types/editor'
import { makeCue, makeSubtitleTrack } from './types'
import { cuesToSrt, fmt } from './srt'
import { transcriber } from './transcriber'
import { getSceneGlobalStart, splitScriptIntoCueTexts } from './timeline'

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
  const [track, setTrack] = useState<SubtitleTrack>(() => existingTrack ?? makeSubtitleTrack())
  const [sourceId, setSourceId] = useState<CaptionSourceId>('all')
  const [script, setScript] = useState('')
  const [status, setStatus] = useState<string>('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setTrack(existingTrack ?? makeSubtitleTrack())
  }, [existingTrack?.id])

  const hasVoiceover = audioClips.some(c => c.audio.track === 'voiceover')
  const hasBackground = audioClips.some(c => c.audio.track === 'background')
  const selectedClips = selectAudioClips(audioClips, sourceId)

  function commit(next = track) {
    upsertSubtitleTrack(next)
    setStatus(`Saved ${next.cues.length} captions to project.`)
  }

  function patchTrack(patch: Partial<SubtitleTrack>) {
    setTrack(t => ({ ...t, ...patch }))
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
    setStatus('Removed saved captions.')
  }

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
                <Trash2 size={13} /> Clear
              </button>
            </div>

            {status && <p className="text-[11px] text-[#c9c4dd] mt-1">{status}</p>}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
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
