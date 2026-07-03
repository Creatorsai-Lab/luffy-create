import { useRef, useEffect, useCallback, useState } from 'react'
import { Stage, Layer, Shape } from 'react-konva'
import type Konva from 'konva'
import { X, Play, Pause, SkipBack } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import { getAnimatedProps } from '../../engine/animator'
import { drawBackground } from '../../engine/backgroundRenderer'
import { easeInOutCubic } from '../../engine/transitionRenderer'
import CanvasElement from '../canvas/CanvasElement'
import type { Background, TransitionType, SlideDir, AudioElement, VideoElement } from '../../types/editor'
import { toFileUrl } from '../../utils/pathUtils'
import { getVideoClipState } from '../../utils/videoClip'
import {
  applyAudioEffects,
  audioPreviewPlaybackRate,
  disposeAudioEffectGraphs,
  ensureAudioEffectGraph,
  syncAudioPlaybackSettings,
  type AudioEffectGraphMap,
} from '../../utils/audioEffects'

export default function PreviewModal() {
  const { project, setPreviewOpen } = useEditorStore()
  const [playhead, setPlayhead] = useState(0)
  const [isPlaying, setIsPlaying] = useState(true)
  const rafRef = useRef<number>(0)
  const lastRef = useRef<number>(0)
  const playheadRef = useRef(0)                                      // always-current value for RAF closures
  const audioPlayersRef = useRef<Map<string, HTMLAudioElement>>(new Map())
  const audioGraphsRef = useRef<AudioEffectGraphMap>(new Map())

  // Fit preview into viewport, preserving aspect ratio
  const maxW = Math.min(950, window.innerWidth * 0.88)
  const maxH = window.innerHeight * 0.72
  const aspect = project ? project.width / project.height : 16 / 9
  let pw = maxW, ph = maxW / aspect
  if (ph > maxH) { ph = maxH; pw = maxH * aspect }
  const PREVIEW_W = Math.round(pw)
  const PREVIEW_H = Math.round(ph)
  const scale = project ? PREVIEW_W / project.width : 1

  const totalDur = project?.scenes.reduce((s, sc) => s + sc.duration, 0) ?? 0

  function getSceneAt(t: number) {
    if (!project) return null
    let acc = 0
    for (const sc of project.scenes) {
      if (t < acc + sc.duration) return { scene: sc, localTime: t - acc }
      acc += sc.duration
    }
    return null
  }

  // RAF loop
  useEffect(() => {
    if (!isPlaying) { cancelAnimationFrame(rafRef.current); return }
    lastRef.current = 0
    const tick = (now: number) => {
      if (!lastRef.current) lastRef.current = now
      const delta = (now - lastRef.current) / 1000
      lastRef.current = now
      setPlayhead(t => {
        const next = t + delta
        const val = next >= totalDur ? 0 : next
        playheadRef.current = val
        return val
      })
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [isPlaying, totalDur])

  // Audio sync RAF — mirrors Timeline.tsx logic
  useEffect(() => {
    if (!project) return
    if (!isPlaying) {
      audioPlayersRef.current.forEach(p => p.pause())
      return
    }

    let rafId: number

    function syncAudio() {
      const ph = playheadRef.current
      const activeIds = new Set<string>()
      let elapsed = 0

      for (const sc of project!.scenes) {
        for (const el of sc.elements) {
          if (el.type !== 'audio') continue
          const audio = el as AudioElement
          const absStart = elapsed + (audio.x ?? 0)
          const absEnd = absStart + (audio.duration ?? 0)

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

            const expected = (audio.startTime ?? 0) + (ph - absStart) * audioPreviewPlaybackRate(audio)
            if (player.paused) {
              player.currentTime = Math.max(0, expected)
              void graph.context.resume().catch(() => {})
              player.play().catch(() => { })
            } else if (Math.abs(player.currentTime - expected) > 0.3) {
              player.currentTime = Math.max(0, expected)
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
  }, [isPlaying, project])

  // Release audio players on unmount
  useEffect(() => {
    return () => {
      audioPlayersRef.current.forEach(p => { p.pause(); p.src = '' })
      audioPlayersRef.current.clear()
      disposeAudioEffectGraphs(audioGraphsRef.current)
    }
  }, [])

  if (!project) return null

  const at = getSceneAt(playhead)
  const scene = at?.scene ?? project.scenes[0]
  const localTime = at?.localTime ?? 0
  const sorted = [...scene.elements].sort((a, b) => a.zIndex - b.zIndex)

  // Transition computation
  const tr = scene.transition
  const inTrans = tr && tr.type !== 'none' && localTime < tr.duration
  const transP = inTrans ? easeInOutCubic(Math.min(1, Math.max(0, localTime / tr.duration))) : 1

  // CSS transform for legacy slide/push/zoom/morph transitions.
  const transStyle: React.CSSProperties = (() => {
    if (!inTrans || !tr) return {}
    const p = transP
    const off = (n: number) => `${n}%`
    switch (tr.type as TransitionType) {
      case 'slide': {
        const d = (tr.direction ?? 'right') as SlideDir
        const v = (1 - p) * 100
        if (d === 'right') return { transform: `translateX(${off(v)})` }
        if (d === 'left') return { transform: `translateX(${off(-v)})` }
        if (d === 'down') return { transform: `translateY(${off(v)})` }
        if (d === 'up') return { transform: `translateY(${off(-v)})` }
        return {}
      }
      case 'push': {
        const d = (tr.direction ?? 'left') as SlideDir
        const v = (1 - p) * 100
        if (d === 'left') return { transform: `translateX(${off(v)})` }
        if (d === 'right') return { transform: `translateX(${off(-v)})` }
        if (d === 'down') return { transform: `translateY(${off(-v)})` }
        if (d === 'up') return { transform: `translateY(${off(v)})` }
        return {}
      }
      case 'zoom': return { transform: `scale(${0.965 + p * 0.035})`, opacity: p, transformOrigin: 'center center' }
      case 'morph': return { transform: `scale(${0.965 + p * 0.035})`, opacity: p, transformOrigin: 'center center' }
      default: return {}
    }
  })()

  // Overlay opacity for fade / wipe
  const fadeOverlay = inTrans && tr?.type === 'fade' ? 1 - transP : 0
  const wipeWidth = inTrans && tr?.type === 'wipe' ? (1 - transP) * 100 : 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) setPreviewOpen(false) }}
    >
      {/* Prominent close */}
      <button
        onClick={() => setPreviewOpen(false)}
        className="absolute top-4 right-4 z-10 flex items-center justify-center w-9 h-9 rounded-full bg-black/60 border border-white/20 text-white hover:bg-white/20 transition-colors"
      >
        <X size={18} />
      </button>

      <div className="flex flex-col items-center gap-3">
        {/* Stage */}
        <div
          className="rounded-lg shadow-2xl bg-black relative overflow-hidden"
          style={{ width: PREVIEW_W, height: PREVIEW_H }}
        >
          {/* Content with transition transform */}
          <div style={{ width: '100%', height: '100%', ...transStyle }}>
            <Stage width={PREVIEW_W} height={PREVIEW_H} scaleX={scale} scaleY={scale}>
              <Layer>
                <BgShape bg={scene.background} w={project.width} h={project.height} time={playhead} />
              </Layer>
              <Layer>
                {sorted.filter(e => {
                  if (!e.visible) return false
                  if (e.type === 'video') return getVideoClipState(e as VideoElement, localTime).visible
                  return true
                }).map(el => (
                  <CanvasElement
                    key={el.id}
                    element={el}
                    animProps={getAnimatedProps(el, localTime)}
                    isSelected={false}
                    onSelect={() => { }}
                    onDblClick={() => { }}
                    stageScale={scale}
                    localTime={localTime}
                    syncVideoToTime
                    videoPlaybackActive={isPlaying}
                  />
                ))}
              </Layer>
            </Stage>
          </div>

          {/* Fade overlay */}
          {fadeOverlay > 0 && (
            <div className="absolute inset-0 bg-black pointer-events-none" style={{ opacity: fadeOverlay }} />
          )}
          {/* Wipe overlay — black curtain shrinks from right */}
          {wipeWidth > 0 && (
            <div
              className="absolute top-0 bottom-0 right-0 bg-black pointer-events-none"
              style={{ width: `${wipeWidth}%` }}
            />
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3 bg-editor-panel/90 backdrop-blur-sm border border-editor-border rounded-xl px-4 py-2.5">
          <button
            onClick={() => { setPlayhead(0); setIsPlaying(false) }}
            className="text-[#f2f2f2] hover:text-editor-text transition-colors"
          >
            <SkipBack size={14} />
          </button>
          <button
            onClick={() => setIsPlaying(v => !v)}
            className="flex items-center justify-center w-8 h-8 rounded-lg bg-editor-accent hover:bg-editor-accent-hover text-white transition-colors"
          >
            {isPlaying ? <Pause size={13} /> : <Play size={13} />}
          </button>

          <input
            type="range" min={0} max={totalDur} step={0.05}
            value={playhead}
            onChange={e => { const v = Number(e.target.value); playheadRef.current = v; setPlayhead(v) }}
            className="w-52 accent-editor-accent"
          />
          <span className="text-xs text-[#f2f2f2] tabular-nums w-24">
            {playhead.toFixed(1)}s / {totalDur.toFixed(1)}s
          </span>

          <button
            onClick={() => setPreviewOpen(false)}
            className="text-[#f2f2f2] hover:text-editor-text transition-colors ml-1"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}

function BgShape({ bg, w, h, time }: { bg: Background; w: number; h: number; time: number }) {
  const sceneFunc = useCallback((ctx: Konva.Context) => {
    const raw = (ctx as unknown as { _context: CanvasRenderingContext2D })._context
    drawBackground(raw, bg, w, h, time)
  }, [bg, w, h, time])

  return <Shape width={w} height={h} sceneFunc={sceneFunc} listening={false} />
}
