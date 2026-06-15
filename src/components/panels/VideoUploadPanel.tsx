import { useRef, useEffect, useState } from 'react'
import { Trash2, Film } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import { makeVideo } from '../../utils/defaults'
import { cn } from '../../utils/cn'
import { toFileUrl } from '../../utils/pathUtils'
import type { AssetMeta } from '../../types/editor'

const VIDEO_EXTS = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'gif']

export default function VideoUploadPanel() {
  const { project, addAsset, removeAsset, addElement } = useEditorStore()
  const [loading,  setLoading]  = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const dropZoneRef = useRef<HTMLDivElement>(null)

  function placeVideo(path: string, assetId: string, naturalW: number, naturalH: number, sourceDuration: number) {
    if (!project) return
    const maxW  = Math.min(naturalW, project.width * 0.6, 960)
    const ratio = naturalW > 0 ? naturalW / naturalH : 16 / 9
    const scaledW = Math.round(maxW)
    const scaledH = Math.round(maxW / ratio)
    const x = Math.round(project.width  / 2 - scaledW / 2)
    const y = Math.round(project.height / 2 - scaledH / 2)
    const dur = Math.max(0.1, sourceDuration || 10)
    addElement(makeVideo(x, y, path, assetId, scaledW, scaledH, dur))
  }

  async function handleUpload() {
    if (!project) return
    const path = await window.api.dialog.openFile([
      { name: 'Video Files', extensions: VIDEO_EXTS }
    ])
    if (!path) return
    await uploadFile(path)
  }

  async function uploadFile(path: string) {
    if (!project) return
    setLoading(true)
    try {
      const asset = await window.api.assets.upload(project.id, path)
      addAsset({ id: asset.id, filename: asset.filename, path: asset.path, type: 'video', name: asset.filename })
    } catch (e) {
      console.error('Video upload failed', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const el = dropZoneRef.current
    if (!el) return
    const onDragOver  = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragOver(true) }
    const onDragLeave = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragOver(false) }
    const onDrop      = async (e: DragEvent) => {
      e.preventDefault(); e.stopPropagation(); setDragOver(false)
      for (const file of Array.from(e.dataTransfer?.files ?? [])) {
        if (VIDEO_EXTS.includes(file.name.split('.').pop()?.toLowerCase() ?? '')) {
          await uploadFile(window.api.fs.getPathForFile(file))
        }
      }
    }
    el.addEventListener('dragover',  onDragOver)
    el.addEventListener('dragleave', onDragLeave)
    el.addEventListener('drop',      onDrop)
    return () => {
      el.removeEventListener('dragover',  onDragOver)
      el.removeEventListener('dragleave', onDragLeave)
      el.removeEventListener('drop',      onDrop)
    }
  }, [project])

  const videoAssets = (project?.assets ?? []).filter(a => a.type === 'video')

  return (
    <div className="flex flex-col overflow-y-auto flex-1">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-editor-border">
        <Film size={12} className="text-editor-accent" />
        <span className="text-xs font-medium text-editor-text">Upload Videos</span>
      </div>

      <div className="px-3 py-2 border-b border-editor-border">
        <button
          onClick={handleUpload}
          disabled={loading || !project}
          className="w-full text-xs py-2 bg-editor-accent-dim text-editor-accent border border-editor-accent rounded hover:bg-editor-accent hover:text-white transition-colors disabled:opacity-50"
        >
          {loading ? 'Uploading…' : '+ Upload Video'}
        </button>
      </div>

      <div
        ref={dropZoneRef}
        className={cn(
          'mx-3 my-2 p-4 border-2 border-dashed rounded-lg transition-colors',
          dragOver ? 'border-editor-accent bg-editor-accent-dim' : 'border-editor-border bg-editor-elevated'
        )}
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <Film size={24} className={dragOver ? 'text-editor-accent' : 'text-[#f2f2f2]'} />
          <p className="text-xs text-editor-secondary">Drag & drop videos here</p>
          <p className="text-2xs text-[#f2f2f2]">MP4 · WebM · MOV · AVI</p>
        </div>
      </div>

      {videoAssets.length === 0 && (
        <p className="text-xs text-[#f2f2f2] px-3 py-4 text-center">No videos yet.</p>
      )}

      <div className="flex flex-col gap-2 p-2">
        {videoAssets.map(a => (
          <VideoThumb
            key={a.id}
            asset={a}
            onAdd={(w, h, dur) => placeVideo(a.path, a.id, w, h, dur)}
            onRemove={() => removeAsset(a.id)}
          />
        ))}
      </div>
    </div>
  )
}

function VideoThumb({ asset, onAdd, onRemove }: {
  asset: AssetMeta
  onAdd: (w: number, h: number, duration: number) => void
  onRemove: () => void
}) {
  const [dims, setDims] = useState({ w: 640, h: 360, dur: 10 })

  return (
    <div
      className="group relative aspect-video bg-editor-elevated rounded overflow-hidden cursor-pointer hover:ring-2 hover:ring-editor-accent transition-all"
      onClick={() => onAdd(dims.w, dims.h, dims.dur)}
    >
      <video
        src={toFileUrl(asset.path)}
        muted
        preload="metadata"
        className="w-full h-full object-cover"
        onLoadedMetadata={e => {
          const v = e.currentTarget as HTMLVideoElement
          if (v.videoWidth) {
            setDims({
              w: v.videoWidth,
              h: v.videoHeight,
              dur: Number.isFinite(v.duration) ? v.duration : 10,
            })
          }
          v.currentTime = 0.5
        }}
      />
      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
        <Film size={14} className="text-white" />
        <span className="text-xs text-white font-medium">Add to Canvas</span>
      </div>
      <button
        onClick={e => { e.stopPropagation(); onRemove() }}
        className="absolute top-1 right-1 p-1 bg-black/70 rounded opacity-0 group-hover:opacity-100 text-white hover:text-red-400 transition-all"
      >
        <Trash2 size={12} />
      </button>
      <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-black/70">
        <p className="text-2xs text-white truncate">{asset.name}</p>
      </div>
    </div>
  )
}
