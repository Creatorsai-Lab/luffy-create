import { useEffect, useRef, useState } from 'react'
import { Shape, Rect, Group, Text } from 'react-konva'
import type Konva from 'konva'
import type { ImageElement, SlideDir } from '../../../types/editor'
import { toFileUrl } from '../../../utils/pathUtils'
import { drawPerspectiveWarp } from '../../../engine/perspectiveUtils'
import { buildCssFilter, applyCanvasAdjustments, drawVignette } from '../../../engine/imageFilters'
import { drawBoxShadow } from '../../../engine/boxShadow'
import { drawMediaBorder, drawPerspectiveQuadBorder } from '../../../engine/borderRenderer'
import { drawMediaWithEffects, mediaEffectRequiresAnimation, type MediaDrawFns } from '../../../engine/mediaEffects'

function makeImageDrawFns(img: HTMLImageElement, el: ImageElement): MediaDrawFns {
  const cropX = (el.crop?.x ?? 0) * img.naturalWidth
  const cropY = (el.crop?.y ?? 0) * img.naturalHeight
  const cropW = (el.crop?.w ?? 1) * img.naturalWidth
  const cropH = (el.crop?.h ?? 1) * img.naturalHeight

  return {
    drawBase: (ctx, dx = 0, dy = 0, dw = el.width, dh = el.height) => {
      ctx.drawImage(img, cropX, cropY, cropW, cropH, dx, dy, dw, dh)
    },
    drawSlice: (ctx, sourceY, sourceH, destX, destY, destW, destH) => {
      const sy = cropY + (sourceY / el.height) * cropH
      const sh = (sourceH / el.height) * cropH
      ctx.drawImage(img, cropX, sy, cropW, sh, destX, destY, destW, destH)
    },
  }
}

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
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [offscreen, setOffscreen] = useState<HTMLCanvasElement | null>(null)
  const isGif = /\.gif(?:$|[?#])/i.test(el.src)
  const dynamicPerspective = isGif || mediaEffectRequiresAnimation(el)

  useEffect(() => {
    setLoading(true)
    setError(false)

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
  }, [el.src])

  function buildPerspectiveSource() {
    if (!img) return null
    const canvas = document.createElement('canvas')
    canvas.width = el.width; canvas.height = el.height
    const ctx = canvas.getContext('2d')!
    ctx.save()
    if (el.cornerRadius > 0) {
      const r = el.cornerRadius, W = el.width, H = el.height
      ctx.beginPath(); ctx.moveTo(r, 0); ctx.arcTo(W,0,W,H,r); ctx.arcTo(W,H,0,H,r)
      ctx.arcTo(0,H,0,0,r); ctx.arcTo(0,0,W,0,r); ctx.closePath(); ctx.clip()
    }
    ctx.filter = buildCssFilter(el) || 'none'
    drawMediaWithEffects(ctx, el, el.width, el.height, localTime, makeImageDrawFns(img, el))
    if (el.glass) { ctx.filter = 'none'; ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(0,0,el.width,el.height) }
    applyCanvasAdjustments(ctx, el)
    drawVignette(ctx, el)
    ctx.restore()
    return canvas
  }

  // Animated GIFs advance internally; keep the Konva layer redrawing so the
  // current frame is sampled instead of freezing on the first drawn frame.
  useEffect(() => {
    if ((!isGif && !mediaEffectRequiresAnimation(el)) || !img || error) return
    let raf = 0
    const tick = () => {
      shapeRef.current?.getLayer()?.batchDraw()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [
    isGif, img, error,
    el.mediaEffects, el.mediaEffect, el.mediaEffectIntensity, el.mediaEffectSpeed, el.mediaEffectHardness,
    el.mediaEffectDirection, el.mediaEffectBlend, el.mediaEffectColor,
  ])

  // Build offscreen canvas for perspective warp. GIFs stay dynamic and rebuild
  // from the live image frame during each draw.
  useEffect(() => {
    if (!el.perspectivePts || !img || dynamicPerspective) { setOffscreen(null); return }
    setOffscreen(buildPerspectiveSource())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, el.width, el.height, el.cornerRadius, el.crop,
      el.brightness, el.contrast, el.saturation, el.hueRotate, el.blur, el.glass,
      el.exposure, el.highlights, el.shadows, el.whites, el.blacks,
      el.temperature, el.tint, el.vibrance, el.vignetteEnabled, el.vignetteColor,
      el.vignetteAmount, el.vignetteSize, el.vignetteFade, el.mediaEffects, el.mediaEffect,
      el.mediaEffectAxis, el.mediaEffectIntensity, el.mediaEffectSpeed,
      el.mediaEffectHardness, el.mediaEffectBlend, el.mediaEffectSize,
      !!el.perspectivePts, dynamicPerspective])

  // Perspective warp rendering
  if (el.perspectivePts && (offscreen || (dynamicPerspective && img))) {
    return (
      <Shape
        ref={shapeRef}
        {...konvaProps}
        width={el.width}
        height={el.height}
        hitFunc={(ctx, shape) => {
          ctx.beginPath(); ctx.rect(0, 0, el.width, el.height); ctx.closePath(); ctx.fillStrokeShape(shape)
        }}
        sceneFunc={(ctx, _shape) => {
          const raw = (ctx as unknown as { _context: CanvasRenderingContext2D })._context
          drawBoxShadow(raw, el.boxShadow, el.width, el.height, el.cornerRadius)
          const source = dynamicPerspective ? buildPerspectiveSource() : offscreen
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

  if (error || !img) {
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

        raw.filter = buildCssFilter(el) || 'none'
        drawMediaWithEffects(raw, el, el.width, el.height, localTime, makeImageDrawFns(img, el))
        if (el.glass) {
          raw.filter = 'none'
          raw.fillStyle = 'rgba(255,255,255,0.18)'
          raw.fillRect(0, 0, el.width, el.height)
        }
        applyCanvasAdjustments(raw, el)
        drawVignette(raw, el)

        raw.restore()
        drawMediaBorder(raw, el, el.width, el.height, localTime)

        ctx.fillStrokeShape(shape)
      }}
    />
  )
}
