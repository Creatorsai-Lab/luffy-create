import { useState, useRef, useEffect } from 'react'
import { X, Download, CheckCircle, AlertCircle, Loader2, Settings, Image, Film, FolderOpen, Play } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import { exportToMP4WithFFmpeg, isFFmpegAvailable } from '../../engine/ffmpegExporter'
import { getOutgoingStage, getStage } from '../../engine/stageRegistry'
import { buildTransitionTimeline, getTransitionFrameState } from '../../utils/transitionTiming'
import { videoRegistry } from '../../engine/videoRegistry'
import { decodeGif } from '../../engine/gifDecoder'
import type { ImageElement, Scene, VideoElement } from '../../types/editor'
import { getVideoClipState } from '../../utils/videoClip'
import { toast } from '../ui/Toast'
import { sceneAtTime, sceneStartTime, sceneStartTimes } from '../../utils/sceneTiming'
import { nextFrame } from '../../utils/nextFrame'
import { useShallow } from 'zustand/react/shallow'

type Phase = 'idle' | 'exporting' | 'done' | 'error'
type Quality = '720p' | '1080p'
type Tab = 'video' | 'image'
type ImgFmt = 'png' | 'webp'
type ImgPhase = 'idle' | 'capturing' | 'done' | 'error'

/** Compute the best local time within a scene to capture all elements visible. */
function computeSnapshotLocalTime(scene: Scene): number {
  let maxEnterEnd = 0
  for (const el of scene.elements) {
    for (const anim of el.animations) {
      if (anim.timing === 'onEnter') {
        const end = (anim.delay ?? 0) + (anim.duration ?? 0)
        if (end > maxEnterEnd) maxEnterEnd = end
      }
    }
  }
  // Clamp to 90% of scene duration; fall back to midpoint if no animations
  const candidate = maxEnterEnd > 0 ? maxEnterEnd + 0.05 : scene.duration * 0.5
  return Math.min(candidate, scene.duration * 0.9)
}

export default function ExportModal() {
  const { project, setExportOpen, setPlayhead } = useEditorStore(useShallow(s => ({ project: s.project, setExportOpen: s.setExportOpen, setPlayhead: s.setPlayhead })))

  // ── Video state ──────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState(0)
  const [log, setLog] = useState('')
  const [savePath, setSavePath] = useState<string | null>(null)
  const [quality, setQuality] = useState<Quality>('1080p')
  const [ffmpegAvailable, setFFmpegAvailable] = useState(false)
  const blobRef = useRef<Blob | null>(null)
  const cancelRef = useRef(false)

  // ── Image state ──────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<Tab>('video')
  const [imgScene, setImgScene] = useState(0)
  const [imgFormat, setImgFormat] = useState<ImgFmt>('png')
  const [imgPhase, setImgPhase] = useState<ImgPhase>('idle')
  const [imgLog, setImgLog] = useState('')

  useEffect(() => { isFFmpegAvailable().then(setFFmpegAvailable) }, [])
  useEffect(() => () => { cancelRef.current = true }, [])

  if (!project) return null

  // ── Shared helpers ────────────────────────────────────────────────────────────
  async function ensureFrameRendered(sceneId: string | null, globalTime: number) {
    if (cancelRef.current) throw new Error('Cancelled')
    if (sceneId && sceneId !== useEditorStore.getState().currentSceneId) {
      useEditorStore.getState().setCurrentScene(sceneId)
      await new Promise(r => setTimeout(r, 0))
    }
    setPlayhead(globalTime)
    // Let React commit + the video-seek effect run.
    await new Promise(r => setTimeout(r, 0))
    await nextFrame()
    await waitForSceneGifs(sceneId)
    await nextFrame()
    if (sceneId) await waitForSceneVideos(sceneId, globalTime)
    await waitForOutgoingVideos(globalTime)
    // Wait for any video elements to finish seeking to this frame, so the
    // captured stage shows the correct video frame (not a stale one).
    await waitForVideoSeeks()
    const stage = getStage()
    if (stage) stage.batchDraw()
    await new Promise(r => setTimeout(r, 8))
  }

  async function waitForSceneGifs(sceneId: string | null): Promise<void> {
    const scene = project?.scenes.find(sc => sc.id === sceneId)
    if (!scene) return
    const gifs = scene.elements.filter((el): el is ImageElement =>
      el.type === 'image' && /\.gif(?:$|[?#])/i.test(el.src)
    )
    await Promise.all(gifs.map(gif => decodeGif(gif.src)))
  }

  // Resolve once every registered video has finished seeking (or after a cap).
  function waitForVideoSeeks(): Promise<void> {
    const videos = videoRegistry.all().filter(v => v.seeking)
    if (videos.length === 0) return Promise.resolve()
    return Promise.all(videos.map(v => new Promise<void>(resolve => {
      let done = false
      const finish = () => { if (done) return; done = true; v.removeEventListener('seeked', finish); resolve() }
      v.addEventListener('seeked', finish)
      setTimeout(finish, 250)  // safety cap so export can't hang
    }))).then(() => undefined)
  }

  // During a cut the outgoing scene plays on its own stage (videos keyed `<id>@out`): wait for those too.
  async function waitForOutgoingVideos(globalTime: number): Promise<void> {
    if (!project) return
    const state = getTransitionFrameState(buildTransitionTimeline(project.scenes, project.endTransition), globalTime)
    if (state.kind !== 'transition' || state.phase !== 'cut' || state.transition.type === 'morph') return
    const from = project.scenes[state.fromSceneIndex]
    const videos = from.elements.filter((el): el is VideoElement =>
      el.type === 'video' && el.visible && getVideoClipState(el, state.fromLocalTime, { sceneEnd: from.duration }).visible)
    const deadline = performance.now() + 1500
    while (performance.now() < deadline) {
      const pending = !getOutgoingStage() || videos.some(el => {
        const video = videoRegistry.get(`${el.id}@out`)
        return !video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.seeking
      })
      if (!pending) return
      await nextFrame()
    }
  }

  async function waitForSceneVideos(sceneId: string, globalTime: number): Promise<void> {
    if (!project) return
    const scene = project.scenes.find(sc => sc.id === sceneId)
    if (!scene) return

    const sceneStart = sceneStartTime(project.scenes, sceneId)
    const localTime = Math.max(0, globalTime - sceneStart)
    const visibleVideos = scene.elements.filter((el): el is VideoElement => {
      return el.type === 'video' && el.visible && getVideoClipState(el, localTime).visible
    })
    if (visibleVideos.length === 0) return

    const deadline = performance.now() + 900
    while (performance.now() < deadline) {
      const pending = visibleVideos.some(videoEl => {
        const video = videoRegistry.get(videoEl.id)
        return !video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.seeking
      })
      if (!pending) return
      await nextFrame()
    }
  }

  // ── Video export ─────────────────────────────────────────────────────────────
  async function startExport() {
    if (!project) return
    // Ask where to save first, so the file is written by itself when rendering ends.
    const path = await window.api.dialog.saveVideo(`${project.name}.mp4`)
    if (!path) return
    setSavePath(path)
    blobRef.current = null
    cancelRef.current = false
    setPhase('exporting')
    setProgress(0)
    setLog('Initializing export...')
    // Keeps rendering while the window is minimised or covered; progress shows on the taskbar.
    await window.api.exportTask?.setBackground(true)
    try {
      const blob = await exportToMP4WithFFmpeg({
        project, getStage, quality,
        onProgress: (pct, msg) => {
          if (cancelRef.current) return
          setProgress(pct)
          setLog(msg)
          window.api.exportTask?.progress(pct / 100)
        },
        onLog: (msg) => console.log('[Export]', msg),
        getOutgoingStage,
        renderFrame: async (t) => { await ensureFrameRendered(sceneAtTime(project.scenes, t)?.scene.id ?? null, t) }
      })
      if (cancelRef.current) return
      blobRef.current = blob
      setLog('Saving file...')
      if (await writeVideo(path)) {
        blobRef.current = null // written to disk; don't keep a second copy in memory
        setPhase('done')
        setLog('Export complete!')
      } else {
        setPhase('error')
        setLog(`Could not save to ${path}. Use Save As to pick another place.`)
      }
      window.api.exportTask?.finished()
    } catch (err) {
      if (cancelRef.current) return
      setPhase('error')
      setLog(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      void window.api.exportTask?.setBackground(false)
    }
  }

  async function writeVideo(path: string) {
    if (!blobRef.current) return false
    try {
      await window.api.fs.writeFile(path, new Uint8Array(await blobRef.current.arrayBuffer()))
      toast.success('Video saved')
      return true
    } catch {
      toast.error('Failed to save video file')
      return false
    }
  }

  // Only needed when the automatic save failed: the rendered video is still in memory.
  async function handleSaveAs() {
    if (!blobRef.current || !project) return
    const path = await window.api.dialog.saveVideo(`${project.name}.mp4`)
    if (!path) return
    setSavePath(path)
    setLog('Saving file...')
    if (await writeVideo(path)) {
      blobRef.current = null
      setPhase('done')
      setLog('Export complete!')
    } else {
      setLog(`Could not save to ${path}. Use Save As to pick another place.`)
    }
  }

  // ── Image export ─────────────────────────────────────────────────────────────
  async function exportImage() {
    if (!project) return
    const scene = project.scenes[imgScene]
    if (!scene) return

    cancelRef.current = false
    setImgPhase('capturing')
    setImgLog('Capturing slide...')

    try {
      const localT = computeSnapshotLocalTime(scene)
      const globalT = (sceneStartTimes(project.scenes)[imgScene] ?? 0) + localT
      await ensureFrameRendered(scene.id, globalT)

      const stage = getStage()
      if (!stage) throw new Error('Canvas not ready')

      // For a transparent background, hide the checkerboard so PNG/WebP keep real alpha.
      const transparent = scene.background.type === 'transparent'
      const bgNode = transparent ? stage.findOne('.bg') : null
      if (bgNode) { bgNode.visible(false); stage.batchDraw(); await nextFrame() }

      const mimeType = imgFormat === 'webp' ? 'image/webp' : 'image/png'
      const dataUrl = stage.toDataURL({ mimeType, quality: 0.95, pixelRatio: 1 })

      if (bgNode) { bgNode.visible(true); stage.batchDraw() }

      // Convert dataURL to Uint8Array
      const base64 = dataUrl.split(',')[1]
      if (!base64) throw new Error('Failed to capture image')
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

      const sceneName = scene.name.replace(/[^a-zA-Z0-9_-]/g, '_')
      const defaultName = `${project.name}_${sceneName}.${imgFormat}`
      const path = await window.api.dialog.saveImage(defaultName)
      if (!path) { setImgPhase('idle'); setImgLog(''); return }

      await window.api.fs.writeFile(path, bytes)
      setImgPhase('done')
      setImgLog('Image saved!')
      toast.success('Image saved successfully')
    } catch (err) {
      setImgPhase('error')
      setImgLog(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────────
  function handleClose() {
    cancelRef.current = true
    setExportOpen(false)
  }

  const fps = project.fps
  const total = project.scenes.reduce((s, sc) => s + sc.duration, 0)
  const frames = Math.ceil(total * fps)
  // The short side becomes 720, or at most 1080 (as the exporter scales it), rounded to even pixels.
  const shortSide = Math.min(project.width, project.height)
  const scale = (quality === '720p' ? 720 : Math.min(shortSide, 1080)) / shortSide
  const exportW = Math.round(project.width * scale / 2) * 2
  const exportH = Math.round(project.height * scale / 2) * 2
  const estimatedSizeMB = Math.round((exportW * exportH * fps * total * 0.10) / (1024 * 1024))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-editor-panel border border-editor-border rounded-3xl shadow-2xl flex flex-col overflow-hidden w-[75vw] h-[75vh] max-w-[960px]">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-editor-border">
          <div className="flex items-center gap-2">
            <Download size={16} className="text-editor-accent" />
            <span className="text-base font-medium text-editor-accent">Export</span>
          </div>
          <button onClick={handleClose} className="text-[#f2f2f2] hover:text-editor-text transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-editor-accent px-4 pt-2 gap-1">
          {(['video', 'image'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={[
                'flex items-center gap-1.5 px-3 py-1.5 text-lg rounded-t transition-colors',
                tab === t
                  ? 'bg-editor-accent text-editor-text'
                  : 'text-[#f2f2f2] hover:text-editor-text'
              ].join(' ')}
            >
              {t === 'video' ? <Film size={13} /> : <Image size={13} />}
              {t === 'video' ? 'Video' : 'Image'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="px-4 py-4 flex flex-col gap-4">

          {/* ─ VIDEO TAB ─────────────────────────────────────────────────────── */}
          {tab === 'video' && (
            <>
              {/* Info row */}
              <div className="grid grid-cols-3 gap-2 text-ms">
                <div className="bg-editor-elevated-highlight rounded px-3 py-2">
                  <div className="label mb-1">Resolution</div>
                  <div className="text-editor-text">{project.width} × {project.height}</div>
                </div>
                <div className="bg-editor-elevated-highlight rounded px-3 py-2">
                  <div className="label mb-1">Duration</div>
                  <div className="text-editor-text">{total.toFixed(1)}s</div>
                </div>
                <div className="bg-editor-elevated-highlight rounded px-3 py-2">
                  <div className="label mb-1">Frames</div>
                  <div className="text-editor-text">{frames} @ {fps}fps</div>
                </div>
              </div>

              {phase === 'idle' && (
                <div className="flex flex-col gap-3 bg-editor-elevated-highlight rounded-lg p-3">
                  <div className="flex items-center gap-2 text-base text-editor-text">
                    <Settings size={14} />
                    <span className="font-medium">Export Settings</span>
                  </div>
                  <div className="flex items-center justify-between text-ms">
                    <span className="text-editor-text-secondary">Format</span>
                    <span className="text-editor-text font-medium">MP4 (H.264)</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex gap-2">
                      {(['720p', '1080p'] as Quality[]).map(q => (
                        <button
                          key={q}
                          onClick={() => setQuality(q)}
                          className={`flex-1 px-3 py-2 text-sm rounded transition-colors ${quality === q
                            ? 'bg-editor-accent text-white'
                            : 'bg-editor-panel text-editor-text hover:bg-editor-hover'
                            }`}
                        >
                          <div className="font-medium">{q}</div>
                          <div className="text-2xs opacity-70">{q === '720p' ? 'HD · CRF 18' : 'Full HD · CRF 16'}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="text-xs text-[#f2f2f2]">
                    Output: {exportW} × {exportH} · ~{estimatedSizeMB} MB
                  </div>
                  {!ffmpegAvailable && (
                    <div className="text-2xs text-yellow-500 bg-yellow-900/20 rounded px-2 py-1.5">
                      loading... export will be available shortly.
                    </div>
                  )}
                </div>
              )}

              {phase !== 'idle' && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    {phase === 'exporting' && <Loader2 size={13} className="text-editor-accent animate-spin" />}
                    {phase === 'done' && <CheckCircle size={13} className="text-green-400" />}
                    {phase === 'error' && <AlertCircle size={13} className="text-red-400" />}
                    <span className="text-ms text-editor-text-secondary truncate">{log}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-editor-elevated-highlight overflow-hidden">
                    <div
                      className={[
                        'h-full rounded-full transition-all duration-200',
                        phase === 'error' ? 'bg-red-500' : phase === 'done' ? 'bg-green-500' : 'bg-editor-accent'
                      ].join(' ')}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className="text-ms text-[#f2f2f2] text-right">{progress}%</span>
                </div>
              )}

              {phase === 'exporting' && (
                <p className="text-ms text-[#f2f2f2] bg-editor-elevated-highlight rounded px-3 py-2">
                  Do not edit the canvas during export. You can minimise Luffy or use other apps —
                  the video is saved automatically when it finishes.
                </p>
              )}

              {phase !== 'idle' && savePath && (
                <div className="bg-editor-elevated-highlight rounded px-3 py-2 min-w-0">
                  <div className="label mb-1">{phase === 'done' ? 'Saved to' : 'Saving to'}</div>
                  <div className="text-ms text-editor-text break-all">{savePath}</div>
                </div>
              )}
            </>
          )}

          {/* ─ IMAGE TAB ─────────────────────────────────────────────────────── */}
          {tab === 'image' && (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-2 text-ms">
                <div className="bg-editor-elevated-highlight rounded px-3 py-2">
                  <div className="label mb-1">Canvas Size</div>
                  <div className="text-editor-text">{project.width} × {project.height}</div>
                </div>
                <div className="bg-editor-elevated-highlight rounded px-3 py-2">
                  <div className="label mb-1">Slides</div>
                  <div className="text-editor-text">{project.scenes.length} scene{project.scenes.length !== 1 ? 's' : ''}</div>
                </div>
              </div>

              <div className="flex flex-col gap-3 bg-editor-elevated-highlight rounded-lg p-3">
                <div className="flex items-center gap-2 text-ms text-editor-text">
                  <Settings size={12} />
                  <span className="font-base">Image Settings</span>
                </div>

                {/* Scene selector */}
                <div className="flex flex-col gap-1.5">
                  <select
                    value={imgScene}
                    onChange={e => setImgScene(Number(e.target.value))}
                    className="w-full bg-editor-accent border border-editor-border rounded-xl text-base text-white px-2 py-3 border-white"
                  >
                    {project.scenes.map((scene, i) => (
                      <option key={scene.id} value={i}>
                        {i + 1}. {scene.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Format selector */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex gap-2">
                    {(['png', 'webp'] as ImgFmt[]).map(fmt => (
                      <button
                        key={fmt}
                        onClick={() => setImgFormat(fmt)}
                        className={`flex-1 px-3 py-2 text-ms rounded transition-colors ${imgFormat === fmt
                          ? 'bg-editor-accent text-white'
                          : 'bg-editor-panel text-editor-text hover:bg-editor-hover'
                          }`}
                      >
                        <div className="font-medium uppercase">{fmt}</div>
                        <div className="text-2xs opacity-70">{fmt === 'png' ? 'Lossless' : 'Compressed'}</div>
                      </button>
                    ))}
                  </div>

                </div>
              </div>

              {/* Status */}
              {imgPhase !== 'idle' && (
                <div className="flex items-center gap-2">
                  {imgPhase === 'capturing' && <Loader2 size={13} className="text-editor-accent animate-spin" />}
                  {imgPhase === 'done' && <CheckCircle size={13} className="text-green-400" />}
                  {imgPhase === 'error' && <AlertCircle size={13} className="text-red-400" />}
                  <span className="text-ms text-editor-text-secondary">{imgLog}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-auto px-4 pb-4 flex items-center justify-end gap-2">

          {/* Video footer */}
          {tab === 'video' && phase === 'idle' && (
            <>
              <button onClick={handleClose} className="text-ms px-3 py-1.5 rounded text-editor-text-secondary hover:text-editor-text hover:bg-editor-hover transition-colors">
                Cancel
              </button>
              <button
                onClick={startExport}
                disabled={!ffmpegAvailable}
                className="flex items-center gap-1.5 text-ms px-4 py-1.5 rounded bg-editor-accent text-white hover:bg-editor-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download size={12} /> {ffmpegAvailable ? 'Start Export' : 'Loading...'}
              </button>
            </>
          )}
          {tab === 'video' && phase === 'exporting' && (
            <button onClick={handleClose} className="text-ms px-3 py-1.5 rounded text-red-400 hover:bg-red-900/30 transition-colors">
              Cancel
            </button>
          )}
          {tab === 'video' && phase === 'done' && (
            <>
              <button onClick={handleClose} className="text-ms px-3 py-1.5 rounded text-editor-text-secondary hover:text-editor-text hover:bg-editor-hover transition-colors">
                Close
              </button>
              {savePath && (
                <button onClick={() => window.api.shell.openPath(savePath)} className="flex items-center gap-1.5 text-ms px-3 py-1.5 rounded text-editor-text hover:bg-editor-hover transition-colors">
                  <Play size={12} /> Play
                </button>
              )}
              {savePath && (
                <button onClick={() => window.api.shell.showItem(savePath)} className="flex items-center gap-1.5 text-ms px-4 py-1.5 rounded bg-green-600 text-white hover:bg-green-500 transition-colors">
                  <FolderOpen size={12} /> Show in Folder
                </button>
              )}
            </>
          )}
          {tab === 'video' && phase === 'error' && (
            <>
              {blobRef.current && (
                <button onClick={handleSaveAs} className="flex items-center gap-1.5 text-ms px-4 py-1.5 rounded bg-green-600 text-white hover:bg-green-500 transition-colors">
                  <Download size={12} /> Save As…
                </button>
              )}
              <button onClick={() => setPhase('idle')} className="text-ms px-3 py-1.5 rounded text-editor-text-secondary hover:text-editor-text hover:bg-editor-hover transition-colors">
                Try Again
              </button>
              <button onClick={handleClose} className="text-ms px-3 py-1.5 rounded text-editor-text-secondary hover:text-editor-text hover:bg-editor-hover transition-colors">
                Close
              </button>
            </>
          )}

          {/* Image footer */}
          {tab === 'image' && (
            <>
              <button onClick={handleClose} className="text-ms px-3 py-1.5 rounded text-editor-text-secondary hover:text-editor-text hover:bg-editor-hover transition-colors">
                {imgPhase === 'done' ? 'Close' : 'Cancel'}
              </button>
              {imgPhase !== 'capturing' && (
                <button
                  onClick={imgPhase === 'done' || imgPhase === 'error' ? () => { setImgPhase('idle'); setImgLog('') } : exportImage}
                  className="flex items-center gap-1.5 text-ms px-4 py-1.5 rounded bg-editor-accent text-white hover:bg-editor-accent-hover transition-colors"
                >
                  <Image size={12} />
                  {imgPhase === 'done' ? 'Export Again' : imgPhase === 'error' ? 'Retry' : 'Download Image'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
