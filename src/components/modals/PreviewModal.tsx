import { useRef, useEffect, useState } from 'react'
import type Konva from 'konva'
import { X, Play, Pause, SkipBack } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import { buildTransitionTimeline, getTransitionFrameState, type TransitionTimeline } from '../../utils/transitionTiming'
import SceneStage from '../canvas/SceneStage'
import { blendVolumes, captureLayers, drawBlend, type BlendState } from '../canvas/transitionComposite'
import type { AudioElement, Scene, Project } from '../../types/editor'
import { toFileUrl } from '../../utils/pathUtils'
import { prewarmUpcomingVideos } from '../../engine/videoPreloader'
import { getMorphFrame } from '../../engine/morph'
import { fitPreviewToViewport } from '../../utils/previewLayout'
import { useShallow } from 'zustand/react/shallow'
import {
  applyAudioEffects,
  audioPreviewPlaybackRate,
  disposeAudioEffectGraphs,
  ensureAudioEffectGraph,
  syncAudioPlaybackSettings,
  type AudioEffectGraphMap,
} from '../../utils/audioEffects'

export default function PreviewModal() {
  const { project, setPreviewOpen } = useEditorStore(useShallow(s => ({ project: s.project, setPreviewOpen: s.setPreviewOpen })))
  const [playhead, setPlayhead] = useState(0)
  const [isPlaying, setIsPlaying] = useState(true)
  const rafRef = useRef<number>(0)
  const lastRef = useRef<number>(0)
  const playheadRef = useRef(0)                                      // always-current value for RAF closures
  const audioPlayersRef = useRef<Map<string, HTMLAudioElement>>(new Map())
  const audioGraphsRef = useRef<AudioEffectGraphMap>(new Map())

  // Use the whole viewport while preserving the project aspect ratio.
  const { width: PREVIEW_W, height: PREVIEW_H } = fitPreviewToViewport(
    project?.width ?? 16,
    project?.height ?? 9,
    window.innerWidth,
    window.innerHeight,
  )
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

  // Load + seek upcoming video clips (split/trimmed clips, next scene) ahead of the cut.
  useEffect(() => {
    if (project && isPlaying) prewarmUpcomingVideos(project, playhead)
  }, [project, isPlaying, playhead])

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
            applyAudioEffects(graph, audio, ph - absStart)   // clip time drives fade in/out
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

  const timeline = buildTransitionTimeline(project.scenes, project.endTransition)
  const frameState = getTransitionFrameState(timeline, playhead)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-[#040105]/90 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) setPreviewOpen(false) }}
    >
      {/* Prominent close */}
      <button
        onClick={() => setPreviewOpen(false)}
        className="absolute top-4 right-4 z-10 flex items-center justify-center w-9 h-9 rounded-full bg-black/60 border border-white/20 text-white hover:bg-white/20 transition-colors"
      >
        <X size={18} />
      </button>

      {/* Edge-to-edge stage */}
      <div
        className="relative overflow-hidden"
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

      {/* Playback rail overlays the video so it never reduces preview size. */}
      <div className="absolute left-0 top-1/2 z-10 flex -translate-y-1/2 flex-col items-center gap-3 rounded-r-xl border-y border-r border-white/15 bg-black/65 px-2 py-3 text-white backdrop-blur-sm">
        <button
          onClick={() => { playheadRef.current = 0; setPlayhead(0); setIsPlaying(false) }}
          className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/15 transition-colors"
          title="Restart"
        >
          <SkipBack size={14} />
        </button>
        <button
          onClick={() => setIsPlaying(v => !v)}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-editor-accent hover:bg-editor-accent-hover transition-colors"
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause size={13} /> : <Play size={13} />}
        </button>
        <input
          type="range" min={0} max={totalDur} step={0.05}
          value={playhead}
          onChange={e => { const v = Number(e.target.value); playheadRef.current = v; setPlayhead(v) }}
          className="h-40 w-4 accent-editor-accent"
          style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
          aria-label="Preview position"
        />
        <span className="w-12 text-center text-[10px] leading-tight tabular-nums text-white/80">
          {playhead.toFixed(1)}s<br />{totalDur.toFixed(1)}s
        </span>
      </div>
    </div>
  )
}

/** Seconds before a cut that the next scene's stage is mounted, so its videos are ready. */
const LEAD = 0.6

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
  timeline: TransitionTimeline
  width: number
  height: number
  scale: number
  playhead: number
  isPlaying: boolean
}) {
  const stagesRef = useRef(new Map<string, Konva.Stage>())

  const morph = frameState.kind === 'transition' && frameState.transition.type === 'morph' ? getMorphFrame(project, playhead) : null
  if (morph) {
    return (
      <SceneStage project={project} scene={morph.scene} localTime={morph.localTime} globalTime={playhead}
        width={width} height={height} scale={scale} isPlaying={isPlaying} style={{ position: 'absolute', inset: 0 }} />
    )
  }

  const blend = frameState.kind === 'transition' ? frameState : null
  const volumes = blend ? blendVolumes(blend) : null
  // The scenes on stage, keyed by scene so a scene keeps its stage (and its playing videos) across a cut.
  const stages: Array<{ scene: Scene; localTime: number; playing: boolean; volume: number; visible: boolean }> = []
  if (frameState.kind === 'scene') {
    const scene = project.scenes[frameState.sceneIndex]
    stages.push({ scene, localTime: frameState.sceneTime, playing: isPlaying, volume: 1, visible: true })
    const next = timeline[frameState.sceneIndex + 1]
    const current = timeline[frameState.sceneIndex]
    if (isPlaying && next && next.transition.type !== 'none' && next.transition.type !== 'morph' && current.endTime - playhead < LEAD) {
      stages.push({ scene: project.scenes[next.sceneIndex], localTime: 0, playing: false, volume: 0, visible: false })
    }
  } else if (blend) {
    if (blend.fromSceneIndex >= 0) stages.push({ scene: project.scenes[blend.fromSceneIndex], localTime: blend.fromLocalTime, playing: isPlaying, volume: volumes!.from, visible: false })
    if (blend.toSceneIndex >= 0) stages.push({ scene: project.scenes[blend.toSceneIndex], localTime: blend.toLocalTime, playing: isPlaying, volume: volumes!.to, visible: false })
  }

  return (
    <>
      {stages.map(({ scene, localTime, playing, volume, visible }) => (
        <SceneStage
          key={scene.id}
          refSetter={stage => { if (stage) stagesRef.current.set(scene.id, stage); else stagesRef.current.delete(scene.id) }}
          project={project}
          scene={scene}
          localTime={localTime}
          globalTime={playhead}
          width={width}
          height={height}
          scale={scale}
          isPlaying={playing}
          keepPlaying
          mediaVolume={volume}
          quietLoading={!visible}
          style={{ position: 'absolute', inset: 0, opacity: visible ? 1 : 0 }}
        />
      ))}
      {blend && <BlendCanvas state={blend} stages={stagesRef} width={width} height={height} />}
    </>
  )
}

/** The transition frame, redrawn every animation frame from the live stages. */
function BlendCanvas({ state, stages, width, height }: {
  state: BlendState
  stages: React.MutableRefObject<Map<string, Konva.Stage>>
  width: number
  height: number
}) {
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const scratch = useRef({ main: document.createElement('canvas'), other: document.createElement('canvas') })
  const latest = useRef(state)
  latest.current = state
  const dpr = window.devicePixelRatio || 1
  const W = Math.round(width * dpr)
  const H = Math.round(height * dpr)

  useEffect(() => {
    let frame = 0
    const draw = () => {
      const ctx = canvas.current?.getContext('2d')
      const s = latest.current
      const mainId = s.phase === 'outro' ? s.fromSceneId : s.toSceneId
      const main = mainId ? stages.current.get(mainId) : undefined
      const other = s.phase === 'cut' && s.fromSceneId ? stages.current.get(s.fromSceneId) : undefined
      if (ctx && main) {
        drawBlend(ctx, W, H, s,
          captureLayers(main.getLayers(), scratch.current.main),
          other ? captureLayers(other.getLayers(), scratch.current.other) : null)
      }
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [stages, W, H])

  return (
    <canvas ref={canvas} width={W} height={H}
      style={{ position: 'absolute', inset: 0, width, height, zIndex: 2, pointerEvents: 'none' }} />
  )
}
