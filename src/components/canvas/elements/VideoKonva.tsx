import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Group, Rect, Shape } from 'react-konva'
import type Konva from 'konva'
import type { SlideDir, VideoElement } from '../../../types/editor'
import { getVideoClipState } from '../../../utils/videoClip'
import { playbackSpeedAt } from '../../../utils/speedCurve'
import { cropAt, punchedCrop } from '../../../utils/cropKeys'
import { videoRegistry } from '../../../engine/videoRegistry'
import { createVideoFor, isAtFrame, loadVideoAt, releaseVideo, seekVideo, takeWarmVideo } from '../../../engine/videoPreloader'
import { perspectiveHitFunc } from '../../../engine/perspectiveUtils'
import { drawMedia, drawMediaInPerspective, type MediaSource } from './mediaDraw'

/** The video's frame on screen, with the crop it shows (a reframed clip's crop follows the frame; a jump-cut part may be punched in). */
function videoSource(video: HTMLVideoElement, el: VideoElement): MediaSource {
  return {
    image: video,
    width: video.videoWidth,
    height: video.videoHeight,
    crop: punchedCrop(cropAt(el.crop, el.cropKeys, video.currentTime), el.punchIn),
    time: video.currentTime,
  }
}

interface Props {
  el: VideoElement
  konvaProps: Record<string, unknown>
  localTime?: number   // scene-local seconds — the video is seeked to this
  syncToTime?: boolean
  playbackActive?: boolean
  /** The scene's length: past it the clip keeps playing (the outgoing scene of a transition). */
  sceneEnd?: number
  /** Multiplies the clip's volume (sound fading through a transition). */
  volumeScale?: number
  /** Pool / registry key when a second copy of the clip is on screen (default: the element id). */
  mediaKey?: string
  /** Draw nothing while loading instead of the dashed placeholder (hidden copies). */
  quietLoading?: boolean
  /** Timeline seconds (beat-synced effects). */
  globalTime?: number
  sceneDuration?: number
  wipeProgress?: number
  wipeDir?: SlideDir
}

export default function VideoKonva({ el, konvaProps, localTime = 0, syncToTime = true, playbackActive = false, sceneEnd, volumeScale = 1, mediaKey, quietLoading = false, globalTime = 0, sceneDuration = 0, wipeProgress = 1, wipeDir }: Props) {
  const key = mediaKey ?? el.id
  const sceneEndRef = useRef(sceneEnd)
  sceneEndRef.current = sceneEnd
  const videoRef  = useRef<HTMLVideoElement | null>(null)
  const shapeRef  = useRef<Konva.Shape | null>(null)
  const rafRef    = useRef<number>(0)
  // Reused every frame for the perspective source (avoids a new canvas per draw).
  const perspectiveScratchRef = useRef<HTMLCanvasElement | null>(null)
  const [loaded, setLoaded] = useState(false)

  function redraw() {
    requestAnimationFrame(() => {
      shapeRef.current?.getLayer()?.batchDraw()
    })
  }

  const elRef = useRef(el)
  elRef.current = el
  const localTimeRef = useRef(localTime)
  localTimeRef.current = localTime

  // Source time this clip should show first — the trimmed in-point for a split
  // clip, not source time 0.
  const initialSourceTime = () => {
    const clip = getVideoClipState(elRef.current, localTimeRef.current, { sceneEnd: sceneEndRef.current })
    return clip.visible ? clip.sourceTime : (elRef.current.startTime ?? 0)
  }

  // Create (or take a prewarmed) video element. Layout effect so an already
  // seeked warm video is shown in the same paint as the clip's first frame.
  // The video is only marked loaded once it sits on the right frame, so the
  // stage never paints source time 0 before jumping to the trim point.
  useLayoutEffect(() => {
    let cancelled = false
    const warm = takeWarmVideo(key, el.src)
    const video = warm?.video ?? createVideoFor(el)
    video.loop         = el.loop
    video.muted        = el.muted
    video.volume       = Math.max(0, Math.min(1, el.volume * volumeScale))
    video.playbackRate = el.playbackRate

    const onSeeked = () => redraw()
    video.addEventListener('seeked', onSeeked)

    const markReady = (ok: boolean) => {
      if (cancelled || !ok) return
      videoRef.current = video
      setLoaded(true)
    }

    const tolerance = playbackActive ? 0.25 : 0.015
    if (warm?.isReady && isAtFrame(video, initialSourceTime(), tolerance)) {
      markReady(true)
    } else {
      const ready = warm ? warm.ready : loadVideoAt(video, initialSourceTime)
      ready
        .then(ok => ok && !cancelled ? seekVideo(video, initialSourceTime()) : ok)
        .then(markReady)
    }

    return () => {
      cancelled = true
      video.removeEventListener('seeked', onSeeked)
      videoRef.current = null
      cancelAnimationFrame(rafRef.current)
      setLoaded(false)
      releaseVideo(elRef.current, video, key)
    }
  }, [el.src])

  // Expose the video to export/preview helpers only once it shows the right frame.
  useLayoutEffect(() => {
    const v = videoRef.current
    if (!loaded || !v) return
    videoRegistry.register(key, v)
    return () => { videoRegistry.unregister(key) }
  }, [loaded, key])

  // Sync mutable props without reloading
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.volume        = Math.max(0, Math.min(1, el.volume * volumeScale))
    v.playbackRate  = el.playbackRate
    v.loop          = el.loop
    v.muted         = el.muted
  }, [el.volume, el.playbackRate, el.loop, el.muted, volumeScale])

  // Drive per-frame redraws from the video's own play/pause/ended events
  useEffect(() => {
    const v = videoRef.current
    if (!v || !loaded) return

    const startLoop = () => {
      cancelAnimationFrame(rafRef.current)
      const tick = () => {
        shapeRef.current?.getLayer()?.batchDraw()
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    const stopLoop = () => {
      cancelAnimationFrame(rafRef.current)
      redraw()
    }

    v.addEventListener('play',  startLoop)
    v.addEventListener('pause', stopLoop)
    v.addEventListener('ended', stopLoop)

    return () => {
      v.removeEventListener('play',  startLoop)
      v.removeEventListener('pause', stopLoop)
      v.removeEventListener('ended', stopLoop)
      cancelAnimationFrame(rafRef.current)
    }
  }, [loaded])

  // Seek the video to the clip-adjusted source time.
  useEffect(() => {
    const v = videoRef.current
    if (!v || !loaded || !syncToTime) return

    const clip = getVideoClipState(el, localTime, { sceneEnd })
    if (!clip.visible) {
      if (!v.paused) v.pause()
      redraw()
      return
    }

    const dur = v.duration || el.sourceDuration || 0
    if (!dur) { redraw(); return }

    let target = clip.sourceTime
    target = Math.max(0, Math.min(target, dur - 0.03))

    if (playbackActive) {
      // A speed curve or freeze frame: follow it with the playback speed (the sound keeps its
      // pitch), holding the picture while frozen, and keep closer to the expected frame.
      const curved = Boolean(el.speedCurve || el.freeze)
      if (curved) {
        const speed = playbackSpeedAt(el, clip.clipLocalTime)
        if (speed < 0.06) {
          if (!v.paused) v.pause()
          if (Math.abs(v.currentTime - target) > 0.02) v.currentTime = target
          else redraw()
          return
        }
        const rate = Math.min(16, Math.max(0.0625, speed))
        if (Math.abs(v.playbackRate - rate) > 0.01) v.playbackRate = rate
      }
      if (Math.abs(v.currentTime - target) > (curved ? 0.12 : 0.25)) v.currentTime = target
      if (v.paused) v.play().catch(() => {
        if (Math.abs(v.currentTime - target) > 0.015) v.currentTime = target
        else redraw()
      })
      else redraw()
      return
    }

    if (!v.paused) v.pause()
    if (Math.abs(v.currentTime - target) > 0.015) {
      v.currentTime = target
    } else {
      redraw()
    }
  }, [localTime, loaded, syncToTime, playbackActive, sceneEnd, el.loop, el.startTime, el.duration, el.timelineX, el.playbackRate, el.sourceDuration, el.speedCurve, el.freeze])

  if (!loaded || !videoRef.current) {
    // During playback an unready clip draws nothing rather than flashing the
    // dashed edit-mode placeholder at the cut.
    if (playbackActive || quietLoading) return <Group {...konvaProps} />
    return (
      <Group {...konvaProps}>
        <Rect
          width={el.width}
          height={el.height}
          fill="#1a1a2e"
          stroke="#4a4a5a"
          strokeWidth={2}
          dash={[5, 5]}
          cornerRadius={el.cornerRadius}
        />
      </Group>
    )
  }

  const video = videoRef.current
  const drawContext = { key, localTime, globalTime, sceneDuration: sceneDuration || el.duration || 0, wipeProgress, wipeDir }

  return (
    <Shape
      ref={shapeRef}
      {...konvaProps}
      width={el.width}
      height={el.height}
      hitFunc={el.perspectivePts ? perspectiveHitFunc(el.perspectivePts) : (ctx, shape) => {
        ctx.beginPath(); ctx.rect(0, 0, el.width, el.height); ctx.closePath(); ctx.fillStrokeShape(shape)
      }}
      sceneFunc={(ctx) => {
        const raw = (ctx as unknown as { _context: CanvasRenderingContext2D })._context
        if (!video.videoWidth) return
        if (el.perspectivePts) {
          drawMediaInPerspective(raw, el, videoSource(video, el), drawContext, perspectiveScratchRef.current ??= document.createElement('canvas'))
        } else {
          drawMedia(raw, el, videoSource(video, el), drawContext)
        }
      }}
    />
  )
}
