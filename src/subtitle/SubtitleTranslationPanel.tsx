import { useEffect, useState } from 'react'
import { ChevronDown, Languages, Plus, Trash2 } from 'lucide-react'
import type { Dispatch, SetStateAction } from 'react'
import type { SubtitleLanguage, SubtitleTrack } from '../types/editor'
import type { SubtitleTranslationPackStatus } from '../types/global'
import { getTranslationDirection, mergeTranslationResults, selectTranslationCandidates } from './translation'
import { normalizeSubtitleTrack } from './types'

interface Props {
  track: SubtitleTrack
  onChange: Dispatch<SetStateAction<SubtitleTrack>>
  setStatus: (status: string) => void
}

const languageName = { en: 'English', hi: 'Hindi' } satisfies Record<SubtitleLanguage, string>
const opposite = (language: SubtitleLanguage): SubtitleLanguage => language === 'en' ? 'hi' : 'en'

export default function SubtitleTranslationPanel({ track, onChange, setStatus }: Props) {
  const settings = normalizeSubtitleTrack(track).translation!
  const direction = getTranslationDirection(track.language)
  const [model, setModel] = useState<SubtitleTranslationPackStatus>({ state: 'not-installed', direction })
  const [jobId, setJobId] = useState('')
  const [glossaryOpen, setGlossaryOpen] = useState(false)
  const [progress, setProgress] = useState('')

  useEffect(() => {
    let current = true
    setProgress('')
    window.api.subtitle.translationStatus(direction)
      .then(value => { if (current) setModel(value) })
      .catch(error => { if (current) setStatus(message(error)) })
    return () => { current = false }
  }, [direction, setStatus])

  useEffect(() => window.api.subtitle.onTranslationProgress(value => {
    if ('jobId' in value) {
      if (value.jobId !== jobId) return
      setProgress(`${value.completed}/${value.total} captions`)
    } else {
      if (value.direction !== direction) return
      const percent = value.totalBytes ? Math.round(value.receivedBytes / value.totalBytes * 100) : 0
      setProgress(`${value.phase === 'install' ? 'Installing' : 'Downloading'} ${percent}%`)
    }
  }), [jobId])

  function patchLanguages(sourceLanguage: SubtitleLanguage) {
    onChange(current => normalizeSubtitleTrack({
      ...current,
      language: sourceLanguage,
      translation: { ...normalizeSubtitleTrack(current).translation!, targetLanguage: opposite(sourceLanguage) },
    }))
    setModel({ state: 'not-installed', direction: getTranslationDirection(sourceLanguage) })
  }

  async function install() {
    try {
      setModel({ state: 'downloading', direction })
      setModel(await window.api.subtitle.installTranslation(direction))
      setStatus(`${languageName[settings.targetLanguage]} translation model installed.`)
    } catch (error) {
      setModel({ state: 'not-installed', direction })
      setStatus(message(error))
    }
  }

  async function remove() {
    try {
      await window.api.subtitle.removeTranslation(direction)
      setModel({ state: 'not-installed', direction })
      setStatus('Translation model removed. Saved caption text was kept.')
    } catch (error) { setStatus(message(error)) }
  }

  function cancelInstall() {
    void window.api.subtitle.cancelTranslationInstall(direction)
  }

  async function translate() {
    const candidates = selectTranslationCandidates(track)
    if (model.state !== 'installed') { setStatus('Install this translation model first.'); return }
    if (!candidates.length) { setStatus('No captions need translation.'); return }

    const nextJobId = crypto.randomUUID()
    setJobId(nextJobId)
    setProgress(`0/${candidates.length} captions`)
    try {
      const result = await window.api.subtitle.translate({
        jobId: nextJobId,
        sourceLanguage: track.language,
        targetLanguage: settings.targetLanguage,
        cues: candidates.map(({ id, text }) => ({ id, text })),
        glossary: settings.glossary.map(({ source, target }) => ({ source, target })).filter(item => item.source.trim() && item.target.trim()),
      })
      onChange(current => mergeTranslationResults(current, settings.targetLanguage, candidates, result.translated))
      const summary = `${result.translated.length} translated, ${result.skipped.length} skipped, ${result.failed.length} failed`
      setStatus(result.cancelled ? `Translation cancelled. ${summary}.` : `Translation complete: ${summary}.`)
    } catch (error) { setStatus(message(error)) }
    finally { setJobId(''); setProgress('') }
  }

  function addGlossary() {
    onChange(current => {
      const normalized = normalizeSubtitleTrack(current)
      return { ...normalized, translation: { ...normalized.translation!, glossary: [...normalized.translation!.glossary, { id: crypto.randomUUID(), source: '', target: '' }] } }
    })
  }

  function patchGlossary(id: string, patch: { source?: string; target?: string }) {
    onChange(current => {
      const normalized = normalizeSubtitleTrack(current)
      return { ...normalized, translation: { ...normalized.translation!, glossary: normalized.translation!.glossary.map(item => item.id === id ? { ...item, ...patch } : item) } }
    })
  }

  function removeGlossary(id: string) {
    onChange(current => {
      const normalized = normalizeSubtitleTrack(current)
      return { ...normalized, translation: { ...normalized.translation!, glossary: normalized.translation!.glossary.filter(item => item.id !== id) } }
    })
  }

  return (
    <section className="border-t border-editor-border pt-3 mt-2">
      <div className="flex items-center gap-2 mb-2 text-[11px] font-semibold uppercase tracking-wider text-editor-accent">
        <Languages size={13} /> Auto translation
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
        <LanguageSelect label="From" value={track.language} onChange={patchLanguages} disabled={Boolean(jobId)} />
        <button title="Swap languages" disabled={Boolean(jobId)} onClick={() => patchLanguages(settings.targetLanguage)}
          className="mb-0.5 px-2 py-1.5 rounded border border-editor-border text-editor-text hover:bg-editor-hover disabled:opacity-50">⇄</button>
        <LanguageSelect label="To" value={settings.targetLanguage} onChange={language => patchLanguages(opposite(language))} disabled={Boolean(jobId)} />
      </div>

      <div className="mt-2 flex items-center justify-between mt-2text-normal p-3 bg-yellow-700/20 rounded">
        <span className="text-editor-text">MODEL STATUS: {model.state.replace('-', ' ')}</span>
        {model.state === 'installed' ? (
          <button onClick={remove} className="px-2 py-1 text-editor-error border rounded-2xl border-editor-error ">Remove Model</button>
        ) : model.state === 'downloading' ? (
          <button onClick={cancelInstall} className="text-red-300 hover:text-red-200">Cancel download</button>
        ) : (
          <button onClick={install} className="px-2 py-1 border border-editor-success rounded-2xl  text-editor-success">Install Model (one time)</button>
        )}
      </div>
      {progress && <p className="mt-1 text-[10px] text-editor-text-secondary">{progress}</p>}

      <button onClick={() => jobId ? window.api.subtitle.cancelTranslation(jobId) : translate()}
        className="w-full mt-2 py-2 rounded bg-editor-accent text-sm text-white hover:bg-editor-accent-hover">
        {jobId ? 'Cancel translation' : 'Translate captions'}
      </button>

      <button onClick={() => setGlossaryOpen(open => !open)} className="flex w-full items-center justify-between mt-3 text-[11px] text-editor-text">
        Technical glossary <ChevronDown size={13} className={glossaryOpen ? 'rotate-180' : ''} />
      </button>
      {glossaryOpen && (
        <div className="mt-2 space-y-2">
          {settings.glossary.map(item => (
            <div key={item.id} className="grid grid-cols-[1fr_1fr_auto] gap-1">
              <input value={item.source} placeholder="Source term" onChange={event => patchGlossary(item.id, { source: event.target.value })} className="min-w-0 bg-editor-base border border-editor-border rounded px-1.5 py-1 text-[11px] text-editor-text" />
              <input value={item.target} placeholder="Required term" onChange={event => patchGlossary(item.id, { target: event.target.value })} className="min-w-0 bg-editor-base border border-editor-border rounded px-1.5 py-1 text-[11px] text-editor-text" />
              <button onClick={() => removeGlossary(item.id)} className="text-editor-text-secondary hover:text-red-400"><Trash2 size={13} /></button>
            </div>
          ))}
          <button onClick={addGlossary} className="flex items-center gap-1 text-[11px] text-editor-accent"><Plus size={12} /> Add term</button>
        </div>
      )}
    </section>
  )
}

function LanguageSelect({ label, value, onChange, disabled }: { label: string; value: SubtitleLanguage; onChange: (value: SubtitleLanguage) => void; disabled: boolean }) {
  return <label className="text-[10px] uppercase tracking-wider text-editor-text-secondary">{label}
    <select value={value} disabled={disabled} onChange={event => onChange(event.target.value as SubtitleLanguage)} className="w-full mt-1 bg-editor-elevated-highlight border border-editor-border rounded px-2 py-1.5 text-xs normal-case tracking-normal text-editor-text disabled:opacity-50">
      <option value="en">English</option><option value="hi">Hindi</option>
    </select>
  </label>
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
