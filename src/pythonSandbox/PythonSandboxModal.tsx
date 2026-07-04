import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import type { editor as MonacoEditorNS } from 'monaco-editor'
import { AlertCircle, CheckCircle2, FileImage, Film, FolderOpen, Play, Plus, Square, Terminal, X, Check } from 'lucide-react'
import { useEditorStore } from '../store/editorStore'
import { makeImage, makeVideo } from '../utils/defaults'
import { toFileUrl } from '../utils/pathUtils'
import type { PythonOutputFile, PythonRunResult, PythonStatus } from '../types/global'
import { PYTHON_SANDBOX_IMAGE_EXTS, PYTHON_SANDBOX_VIDEO_EXTS } from './constants'
import { readPythonSandboxImageSize, readPythonSandboxVideoMeta } from './media'
import { PYTHON_SANDBOX_TEMPLATES, type PythonSandboxKind } from './templates'

const MonacoEditor = lazy(() => import('@monaco-editor/react'))

export default function PythonSandboxModal() {
  const {
    project,
    setPythonSandboxOpen,
    addAsset,
    addElement,
  } = useEditorStore()

  const firstTemplate = PYTHON_SANDBOX_TEMPLATES[0]
  const [status, setStatus] = useState<PythonStatus | null>(null)
  const [checking, setChecking] = useState(true)
  const [kind, setKind] = useState<PythonSandboxKind>(firstTemplate.kind)
  const [sceneName, setSceneName] = useState(firstTemplate.sceneName)
  const [code, setCode] = useState(firstTemplate.code)
  const [running, setRunning] = useState(false)
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [result, setResult] = useState<PythonRunResult | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [importedByPath, setImportedByPath] = useState<Record<string, { id: string; path: string; type: 'image' | 'video'; filename: string }>>({})
  const [error, setError] = useState<string | null>(null)

  const selectedOutput = useMemo(
    () => result?.outputs.find(o => o.path === selectedPath) ?? result?.outputs[0] ?? null,
    [result, selectedPath]
  )

  useEffect(() => {
    let alive = true
    setChecking(true)
    window.api.python.check()
      .then(next => { if (alive) setStatus(next) })
      .catch(err => { if (alive) setError(String(err?.message ?? err)) })
      .finally(() => { if (alive) setChecking(false) })
    return () => { alive = false }
  }, [])

  function applyTemplate(templateId: string) {
    const template = PYTHON_SANDBOX_TEMPLATES.find(t => t.id === templateId)
    if (!template) return
    setKind(template.kind)
    setSceneName(template.sceneName)
    setCode(template.code)
    setResult(null)
    setSelectedPath(null)
    setError(null)
  }

  async function runCode() {
    if (!project || running) return
    const jobId = `py_${Date.now()}_${Math.random().toString(16).slice(2)}`
    setRunning(true)
    setActiveJobId(jobId)
    setError(null)
    setResult(null)
    setSelectedPath(null)

    try {
      const runResult = await window.api.python.run({
        jobId,
        projectId: project.id,
        code,
        kind,
        sceneName,
        width: project.width,
        height: project.height,
        fps: 30,
        timeoutMs: 180_000,
      })
      setResult(runResult)
      setSelectedPath(runResult.outputs[0]?.path ?? null)
      if (!runResult.success) {
        setError(runResult.timedOut ? 'Python render timed out.' : 'Python render finished with errors.')
      }
    } catch (err) {
      setError(String(err?.message ?? err))
    } finally {
      setRunning(false)
      setActiveJobId(null)
    }
  }

  async function stopRun() {
    if (!activeJobId) return
    await window.api.python.cancel(activeJobId)
    setRunning(false)
    setActiveJobId(null)
  }

  async function refreshOutputs() {
    if (!result?.outputDir) return
    const outputs = await window.api.python.listOutputs(result.outputDir)
    setResult({ ...result, outputs })
    setSelectedPath(outputs[0]?.path ?? null)
  }

  async function importOutput(output: PythonOutputFile) {
    if (!project) throw new Error('No project is open')
    const existing = importedByPath[output.path]
    if (existing) return existing

    const asset = await window.api.assets.upload(project.id, output.path)
    const assetType = output.type === 'video' ? 'video' : 'image'
    const record = { id: asset.id, path: asset.path, type: assetType, filename: asset.filename }
    addAsset({ id: asset.id, filename: asset.filename, path: asset.path, type: assetType, name: output.name })
    setImportedByPath(prev => ({ ...prev, [output.path]: record }))
    return record
  }

  async function importAndInsert(output: PythonOutputFile) {
    if (!project) return
    const asset = await importOutput(output)

    if (asset.type === 'video') {
      const meta = await readPythonSandboxVideoMeta(asset.path)
      const maxW = Math.min(meta.width, project.width * 0.7, 960)
      const ratio = meta.width > 0 && meta.height > 0 ? meta.width / meta.height : 16 / 9
      const width = Math.max(40, Math.round(maxW))
      const height = Math.max(40, Math.round(maxW / ratio))
      addElement(makeVideo(
        Math.round(project.width / 2 - width / 2),
        Math.round(project.height / 2 - height / 2),
        asset.path,
        asset.id,
        width,
        height,
        meta.duration
      ))
      return
    }

    const meta = await readPythonSandboxImageSize(asset.path)
    const maxW = Math.min(meta.width, project.width * 0.7, 960)
    const maxH = Math.min(meta.height, project.height * 0.7, 960)
    const scale = Math.min(maxW / meta.width, maxH / meta.height, 1)
    const width = Math.max(40, Math.round(meta.width * scale))
    const height = Math.max(40, Math.round(meta.height * scale))
    addElement(makeImage(
      Math.round(project.width / 2 - width / 2),
      Math.round(project.height / 2 - height / 2),
      asset.path,
      asset.id,
      width,
      height
    ))
  }

  const consoleText = result ? [result.stdout, result.stderr].filter(Boolean).join('\n') : ''

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85">
      <div className="bg-editor-panel border border-editor-border rounded-3xl shadow-2xl flex flex-col overflow-hidden w-[80vw] h-[80vh]">
        <div className="flex items-center justify-between border-b border-editor-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Terminal size={16} className="text-editor-accent" />
            <div>
              <h2 className="text-sm font-semibold text-editor-text">Python Sandbox</h2>
              <p className="text-[11px] text-editor-secondary">
                {checking
                  ? 'Checking Python...'
                  : status?.available
                    ? `${status.version ?? 'Python'} - Matplotlib ${status.matplotlib ? 'ready' : 'missing'} - Manim ${status.manim ? 'ready' : 'missing'}`
                    : 'Python 3 not found'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setPythonSandboxOpen(false)}
            className="rounded p-1.5 text-editor-secondary transition-colors hover:bg-editor-hover hover:text-editor-text"
          >
            <X size={17} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(420px,1fr)_360px] gap-0">
          <div className="flex min-h-0 flex-col border-r border-editor-border">
            <div className="flex flex-wrap items-center gap-2 border-b border-editor-border px-3 py-2">
              <select
                onChange={e => applyTemplate(e.target.value)}
                className="rounded border border-editor-border bg-editor-elevated px-2 py-1.5 text-xs text-editor-text"
                defaultValue={firstTemplate.id}
              >
                {PYTHON_SANDBOX_TEMPLATES.map(template => (
                  <option key={template.id} value={template.id}>{template.label}</option>
                ))}
              </select>

              <select
                value={kind}
                onChange={e => setKind(e.target.value as PythonSandboxKind)}
                className="rounded border border-editor-border bg-editor-elevated px-2 py-1.5 text-xs text-editor-text"
              >
                <option value="script">Python Script</option>
                <option value="manim">Manim Scene</option>
              </select>

              {kind === 'manim' && (
                <input
                  value={sceneName}
                  onChange={e => setSceneName(e.target.value)}
                  placeholder="Scene class"
                  className="w-40 rounded border border-editor-border bg-editor-elevated px-2 py-1.5 text-xs text-editor-text"
                />
              )}

              <div className="ml-auto flex items-center gap-2">
                {running ? (
                  <button
                    onClick={stopRun}
                    className="flex items-center gap-1.5 rounded border border-red-500/60 bg-red-500/10 px-3 py-1.5 text-xs text-red-300 transition-colors hover:bg-red-500/20"
                  >
                    <Square size={13} /> Stop
                  </button>
                ) : (
                  <button
                    onClick={runCode}
                    disabled={!project || checking || !status?.available}
                    className="flex items-center gap-1.5 rounded border border-editor-accent bg-editor-accent-dim px-3 py-1.5 text-xs text-editor-accent transition-colors hover:bg-editor-accent hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Play size={13} /> Run
                  </button>
                )}
              </div>
            </div>

            <div className="min-h-0 flex-1">
              <Suspense fallback={<div className="p-4 text-xs text-editor-secondary">Loading editor...</div>}>
                <MonacoEditor
                  height="100%"
                  language="python"
                  theme="vs-dark"
                  value={code}
                  onChange={value => setCode(value ?? '')}
                  options={{
                    fontSize: 13,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    wordWrap: 'on',
                    tabSize: 4,
                  } satisfies MonacoEditorNS.IStandaloneEditorConstructionOptions}
                />
              </Suspense>
            </div>
          </div>

          <div className="flex min-h-0 flex-col">
            <div className="border-b border-editor-border p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-editor-text">Output</span>
                {result?.outputDir && (
                  <button
                    onClick={() => window.api.shell.openPath(result.outputDir)}
                    className="rounded p-1 text-editor-secondary hover:bg-editor-hover hover:text-editor-text"
                    title="Open output folder"
                  >
                    <FolderOpen size={14} />
                  </button>
                )}
              </div>

              {error && (
                <div className="mb-2 flex items-start gap-2 rounded border border-red-500/30 bg-red-500/10 px-2 py-2 text-xs text-red-200">
                  <AlertCircle size={14} className="mt-0.5 flex-none" />
                  <span>{error}</span>
                </div>
              )}

              {result?.success && (
                <div className="mb-2 flex items-center gap-2 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-2 text-xs text-emerald-200">
                  <CheckCircle2 size={14} />
                  <span>Render complete</span>
                </div>
              )}

              <div className="max-h-36 overflow-y-auto rounded border border-editor-border bg-editor-panel">
                {result?.outputs.length ? result.outputs.map(output => (
                  <button
                    key={output.path}
                    onClick={() => setSelectedPath(output.path)}
                    className={`flex w-full items-center gap-2 px-2 py-2 text-left text-xs transition-colors ${selectedOutput?.path === output.path ? 'bg-editor-accent/20 text-editor-accent' : 'text-editor-text hover:bg-editor-hover'}`}
                  >
                    {output.type === 'video' ? <Film size={13} /> : <FileImage size={13} />}
                    <span className="min-w-0 flex-1 truncate">{output.name}</span>
                    <span className="text-[10px] uppercase text-editor-secondary">{output.ext}</span>
                  </button>
                )) : (
                  <div className="px-2 py-5 text-center text-xs text-editor-secondary">
                    {running ? 'Rendering...' : 'No generated files'}
                  </div>
                )}
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
              <div className="flex aspect-video items-center justify-center overflow-hidden rounded border border-editor-border bg-black">
                {selectedOutput ? (
                  selectedOutput.type === 'video' || PYTHON_SANDBOX_VIDEO_EXTS.has(selectedOutput.ext) ? (
                    <video src={toFileUrl(selectedOutput.path)} controls className="h-full w-full object-contain" />
                  ) : PYTHON_SANDBOX_IMAGE_EXTS.has(selectedOutput.ext) ? (
                    <img src={toFileUrl(selectedOutput.path)} alt={selectedOutput.name} className="h-full w-full object-contain" />
                  ) : (
                    <span className="text-xs text-editor-secondary">Preview unavailable</span>
                  )
                ) : (
                  <span className="text-xs text-editor-secondary">Preview</span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  disabled={!selectedOutput || running}
                  onClick={() => selectedOutput && importOutput(selectedOutput)}
                  className="flex items-center justify-center gap-1.5 rounded border border-editor-border bg-editor-elevated px-3 py-2 text-xs text-editor-text transition-colors hover:border-editor-accent hover:text-editor-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Check size={13} /> Save to Assets
                </button>
                <button
                  disabled={!selectedOutput || running}
                  onClick={() => selectedOutput && importAndInsert(selectedOutput)}
                  className="flex items-center justify-center gap-1.5 rounded border border-editor-accent bg-editor-accent-dim px-3 py-2 text-xs text-editor-accent transition-colors hover:bg-editor-accent hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus size={13} /> Insert
                </button>
              </div>

              {result?.outputDir && (
                <button
                  onClick={refreshOutputs}
                  className="rounded border border-editor-border bg-editor-elevated px-3 py-2 text-xs text-editor-text transition-colors hover:border-editor-accent hover:text-editor-accent"
                >
                  Refresh outputs
                </button>
              )}

              <div className="min-h-32 rounded border border-editor-border bg-[#0f0f0f] p-2">
                <div className="mb-1 text-[10px] uppercase tracking-wide text-editor-secondary">Console</div>
                <pre className="max-h-44 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed text-editor-text">
                  {consoleText || 'No logs yet.'}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
