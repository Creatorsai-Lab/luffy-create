import { useEffect, useRef, useState, useCallback } from 'react'
import { Shape, Rect, Group, Text } from 'react-konva'
import type Konva from 'konva'
import type { ImageElement, SlideDir } from '../../../types/editor'
import { toFileUrl } from '../../../utils/pathUtils'
import { drawPerspectiveWarp, perspectiveHitFunc } from '../../../engine/perspectiveUtils'
import { buildCssFilter, applyCanvasAdjustments, drawGrain, drawVignette } from '../../../engine/imageFilters'
import { drawBoxShadow } from '../../../engine/boxShadow'
import { drawMediaBorder, drawPerspectiveQuadBorder } from '../../../engine/borderRenderer'
import { drawMediaWithEffects, mediaEffectRequiresAnimation, type MediaDrawFns } from '../../../engine/mediaEffects'
import { decodeGif, getGifFrameAtTime, type GifData } from '../../../engine/gifDecoder'
import { keyedFrame } from '../../../engine/keying'

// ── Draw-function factories ──────────────────────────────────────────────────

/** Draws `source` cropped to el.crop — or its keyed copy when the image has a green screen / background removal. */
function makeCropDrawFns(source: HTMLImageElement | HTMLCanvasElement, sourceW: number, sourceH: number, el: ImageElement, time: number): MediaDrawFns {
  const cropX = (el.crop?.x ?? 0) * sourceW
  const cropY = (el.crop?.y ?? 0) * sourceH
  const cropW = (el.crop?.w ?? 1) * sourceW
  const cropH = (el.crop?.h ?? 1) * sourceH
  const keyed = sourceW ? keyedFrame(el.id, el.keying, source, sourceW, sourceH, { x: cropX, y: cropY, w: cropW, h: cropH }, time) : null
  const image: CanvasImageSource = keyed ?? source
  const sx = keyed ? 0 : cropX
  const sy = keyed ? 0 : cropY
  const sw = keyed ? keyed.width : cropW
  const sh = keyed ? keyed.height : cropH

  return {
    drawBase: (ctx, dx = 0, dy = 0, dw = el.width, dh = el.height) => {
      ctx.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh)
    },
    drawSlice: (ctx, sourceY, sourceH, destX, destY, destW, destH) => {
      ctx.drawImage(image, sx, sy + (sourceY / el.height) * sh, sw, (sourceH / el.height) * sh, destX, destY, destW, destH)
    },
  }
}

function makeImageDrawFns(img: HTMLImageElement, el: ImageElement): MediaDrawFns {
  return makeCropDrawFns(img, img.naturalWidth, img.naturalHeight, el, 0)
}

function makeGifDrawFns(frameCanvas: HTMLCanvasElement, el: ImageElement, time: number): MediaDrawFns {
  return makeCropDrawFns(frameCanvas, frameCanvas.width, frameCanvas.height, el, time)
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  el: ImageElement
  konvaProps: Record<string, unknown>
  textProgress?: number
  wipeProgress?: number
  wipeDir?: SlideDir
  localTime?: number
}

export default function ImageKonva({ el, konvaProps, textProgress = 1, wipeProgress = 1, wipeDir, localTime = 0 }: Props) {
  const shapeRef = useRef<Konva.Shape | null>(null)
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [gifData, setGifData] = useState<GifData | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [offscreen, setOffscreen] = useState<HTMLCanvasElement | null>(null)
  const isGif = /\.gif(?:$|[?#])/i.test(el.src)
  const dynamicPerspective = isGif || mediaEffectRequiresAnimation(el)

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

  /** Get draw functions for the current source (GIF frame or static image). */
  const getCurrentDrawFns = useCallback((): MediaDrawFns | null => {
    if (isGif) {
      const frame = getGifFrame()
      return frame ? makeGifDrawFns(frame, el, localTime) : null
    }
    return img ? makeImageDrawFns(img, el) : null
  }, [isGif, getGifFrame, img, el, localTime])

  /** Render the image (with effects) for the perspective warp, into `target` when given. */
  function buildPerspectiveSource(target?: HTMLCanvasElement) {
    const fns = getCurrentDrawFns()
    if (!fns) return null
    const canvas = target ?? document.createElement('canvas')
    if (canvas.width !== el.width) canvas.width = el.width
    if (canvas.height !== el.height) canvas.height = el.height
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.save()
    if (el.cornerRadius > 0) {
      const r = el.cornerRadius, W = el.width, H = el.height
      ctx.beginPath(); ctx.moveTo(r, 0); ctx.arcTo(W,0,W,H,r); ctx.arcTo(W,H,0,H,r)
      ctx.arcTo(0,H,0,0,r); ctx.arcTo(0,0,W,0,r); ctx.closePath(); ctx.clip()
    }
    ctx.filter = buildCssFilter(el) || 'none'
    drawMediaWithEffects(ctx, el, el.width, el.height, localTime, fns)
    if (el.glass) { ctx.filter = 'none'; ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(0,0,el.width,el.height) }
    applyCanvasAdjustments(ctx, el)
    drawGrain(ctx, el)
    drawVignette(ctx, el)
    ctx.restore()
    return canvas
  }

  // Build offscreen canvas for perspective warp. GIFs stay dynamic and rebuild
  // from the live frame during each draw.
  useEffect(() => {
    const hasSource = isGif ? !!(gifData || img) : !!img
    if (!el.perspectivePts || !hasSource || dynamicPerspective) { setOffscreen(null); return }
    setOffscreen(buildPerspectiveSource())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, gifData, el.width, el.height, el.cornerRadius, el.crop,
      el.brightness, el.contrast, el.saturation, el.hueRotate, el.blur, el.glass,
      el.exposure, el.highlights, el.shadows, el.whites, el.blacks,
      el.temperature, el.tint, el.vibrance, el.vignetteEnabled, el.vignetteColor,
      el.vignetteAmount, el.vignetteSize, el.vignetteFade,
      el.grainColor, el.grainSize, el.grainOpacity, el.mediaEffects, el.mediaEffect,
      el.mediaEffectAxis, el.mediaEffectIntensity, el.mediaEffectSpeed,
      el.mediaEffectHardness, el.mediaEffectBlend, el.mediaEffectSize, el.keying,
      !!el.perspectivePts, dynamicPerspective])

  // ── Determine if we have a renderable source ──────────────────────────────
  const hasSource = isGif ? !!(gifData || img) : !!img

  // Perspective warp rendering
  if (el.perspectivePts && (offscreen || (dynamicPerspective && hasSource))) {
    return (
      <Shape
        ref={shapeRef}
        {...konvaProps}
        width={el.width}
        height={el.height}
        hitFunc={perspectiveHitFunc(el.perspectivePts!)}
        sceneFunc={(ctx, _shape) => {
          const raw = (ctx as unknown as { _context: CanvasRenderingContext2D })._context
          drawBoxShadow(raw, el.boxShadow, el.width, el.height, el.cornerRadius)
          const source = dynamicPerspective
            ? buildPerspectiveSource(perspectiveScratchRef.current ??= document.createElement('canvas'))
            : offscreen
          if (source) drawPerspectiveWarp(raw, source, el.perspectivePts!, el.width, el.height)
          drawPerspectiveQuadBorder(raw, el, localTime)
        }}
      />
    )
  }

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

  return (
    <Shape
      ref={shapeRef}
      {...konvaProps}
      width={el.width}
      height={el.height}
      hitFunc={(ctx, shape) => {
        ctx.beginPath()
        ctx.rect(0, 0, el.width, el.height)
        ctx.closePath()
        ctx.fillStrokeShape(shape)
      }}
      sceneFunc={(ctx, shape) => {
        const raw = (ctx as unknown as { _context: CanvasRenderingContext2D })._context

        raw.save()

  if (wipeDir && wipeProgress < 1) {
    // Wipe animation: the clip rectangle grows from the starting edge
    // Direction indicates which side the wipe "enters" from
    // left: wipe enters from left (clip starts at x=0, grows right)
    // right: wipe enters from right (clip starts at x=width*(1-progress), grows left)
    // up: wipe enters from top (clip starts at y=0, grows down)
    // down: wipe enters from bottom (clip starts at y=height*(1-progress), grows up)
    const clipX = wipeDir === 'left' ? el.width * (1 - wipeProgress) : 0
    const clipY = wipeDir === 'up'   ? el.height * (1 - wipeProgress) : 0
    const clipW = (wipeDir === 'left' || wipeDir === 'right') ? el.width * wipeProgress : el.width
    const clipH = (wipeDir === 'up'   || wipeDir === 'down')  ? el.height * wipeProgress : el.height
    
    raw.beginPath()
    raw.rect(clipX, clipY, Math.max(0, clipW), Math.max(0, clipH))
    raw.clip()
  }

        drawBoxShadow(raw, el.boxShadow, el.width, el.height, el.cornerRadius)

        // Clip to rounded rect if needed
        if (el.cornerRadius > 0) {
          const r = el.cornerRadius
          const w = el.width
          const h = el.height
          raw.beginPath()
          raw.moveTo(r, 0)
          raw.arcTo(w, 0, w, h, r)
          raw.arcTo(w, h, 0, h, r)
          raw.arcTo(0, h, 0, 0, r)
          raw.arcTo(0, 0, w, 0, r)
          raw.closePath()
          raw.clip()
        }

        // Get draw functions for the current source
        const fns = getCurrentDrawFns()
        if (fns) {
          raw.filter = buildCssFilter(el) || 'none'
          drawMediaWithEffects(raw, el, el.width, el.height, localTime, fns)
        }
        if (el.glass) {
          raw.filter = 'none'
          raw.fillStyle = 'rgba(255,255,255,0.18)'
          raw.fillRect(0, 0, el.width, el.height)
        }
        applyCanvasAdjustments(raw, el)
        drawGrain(raw, el)
        drawVignette(raw, el)

        raw.restore()
        drawMediaBorder(raw, el, el.width, el.height, localTime)

        ctx.fillStrokeShape(shape)
      }}
    />
  )
}
