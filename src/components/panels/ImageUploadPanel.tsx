import { useState, useRef, useEffect } from 'react'
import { Upload, Trash2, FileImage } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import { makeImage } from '../../utils/defaults'
import { cn } from '../../utils/cn'
import { toFileUrl } from '../../utils/pathUtils'

export default function ImageUploadPanel() {
  const { project, addAsset, removeAsset, addElement } = useEditorStore()
  const [loading, setLoading]   = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const dropZoneRef = useRef<HTMLDivElement>(null)

  async function handleUpload() {
    if (!project) return
    const path = await window.api.dialog.openFile([
      { name: 'Image Files', extensions: ['png','jpg','jpeg','gif','webp'] }
    ])
    if (!path) return
    await uploadFile(path)
  }

  async function uploadFile(path: string) {
    if (!project) return
    setLoading(true)
    try {
      const asset = await window.api.assets.upload(project.id, path, 'image')
      addAsset({ id: asset.id, filename: asset.filename, path: asset.path, type: 'image', name: asset.filename })
    } catch (e) {
      console.error('Upload failed', e)
    } finally {
      setLoading(false)
    }
  }

  function readImageSize(path: string): Promise<{ width: number; height: number }> {
    return new Promise(resolve => {
      const img = new Image()
      img.onload = () => resolve({ width: img.naturalWidth || 320, height: img.naturalHeight || 240 })
      img.onerror = () => resolve({ width: 320, height: 240 })
      img.src = toFileUrl(path)
    })
  }

  async function addImageToCanvas(asset: NonNullable<typeof project>['assets'][number]) {
    if (!project) return
    const natural = await readImageSize(asset.path)
    const maxW = Math.min(640, project.width * 0.5)
    const maxH = Math.min(640, project.height * 0.5)
    const scale = Math.min(maxW / natural.width, maxH / natural.height, 1)
    const width = Math.max(10, Math.round(natural.width * scale))
    const height = Math.max(10, Math.round(natural.height * scale))
    const x = Math.round(project.width / 2 - width / 2)
    const y = Math.round(project.height / 2 - height / 2)
    addElement(makeImage(x, y, asset.path, asset.id, width, height))
  }

  useEffect(() => {
    const dropZone = dropZoneRef.current
    if (!dropZone) return

    const onDragOver = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragOver(true) }
    const onDragLeave = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragOver(false) }
    const onDrop = async (e: DragEvent) => {
      e.preventDefault(); e.stopPropagation(); setDragOver(false)
      const files = Array.from(e.dataTransfer?.files || [])
      for (const file of files) {
        const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
        if (['png','jpg','jpeg','gif','webp'].includes(ext)) await uploadFile(window.api.fs.getPathForFile(file))
      }
    }

    dropZone.addEventListener('dragover', onDragOver)
    dropZone.addEventListener('dragleave', onDragLeave)
    dropZone.addEventListener('drop', onDrop)
    return () => {
      dropZone.removeEventListener('dragover', onDragOver)
      dropZone.removeEventListener('dragleave', onDragLeave)
      dropZone.removeEventListener('drop', onDrop)
    }
  }, [project])

  const imageAssets = (project?.assets ?? []).filter(a => a.type === 'image')

  return (
    <div className="flex flex-col overflow-y-auto flex-1">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-editor-border">
        <Upload size={12} className="text-editor-accent" />
        <span className="text-xs font-medium text-editor-text">Upload Images</span>
      </div>

      <div className="px-3 py-2 border-b border-editor-border">
        <button
          onClick={handleUpload}
          disabled={loading || !project}
          className="w-full text-xs py-2 bg-editor-accent-dim text-editor-accent border border-editor-accent rounded hover:bg-editor-accent hover:text-white transition-colors disabled:opacity-50"
        >
          {loading ? 'Uploading…' : '+ Upload Image'}
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
          <FileImage size={24} className={dragOver ? 'text-editor-accent' : 'text-[#f2f2f2]'} />
          <p className="text-xs text-editor-secondary">Drag & drop images here</p>
          <p className="text-2xs text-[#f2f2f2]">PNG · JPG · GIF · WebP</p>
        </div>
      </div>

      {imageAssets.length === 0 && (
        <p className="text-xs text-[#f2f2f2] px-3 py-4 text-center">No images yet.</p>
      )}

      <div className="grid grid-cols-2 gap-2 p-2">
        {imageAssets.map(a => (
          <div
            key={a.id}
            className="group relative aspect-video bg-editor-elevated rounded overflow-hidden cursor-pointer hover:ring-2 hover:ring-editor-accent transition-all"
            onClick={() => { void addImageToCanvas(a) }}
          >
            <div className="absolute inset-0 flex items-center justify-center bg-editor-panel">
              <img
                src={toFileUrl(a.path)}
                alt={a.name}
                className="w-full h-full object-cover"
                onError={e => {
                  const t = e.currentTarget; t.style.display = 'none'
                  const p = t.parentElement
                  if (p) p.innerHTML = '<div class="flex items-center justify-center w-full h-full"><svg class="w-8 h-8 text-[#f2f2f2]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg></div>'
                }}
              />
            </div>
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <span className="text-xs text-white font-medium">Add to Canvas</span>
            </div>
            <button
              onClick={e => { e.stopPropagation(); removeAsset(a.id) }}
              className="absolute top-1 right-1 p-1 bg-black/70 rounded opacity-0 group-hover:opacity-100 text-white hover:text-red-400 transition-all"
            >
              <Trash2 size={12} />
            </button>
            <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-black/70">
              <p className="text-2xs text-white truncate">{a.name}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
