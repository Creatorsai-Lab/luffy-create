/**
 * Drawing a video or image element: its source cropped (and punched in),
 * keyed (green screen / cut-out), run through the effects engine, then drawn
 * inside its box — always clipped to it, so effects never spill onto the
 * stage — with whole-item motion, shadows, glass, wipe, border and
 * perspective. Shared by VideoKonva and ImageKonva so both behave alike.
 */
import type { ImageElement, SlideDir, VideoElement } from '../../../types/editor'
import { keyedFrame } from '../../../engine/keying'
import { renderFx } from '../../../engine/fx/render'
import { clipTimeOf, effectStack, itemMotion, needsPixelWork } from '../../../engine/fx/stack'
import { drawBoxShadow, drawInnerShadow } from '../../../engine/boxShadow'
import { drawMediaBorder, drawPerspectiveQuadBorder } from '../../../engine/borderRenderer'
import { drawPerspectiveWarp } from '../../../engine/perspectiveUtils'

type Media = VideoElement | ImageElement

export interface MediaSource {
  image: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement
  width: number
  height: number
  /** 0–1 of the source (after punch-in / face following). */
  crop?: { x: number; y: number; w: number; h: number }
  /** Identifies the frame (video time, GIF time, 0 for a still image). */
  time: number
}

export interface MediaDrawContext {
  /** Cache key (a second copy of a clip uses its own). */
  key: string
  /** Scene seconds (drives clip time, item motion and effects). */
  localTime: number
  /** Timeline seconds (beats). */
  globalTime: number
  /** The scene's length — how long an image's effects run when they have no end. */
  sceneDuration: number
  wipeProgress?: number
  wipeDir?: SlideDir
}

/** The picture to draw for the element now: processed by keying and the effects engine when it needs it. */
export function mediaPicture(el: Media, src: MediaSource, c: MediaDrawContext, outScale: number) {
  const crop = src.crop ?? { x: 0, y: 0, w: 1, h: 1 }
  const rect = { x: crop.x * src.width, y: crop.y * src.height, w: crop.w * src.width, h: crop.h * src.height }
  const keyed = src.width ? keyedFrame(c.key, el.keying, src.image, src.width, src.height, rect, src.time) : null
  const picture: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement = keyed ?? src.image
  const pRect = keyed ? { x: 0, y: 0, w: keyed.width, h: keyed.height } : rect
  const stack = effectStack(el)
  if (src.width && needsPixelWork(el, stack)) {
    const processed = renderFx({
      key: c.key,
      el,
      stack,
      picture,
      pictureW: keyed ? keyed.width : src.width,
      pictureH: keyed ? keyed.height : src.height,
      rect: pRect,
      maskSource: src.image,
      maskRect: rect,
      outW: el.width * outScale,
      outH: el.height * outScale,
      clipTime: clipTimeOf(el, c.localTime),
      clipDuration: el.type === 'video' ? el.duration ?? el.sourceDuration ?? c.sceneDuration : c.sceneDuration,
      globalTime: c.globalTime,
      frameTime: src.time,
    })
    if (processed) return { image: processed as CanvasImageSource, sx: 0, sy: 0, sw: processed.width, sh: processed.height }
  }
  return { image: picture as CanvasImageSource, sx: pRect.x, sy: pRect.y, sw: pRect.w, sh: pRect.h }
}

/** The element's outline (frame shape, rounded corners or its box) as the current path. */
function outline(ctx: CanvasRenderingContext2D, el: Media, w: number, h: number) {
  const frame = el.type === 'video' ? el.frameType ?? 'none' : 'none'
  ctx.beginPath()
  if (frame === 'circle') {
    ctx.arc(w / 2, h / 2, Math.min(w, h) / 2, 0, Math.PI * 2)
  } else if (frame === 'triangle') {
    ctx.moveTo(w / 2, 0); ctx.lineTo(w, h); ctx.lineTo(0, h)
  } else if (el.cornerRadius > 0) {
    const r = Math.min(el.cornerRadius, w / 2, h / 2)
    ctx.moveTo(r, 0); ctx.arcTo(w, 0, w, h, r); ctx.arcTo(w, h, 0, h, r); ctx.arcTo(0, h, 0, 0, r); ctx.arcTo(0, 0, w, 0, r)
  } else {
    ctx.rect(0, 0, w, h)
  }
  ctx.closePath()
}

function shapeRadius(el: Media, w: number, h: number) {
  const frame = el.type === 'video' ? el.frameType ?? 'none' : 'none'
  return frame === 'none' ? el.cornerRadius : Math.min(w, h) / 2
}

/** Device pixels per element unit at this point of the canvas (stage zoom × screen density). */
export function pixelScale(ctx: CanvasRenderingContext2D) {
  const t = ctx.getTransform()
  return Math.max(0.05, Math.hypot(t.a, t.b))
}

/** Draws the element (not in perspective) into a Konva scene context. */
export function drawMedia(raw: CanvasRenderingContext2D, el: Media, src: MediaSource, c: MediaDrawContext) {
  const w = el.width
  const h = el.height
  const stack = effectStack(el)
  const motion = itemMotion(stack, clipTimeOf(el, c.localTime), el.type === 'video' ? el.duration ?? c.sceneDuration : c.sceneDuration)
  raw.save()
  // Whole-item motion (float, wiggle, drift) moves the item with its border and shadow.
  if (motion.dx || motion.dy || motion.rotate || motion.scale !== 1) {
    raw.translate(w / 2 + motion.dx * w, h / 2 + motion.dy * h)
    raw.rotate((motion.rotate * Math.PI) / 180)
    raw.scale(motion.scale, motion.scale)
    raw.translate(-w / 2, -h / 2)
  }
  if (c.wipeDir && (c.wipeProgress ?? 1) < 1) {
    const p = Math.max(0, c.wipeProgress ?? 1)
    const x = c.wipeDir === 'left' ? w * (1 - p) : 0
    const y = c.wipeDir === 'up' ? h * (1 - p) : 0
    raw.beginPath()
    raw.rect(x, y, c.wipeDir === 'left' || c.wipeDir === 'right' ? w * p : w, c.wipeDir === 'up' || c.wipeDir === 'down' ? h * p : h)
    raw.clip()
  }
  drawBoxShadow(raw, el.boxShadow, w, h, shapeRadius(el, w, h))
  raw.save()
  outline(raw, el, w, h)
  raw.clip()
  const pic = mediaPicture(el, src, c, pixelScale(raw))
  raw.drawImage(pic.image, pic.sx, pic.sy, pic.sw, pic.sh, 0, 0, w, h)
  if (el.glass) {
    raw.fillStyle = 'rgba(255,255,255,0.18)'
    raw.fillRect(0, 0, w, h)
  }
  drawInnerShadow(raw, el.innerShadow, w, h, shapeRadius(el, w, h))
  raw.restore()
  drawMediaBorder(raw, el, w, h, c.localTime, el.type === 'video' ? el.frameType ?? 'none' : undefined)
  raw.restore()
}

/** Draws the element in perspective: the finished picture is warped onto its four corners. */
export function drawMediaInPerspective(raw: CanvasRenderingContext2D, el: Media, src: MediaSource, c: MediaDrawContext, scratch: HTMLCanvasElement) {
  const w = el.width
  const h = el.height
  if (scratch.width !== Math.round(w)) scratch.width = Math.round(w)
  if (scratch.height !== Math.round(h)) scratch.height = Math.round(h)
  const sctx = scratch.getContext('2d')!
  sctx.clearRect(0, 0, w, h)
  sctx.save()
  outline(sctx, el, w, h)
  sctx.clip()
  const pic = mediaPicture(el, src, c, Math.min(2, pixelScale(raw)))
  sctx.drawImage(pic.image, pic.sx, pic.sy, pic.sw, pic.sh, 0, 0, w, h)
  if (el.glass) {
    sctx.fillStyle = 'rgba(255,255,255,0.18)'
    sctx.fillRect(0, 0, w, h)
  }
  sctx.restore()
  raw.save()
  drawBoxShadow(raw, el.boxShadow, w, h, shapeRadius(el, w, h))
  drawPerspectiveWarp(raw, scratch, el.perspectivePts!, w, h)
  drawInnerShadow(raw, el.innerShadow, w, h, shapeRadius(el, w, h))
  drawPerspectiveQuadBorder(raw, el, c.localTime)
  raw.restore()
}
