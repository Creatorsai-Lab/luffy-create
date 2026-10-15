import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Download } from 'lucide-react'
import type { PythonRuntimeProgress, PythonRuntimeStatus } from '../types/global'

interface Props {
  /** What the runtime unlocks here, e.g. "Python Sandbox". */
  purpose: string
  onInstalled?: () => void
}

const mb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024 / 1024))} MB`

/**
 * One-time download prompt for the Python runtime. Renders nothing once the
 * runtime is installed, so it can sit wherever a feature needs Python.
 */
export default function PythonRuntimeDownload({ purpose, onInstalled }: Props) {
  const [status, setStatus] = useState<PythonRuntimeStatus | null>(null)
  const [progress, setProgress] = useState<PythonRuntimeProgress | null>(null)
  const [error, setError] = useState<string | null>(null)

  const onInstalledRef = useRef(onInstalled)
  onInstalledRef.current = onInstalled

  useEffect(() => {
    let alive = true
    const refresh = () => window.api.python.runtimeStatus()
      .then(next => {
        if (!alive) return
        setStatus(next)
        if (next.state === 'installed') onInstalledRef.current?.()
      })
      .catch(err => { if (alive) setError(message(err)) })
    void window.api.python.runtimeStatus().then(next => { if (alive) setStatus(next) }, err => { if (alive) setError(message(err)) })
    // Progress also arrives for a download started before this prompt mounted.
    const unsubscribe = window.api.python.onRuntimeProgress(next => {
      if (next.phase === 'finished') {
        setProgress(null)
        void refresh()
        return
      }
      setProgress(next)
      setStatus(current => current && { ...current, state: 'downloading' })
    })
    return () => { alive = false; unsubscribe() }
  }, [])

  async function install() {
    setError(null)
    setProgress(null)
    setStatus(current => current && { ...current, state: 'downloading' })
    // Success is handled by the 'finished' progress event.
    await window.api.python.installRuntime().catch(err => setError(message(err)))
  }

  if (!status || status.state === 'installed') return null

  const percent = progress?.totalBytes ? Math.round(progress.receivedBytes / progress.totalBytes * 100) : 0
  return (
    <div className="rounded border border-editor-accent/40 bg-editor-accent/10 px-3 py-2.5 text-xs text-editor-text">
      {status.state === 'unavailable' ? (
        <p className="flex items-start gap-2">
          <AlertCircle size={14} className="mt-0.5 flex-none text-amber-300" />
          {purpose} needs the Python runtime, which is not available for this platform yet.
        </p>
      ) : status.state === 'downloading' ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <span>
              {progress?.phase === 'install'
                ? 'Installing Python runtime...'
                : `Downloading Python runtime... ${progress ? `${mb(progress.receivedBytes)} / ${mb(progress.totalBytes)}` : ''}`}
            </span>
            <button onClick={() => void window.api.python.cancelRuntimeInstall()} className="text-red-300 hover:text-red-200">
              Cancel
            </button>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded bg-black/30">
            <div
              className={`h-full bg-editor-accent transition-[width] ${progress?.phase === 'install' ? 'w-full animate-pulse' : ''}`}
              style={progress?.phase === 'install' ? undefined : { width: `${percent}%` }}
            />
          </div>
        </>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <span>
            {purpose} needs a one-time download of the Python runtime ({mb(status.archiveBytes)}).
          </span>
          <button
            onClick={install}
            className="flex flex-none items-center gap-1.5 rounded bg-editor-accent px-3 py-1.5 text-white hover:bg-editor-accent-hover"
          >
            <Download size={13} /> Download
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-red-300">{error}</p>}
    </div>
  )
}

function message(err: unknown) {
  return err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err)
}
