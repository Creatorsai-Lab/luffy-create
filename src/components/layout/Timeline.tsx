import { useRef, useCallback, useEffect, useState, useMemo } from 'react'
import { Plus, Play, Pause, SkipBack, ZoomIn, ZoomOut, ArrowLeftRight, Music, Trash2, Copy, Scissors, Split, X, Volume2, Bookmark, Shuffle, Film, Repeat } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import { cn } from '../../utils/cn'
import { toFileUrl } from '../../utils/pathUtils'
import { getWaveform } from '../../utils/waveform'
import type { WaveformData } from '../../utils/waveform'
import Tooltip from '../ui/Tooltip'
import ContextMenu from '../ui/ContextMenu'
import type { AudioElement, VideoElement } from '../../types/editor'
import { maxVideoClipDuration } from '../../utils/videoClip'
import { TRANS_COLOR } from '../../utils/transitions'
import {
  applyAudioEffects,
  audioPreviewPlaybackRate,
  disposeAudioEffectGraphs,
  ensureAudioEffectGraph,
  syncAudioPlaybackSettings,
  type AudioEffectGraphMap,
} from '../../utils/audioEffects'

const RULER_HEIGHT = 22
const SINGLE_VIDEO_TRACK_HEIGHT = 42
const SCENE_HEIGHT = 50
const TRACK_HEIGHT = 32
const PX_PER_SEC_BASE = 60

const SCENE_COLORS = ['#3a5a8d', '#437f9b', '#474899', '#46945d', '#513988', '#43899b']

// Stable color from a scene id — stays the same after reordering, so a scene
// keeps its color + name identity wherever it moves.
function colorForId(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return SCENE_COLORS[h % SCENE_COLORS.length]
}

const SPEED_OPTIONS = [
  { label: '0.25×', value: 0.25 },
  { label: '0.5×',  value: 0.5  },
  { label: '0.75×', value: 0.75 },
  { label: '1×',    value: 1    },
  { label: '1.25×', value: 1.25 },
  { label: '1.5×',  value: 1.5  },
  { label: '2×',    value: 2    },
]

const MARKER_COLOR = '#33dd08'

export default function Timeline() {
  const {
    project, currentSceneId,
    playhead, isPlaying,
    timelineZoom, snapEnabled,
    addScene, addSceneAfter, splitScene, setCurrentScene, updateScene, reorderScenes, removeScene, duplicateScene,
    setPlayhead, play, pause, stop,
    getTotalDuration, setTimelineZoom, 
    updateElement, removeElement, addElementToScene,
    addAudioMarker, removeAudioMarker,
    setActivePanel, selectElement, deselectAll,
  } = useEditorStore()

  const [editDurId, setEditDurId] = useState<string | null>(null)
  const [resizingScene, setResizingScene] = useState<{ id: string; edge: 'start' | 'end' } | null>(null)
  const [resizingAudio, setResizingAudio] = useState<{ id: string; edge: 'start' | 'end' } | null>(null)
  const [draggingPlayhead, setDraggingPlayhead] = useState(false)
  const [draggedSceneIndex, setDraggedSceneIndex] = useState<number | null>(null)
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; sceneId: string; clickTimeInScene: number } | null>(null)
  const [selectedAudioId, setSelectedAudioId] = useState<string | null>(null)
  const [audioContextMenu, setAudioContextMenu] = useState<{
    x: number; y: number; audioId: string; clickTimeInAudio: number; sceneId: string; absoluteTime: number
  } | null>(null)
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null)
  const [videoContextMenu, setVideoContextMenu] = useState<{
    x: number; y: number; videoId: string; clickTimeInClip: number; sceneId: string
  } | null>(null)
  const [resizingVideo, setResizingVideo] = useState<{ id: string; edge: 'start' | 'end' } | null>(null)
  const [timelineContextMenu, setTimelineContextMenu] = useState<{ x: number; y: number; time: number } | null>(null)
  const [panelHeight, setPanelHeight] = useState(160)
  const [shiftHeld, setShiftHeld] = useState(false)

  // Track Shift so scene reorder only happens on Shift+drag (avoids accidental
  // reordering while resizing a scene's duration from its edge).
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === 'Shift') setShiftHeld(true) }
    const up   = (e: KeyboardEvent) => { if (e.key === 'Shift') setShiftHeld(false) }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const startH = panelHeight
    const onMove = (mv: MouseEvent) => {
      // drag up = taller (timeline sits at the bottom of the window)
      const next = Math.max(120, Math.min(window.innerHeight - 160, startH + (startY - mv.clientY)))
      setPanelHeight(next)
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [panelHeight])

  const containerRef    = useRef<HTMLDivElement>(null)
  const rafRef          = useRef<number>(0)
  const lastTimeRef     = useRef<number>(0)
  const audioPlayersRef = useRef<Map<string, HTMLAudioElement>>(new Map())
  const audioGraphsRef  = useRef<AudioEffectGraphMap>(new Map())

  const PX_PER_SEC = PX_PER_SEC_BASE * timelineZoom

  const snapTime = useCallback((time: number): number => {
    if (!snapEnabled) return time
    const gridSize = 0.1
    return Math.round(time / gridSize) * gridSize
  }, [snapEnabled])

  // Playback RAF — advances the playhead
  useEffect(() => {
    if (!isPlaying) { cancelAnimationFrame(rafRef.current); return }
    const totalDur = getTotalDuration()

    function tick(now: number) {
      if (!lastTimeRef.current) lastTimeRef.current = now
      const delta = (now - lastTimeRef.current) / 1000
      lastTimeRef.current = now

      useEditorStore.setState(s => {
        let next = s.playhead + delta
        if (next >= totalDur) next = 0
        s.playhead = next
        const at = useEditorStore.getState().getSceneAtTime(next)
        if (at && s.currentSceneId !== at.scene.id) s.currentSceneId = at.scene.id
      })

      rafRef.current = requestAnimationFrame(tick)
    }

    lastTimeRef.current = 0
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [isPlaying])

  // Audio sync RAF
  useEffect(() => {
    if (!isPlaying) {
      audioPlayersRef.current.forEach(p => p.pause())
      return
    }

    let rafId: number

    function syncAudio() {
      const { playhead: ph, project: proj } = useEditorStore.getState()
      if (!proj) { rafId = requestAnimationFrame(syncAudio); return }

      const activeIds = new Set<string>()
      let elapsed = 0

      for (const sc of proj.scenes) {
        for (const el of sc.elements) {
          if (el.type !== 'audio') continue
          const audio    = el as AudioElement
          const absStart = elapsed + (audio.x ?? 0)
          const absEnd   = absStart + (audio.duration ?? 0)

          if (ph >= absStart && ph < absEnd) {
            activeIds.add(audio.id)
            let player = audioPlayersRef.current.get(audio.id)

            if (!player) {
              player = new Audio(toFileUrl(audio.src))
              audioPlayersRef.current.set(audio.id, player)
            }

            const graph = ensureAudioEffectGraph(audio.id, player, audioGraphsRef.current)
            applyAudioEffects(graph, audio)
            syncAudioPlaybackSettings(player, audio)

            if (player.paused) {
              // Calculate current time based on playhead position within this audio element
              // account for trim start (startTime) and playback speed
              const trimStart = audio.startTime ?? 0
              const timeWithinAudio = (ph - absStart) * audioPreviewPlaybackRate(audio)
              player.currentTime = Math.max(trimStart, trimStart + timeWithinAudio)
              void graph.context.resume().catch(() => {})
              player.play().catch(() => {})
            }
          }
        }
        elapsed += sc.duration
      }

      audioPlayersRef.current.forEach((player, id) => {
        if (!activeIds.has(id) && !player.paused) player.pause()
      })

      rafId = requestAnimationFrame(syncAudio)
    }

    rafId = requestAnimationFrame(syncAudio)
    return () => cancelAnimationFrame(rafId)
  }, [isPlaying])

  useEffect(() => {
    return () => {
      audioPlayersRef.current.forEach(p => { p.pause(); p.src = '' })
      audioPlayersRef.current.clear()
      disposeAudioEffectGraphs(audioGraphsRef.current)
    }
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.target instanceof HTMLTextAreaElement) return

      switch (e.key) {
        case ' ':
          e.preventDefault()
          isPlaying ? pause() : play()
          break
        case 'ArrowLeft':
          // Element movement takes priority — only scrub when nothing is selected
          if (useEditorStore.getState().selectedIds.length > 0) break
          if (!isPlaying) { e.preventDefault(); setPlayhead(Math.max(0, playhead - 1/30)) }
          break
        case 'ArrowRight':
          if (useEditorStore.getState().selectedIds.length > 0) break
          if (!isPlaying) { e.preventDefault(); setPlayhead(Math.min(getTotalDuration(), playhead + 1/30)) }
          break
        case 'Home':
          e.preventDefault(); setPlayhead(0); break
        case 'End':
          e.preventDefault(); setPlayhead(getTotalDuration()); break
        case '+': case '=':
          if (e.ctrlKey || e.metaKey) { e.preventDefault(); setTimelineZoom(Math.min(5, timelineZoom * 1.2)) }
          break
        case '-': case '_':
          if (e.ctrlKey || e.metaKey) { e.preventDefault(); setTimelineZoom(Math.max(0.1, timelineZoom / 1.2)) }
          break
        case '0':
          if (e.ctrlKey || e.metaKey) { e.preventDefault(); setTimelineZoom(1) }
          break
        case 'Delete': case 'Backspace': {
          if (selectedVideoId) {
            e.preventDefault()
            removeElement(selectedVideoId)
            setSelectedVideoId(null)
            break
          }
          if (selectedAudioId) {
            e.preventDefault()
            removeElement(selectedAudioId)
            setSelectedAudioId(null)
            break
          }
          const { selectedIds } = useEditorStore.getState()
          if (selectedIds.length === 0 && currentSceneId && project && project.scenes.length > 1) {
            e.preventDefault(); removeScene(currentSceneId)
          }
          break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isPlaying, playhead, timelineZoom, currentSceneId, project, pause, play, setPlayhead, getTotalDuration, setTimelineZoom, removeScene])

  const handleRulerClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return  // left click only
    if (!containerRef.current || draggingPlayhead) return
    const rect = containerRef.current.getBoundingClientRect()
    const x    = e.clientX - rect.left + containerRef.current.scrollLeft
    setPlayhead(snapTime(Math.max(0, Math.min(getTotalDuration(), x / PX_PER_SEC))))
  }, [setPlayhead, getTotalDuration, PX_PER_SEC, snapTime, draggingPlayhead])

  const handleContainerContextMenu = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left + containerRef.current.scrollLeft
    const time = snapTime(Math.max(0, Math.min(getTotalDuration(), x / PX_PER_SEC)))
    setTimelineContextMenu({ x: e.clientX, y: e.clientY, time })
  }, [PX_PER_SEC, getTotalDuration, snapTime])

  const handlePlayheadMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setDraggingPlayhead(true)
    pause()

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left + containerRef.current.scrollLeft
      setPlayhead(snapTime(Math.max(0, Math.min(getTotalDuration(), x / PX_PER_SEC))))
    }

    const handleMouseUp = () => {
      setDraggingPlayhead(false)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [pause, setPlayhead, getTotalDuration, PX_PER_SEC, snapTime])

  const handleSceneEdgeMouseDown = useCallback((sceneId: string, edge: 'start' | 'end', e: React.MouseEvent) => {
    e.stopPropagation()
    setResizingScene({ id: sceneId, edge })

    const scene = project!.scenes.find(s => s.id === sceneId)!
    const startX       = e.clientX
    const startDuration = scene.duration

    const handleMouseMove = (e: MouseEvent) => {
      const deltaTime = (e.clientX - startX) / PX_PER_SEC
      const newDuration = edge === 'end'
        ? Math.max(0.5, startDuration + deltaTime)
        : Math.max(0.5, startDuration - deltaTime)
      updateScene(sceneId, { duration: snapTime(newDuration) })
    }

    const handleMouseUp = () => {
      setResizingScene(null)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [project, updateScene, PX_PER_SEC, snapTime])

  function handleAudioMouseDown(e: React.MouseEvent, audioId: string, audioX: number, sceneId: string) {
    e.stopPropagation()

    const wasSelected = selectedAudioId === audioId
    const startMouseX = e.clientX
    const pxPerSec    = PX_PER_SEC
    let moved         = false

    if (!wasSelected) {
      setSelectedAudioId(audioId)
      setSelectedVideoId(null)
      setCurrentScene(sceneId)
      selectElement(audioId, false)
      setActivePanel('audio')
    }

    const handleMouseMove = (mv: MouseEvent) => {
      if (!moved && Math.abs(mv.clientX - startMouseX) < 3) return
      moved = true
      setSelectedAudioId(audioId)
      setCurrentScene(sceneId)
      selectElement(audioId, false)
      setActivePanel('audio')
      updateElement(audioId, { x: Math.max(0, audioX + (mv.clientX - startMouseX) / pxPerSec) })
    }

    const handleMouseUp = () => {
      if (!moved && wasSelected) {
        setSelectedAudioId(null)
        deselectAll()
      }
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  function handleAudioResizeMouseDown(e: React.MouseEvent, audioEl: AudioElement, edge: 'start' | 'end', sceneId: string) {
    e.stopPropagation()
    e.preventDefault()
    setResizingAudio({ id: audioEl.id, edge })
    setSelectedAudioId(audioEl.id)
    setSelectedVideoId(null)
    setCurrentScene(sceneId)
    selectElement(audioEl.id, false)
    setActivePanel('audio')

    const startMouseX   = e.clientX
    const origX         = audioEl.x ?? 0
    const origDuration  = audioEl.duration ?? 0
    const origStartTime = audioEl.startTime ?? 0
    const speed         = audioEl.speed ?? 1

    const handleMouseMove = (mv: MouseEvent) => {
      const delta = (mv.clientX - startMouseX) / PX_PER_SEC
      if (edge === 'end') {
        updateElement(audioEl.id, { duration: Math.max(0.1, origDuration + delta) })
      } else {
        const newX        = Math.max(0, origX + delta)
        const actualDelta = newX - origX
        updateElement(audioEl.id, {
          x:         newX,
          startTime: Math.max(0, origStartTime + actualDelta * speed),
          duration:  Math.max(0.1, origDuration - actualDelta),
        })
      }
    }

    const handleMouseUp = () => {
      setResizingAudio(null)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  function handleVideoMouseDown(e: React.MouseEvent, videoId: string, timelineX: number) {
    e.stopPropagation()
    const wasSelected = selectedVideoId === videoId
    const startMouseX = e.clientX
    const origTimelineX = timelineX
    let moved = false

    if (!wasSelected) {
      setSelectedVideoId(videoId)
      setSelectedAudioId(null)
      selectElement(videoId, false)
    }

    const handleMouseMove = (mv: MouseEvent) => {
      if (!moved && Math.abs(mv.clientX - startMouseX) < 3) return
      moved = true
      let elapsed = 0
      for (const sc of project!.scenes) {
        const video = sc.elements.find(el => el.id === videoId && el.type === 'video') as VideoElement | undefined
        if (video) {
          const clipDur = video.duration ?? video.sourceDuration ?? 10
          const maxX = Math.max(0, sc.duration - clipDur)
          const delta = (mv.clientX - startMouseX) / PX_PER_SEC
          updateElement(videoId, { timelineX: Math.max(0, Math.min(maxX, origTimelineX + delta)) })
          return
        }
        elapsed += sc.duration
      }
    }

    const handleMouseUp = () => {
      if (!moved && wasSelected) setSelectedVideoId(null)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  function handleVideoResizeMouseDown(e: React.MouseEvent, video: VideoElement, edge: 'start' | 'end') {
    e.stopPropagation()
    e.preventDefault()
    setResizingVideo({ id: video.id, edge })
    setSelectedVideoId(video.id)
    setSelectedAudioId(null)
    selectElement(video.id, false)

    const startMouseX = e.clientX
    const origTimelineX = video.timelineX ?? 0
    const origDuration = video.duration ?? 10
    const origStartTime = video.startTime ?? 0
    const speed = video.playbackRate ?? 1
    const result = findVideoScene(video.id)
    const sceneRemaining = result ? Math.max(0.1, result.scene.duration - origTimelineX) : Number.POSITIVE_INFINITY
    const maxDur = Math.min(maxVideoClipDuration(video), sceneRemaining)

    const handleMouseMove = (mv: MouseEvent) => {
      const delta = (mv.clientX - startMouseX) / PX_PER_SEC
      if (edge === 'end') {
        updateElement(video.id, { duration: Math.max(0.1, Math.min(maxDur, origDuration + delta)) })
      } else {
        const maxX = result ? Math.max(0, result.scene.duration - 0.1) : Number.POSITIVE_INFINITY
        const newX = Math.max(0, Math.min(maxX, origTimelineX + delta))
        const actualDelta = newX - origTimelineX
        updateElement(video.id, {
          timelineX: newX,
          startTime: Math.max(0, origStartTime + actualDelta * speed),
          duration: Math.max(0.1, Math.min(maxDur, origDuration - actualDelta)),
        })
      }
    }

    const handleMouseUp = () => {
      setResizingVideo(null)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  if (!project) return (
    <div className="flex flex-col bg-orange flex-none" style={{ height: 120 }}>
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-editor-border">
        <span className="text-xs text-editor-text">Timeline</span>
      </div>
    </div>
  )

  const totalDur = getTotalDuration()
  const totalPx  = totalDur * PX_PER_SEC

  const sceneStarts: Record<string, number> = {}
  let acc = 0
  for (const sc of project.scenes) {
    sceneStarts[sc.id] = acc
    acc += sc.duration
  }

  const maxAudioRightPx = project.scenes.reduce((max, sc) => {
    const scStart = sceneStarts[sc.id] ?? 0
    for (const el of sc.elements) {
      if (el.type !== 'audio') continue
      const a = el as AudioElement
      const rightPx = (scStart + (a.x ?? 0) + (a.duration ?? 0)) * PX_PER_SEC
      if (rightPx > max) max = rightPx
    }
    return max
  }, 0)

  const playheadPx = playhead * PX_PER_SEC

  let selectedAudio: AudioElement | undefined
  if (selectedAudioId) {
    for (const sc of project.scenes) {
      const found = sc.elements.find(e => e.id === selectedAudioId && e.type === 'audio') as AudioElement | undefined
      if (found) { selectedAudio = found; break }
    }
  }

  let selectedVideo: VideoElement | undefined
  if (selectedVideoId) {
    for (const sc of project.scenes) {
      const found = sc.elements.find(e => e.id === selectedVideoId && e.type === 'video') as VideoElement | undefined
      if (found) { selectedVideo = found; break }
    }
  }

  function findVideoScene(videoId: string) {
    let elapsed = 0
    for (const sc of project!.scenes) {
      const video = sc.elements.find(e => e.id === videoId && e.type === 'video') as VideoElement | undefined
      if (video) return { video, scene: sc, sceneStart: elapsed }
      elapsed += sc.duration
    }
    return null
  }

  function trimVideoAtPlayhead() {
    if (!selectedVideo) return
    const result = findVideoScene(selectedVideo.id)
    if (!result) return
    const clipTime = playhead - result.sceneStart - (selectedVideo.timelineX ?? 0)
    if (clipTime <= 0.1) return
    updateElement(selectedVideo.id, { duration: Math.max(0.1, clipTime) })
  }

  function splitVideoAtPlayhead() {
    if (!selectedVideo) return
    const result = findVideoScene(selectedVideo.id)
    if (!result) return
    const clipDur = selectedVideo.duration ?? 10
    const clipTime = playhead - result.sceneStart - (selectedVideo.timelineX ?? 0)
    if (clipTime <= 0.1 || clipTime >= clipDur - 0.1) return
    const speed = selectedVideo.playbackRate ?? 1
    updateElement(selectedVideo.id, { duration: clipTime })
    addElementToScene(result.scene.id, {
      ...JSON.parse(JSON.stringify(selectedVideo)),
      id: crypto.randomUUID(),
      timelineX: (selectedVideo.timelineX ?? 0) + clipTime,
      startTime: (selectedVideo.startTime ?? 0) + clipTime * speed,
      duration: clipDur - clipTime,
    })
  }

  function trimVideoAfterAtContext() {
    if (!videoContextMenu || !project) return
    const { videoId, sceneId, clickTimeInClip } = videoContextMenu
    const sc = project.scenes.find(s => s.id === sceneId)
    const video = sc?.elements.find(e => e.id === videoId) as VideoElement | undefined
    if (!video || clickTimeInClip <= 0.1) return
    updateElement(videoId, { duration: Math.max(0.1, clickTimeInClip) })
    setVideoContextMenu(null)
  }

  function trimVideoBeforeAtContext() {
    if (!videoContextMenu || !project) return
    const { videoId, sceneId, clickTimeInClip } = videoContextMenu
    const sc = project.scenes.find(s => s.id === sceneId)
    const video = sc?.elements.find(e => e.id === videoId) as VideoElement | undefined
    if (!video || clickTimeInClip >= (video.duration ?? 0) - 0.1) return
    const speed = video.playbackRate ?? 1
    updateElement(videoId, {
      timelineX: (video.timelineX ?? 0) + clickTimeInClip,
      startTime: (video.startTime ?? 0) + clickTimeInClip * speed,
      duration:  (video.duration ?? 0) - clickTimeInClip,
    })
    setVideoContextMenu(null)
  }

  function splitVideoAtContext() {
    if (!videoContextMenu || !project) return
    const { videoId, sceneId, clickTimeInClip } = videoContextMenu
    const sc = project.scenes.find(s => s.id === sceneId)
    const video = sc?.elements.find(e => e.id === videoId) as VideoElement | undefined
    const clipDur = video?.duration ?? 0
    if (!video || clickTimeInClip <= 0.1 || clickTimeInClip >= clipDur - 0.1) return
    const speed = video.playbackRate ?? 1
    updateElement(videoId, { duration: clickTimeInClip })
    addElementToScene(sceneId, {
      ...JSON.parse(JSON.stringify(video)),
      id: crypto.randomUUID(),
      timelineX: (video.timelineX ?? 0) + clickTimeInClip,
      startTime: (video.startTime ?? 0) + clickTimeInClip * speed,
      duration: clipDur - clickTimeInClip,
    })
    setVideoContextMenu(null)
  }

  function findAudioScene(audioId: string) {
    let elapsed = 0
    for (const sc of project!.scenes) {
      if (sc.elements.some(e => e.id === audioId)) return { scene: sc, sceneStart: elapsed }
      elapsed += sc.duration
    }
    return null
  }

  function trimAtPlayhead() {
    if (!selectedAudio) return
    const result = findAudioScene(selectedAudio.id)
    if (!result) return
    const clipTime = playhead - (result.sceneStart + selectedAudio.x)
    if (clipTime <= 0.1) return
    updateElement(selectedAudio.id, { duration: Math.max(0.1, clipTime) })
  }

  function splitAtPlayhead() {
    if (!selectedAudio) return
    const result = findAudioScene(selectedAudio.id)
    if (!result) return
    const clipTime = playhead - (result.sceneStart + selectedAudio.x)
    if (clipTime <= 0.1 || clipTime >= selectedAudio.duration - 0.1) return

    const speed = selectedAudio.speed ?? 1
    updateElement(selectedAudio.id, { duration: clipTime })
    addElementToScene(result.scene.id, {
      ...JSON.parse(JSON.stringify(selectedAudio)),
      id: crypto.randomUUID(),
      x: selectedAudio.x + clipTime,
      startTime: selectedAudio.startTime + clipTime * speed,
      duration: selectedAudio.duration - clipTime,
    })
  }

  function trimAfterAtContextPosition() {
    if (!audioContextMenu || !project) return
    const { audioId, sceneId, clickTimeInAudio } = audioContextMenu
    const sc    = project.scenes.find(s => s.id === sceneId)
    const audio = sc?.elements.find(e => e.id === audioId) as AudioElement | undefined
    if (!audio || clickTimeInAudio <= 0.1) return
    updateElement(audioId, { duration: Math.max(0.1, clickTimeInAudio) })
    setAudioContextMenu(null)
  }

  function trimBeforeAtContextPosition() {
    if (!audioContextMenu || !project) return
    const { audioId, sceneId, clickTimeInAudio } = audioContextMenu
    const sc    = project.scenes.find(s => s.id === sceneId)
    const audio = sc?.elements.find(e => e.id === audioId) as AudioElement | undefined
    if (!audio || clickTimeInAudio >= audio.duration - 0.1) return
    const speed = audio.speed ?? 1
    updateElement(audioId, {
      x:         (audio.x ?? 0) + clickTimeInAudio,
      startTime: (audio.startTime ?? 0) + clickTimeInAudio * speed,
      duration:  audio.duration - clickTimeInAudio,
    })
    setAudioContextMenu(null)
  }

  function splitAtContextPosition() {
    if (!audioContextMenu || !project) return
    const { audioId, sceneId, clickTimeInAudio } = audioContextMenu
    const sc    = project.scenes.find(s => s.id === sceneId)
    const audio = sc?.elements.find(e => e.id === audioId) as AudioElement | undefined
    if (!audio || clickTimeInAudio <= 0.1 || clickTimeInAudio >= audio.duration - 0.1) return

    const speed = audio.speed ?? 1
    updateElement(audioId, { duration: clickTimeInAudio })
    addElementToScene(sceneId, {
      ...JSON.parse(JSON.stringify(audio)),
      id: crypto.randomUUID(),
      x: audio.x + clickTimeInAudio,
      startTime: audio.startTime + clickTimeInAudio * speed,
      duration: audio.duration - clickTimeInAudio,
    })
    setAudioContextMenu(null)
  }

  const allAudioClips = project.scenes.flatMap(sc => {
    const scStart = sceneStarts[sc.id] ?? 0
    return sc.elements
      .filter(el => el.type === 'audio')
      .map((el, idx) => ({ audio: el as AudioElement, sc, scStart, idx }))
  })

  const allVideoClips = project.scenes.flatMap(sc => {
    const scStart = sceneStarts[sc.id] ?? 0
    return sc.elements
      .filter(el => el.type === 'video')
      .map(el => ({ video: el as VideoElement, sc, scStart }))
  })

  // ── Lane packing for video clips ──────────────────────────────────────────
  const videoLaneById = new Map<string, number>()
  {
    const laneEnds: number[] = []
    const vbs = allVideoClips.map(c => {
      const s = c.scStart + (c.video.timelineX ?? 0)
      const dur = c.video.duration ?? c.video.sourceDuration ?? 10
      return { id: c.video.id, s, e: s + dur }
    })
    for (const c of [...vbs].sort((a, b) => a.s - b.s)) {
      let lane = 0
      while ((laneEnds[lane] ?? -Infinity) > c.s + 1e-6) lane++
      videoLaneById.set(c.id, lane)
      laneEnds[lane] = Math.max(laneEnds[lane] ?? -Infinity, c.e)
    }
  }
  const maxVideoLane = videoLaneById.size ? Math.max(...videoLaneById.values()) : 0
  const numVideoLanes = videoLaneById.size ? maxVideoLane + 1 : 1
  const VIDEO_TRACK_HEIGHT = numVideoLanes * SINGLE_VIDEO_TRACK_HEIGHT

  const SCENE_TOP = RULER_HEIGHT + VIDEO_TRACK_HEIGHT
  const AUDIO_TOP = SCENE_TOP + SCENE_HEIGHT

  // ── Lane packing for audio clips ──────────────────────────────────────────
  // Explicit `lane` (set by Shift+click) is honored; the rest are greedily
  // packed into the lowest lane with no time overlap. So a split/new clip that
  // doesn't overlap reuses lane 0 instead of adding depth to the timeline.
  const laneById = new Map<string, number>()
  {
    const laneEnds: number[] = []
    const abs = allAudioClips.map(c => {
      const s = c.scStart + (c.audio.x ?? 0)
      return { id: c.audio.id, lane: c.audio.lane, s, e: s + (c.audio.duration ?? 30) }
    })
    for (const c of abs) {
      if (c.lane != null) { laneById.set(c.id, c.lane); laneEnds[c.lane] = Math.max(laneEnds[c.lane] ?? -Infinity, c.e) }
    }
    for (const c of [...abs].sort((a, b) => a.s - b.s)) {
      if (laneById.has(c.id)) continue
      let lane = 0
      while ((laneEnds[lane] ?? -Infinity) > c.s + 1e-6) lane++
      laneById.set(c.id, lane)
      laneEnds[lane] = Math.max(laneEnds[lane] ?? -Infinity, c.e)
    }
  }
  const maxLane = laneById.size ? Math.max(...laneById.values()) : 0
  const audioLaneOf = (id: string) => laneById.get(id) ?? 0


  return (
    <div className="flex flex-col bg-[#171717] flex-none relative" style={{ height: panelHeight }}>
      {/* Resize handle — drag to change timeline height */}
      <div
        onMouseDown={handleResizeMouseDown}
        className="absolute top-0 left-0 right-0 h-1.5 -mt-0.5 cursor-ns-resize z-40 group"
        title="Drag to resize timeline"
      >
        <div className="mx-auto mt-0.5 h-1 w-16 rounded-full bg-editor-border group-hover:bg-editor-accent transition-colors" />
      </div>

      {/* Controls row - Increased gap-2 to gap-4, and py-1.5 to py-2.5 */}
      <div className="flex items-center gap-3 px-4 py-1.5 border-b border-editor-border flex-none min-w-0 overflow-hidden">
        <Tooltip text="Stop (Home)">
          <button onClick={stop} className="text-editor-text hover:text-editor-text transition-colors flex-none">
            <SkipBack size={12} />
          </button>
        </Tooltip>

        <Tooltip text={isPlaying ? 'Pause (Space)' : 'Play (Space)'}>
          <button
            onClick={() => isPlaying ? pause() : play()}
            className="flex items-center justify-center w-6 h-6 rounded bg-editor-accent hover:bg-editor-accent-hover text-white transition-colors flex-none"
          >
            {isPlaying ? <Pause size={10} /> : <Play size={10} />}
          </button>
        </Tooltip>

        {/* Cleaned text alignment layout */}
        <div className="text-xs text-editor-text tabular-nums ml-1 flex-none flex items-center gap-1.5">
          <span>current time:</span>
          <span className="text-sm bg-editor-elevated rounded px-1.5 py-0.5">{fmtTime(playhead)} / {fmtTime(totalDur)}</span>
        </div>

        {/* Fixed zoom box layout by adding flex items-center */}
        <div className="flex items-center border border-editor-border p-1.5 gap-3 rounded bg-neutral-900/40">
          <Tooltip text="Zoom Out (Ctrl -)">
            <button onClick={() => setTimelineZoom(Math.max(0.1, timelineZoom / 1.2))} className="text-editor-text hover:text-editor-text transition-colors flex-none">
              <ZoomOut size={14} />
            </button>
          </Tooltip>

          <span className="text-xs text-editor-text tabular-nums min-w-[36px] text-center flex-none">
            {Math.round(timelineZoom * 100)}%
          </span>

          <Tooltip text="Zoom In (Ctrl +) ">
            <button onClick={() => setTimelineZoom(Math.min(5, timelineZoom * 1.2))} className="text-editor-text hover:text-editor-text transition-colors flex-none">
              <ZoomIn size={14} />
            </button>
          </Tooltip>

          <Tooltip text="Reset Zoom (Ctrl 0)">
            <button onClick={() => setTimelineZoom(1)} className="text-xs text-editor-text hover:text-editor-text transition-colors px-1 flex-none border-l border-gray-700 pl-2">
              [1:1]
            </button>
          </Tooltip>
        </div>

        {selectedVideo ? (
          <>
            <Film size={15} className="text-editor-text flex-none" />

            <div className="flex items-center gap-2 flex-none">
              <Volume2 size={15} className="text-editor-text" />
              <input
                type="range" min={0} max={1} step={0.01}
                value={selectedVideo.volume ?? 1}
                onChange={e => updateElement(selectedVideo!.id, { volume: parseFloat(e.target.value) })}
                className="w-20 text-editor-text h-1 accent-editor-accent"
              />
              <span className="text-xs text-editor-text w-10 flex-none">
                {Math.round((selectedVideo.volume ?? 1) * 100)}%
              </span>
            </div>

            <select
              value={selectedVideo.playbackRate ?? 1}
              onChange={e => {
                const newRate = parseFloat(e.target.value)
                const rawS = (selectedVideo!.duration ?? 10) * (selectedVideo!.playbackRate ?? 1)
                updateElement(selectedVideo!.id, { playbackRate: newRate, duration: rawS / newRate })
              }}
              className="bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-1.5 py-1 flex-none"
              title="Playback speed"
            >
              {SPEED_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>

            <div className="w-px h-5 bg-editor-border mx-1 flex-none" />

            <div className="flex items-center gap-2 flex-none">
              <Tooltip text="Trim after playhead (cut end)">
                <button
                  onClick={trimVideoAtPlayhead}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs rounded bg-editor-elevated border border-editor-border text-editor-text hover:border-editor-text/40 transition-colors flex-none"
                >
                  <Scissors size={13} /> Trim
                </button>
              </Tooltip>
              <Tooltip text="Split at playhead">
                <button
                  onClick={splitVideoAtPlayhead}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs rounded bg-editor-elevated border border-editor-border text-editor-text hover:border-editor-text/40 transition-colors flex-none"
                >
                  <Split size={13} /> Split
                </button>
              </Tooltip>
            </div>

            <button
              onClick={() => setSelectedVideoId(null)}
              className="text-editor-text hover:text-red-400 transition-colors ml-1 flex-none"
              title="Deselect video"
            >
              <X size={12} />
            </button>
          </>
        ) : selectedAudio ? (
          <>
            <Music size={15} className="text-editor-accent flex-none" />
            <span className="text-xs text-editor-text truncate max-w-[180px] flex-none" title={selectedAudio.name}>
              {selectedAudio.name}
            </span>
            <span className="text-xs text-editor-secondary tabular-nums flex-none">
              {selectedAudio.duration.toFixed(1)}s
            </span>

            <button
              onClick={() => { setSelectedAudioId(null); deselectAll() }}
              className="text-editor-text hover:text-red-400 transition-colors ml-1 flex-none"
              title="Deselect audio"
            >
              <X size={12} />
            </button>
          </>
        ) : null}

        <div className="flex-1" />

        <Tooltip text="Add Scene">
          <button
            onClick={addScene}
            className="flex items-center gap-1.5 text-xs text-white bg-editor-accent hover:bg-editor-accent-hover transition-colors px-3 py-1.5 rounded font-medium flex-none shadow-sm"
          >
            <Plus size={12} /> Scene
          </button>
        </Tooltip>
      </div>


      {/* Scrollable track area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-x-auto overflow-y-auto relative cursor-pointer"
        onMouseDown={handleRulerClick}
        onContextMenu={handleContainerContextMenu}
      >
        <div className="relative" style={{ width: Math.max(totalPx + 120, maxAudioRightPx + 120, 600), height: '100%' }}>

          {/* Time ruler */}
          <div className="absolute top-0 left-0 right-0" style={{ height: RULER_HEIGHT }}>
            {Array.from({ length: Math.ceil(totalDur) + 1 }, (_, i) => (
              <div key={i} className="absolute flex flex-col items-start" style={{ left: i * PX_PER_SEC }}>
                <div className="w-px h-2 bg-editor-border-strong" />
                <span className="text-editor-text" style={{ fontSize: 9 }}>{fmtTime(i)}</span>
              </div>
            ))}
          </div>

          {/* Video track — above scene blocks */}
          <div className="absolute left-0 right-0" style={{ top: RULER_HEIGHT, height: VIDEO_TRACK_HEIGHT }}>
            {allVideoClips.map(({ video, sc, scStart }) => {
              const clipDur = video.duration ?? video.sourceDuration ?? 5
              const startPx = (scStart + (video.timelineX ?? 0)) * PX_PER_SEC
              const widthPx = clipDur * PX_PER_SEC
              const isSelected = selectedVideoId === video.id
              const isResizing = resizingVideo?.id === video.id
              const lane = videoLaneById.get(video.id) ?? 0
              const topPx = lane * SINGLE_VIDEO_TRACK_HEIGHT + 3
              const heightPx = SINGLE_VIDEO_TRACK_HEIGHT - 8
              return (
                <div
                  key={video.id}
                  className={cn(
                    'absolute rounded overflow-hidden transition-shadow select-none cursor-grab',
                    isSelected ? 'ring-2 ring-sky-300 shadow-lg shadow-black/40' : 'hover:ring-1 hover:ring-white/45',
                    isResizing && 'ring-2 ring-white',
                  )}
                  style={{
                    left: startPx,
                    width: Math.max(widthPx, 40),
                    top: topPx,
                    height: heightPx,
                    background: '#111316',
                    boxShadow: '0 1px 6px rgba(0,0,0,0.45)',
                  }}
                  title={`${video.name} — ${clipDur.toFixed(1)}s — drag · right-click for options`}
                  onMouseDown={e => handleVideoMouseDown(e, video.id, video.timelineX ?? 0)}
                  onContextMenu={e => {
                    e.preventDefault(); e.stopPropagation()
                    const barRect = e.currentTarget.getBoundingClientRect()
                    const clickTimeInClip = Math.max(0, Math.min(clipDur, (e.clientX - barRect.left) / PX_PER_SEC))
                    setVideoContextMenu({
                      x: e.clientX, y: e.clientY,
                      videoId: video.id,
                      sceneId: sc.id,
                      clickTimeInClip,
                    })
                    setSelectedVideoId(video.id)
                    setSelectedAudioId(null)
                    selectElement(video.id, false)
                  }}
                >
                  <VideoClipFilmstrip
                    src={video.src}
                    startTime={video.startTime ?? 0}
                    clipDuration={clipDur}
                    speed={video.playbackRate ?? 1}
                    clipWidthPx={Math.max(widthPx, 40)}
                    trackH={heightPx}
                    loop={video.loop ?? false}
                  />
                  <div className="absolute inset-0 flex items-center px-1 pointer-events-none bg-gradient-to-r from-black/45 via-transparent to-black/35">
                    <Film size={9} className="text-white/80 flex-none drop-shadow" />
                    <span className="text-[9px] text-white/90 truncate ml-1 font-medium drop-shadow">
                      {(video.playbackRate ?? 1) !== 1 ? `${video.playbackRate}× ` : ''}{clipDur.toFixed(1)}s
                    </span>
                    {video.loop && (
                      <span className="ml-auto flex items-center gap-0.5 rounded bg-black/80 px-1 py-0.5 text-[10px] uppercase tracking-normal text-white/85">
                        <Repeat size={9} /> loop
                      </span>
                    )}
                  </div>
                  <div
                    className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/40 z-10"
                    onMouseDown={e => handleVideoResizeMouseDown(e, video, 'start')}
                    title="Drag to trim start"
                  />
                  <div
                    className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/40 z-10"
                    onMouseDown={e => handleVideoResizeMouseDown(e, video, 'end')}
                    title="Drag to trim end"
                  />
                </div>
              )
            })}
          </div>

          {/* Scene blocks */}
          <div className="absolute left-0 right-0" style={{ top: SCENE_TOP, height: SCENE_HEIGHT }}>
            {project.scenes.map((sc, index) => {
              const startPx    = sceneStarts[sc.id] * PX_PER_SEC
              const widthPx    = sc.duration * PX_PER_SEC
              const isResizing  = resizingScene?.id === sc.id
              const isDragging  = draggedSceneIndex === index
              const isDropTarget = dropTargetIndex === index
              const sceneColor  = colorForId(sc.id)
              const isActive    = sc.id === currentSceneId

              return (
                <div
                  key={sc.id}
                  draggable={shiftHeld}
                  onDragStart={e => { if (!shiftHeld) { e.preventDefault(); return } setDraggedSceneIndex(index); e.dataTransfer.effectAllowed = 'move' }}
                  onDragEnd={() => { setDraggedSceneIndex(null); setDropTargetIndex(null) }}
                  onDragOver={e => { e.preventDefault(); setDropTargetIndex(index) }}
                  onDragLeave={() => setDropTargetIndex(null)}
                  onDrop={e => {
                    e.preventDefault()
                    if (draggedSceneIndex !== null && draggedSceneIndex !== index) reorderScenes(draggedSceneIndex, index)
                    setDraggedSceneIndex(null); setDropTargetIndex(null)
                  }}
                  onClick={e => { e.stopPropagation(); setCurrentScene(sc.id); setSelectedAudioId(null); setSelectedVideoId(null) }}
                  onContextMenu={e => {
                    e.preventDefault(); e.stopPropagation()
                    const rect = e.currentTarget.getBoundingClientRect()
                    const localX = e.clientX - rect.left
                    const clickTimeInScene = Math.max(0, Math.min(sc.duration, (localX / Math.max(1, rect.width)) * sc.duration))
                    setContextMenu({ x: e.clientX, y: e.clientY, sceneId: sc.id, clickTimeInScene })
                  }}
                  className={cn(
                    'absolute flex items-center px-3 cursor-pointer text-xs transition-all select-none rounded-md overflow-hidden',
                    isDragging && 'opacity-50',
                    isDropTarget && 'ring-2 ring-editor-accent',
                    isResizing && 'ring-2 ring-white',
                    isActive && 'ring-2 ring-red shadow-lg'
                  )}
                  style={{
                    left: startPx + 3, width: Math.max(widthPx - 6, 8),
                    height: SCENE_HEIGHT - 4, top: 2,
                    background: sceneColor, color: 'white',
                    fontWeight: isActive ? 600 : 400,
                    cursor: shiftHeld ? 'grab' : 'pointer',
                  }}
                  title={shiftHeld ? 'Shift+drag to reorder' : sc.name}
                >
                  <div
                    className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-white/30 rounded-l-md z-10"
                    onMouseDown={e => handleSceneEdgeMouseDown(sc.id, 'start', e)}
                  />

                  <span className="truncate flex-1 pl-1 font-medium">{sc.name}</span>

                  <div
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-white/30 rounded-r-md z-10"
                    onMouseDown={e => handleSceneEdgeMouseDown(sc.id, 'end', e)}
                  />

                  <SceneRuler duration={sc.duration} pxPerSec={PX_PER_SEC} />
                </div>
              )
            })}
          </div>

          {/* Transition blocks — straddle scene boundaries */}
          {project.scenes.map((sc, index) => {
            if (index === 0) return null
            if (!sc.transition || sc.transition.type === 'none') return null
            const startPx = sceneStarts[sc.id] * PX_PER_SEC
            const color   = TRANS_COLOR[sc.transition.type] ?? '#6366f1'
            const BLOCK_W = 20
            const BLOCK_H = 20
            const BLOCK_TOP = SCENE_TOP + 2 + Math.round(((SCENE_HEIGHT - 4) - BLOCK_H) / 2)
            return (
              <div
                key={`trans-${sc.id}`}
                className="absolute z-20 flex items-center justify-center rounded select-none pointer-events-none"
                style={{
                  left: startPx - BLOCK_W / 2,
                  top: BLOCK_TOP,
                  width: BLOCK_W,
                  height: BLOCK_H,
                  background: color + '66',
                  border: `1.5px solid ${color}`,
                  boxShadow: '0 1px 6px rgba(0,0,0,0.45)',
                  borderRadius: 5,
                  backdropFilter: 'blur(1px)',
                }}
                title={`${sc.transition.type} · ${sc.transition.duration}s`}
              >
                <Shuffle size={9} color="white" strokeWidth={2.5} />
              </div>
            )
          })}

          {/* Audio tracks — lane-packed so non-overlapping clips share a row */}
          <div className="absolute left-0 right-0" style={{ top: AUDIO_TOP, height: (maxLane + 1) * TRACK_HEIGHT }}>
            {allAudioClips.map(({ audio, sc, scStart }) => {
              const audioDur     = audio.duration ?? 30
              const audioStartPx = (scStart + (audio.x ?? 0)) * PX_PER_SEC
              const audioWidthPx = audioDur * PX_PER_SEC
              const fileName     = (audio.name ?? 'Audio').substring(0, 10)
              const isSelected   = selectedAudioId === audio.id
              const laneTop      = audioLaneOf(audio.id) * TRACK_HEIGHT + 2

              return (
                  <div
                    key={audio.id}
                    className={cn(
                      'absolute rounded overflow-hidden transition-shadow select-none cursor-grab group',
                      isSelected
                        ? 'ring-2 ring-white shadow-lg shadow-emerald-500/20'
                        : 'hover:ring-2 hover:ring-emerald-400/60'
                    )}
                    style={{
                      left: audioStartPx,
                      width: Math.max(audioWidthPx, 60),
                      top: laneTop,
                      height: TRACK_HEIGHT - 4,
                      background: isSelected
                        ? 'linear-gradient(135deg, #79443e 0%, #883a31 100%)'
                        : 'linear-gradient(135deg, #8a7e7c 0%, #8f7978 100%)',
                      boxShadow: '0 2px 8px rgba(3, 3, 3, 0.3)',
                      color: 'black'
                    }}
                    title={`${audio.name ?? 'Audio'} — ${audioDur.toFixed(1)}s — drag to move · Shift+click to change lane`}
                    onMouseDown={e => {
                      if (e.shiftKey) {
                        e.stopPropagation()
                        const cur = audioLaneOf(audio.id)
                        updateElement(audio.id, { lane: (cur + 1) % (maxLane + 2) })
                        setSelectedAudioId(audio.id)
                        setSelectedVideoId(null)
                        setCurrentScene(sc.id)
                        selectElement(audio.id, false)
                        setActivePanel('audio')
                        return
                      }
                      handleAudioMouseDown(e, audio.id, audio.x ?? 0, sc.id)
                    }}
                    onContextMenu={e => {
                      e.preventDefault(); e.stopPropagation()
                      const barRect = e.currentTarget.getBoundingClientRect()
                      const clickTimeInAudio = (e.clientX - barRect.left) / PX_PER_SEC
                      const clipped = Math.max(0, Math.min(audioDur, clickTimeInAudio))
                      const absoluteTime = scStart + (audio.x ?? 0) + clipped
                      setAudioContextMenu({
                        x: e.clientX, y: e.clientY,
                        audioId: audio.id,
                        sceneId: sc.id,
                        clickTimeInAudio: clipped,
                        absoluteTime,
                      })
                      setSelectedAudioId(audio.id)
                      setSelectedVideoId(null)
                      setCurrentScene(sc.id)
                      selectElement(audio.id, false)
                      setActivePanel('audio')
                    }}
                  >
                    {/* Real waveform */}
                    <AudioWaveformView
                      url={toFileUrl(audio.src)}
                      startTime={audio.startTime ?? 0}
                      clipDuration={audioDur}
                      speed={audio.speed ?? 1}
                      clipWidthPx={Math.max(audioWidthPx, 60)}
                      trackH={TRACK_HEIGHT - 4}
                    />

                    {audio.fadeIn > 0 && (
                      <div
                        className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-yellow-400/40 to-transparent rounded-l pointer-events-none"
                        style={{ width: Math.max(audio.fadeIn * PX_PER_SEC, 2) }}
                        title={`Fade in: ${audio.fadeIn.toFixed(1)}s`}
                      />
                    )}
                    {audio.fadeOut > 0 && (
                      <div
                        className="absolute right-0 top-0 bottom-0 bg-gradient-to-l from-yellow-400/40 to-transparent rounded-r pointer-events-none"
                        style={{ width: Math.max(audio.fadeOut * PX_PER_SEC, 2) }}
                        title={`Fade out: ${audio.fadeOut.toFixed(1)}s`}
                      />
                    )}

                    <div
                      className="absolute inset-0 flex items-center px-2 text-white text-2xs font-medium pointer-events-none overflow-hidden gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                      
                    >
                      <span className="truncate bg-gray-500/60 p-1">{fileName} • {audioDur.toFixed(1)}s</span>
                      {(audio.speed ?? 1) !== 1 && <span className="flex-none opacity-80">{audio.speed}×</span>}
                    </div>

                    <div
                      className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/40 rounded-l z-10"
                      onMouseDown={e => handleAudioResizeMouseDown(e, audio, 'start', sc.id)}
                      title="Drag to trim start"
                    />
                    <div
                      className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/40 rounded-r z-10"
                      onMouseDown={e => handleAudioResizeMouseDown(e, audio, 'end', sc.id)}
                      title="Drag to trim end"
                    />
                  </div>
              )
            })}
          </div>

          {/* Audio markers — stored on each clip, move with the clip */}
          {allAudioClips.map(({ audio, scStart }) =>
            (audio.markers ?? []).map(marker => {
              const markerPx = (scStart + (audio.x ?? 0) + marker.offset) * PX_PER_SEC
              return (
                <div
                  key={marker.id}
                  className="absolute z-20 pointer-events-none"
                  style={{ left: markerPx, top: AUDIO_TOP, bottom: 0 }}
                >
                  <div
                    className="absolute"
                    style={{
                      top: 0, bottom: 0, left: 0, width: 1.5,
                      background: `repeating-linear-gradient(to bottom, ${MARKER_COLOR} 0px, ${MARKER_COLOR} 2px, transparent 2px, transparent 4px)`,
                      opacity: 0.9,
                    }}
                  />
                  <div
                    className="absolute pointer-events-auto cursor-pointer rounded-full"
                    style={{ top: -2.5, left: -1.5, width: 6, height: 6, backgroundColor: MARKER_COLOR }}
                    onClick={e => { e.stopPropagation(); removeAudioMarker(audio.id, marker.id) }}
                    title={`${fmtTime(scStart + (audio.x ?? 0) + marker.offset)} — click to remove`}
                  />
                </div>
              )
            })
          )}
          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 z-30"
            style={{ left: playheadPx, width: 1, background: '#f59e0b', cursor: draggingPlayhead ? 'grabbing' : 'grab' }}
            onMouseDown={handlePlayheadMouseDown}
          >
            <div
              className="w-2.5 h-2.5 bg-warning rounded-full -translate-x-[5px] hover:scale-110 transition-transform"
              style={{ cursor: draggingPlayhead ? 'grabbing' : 'grab' }}
            />
          </div>
        </div>
      </div>

      {/* Context Menu — scenes */}
      <ContextMenu
        visible={contextMenu !== null}
        x={contextMenu?.x ?? 0}
        y={contextMenu?.y ?? 0}
        items={[
          {
            label: 'Edit Transition',
            icon: <Shuffle size={14} />,
            onClick: () => {
              if (contextMenu?.sceneId) { setCurrentScene(contextMenu.sceneId); setActivePanel('transitions') }
              setContextMenu(null)
            }
          },
          {
            label: `Split at ${contextMenu ? fmtTime(contextMenu.clickTimeInScene) : '0:00.0'}`,
            icon: <Split size={14} />,
            onClick: () => {
              if (contextMenu?.sceneId) splitScene(contextMenu.sceneId, contextMenu.clickTimeInScene)
              setContextMenu(null)
            }
          },
          {
            label: 'Add scene after',
            icon: <Plus size={14} />,
            onClick: () => {
              if (contextMenu?.sceneId) addSceneAfter(contextMenu.sceneId)
              setContextMenu(null)
            }
          },
          {
            label: 'Duplicate',
            icon: <Copy size={14} />,
            onClick: () => { if (contextMenu?.sceneId) duplicateScene(contextMenu.sceneId); setContextMenu(null) }
          },
          {
            label: 'Delete',
            icon: <Trash2 size={14} />,
            dangerous: true,
            onClick: () => { if (contextMenu?.sceneId) removeScene(contextMenu.sceneId); setContextMenu(null) }
          },
          {
            label: 'Shift + drag to reposition',
            icon: <ArrowLeftRight size={14} />,
            onClick: () => setContextMenu(null),
          }
        ]}
        onClose={() => setContextMenu(null)}
      />

      {/* Context Menu — audio clips */}
      <ContextMenu
        visible={audioContextMenu !== null}
        x={audioContextMenu?.x ?? 0}
        y={audioContextMenu?.y ?? 0}
        items={[
          {
            label: 'Duplicate',
            icon: <Copy size={14} />,
            onClick: () => {
              if (audioContextMenu) {
                const sc    = project.scenes.find(s => s.id === audioContextMenu.sceneId)
                const audio = sc?.elements.find(e => e.id === audioContextMenu.audioId) as AudioElement | undefined
                if (audio && sc) {
                  addElementToScene(sc.id, {
                    ...JSON.parse(JSON.stringify(audio)),
                    id: crypto.randomUUID(),
                    x: audio.x + audio.duration + 0.1,
                  })
                }
              }
              setAudioContextMenu(null)
            }
          },
          {
            label: `Trim after (${audioContextMenu ? audioContextMenu.clickTimeInAudio.toFixed(1) : 0}s)`,
            icon: <Scissors size={14} />,
            onClick: trimAfterAtContextPosition,
          },
          {
            label: `Trim before (${audioContextMenu ? audioContextMenu.clickTimeInAudio.toFixed(1) : 0}s)`,
            icon: <Scissors size={14} />,
            onClick: trimBeforeAtContextPosition,
          },
          {
            label: `Split here (${audioContextMenu ? audioContextMenu.clickTimeInAudio.toFixed(1) : 0}s)`,
            icon: <Split size={14} />,
            onClick: splitAtContextPosition,
          },
          {
            label: `Add mark at ${audioContextMenu ? fmtTime(audioContextMenu.clickTimeInAudio) : '0:00.0'} in clip`,
            icon: <Bookmark size={14} />,
            onClick: () => {
              if (audioContextMenu) addAudioMarker(audioContextMenu.audioId, audioContextMenu.clickTimeInAudio)
              setAudioContextMenu(null)
            }
          },
          {
            label: 'Delete',
            icon: <Trash2 size={14} />,
            dangerous: true,
            onClick: () => {
              if (audioContextMenu) {
                removeElement(audioContextMenu.audioId)
                if (selectedAudioId === audioContextMenu.audioId) setSelectedAudioId(null)
              }
              setAudioContextMenu(null)
            }
          },
        ]}
        onClose={() => setAudioContextMenu(null)}
      />

      {/* Context Menu — video clips (inside scene blocks) */}
      <ContextMenu
        visible={videoContextMenu !== null}
        x={videoContextMenu?.x ?? 0}
        y={videoContextMenu?.y ?? 0}
        items={[
          {
            label: 'Duplicate',
            icon: <Copy size={14} />,
            onClick: () => {
              if (videoContextMenu) {
                const sc = project.scenes.find(s => s.id === videoContextMenu.sceneId)
                const video = sc?.elements.find(e => e.id === videoContextMenu.videoId) as VideoElement | undefined
                if (video && sc) {
                  addElementToScene(sc.id, {
                    ...JSON.parse(JSON.stringify(video)),
                    id: crypto.randomUUID(),
                    timelineX: (video.timelineX ?? 0) + (video.duration ?? 0) + 0.1,
                    x: video.x + 24,
                    y: video.y + 24,
                  })
                }
              }
              setVideoContextMenu(null)
            },
          },
          {
            label: `Trim after (${videoContextMenu ? videoContextMenu.clickTimeInClip.toFixed(1) : 0}s)`,
            icon: <Scissors size={14} />,
            onClick: trimVideoAfterAtContext,
          },
          {
            label: `Trim before (${videoContextMenu ? videoContextMenu.clickTimeInClip.toFixed(1) : 0}s)`,
            icon: <Scissors size={14} />,
            onClick: trimVideoBeforeAtContext,
          },
          {
            label: `Split here (${videoContextMenu ? videoContextMenu.clickTimeInClip.toFixed(1) : 0}s)`,
            icon: <Split size={14} />,
            onClick: splitVideoAtContext,
          },
          {
            label: 'Delete',
            icon: <Trash2 size={14} />,
            dangerous: true,
            onClick: () => {
              if (videoContextMenu) {
                removeElement(videoContextMenu.videoId)
                if (selectedVideoId === videoContextMenu.videoId) setSelectedVideoId(null)
              }
              setVideoContextMenu(null)
            },
          },
        ]}
        onClose={() => setVideoContextMenu(null)}
      />

      {/* Context Menu — timeline (ruler / empty track area) */}
      <ContextMenu
        visible={timelineContextMenu !== null}
        x={timelineContextMenu?.x ?? 0}
        y={timelineContextMenu?.y ?? 0}
        items={[
          {
            label: `Set playhead to ${timelineContextMenu ? fmtTime(timelineContextMenu.time) : '0:00.0'}`,
            icon: <Bookmark size={14} />,
            onClick: () => {
              if (timelineContextMenu) setPlayhead(timelineContextMenu.time)
              setTimelineContextMenu(null)
            }
          },
        ]}
        onClose={() => setTimelineContextMenu(null)}
      />
    </div>
  )
}

// ── Video clip filmstrip (timeline thumbnail) ─────────────────────────────────

function VideoClipFilmstrip({ src, startTime, clipDuration, speed, clipWidthPx, trackH, loop }: {
  src: string
  startTime: number
  clipDuration: number
  speed: number
  clipWidthPx: number
  trackH: number
  loop: boolean
}) {
  const [stripUrl, setStripUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    const video = document.createElement('video')
    const canvas = document.createElement('canvas')
    const frameW = 68
    const gap = 2
    const safeTrackH = Math.max(20, Math.round(trackH))
    const visibleWidth = Math.max(40, Math.round(clipWidthPx))
    const frameCount = Math.max(1, Math.min(48, Math.ceil(visibleWidth / frameW)))
    const canvasW = frameCount * frameW + Math.max(0, frameCount - 1) * gap

    setStripUrl(null)
    setFailed(false)

    canvas.width = canvasW
    canvas.height = safeTrackH
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      setFailed(true)
      return () => {}
    }

    video.src = toFileUrl(src)
    video.crossOrigin = 'anonymous'
    video.muted = true
    video.preload = 'metadata'

    const seekTo = (time: number) => new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        video.removeEventListener('seeked', onSeeked)
        video.removeEventListener('error', onError)
      }
      const onSeeked = () => { cleanup(); resolve() }
      const onError = () => { cleanup(); reject(new Error('Video frame seek failed')) }
      video.addEventListener('seeked', onSeeked, { once: true })
      video.addEventListener('error', onError, { once: true })
      video.currentTime = time
    })

    const drawCoverFrame = (x: number) => {
      const vw = video.videoWidth || frameW
      const vh = video.videoHeight || safeTrackH
      const scale = Math.max(frameW / vw, safeTrackH / vh)
      const dw = vw * scale
      const dh = vh * scale
      const dx = x + (frameW - dw) / 2
      const dy = (safeTrackH - dh) / 2
      ctx.drawImage(video, dx, dy, dw, dh)
    }

    const render = async () => {
      try {
        await new Promise<void>((resolve, reject) => {
          const onLoaded = () => { cleanup(); resolve() }
          const onError = () => { cleanup(); reject(new Error('Video metadata failed')) }
          const cleanup = () => {
            video.removeEventListener('loadedmetadata', onLoaded)
            video.removeEventListener('loadeddata', onLoaded)
            video.removeEventListener('error', onError)
          }
          video.addEventListener('loadedmetadata', onLoaded, { once: true })
          video.addEventListener('loadeddata', onLoaded, { once: true })
          video.addEventListener('error', onError, { once: true })
          if (video.readyState >= 1) onLoaded()
        })

        const duration = Number.isFinite(video.duration) && video.duration > 0
          ? video.duration
          : startTime + clipDuration * speed
        const maxTime = Math.max(0, duration - 0.05)
        const sourceStart = Math.max(0, Math.min(startTime, maxTime))
        const sourceSpan = Math.max(0.05, duration - sourceStart)
        const clipSourceSpan = Math.max(0.05, clipDuration * Math.max(speed, 0.01))

        ctx.fillStyle = '#111018'
        ctx.fillRect(0, 0, canvas.width, canvas.height)

        for (let i = 0; i < frameCount; i++) {
          if (cancelled) return
          const ratio = frameCount === 1 ? 0 : i / (frameCount - 1)
          const rawOffset = clipSourceSpan * ratio
          const sourceTime = loop
            ? Math.min(maxTime, sourceStart + (rawOffset % sourceSpan))
            : Math.min(maxTime, sourceStart + rawOffset)
          await seekTo(sourceTime)
          if (cancelled) return
          const x = i * (frameW + gap)
          drawCoverFrame(x)
          if (gap > 0 && i < frameCount - 1) {
            ctx.fillStyle = 'rgba(7,7,10,0.92)'
            ctx.fillRect(x + frameW, 0, gap, safeTrackH)
          }
          if (loop && sourceSpan > 0 && rawOffset >= sourceSpan) {
            ctx.fillStyle = 'rgba(255,255,255,0.5)'
            ctx.fillRect(x, 0, 1, safeTrackH)
          }
        }

        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.76))
        if (!blob || cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setStripUrl(objectUrl)
      } catch {
        if (!cancelled) setFailed(true)
      }
    }

    render()

    return () => {
      cancelled = true
      video.pause()
      video.src = ''
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [src, startTime, clipDuration, speed, clipWidthPx, trackH, loop])

  if (stripUrl) {
    return (
      <img
        src={stripUrl}
        className="absolute inset-0 w-full h-full pointer-events-none object-cover"
        style={{ opacity: 0.95, imageRendering: 'auto' }}
      />
    )
  }

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        background: failed
          ? 'linear-gradient(135deg, rgba(39,43,48,0.88), rgba(16,18,22,0.94))'
          : 'repeating-linear-gradient(90deg, rgba(38,42,48,0.9) 0 54px, rgba(68,74,84,0.72) 54px 56px)',
        opacity: 0.9,
      }}
    />
  )
}

// ── Real audio waveform component ──────────────────────────────────────────────

function AudioWaveformView({ url, startTime, clipDuration, speed, clipWidthPx, trackH }: {
  url: string
  startTime: number
  clipDuration: number
  speed: number
  clipWidthPx: number
  trackH: number
}) {
  const [waveData, setWaveData] = useState<WaveformData | null>(null)

  useEffect(() => {
    let cancelled = false
    getWaveform(url).then(data => { if (!cancelled) setWaveData(data) })
    return () => { cancelled = true }
  }, [url])

  const svgW     = Math.max(clipWidthPx, 60)
  const barCount = Math.max(5, Math.floor(svgW / 3))
  const centerY  = trackH / 2

  const bars = useMemo(() => {
    if (!waveData) {
      // Fallback: subtle sine placeholder until decode finishes
      return Array.from({ length: barCount }, (_, i) => {
        const amp = Math.sin(i * 0.6) * 0.25 + 0.35
        return Math.max(2, amp * (trackH - 6))
      })
    }

    const { samples, duration } = waveData
    // Map the trim window into sample indices
    const normStart = Math.min(1, Math.max(0, startTime / duration))
    const normEnd   = Math.min(1, Math.max(0, (startTime + clipDuration * speed) / duration))
    const startIdx  = Math.floor(normStart * samples.length)
    const endIdx    = Math.ceil(normEnd * samples.length)
    const sliceLen  = Math.max(1, endIdx - startIdx)

    return Array.from({ length: barCount }, (_, i) => {
      const pos  = (i / barCount) * sliceLen
      const idx  = startIdx + Math.min(Math.floor(pos), sliceLen - 1)
      const amp  = samples[idx] ?? 0
      return Math.max(2, amp * (trackH - 6))
    })
  }, [waveData, barCount, startTime, clipDuration, speed, trackH])

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      width={svgW}
      height={trackH}
      style={{ opacity: waveData ? 0.75 : 0.3 }}
    >
      {bars.map((barH, i) => (
        <rect
          key={i}
          x={i * (svgW / barCount)}
          y={centerY - barH / 2}
          width={1.5}
          height={barH}
          fill="#eba9a4"
        />
      ))}
    </svg>
  )
}

// Readable duration label: "0.5s", "1s", "59.5s", "1m", "1m30s"
function fmtTime(s: number) {
  const fmtNum = (n: number) => (Number.isInteger(n) ? `${n}` : n.toFixed(1))
  if (s < 60) return `${fmtNum(Math.round(s * 10) / 10)}s`
  const m = Math.floor(s / 60)
  const rem = Math.round((s - m * 60) * 10) / 10
  return rem < 0.05 ? `${m}m` : `${m}m${fmtNum(rem)}s`
}

// Adaptive time ruler rendered inside each scene block
function SceneRuler({ duration, pxPerSec }: { duration: number; pxPerSec: number }) {
  const INTERVALS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 30, 60]
  const MIN_PX    = 36
  const interval  = INTERVALS.find(i => i * pxPerSec >= MIN_PX) ?? 60

  const ticks: number[] = []
  for (let t = interval; t < duration - interval * 0.15; t += interval) {
    ticks.push(Math.round(t * 1000) / 1000)
  }

  return (
    <>
      {ticks.map(t => {
        const label = t < 1 ? `${t}s` : t % 1 === 0 ? `${t}s` : `${t}s`
        return (
          <div
            key={t}
            className="absolute pointer-events-none"
            style={{ left: t * pxPerSec, bottom: 0 }}
          >
            <div style={{ position: 'absolute', bottom: 0, left: 0, width: 1, height: 7, backgroundColor: 'rgba(242, 235, 255, 0.52)' }} />
            <span style={{
              position: 'absolute', bottom: 8, left: -2,
              fontSize: 9, color: 'rgba(251, 245, 255, 0.68)',
              lineHeight: 1, whiteSpace: 'nowrap', userSelect: 'none',
            }}>
              {label}
            </span>
          </div>
        )
      })}
    </>
  )
}
