import { useEffect, useRef, useState } from 'react'
import { Group, Rect, Shape } from 'react-konva'
import type Konva from 'konva'
import type { VideoElement } from '../../../types/editor'
import { toFileUrl } from '../../../utils/pathUtils'
import { getVideoClipState } from '../../../utils/videoClip'
import { videoRegistry } from '../../../engine/videoRegistry'
import { buildCssFilter, applyCanvasAdjustments } from '../../../engine/imageFilters'

interface Props {
  el: VideoElement
  konvaProps: Record<string, unknown>
  localTime?: number   // scene-local seconds — the video is seeked to this
}

export default function VideoKonva({ el, konvaProps, localTime = 0 }: Props) {
  const videoRef  = useRef<HTMLVideoElement | null>(null)
  const shapeRef  = useRef<Konva.Shape | null>(null)
  const rafRef    = useRef<number>(0)
  const [loaded, setLoaded] = useState(false)

  function redraw() {
    requestAnimationFrame(() => {
      shapeRef.current?.getLayer()?.batchDraw()
    })
  }

  // Create video element, load source
  useEffect(() => {
    const video = document.createElement('video')
    video.src          = toFileUrl(el.src)
    video.crossOrigin  = 'anonymous'
    video.loop         = el.loop
    video.muted        = el.muted
    video.volume       = el.volume
    video.playbackRate = el.playbackRate
    video.preload      = 'auto'

    const onReady  = () => { videoRef.current = video; videoRegistry.register(el.id, video); setLoaded(true) }
    const onSeeked = () => redraw()

    video.addEventListener('loadeddata', onReady)
    video.addEventListener('seeked',     onSeeked)

    return () => {
      video.removeEventListener('loadeddata', onReady)
      video.removeEventListener('seeked',     onSeeked)
      video.pause()
      video.src = ''
      videoRegistry.unregister(el.id)
      videoRef.current = null
      cancelAnimationFrame(rafRef.current)
      setLoaded(false)
    }
  }, [el.src])

  // Sync mutable props without reloading
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.volume        = el.volume
    v.playbackRate  = el.playbackRate
    v.loop          = el.loop
    v.muted         = el.muted
  }, [el.volume, el.playbackRate, el.loop, el.muted])

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
    if (!v || !loaded || !v.paused) return

    const clip = getVideoClipState(el, localTime)
    if (!clip.visible) { redraw(); return }

    const dur = v.duration || el.sourceDuration || 0
    if (!dur) { redraw(); return }

    let target = clip.sourceTime
    if (el.loop) target = clip.sourceTime % dur
    target = Math.max(0, Math.min(target, dur - 0.03))

    if (Math.abs(v.currentTime - target) > 0.015) {
      v.currentTime = target
    } else {
      redraw()
    }
  }, [localTime, loaded, el.loop, el.startTime, el.duration, el.timelineX, el.playbackRate, el.sourceDuration])

  if (!loaded || !videoRef.current) {
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

  return (
    <Shape
      ref={shapeRef}
      {...konvaProps}
      width={el.width}
      height={el.height}
      hitFunc={(ctx, shape) => {
        ctx.beginPath(); ctx.rect(0, 0, el.width, el.height); ctx.closePath(); ctx.fillStrokeShape(shape)
      }}
      sceneFunc={(ctx, shape) => {
        const raw = (ctx as unknown as { _context: CanvasRenderingContext2D })._context

        raw.save()

        if (el.cornerRadius > 0) {
          const r = el.cornerRadius, w = el.width, h = el.height
          raw.beginPath()
          raw.moveTo(r, 0)
          raw.arcTo(w, 0, w, h, r)
          raw.arcTo(w, h, 0, h, r)
          raw.arcTo(0, h, 0, 0, r)
          raw.arcTo(0, 0, w, 0, r)
          raw.closePath()
          raw.clip()
        }

        raw.filter = buildCssFilter(el) || 'none'

        const vw = video.videoWidth  || el.width
        const vh = video.videoHeight || el.height
        if (el.crop) {
          raw.drawImage(
            video,
            el.crop.x * vw, el.crop.y * vh,
            el.crop.w * vw, el.crop.h * vh,
            0, 0, el.width, el.height
          )
        } else {
          raw.drawImage(video, 0, 0, el.width, el.height)
        }

        if (el.glass) {
          raw.filter = 'none'
          raw.fillStyle = 'rgba(255,255,255,0.18)'
          raw.fillRect(0, 0, el.width, el.height)
        }

        applyCanvasAdjustments(raw, el)

        raw.restore()

        ctx.fillStrokeShape(shape)
      }}
    />
  )
}
