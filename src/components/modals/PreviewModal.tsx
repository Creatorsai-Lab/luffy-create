import { useRef, useEffect, useCallback, useState, type CSSProperties } from 'react'
import { Stage, Layer, Shape } from 'react-konva'
import type Konva from 'konva'
import { X, Play, Pause, SkipBack } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import { getAnimatedProps } from '../../engine/animator'
import { drawBackground } from '../../engine/backgroundRenderer'
import { easeInOutCubic, renderTransition } from '../../engine/transitionRenderer'
import { isDirectionalTransition } from '../../engine/directionalTransitions'
import { buildTransitionTimeline, getTransitionFrameState } from '../../utils/transitionTiming'
import CanvasElement from '../canvas/CanvasElement'
import { captureStageToCanvas } from '../canvas/captureStageToCanvas'
import SubtitleOverlay from '../../subtitle/SubtitleOverlay'
import type { Background, AudioElement, VideoElement, ImageBg, Scene, Project, SlideDir, TransitionType } from '../../types/editor'
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

  const timeline = buildTransitionTimeline(project.scenes)
  const frameState = getTransitionFrameState(timeline, playhead)

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
          <PreviewFrame
            project={project}
            frameState={frameState}
            timeline={timeline}
            width={PREVIEW_W}
            height={PREVIEW_H}
            scale={scale}
            playhead={playhead}
            isPlaying={isPlaying}
          />
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

function PreviewFrame({
  project,
  frameState,
  timeline,
  width,
  height,
  scale,
  playhead,
  isPlaying,
}: {
  project: Project
  frameState: ReturnType<typeof getTransitionFrameState>
  timeline: ReturnType<typeof buildTransitionTimeline>
  width: number
  height: number
  scale: number
  playhead: number
  isPlaying: boolean
}) {
  if (frameState.kind === 'scene') {
    const scene = project.scenes[frameState.sceneIndex]
    return (
      <PreviewSceneStage
        project={project}
        scene={scene}
        localTime={frameState.sceneTime}
        globalTime={playhead}
        width={width}
        height={height}
        scale={scale}
        isPlaying={isPlaying}
        style={{ position: 'absolute', inset: 0 }}
      />
    )
  }

  const fromScene = project.scenes[frameState.fromSceneIndex]
  const toScene = project.scenes[frameState.toSceneIndex]
  const fromLocalTime = Math.max(0, frameState.fromTime - timeline[frameState.fromSceneIndex].startTime)
  const toLocalTime = Math.max(0, frameState.toTime - timeline[frameState.toSceneIndex].startTime)

  if (isDirectionalTransition(frameState.transition.type)) {
    return (
      <DirectionalTransitionPreview
        project={project}
        fromScene={fromScene}
        toScene={toScene}
        fromLocalTime={fromLocalTime}
        toLocalTime={toLocalTime}
        fromGlobalTime={frameState.fromTime}
        toGlobalTime={frameState.toTime}
        progress={frameState.progress}
        transition={frameState.transition}
        width={width}
        height={height}
        scale={scale}
        isPlaying={isPlaying}
      />
    )
  }

  const p = easeInOutCubic(frameState.progress)
  const styles = transitionLayerStyles(frameState.transition.type, frameState.transition.direction, p)

  return (
    <>
      <PreviewSceneStage
        project={project}
        scene={fromScene}
        localTime={fromLocalTime}
        globalTime={frameState.fromTime}
        width={width}
        height={height}
        scale={scale}
        isPlaying={false}
        style={{ position: 'absolute', inset: 0, zIndex: 1, ...styles.from }}
      />
      <PreviewSceneStage
        project={project}
        scene={toScene}
        localTime={toLocalTime}
        globalTime={frameState.toTime}
        width={width}
        height={height}
        scale={scale}
        isPlaying={isPlaying}
        style={{ position: 'absolute', inset: 0, zIndex: 2, ...styles.to }}
      />
    </>
  )
}

function DirectionalTransitionPreview({
  project,
  fromScene,
  toScene,
  fromLocalTime,
  toLocalTime,
  fromGlobalTime,
  toGlobalTime,
  progress,
  transition,
  width,
  height,
  scale,
  isPlaying,
}: {
  project: Project
  fromScene: Scene
  toScene: Scene
  fromLocalTime: number
  toLocalTime: number
  fromGlobalTime: number
  toGlobalTime: number
  progress: number
  transition: Scene['transition']
  width: number
  height: number
  scale: number
  isPlaying: boolean
}) {
  const [fromStage, setFromStage] = useState<Konva.Stage | null>(null)
  const [toStage, setToStage] = useState<Konva.Stage | null>(null)
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const fromCapture = useRef<HTMLCanvasElement | null>(null)
  const toCapture = useRef<HTMLCanvasElement | null>(null)
  const frame = useRef(0)

  const draw = useCallback(() => {
    const ctx = canvas.current?.getContext('2d')
    if (!ctx || !fromStage || !toStage ||
        !isDirectionalTransition(transition.type)) return
    const fromCanvas = fromCapture.current ?? document.createElement('canvas')
    const toCanvas = toCapture.current ?? document.createElement('canvas')
    fromCapture.current = fromCanvas
    toCapture.current = toCanvas
    renderTransition({
      ctx,
      width,
      height,
      progress,
      type: transition.type,
      direction: transition.direction,
      speed: transition.speed,
      hardness: transition.hardness,
      fromCanvas: captureStageToCanvas(fromStage, fromCanvas, width, height),
      toCanvas: captureStageToCanvas(toStage, toCanvas, width, height),
    })
  }, [fromStage, height, progress, toStage, transition, width])

  const drawLatest = useRef(draw)
  drawLatest.current = draw

  useEffect(() => {
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame.current)
  }, [draw])

  useEffect(() => {
    if (!fromStage || !toStage) return
    const refresh = () => {
      cancelAnimationFrame(frame.current)
      frame.current = requestAnimationFrame(() => drawLatest.current())
    }
    const layers = [...fromStage.getLayers(), ...toStage.getLayers()]
    layers.forEach(layer => layer.on('draw.transitionPreview', refresh))
    return () => {
      layers.forEach(layer => layer.off('draw.transitionPreview', refresh))
      cancelAnimationFrame(frame.current)
    }
  }, [fromStage, toStage])

  return (
    <>
      <PreviewSceneStage
        refSetter={setFromStage}
        project={project}
        scene={fromScene}
        localTime={fromLocalTime}
        globalTime={fromGlobalTime}
        width={width}
        height={height}
        scale={scale}
        isPlaying={false}
        style={{ position: 'absolute', inset: 0, zIndex: 1 }}
      />
      <PreviewSceneStage
        refSetter={setToStage}
        project={project}
        scene={toScene}
        localTime={toLocalTime}
        globalTime={toGlobalTime}
        width={width}
        height={height}
        scale={scale}
        isPlaying={isPlaying}
        style={{ position: 'absolute', inset: 0, zIndex: 0, opacity: 0 }}
      />
      <canvas
        ref={canvas}
        width={width}
        height={height}
        style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none' }}
      />
    </>
  )
}

function transitionLayerStyles(
  type: TransitionType,
  direction: SlideDir | undefined,
  p: number
): { from: CSSProperties; to: CSSProperties } {
  const dir = direction ?? 'left'
  const pct = (n: number) => `${n}%`

  switch (type) {
    case 'slide':
    case 'push': {
      let from: CSSProperties = {}
      let to: CSSProperties = {}
      if (dir === 'right') {
        from = { transform: `translateX(${pct(-p * 100)})` }
        to = { transform: `translateX(${pct((1 - p) * 100)})` }
      } else if (dir === 'left') {
        from = { transform: `translateX(${pct(p * 100)})` }
        to = { transform: `translateX(${pct(-(1 - p) * 100)})` }
      } else if (dir === 'down') {
        from = { transform: `translateY(${pct(-p * 100)})` }
        to = { transform: `translateY(${pct((1 - p) * 100)})` }
      } else {
        from = { transform: `translateY(${pct(p * 100)})` }
        to = { transform: `translateY(${pct(-(1 - p) * 100)})` }
      }
      return { from, to }
    }

    case 'wipe': {
      const to: CSSProperties =
        dir === 'right' ? { clipPath: `inset(0 0 0 ${(1 - p) * 100}%)` } :
        dir === 'left'  ? { clipPath: `inset(0 ${(1 - p) * 100}% 0 0)` } :
        dir === 'down'  ? { clipPath: `inset(${(1 - p) * 100}% 0 0 0)` } :
                          { clipPath: `inset(0 0 ${(1 - p) * 100}% 0)` }
      return { from: {}, to }
    }

    case 'zoom':
      return {
        from: {},
        to: {
          opacity: p,
          transform: `scale(${0.985 + p * 0.015})`,
          transformOrigin: 'center center',
        },
      }

    case 'morph':
    case 'fade':
    default:
      return { from: {}, to: { opacity: p } }
  }
}

function PreviewSceneStage({
  refSetter,
  project,
  scene,
  localTime,
  globalTime,
  width,
  height,
  scale,
  isPlaying,
  style,
}: {
  refSetter?: (stage: Konva.Stage | null) => void
  project: Project
  scene: Scene
  localTime: number
  globalTime: number
  width: number
  height: number
  scale: number
  isPlaying: boolean
  style?: CSSProperties
}) {
  const sorted = [...scene.elements].sort((a, b) => a.zIndex - b.zIndex)

  return (
    <div style={{ width: '100%', height: '100%', pointerEvents: 'none', ...style }}>
      <Stage ref={refSetter} width={width} height={height} scaleX={scale} scaleY={scale}>
        <Layer>
          <BgShape bg={scene.background} w={project.width} h={project.height} time={globalTime} />
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
          <SubtitleOverlay project={project} time={globalTime} />
        </Layer>
      </Stage>
    </div>
  )
}

function BgShape({ bg, w, h, time }: { bg: Background; w: number; h: number; time: number }) {
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null)
  const bgSrc = bg.type === 'image' ? (bg as ImageBg).src : ''

  useEffect(() => {
    if (!bgSrc) { setBgImage(null); return }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => setBgImage(img)
    img.onerror = () => setBgImage(null)
    img.src = toFileUrl(bgSrc)
  }, [bgSrc])

  const sceneFunc = useCallback((ctx: Konva.Context) => {
    const raw = (ctx as unknown as { _context: CanvasRenderingContext2D })._context
    drawBackground(raw, bg, w, h, time, bgImage)
  }, [bg, w, h, time, bgImage])

  return <Shape width={w} height={h} sceneFunc={sceneFunc} listening={false} />
}
