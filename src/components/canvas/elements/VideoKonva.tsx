import { useEffect, useRef, useState } from 'react'
import { Group, Rect, Shape } from 'react-konva'
import type Konva from 'konva'
import type { VideoElement } from '../../../types/editor'
import { toFileUrl } from '../../../utils/pathUtils'
import { getVideoClipState } from '../../../utils/videoClip'
import { videoRegistry } from '../../../engine/videoRegistry'
import { buildCssFilter, applyCanvasAdjustments } from '../../../engine/imageFilters'
import { drawBoxShadow, drawInnerShadow } from '../../../engine/boxShadow'
import { drawPerspectiveWarp } from '../../../engine/perspectiveUtils'
import { drawMediaBorder, drawPerspectiveQuadBorder } from '../../../engine/borderRenderer'

interface Props {
  el: VideoElement
  konvaProps: Record<string, unknown>
  localTime?: number   // scene-local seconds — the video is seeked to this
  syncToTime?: boolean
  playbackActive?: boolean
}

export default function VideoKonva({ el, konvaProps, localTime = 0, syncToTime = true, playbackActive = false }: Props) {
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
    if (!v || !loaded || !syncToTime) return

    const clip = getVideoClipState(el, localTime)
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
      if (Math.abs(v.currentTime - target) > 0.25) v.currentTime = target
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
  }, [localTime, loaded, syncToTime, playbackActive, el.loop, el.startTime, el.duration, el.timelineX, el.playbackRate, el.sourceDuration])

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

        const w = el.width, h = el.height
        const frame = el.frameType ?? 'none'

        if (el.perspectivePts) {
          const source = document.createElement('canvas')
          source.width = w
          source.height = h
          const sourceCtx = source.getContext('2d')!
          const vw = video.videoWidth || w
          const vh = video.videoHeight || h

          sourceCtx.save()
          if (frame === 'circle') {
            sourceCtx.beginPath()
            sourceCtx.arc(w / 2, h / 2, Math.min(w, h) / 2, 0, Math.PI * 2)
            sourceCtx.closePath()
            sourceCtx.clip()
          } else if (frame === 'triangle') {
            sourceCtx.beginPath()
            sourceCtx.moveTo(w / 2, 0)
            sourceCtx.lineTo(w, h)
            sourceCtx.lineTo(0, h)
            sourceCtx.closePath()
            sourceCtx.clip()
          } else if (el.cornerRadius > 0) {
            const r = Math.min(el.cornerRadius, w / 2, h / 2)
            sourceCtx.beginPath()
            sourceCtx.moveTo(r, 0)
            sourceCtx.arcTo(w, 0, w, h, r)
            sourceCtx.arcTo(w, h, 0, h, r)
            sourceCtx.arcTo(0, h, 0, 0, r)
            sourceCtx.arcTo(0, 0, w, 0, r)
            sourceCtx.closePath()
            sourceCtx.clip()
          }
          sourceCtx.filter = buildCssFilter(el) || 'none'
          if (el.crop) {
            sourceCtx.drawImage(
              video,
              el.crop.x * vw, el.crop.y * vh,
              el.crop.w * vw, el.crop.h * vh,
              0, 0, w, h
            )
          } else {
            sourceCtx.drawImage(video, 0, 0, w, h)
          }
          if (el.glass) {
            sourceCtx.filter = 'none'
            sourceCtx.fillStyle = 'rgba(255,255,255,0.18)'
            sourceCtx.fillRect(0, 0, w, h)
          }
          applyCanvasAdjustments(sourceCtx, el)
          sourceCtx.restore()

          raw.filter = 'none'
          drawBoxShadow(raw, el.boxShadow, w, h, frame === 'none' ? el.cornerRadius : Math.min(w, h) / 2)
          drawPerspectiveWarp(raw, source, el.perspectivePts, w, h)
          drawInnerShadow(raw, el.innerShadow, w, h, frame === 'none' ? el.cornerRadius : Math.min(w, h) / 2)
          drawPerspectiveQuadBorder(raw, el, localTime)
          raw.restore()
          return
        }

        drawBoxShadow(raw, el.boxShadow, w, h, frame === 'none' ? el.cornerRadius : Math.min(w, h) / 2)

        // 1. Frame Shape Mask
        if (frame === 'circle') {
          raw.beginPath()
          raw.arc(w / 2, h / 2, Math.min(w, h) / 2, 0, Math.PI * 2)
          raw.closePath()
          raw.clip()
        } else if (frame === 'triangle') {
          raw.beginPath()
          raw.moveTo(w / 2, 0)
          raw.lineTo(w, h)
          raw.lineTo(0, h)
          raw.closePath()
          raw.clip()
        } else if (el.cornerRadius > 0) {
          const r = el.cornerRadius
          raw.beginPath()
          raw.moveTo(r, 0)
          raw.arcTo(w, 0, w, h, r)
          raw.arcTo(w, h, 0, h, r)
          raw.arcTo(0, h, 0, 0, r)
          raw.arcTo(0, 0, w, 0, r)
          raw.closePath()
          raw.clip()
        }

        // 2. Setup Effects & Adjustments Filters
        const effect = el.videoEffect ?? 'none'
        const intensity = el.videoEffectIntensity ?? 0.5

        let filterStr = buildCssFilter(el) || 'none'
        if (effect === 'lensBlur' && intensity > 0) {
          const blurVal = Math.round(15 * intensity)
          if (filterStr === 'none') filterStr = `blur(${blurVal}px)`
          else filterStr += ` blur(${blurVal}px)`
        }
        if (effect === 'comic' && intensity > 0) {
          const val = 1.4 + intensity * 0.8
          if (filterStr === 'none') filterStr = `contrast(${val}) saturate(${val})`
          else filterStr += ` contrast(${val}) saturate(${val})`
        }
        raw.filter = filterStr

        // 3. Camera Shake translation
        if (effect === 'shake' && intensity > 0) {
          const time = localTime * 35
          const shakeX = Math.sin(time) * Math.cos(time * 0.8) * 16 * intensity
          const shakeY = Math.cos(time * 1.2) * Math.sin(time * 0.7) * 16 * intensity
          raw.translate(shakeX, shakeY)
        }

        // 4. Draw Video (with Distortion support)
        const vw = video.videoWidth  || el.width
        const vh = video.videoHeight || el.height
        if (effect === 'distortion' && intensity > 0) {
          const numSlices = 25
          const sliceH = h / numSlices
          const amplitude = 12 * intensity
          const time = localTime * 8 // animation speed
          
          for (let s = 0; s < numSlices; s++) {
            const sx = Math.sin(s / 3 + time) * amplitude
            raw.drawImage(
              video,
              0, s * (vh / numSlices), vw, vh / numSlices,
              sx, s * sliceH, w, sliceH
            )
          }
        } else {
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
        }

        // 5. Comic ink outlines
        if (effect === 'comic' && intensity > 0) {
          raw.save()
          raw.filter = 'none'
          raw.strokeStyle = '#000000'
          raw.lineWidth = 4 * intensity
          if (frame === 'circle') {
            raw.beginPath()
            raw.arc(w / 2, h / 2, Math.min(w, h) / 2, 0, Math.PI * 2)
            raw.stroke()
          } else if (frame === 'triangle') {
            raw.beginPath()
            raw.moveTo(w / 2, 0)
            raw.lineTo(w, h)
            raw.lineTo(0, h)
            raw.closePath()
            raw.stroke()
          } else {
            const r = el.cornerRadius
            raw.beginPath()
            raw.moveTo(r, 0)
            raw.arcTo(w, 0, w, h, r)
            raw.arcTo(w, h, 0, h, r)
            raw.arcTo(0, h, 0, 0, r)
            raw.arcTo(0, 0, w, 0, r)
            raw.closePath()
            raw.stroke()
          }
          raw.restore()
        }

        // 6. Retro scanlines and noise
        if (effect === 'retro' && intensity > 0) {
          raw.save()
          raw.filter = 'none'
          raw.fillStyle = 'rgba(0, 0, 0, 0.12)'
          for (let y = 0; y < h; y += 3) {
            raw.fillRect(0, y, w, 1)
          }
          raw.fillStyle = 'rgba(255, 255, 255, 0.04)'
          const grainCount = Math.round(w * h * 0.0003 * intensity)
          for (let k = 0; k < grainCount; k++) {
            const gx = Math.random() * w
            const gy = Math.random() * h
            raw.fillRect(gx, gy, 1.5, 1.5)
          }
          raw.restore()
        }

        // 7. Strobe flash
        if (effect === 'flash' && intensity > 0) {
          raw.save()
          raw.filter = 'none'
          const flashAlpha = (0.5 + 0.5 * Math.sin(localTime * 18)) * 0.35 * intensity
          raw.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`
          raw.fillRect(0, 0, w, h)
          raw.restore()
        }

        // 8. Glass overlay
        if (el.glass) {
          raw.filter = 'none'
          raw.fillStyle = 'rgba(255,255,255,0.18)'
          raw.fillRect(0, 0, el.width, el.height)
        }

        // 9. Standard Color Adjustments
        applyCanvasAdjustments(raw, el)

        // 10. Color Grading presets
        const grading = el.colorGrading ?? 'none'
        if (grading !== 'none') {
          raw.save()
          raw.filter = 'none'
          if (grading === 'warm') {
            raw.globalCompositeOperation = 'color'
            raw.fillStyle = 'rgba(255, 130, 0, 0.12)'
            raw.fillRect(0, 0, w, h)
          } else if (grading === 'cool') {
            raw.globalCompositeOperation = 'color'
            raw.fillStyle = 'rgba(0, 100, 255, 0.12)'
            raw.fillRect(0, 0, w, h)
          } else if (grading === 'vintage') {
            raw.globalCompositeOperation = 'color'
            raw.fillStyle = 'rgba(180, 135, 80, 0.25)'
            raw.fillRect(0, 0, w, h)
            raw.globalCompositeOperation = 'multiply'
            raw.fillStyle = 'rgba(240, 220, 200, 0.08)'
            raw.fillRect(0, 0, w, h)
          } else if (grading === 'cyberpunk') {
            const grad = raw.createLinearGradient(0, 0, w, h)
            grad.addColorStop(0, 'rgba(255, 0, 128, 0.18)')
            grad.addColorStop(1, 'rgba(0, 255, 255, 0.18)')
            raw.globalCompositeOperation = 'color'
            raw.fillStyle = grad
            raw.fillRect(0, 0, w, h)
          } else if (grading === 'cinematic') {
            raw.globalCompositeOperation = 'difference'
            raw.fillStyle = 'rgba(0, 40, 60, 0.08)'
            raw.fillRect(0, 0, w, h)
            raw.globalCompositeOperation = 'color'
            raw.fillStyle = 'rgba(255, 140, 40, 0.08)'
            raw.fillRect(0, 0, w, h)
          } else if (grading === 'monochrome') {
            raw.globalCompositeOperation = 'color'
            raw.fillStyle = 'rgba(128, 128, 128, 1)'
            raw.fillRect(0, 0, w, h)
          } else if (grading === 'noir') {
            raw.globalCompositeOperation = 'color'
            raw.fillStyle = 'rgba(128, 128, 128, 1)'
            raw.fillRect(0, 0, w, h)
            raw.globalCompositeOperation = 'overlay'
            raw.fillStyle = 'rgba(0,0,0,0.2)'
            raw.fillRect(0, 0, w, h)
          } else if (grading === 'sunset') {
            const grad = raw.createLinearGradient(0, h, w, 0)
            grad.addColorStop(0, 'rgba(253, 94, 83, 0.2)')
            grad.addColorStop(1, 'rgba(255, 180, 0, 0.15)')
            raw.globalCompositeOperation = 'color'
            raw.fillStyle = grad
            raw.fillRect(0, 0, w, h)
          }
          raw.restore()
        }

        // 11. Vignette overlay
        if (el.vignetteEnabled && (el.vignetteAmount ?? 0.5) > 0) {
          raw.save()
          raw.filter = 'none'
          const cx = w / 2
          const cy = h / 2
          const rOuter = Math.sqrt(cx * cx + cy * cy)
          const grad = raw.createRadialGradient(cx, cy, rOuter * 0.35, cx, cy, rOuter)
          
          let color = el.vignetteColor || '#000000'
          let rgb = '0,0,0'
          if (color.startsWith('#')) {
            const hex = color.replace('#', '')
            const r = parseInt(hex.slice(0, 2), 16) || 0
            const g = parseInt(hex.slice(2, 4), 16) || 0
            const b = parseInt(hex.slice(4, 6), 16) || 0
            rgb = `${r},${g},${b}`
          } else if (color === 'white') {
            rgb = '255,255,255'
          }
          
          grad.addColorStop(0, `rgba(${rgb}, 0)`)
          grad.addColorStop(1, `rgba(${rgb}, ${el.vignetteAmount ?? 0.5})`)
          
          raw.globalCompositeOperation = 'source-over'
          raw.fillStyle = grad
          raw.fillRect(0, 0, w, h)
          raw.restore()
        }

        drawInnerShadow(raw, el.innerShadow, w, h, frame === 'none' ? el.cornerRadius : Math.min(w, h) / 2)

        raw.restore()
        drawMediaBorder(raw, el, w, h, localTime, frame)

        ctx.fillStrokeShape(shape)
      }}
    />
  )
}
