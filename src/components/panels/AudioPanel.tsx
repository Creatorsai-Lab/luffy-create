import { useState, useRef } from 'react'
import { Music, Trash2, Plus, Play, Pause, FileAudio } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import { toFileUrl } from '../../utils/pathUtils'
import { makeAudio } from '../../utils/defaults'
import { AUDIO_ASSET_DRAG_TYPE } from '../../utils/dragPayloads'
import { clampAudioDuration, readAudioMetadataDuration, remainingTimelineDuration, resolveStoredAudioDuration } from '../../utils/audioMetadata'
import type { AssetMeta } from '../../types/editor'

export default function AudioPanel() {
  const { project, addAsset, updateAsset, removeAsset, addElementToScene, getTotalDuration } = useEditorStore()
  const [uploading, setUploading] = useState(false)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const audioAssets = (project?.assets ?? []).filter(a => a.type === 'audio')

  async function handleUpload() {
    if (!project) return
    try {
      setUploading(true)
      const result = await window.api.dialog.openFile([
        { name: 'Audio Files', extensions: ['mp3', 'wav', 'ogg', 'aac', 'm4a'] }
      ])

      if (!result) return

      // Copy the file into the project's assets folder via the API
      const uploaded = await window.api.assets.upload(project.id, result, 'audio')
      const originalName = result.split(/[\\/]/).pop() || 'audio'
      const assetName = originalName.replace(/\.[^.]+$/, '')
      const duration = await readAudioMetadataDuration(uploaded.path)

      const asset: AssetMeta = {
        id: uploaded.id,
        filename: uploaded.filename,
        path: uploaded.path,
        type: 'audio',
        name: assetName,
        duration: duration ?? undefined
      }

      addAsset(asset)
    } catch (err) {
      console.error('Failed to upload audio:', err)
    } finally {
      setUploading(false)
    }
  }

  function handlePlayAudio(asset: AssetMeta) {
    if (playingId === asset.id) {
      // Stop current
      if (audioRef.current) {
        audioRef.current.pause()
      }
      setPlayingId(null)
    } else {
      // Play this audio
      if (audioRef.current) {
        audioRef.current.pause()
      }
      
      const audio = new Audio(toFileUrl(asset.path))
      audio.onended = () => setPlayingId(null)
      audio.onpause = () => setPlayingId(null)
      audio.play().catch(e => console.error('Failed to play audio:', e))
      
      audioRef.current = audio
      setPlayingId(asset.id)
    }
  }

  async function handleAddToTimeline(asset: AssetMeta) {
    if (!project) return
    const firstScene = project.scenes[0]
    if (!firstScene) return

    const maxDuration = remainingTimelineDuration(getTotalDuration(), 0)
    const storedDuration = resolveStoredAudioDuration(asset)
    const loadedDuration = storedDuration == null ? await readAudioMetadataDuration(asset.path) : null
    if (loadedDuration != null) updateAsset(asset.id, { duration: loadedDuration })
    const duration = clampAudioDuration(storedDuration ?? loadedDuration ?? maxDuration, maxDuration)

    const el = makeAudio(asset.path, asset.id, duration)
    el.name = asset.name || asset.filename
    el.x = 0
    addElementToScene(firstScene.id, el)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PanelHeader icon={<Music size={12} />} title="Audio Manager" />

      <div className="flex-1 overflow-y-auto">
        {audioAssets.length === 0 ? (
          <p className="text-xs text-[#f2f2f2] px-3 py-3">
            No audio files uploaded. Click the button below to add audio.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5 px-3 py-2">
            {audioAssets.map(asset => (
              <div
                key={asset.id}
                draggable
                onDragStart={e => {
                  e.dataTransfer.effectAllowed = 'copy'
                  e.dataTransfer.setData(AUDIO_ASSET_DRAG_TYPE, asset.id)
                  e.dataTransfer.setData('text/plain', asset.name || asset.filename)
                }}
                className="flex items-center justify-between gap-2 bg-editor-elevated rounded p-2 border border-editor-border hover:border-editor-accent transition-colors"
                title="Drag to the timeline audio area to place this audio under a scene"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {/* Play button */}
                  <button
                    onClick={() => handlePlayAudio(asset)}
                    className="flex-none p-1.5 rounded bg-editor-accent hover:bg-editor-accent-hover text-white transition-colors"
                    title={playingId === asset.id ? 'Stop' : 'Play audio'}
                  >
                    {playingId === asset.id ? (
                      <Pause size={12} />
                    ) : (
                      <Play size={12} />
                    )}
                  </button>

                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white truncate">{asset.name}</p>
                    <p className="text-2xs text-[#888888] truncate">{asset.filename}</p>
                  </div>
                </div>

                {/* Add to timeline button */}
                <button
                  onClick={() => handleAddToTimeline(asset)}
                  className="flex-none p-1.5 rounded bg-editor-accent-dim hover:bg-editor-accent text-editor-accent hover:text-white transition-colors"
                  title="Add to timeline"
                >
                  <FileAudio size={12} />
                </button>

                {/* Delete button */}
                <button
                  onClick={() => removeAsset(asset.id)}
                  className="flex-none text-[#888888] hover:text-red-400 transition-colors"
                  title="Delete audio"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Upload button */}
      <div className="border-t border-editor-border p-3 bg-editor-elevated/50">
        <button
          onClick={handleUpload}
          disabled={uploading}
          className="w-full flex items-center justify-center gap-2 bg-editor-accent hover:bg-editor-accent-hover disabled:bg-editor-muted text-white rounded px-3 py-2 text-xs font-medium transition-colors"
        >
          <Plus size={14} />
          {uploading ? 'Uploading...' : 'Add Audio'}
        </button>
      </div>
    </div>
  )
}

function PanelHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-editor-border bg-editor-elevated/30">
      {icon}
      <span className="text-xs font-semibold text-white">{title}</span>
    </div>
  )
}
