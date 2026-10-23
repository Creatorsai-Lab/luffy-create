import { useEffect, useRef, useState, useCallback } from 'react'
import { Shape, Rect, Group, Text } from 'react-konva'
import type Konva from 'konva'
import type { ImageElement, SlideDir } from '../../../types/editor'
import { toFileUrl } from '../../../utils/pathUtils'
import { perspectiveHitFunc } from '../../../engine/perspectiveUtils'
import { decodeGif, getGifFrameAtTime, type GifData } from '../../../engine/gifDecoder'
import { drawMedia, drawMediaInPerspective, type MediaSource } from './mediaDraw'

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  el: ImageElement
  konvaProps: Record<string, unknown>
  textProgress?: number
  wipeProgress?: number
  wipeDir?: SlideDir
  localTime?: number
  /** Timeline seconds (beat-synced effects). */
  globalTime?: number
  /** The scene's length — how long effects without an end run. */
  sceneDuration?: number
  /** Cache key for a second copy of the item. */
  mediaKey?: string
}

export default function ImageKonva({ el, konvaProps, wipeProgress = 1, wipeDir, localTime = 0, globalTime = 0, sceneDuration = 0, mediaKey }: Props) {
  const shapeRef = useRef<Konva.Shape | null>(null)
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [gifData, setGifData] = useState<GifData | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)
  const isGif = /\.gif(?:$|[?#])/i.test(el.src)

  // Reused for perspective sources rebuilt on every draw (GIF / animated effects).
  const perspectiveScratchRef = useRef<HTMLCanvasElement | null>(null)

  // ── Load image or GIF frames ───────────────────────────────────────────────
  useEffect(() => {
    setLoading(true)
    setError(false)
    setGifData(null)
    setImg(null)

    if (isGif) {
      // Show the browser-decoded first frame immediately while the frame-accurate
      // decoder prepares the canvas frames used by preview and export.
      let cancelled = false
      const image = new window.Image()
      image.onload = () => {
        if (cancelled) return
        setImg(image)
        setLoading(false)
      }
      image.onerror = () => {
        if (cancelled) return
        setError(true)
        setLoading(false)
      }
      image.src = toFileUrl(el.src)

      decodeGif(el.src)
        .then(data => {
          if (cancelled) return
          console.log(`[ImageKonva] GIF decoded: ${data.frames.length} frames, ${data.totalDuration}ms total`, el.src)
          setGifData(data)
          setError(false)
          setLoading(false)
        })
        .catch(err => {
          if (cancelled) return
          console.error('[ImageKonva] Failed to decode GIF:', el.src, err)
          // Keep the native animated image usable if frame decoding fails.
          const nativeImageReady = image.complete && image.naturalWidth > 0
          setError(!nativeImageReady)
          setLoading(!nativeImageReady)
        })
      return () => {
        cancelled = true
        image.onload = null
        image.onerror = null
      }
    } else {
      // Standard image loading
      const image = new window.Image()
      image.onload = () => {
        console.log('[ImageKonva] Image loaded successfully:', el.src)
        setImg(image)
        setError(false)
        setLoading(false)
      }
      image.onerror = (e) => {
        console.error('[ImageKonva] Failed to load image:', el.src, e)
        setError(true)
        setLoading(false)
      }
      const imageUrl = toFileUrl(el.src)
      image.src = imageUrl
      console.log('[ImageKonva] Loading image from:', imageUrl)
      return () => {
        image.onload = null
        image.onerror = null
      }
    }
  }, [el.src, isGif])

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Get the current GIF frame canvas based on localTime. */
  const getGifFrame = useCallback((): HTMLCanvasElement | null => {
    if (!gifData) return null
    // Use localTime (scene-local seconds) converted to milliseconds
    return getGifFrameAtTime(gifData, localTime * 1000)
  }, [gifData, localTime])

  /** The picture now: the GIF frame for this moment, or the still image. */
  const currentSource = useCallback((): MediaSource | null => {
    if (isGif) {
      const frame = getGifFrame()
      if (frame) return { image: frame, width: frame.width, height: frame.height, crop: el.crop, time: localTime }
    }
    return img ? { image: img, width: img.naturalWidth, height: img.naturalHeight, crop: el.crop, time: 0 } : null
  }, [isGif, getGifFrame, img, el.crop, localTime])

  // ── Determine if we have a renderable source ──────────────────────────────
  const hasSource = isGif ? !!(gifData || img) : !!img

  if (loading) {
    return (
      <Group {...konvaProps}>
        <Rect
          width={el.width}
          height={el.height}
          fill="#1a1a2e"
          stroke="#4a4a5a"
          strokeWidth={2}
          cornerRadius={el.cornerRadius}
          dash={[5, 5]}
        />
        <Text
          x={0}
          y={el.height / 2 - 10}
          width={el.width}
          text="Loading..."
          fontSize={14}
          fill="#888"
          align="center"
        />
      </Group>
    )
  }

  if (error || !hasSource) {
    return (
      <Group {...konvaProps}>
        <Rect
          width={el.width}
          height={el.height}
          fill="#2a1a1a"
          stroke="#aa4444"
          strokeWidth={2}
          cornerRadius={el.cornerRadius}
        />
        <Text
          x={0}
          y={el.height / 2 - 10}
          width={el.width}
          text="Image Error"
          fontSize={14}
          fill="#ff6666"
          align="center"
        />
      </Group>
    )
  }

  const drawContext = { key: mediaKey ?? el.id, localTime, globalTime, sceneDuration, wipeProgress, wipeDir }

  return (
    <Shape
      ref={shapeRef}
      {...konvaProps}
      width={el.width}
      height={el.height}
      hitFunc={el.perspectivePts ? perspectiveHitFunc(el.perspectivePts) : (ctx, shape) => {
        ctx.beginPath()
        ctx.rect(0, 0, el.width, el.height)
        ctx.closePath()
        ctx.fillStrokeShape(shape)
      }}
      sceneFunc={(ctx) => {
        const raw = (ctx as unknown as { _context: CanvasRenderingContext2D })._context
        const source = currentSource()
        if (!source) return
        if (el.perspectivePts) drawMediaInPerspective(raw, el, source, drawContext, perspectiveScratchRef.current ??= document.createElement('canvas'))
        else drawMedia(raw, el, source, drawContext)
      }}
    />
  )
}
