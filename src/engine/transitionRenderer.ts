import type { TransitionType, SlideDir } from '../types/editor'

export interface TransitionRenderOptions {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  progress: number  // 0 to 1
  type: TransitionType
  direction?: SlideDir
  fromCanvas: HTMLCanvasElement
  toCanvas: HTMLCanvasElement
}

/**
 * Renders a transition between two scene canvases
 * @param opts Transition rendering options
 */
export function renderTransition(opts: TransitionRenderOptions): void {
  const { ctx, width, height, progress, type, direction, fromCanvas, toCanvas } = opts
  const p = clamp01(progress)
  const e = easeInOutCubic(p)

  // Clear canvas
  ctx.save()
  ctx.globalAlpha = 1
  ctx.filter = 'none'
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, width, height)

  switch (type) {
    case 'none':
      // No transition - just show the new scene
      ctx.drawImage(toCanvas, 0, 0, width, height)
      break

    case 'fade':
      renderFadeTransition(ctx, width, height, e, fromCanvas, toCanvas)
      break

    case 'slide':
      renderPushTransition(ctx, width, height, e, direction ?? 'left', fromCanvas, toCanvas)
      break

    case 'push':
      renderPushTransition(ctx, width, height, e, direction ?? 'left', fromCanvas, toCanvas)
      break

    case 'zoom':
      renderZoomTransition(ctx, width, height, e, fromCanvas, toCanvas)
      break

    case 'wipe':
      renderWipeTransition(ctx, width, height, e, direction ?? 'left', fromCanvas, toCanvas)
      break

    case 'morph':
      renderMorphTransition(ctx, width, height, e, fromCanvas, toCanvas)
      break

    default:
      // Fallback to fade
      renderFadeTransition(ctx, width, height, e, fromCanvas, toCanvas)
  }

  ctx.restore()
}

// ─── Transition Implementations ──────────────────────────────────────────────

function renderFadeTransition(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  from: HTMLCanvasElement,
  to: HTMLCanvasElement
): void {
  // Draw old scene
  ctx.globalAlpha = 1 - t
  ctx.drawImage(from, 0, 0, w, h)
  
  // Draw new scene
  ctx.globalAlpha = t
  ctx.drawImage(to, 0, 0, w, h)
  
  ctx.globalAlpha = 1
}

function renderPushTransition(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  dir: SlideDir,
  from: HTMLCanvasElement,
  to: HTMLCanvasElement
): void {
  // Both scenes move together. `dir` = edge the NEW scene enters from;
  // the old scene exits toward the opposite edge.
  let fromX = 0, fromY = 0, toX = 0, toY = 0

  switch (dir) {
    case 'right':  // new in from right, old out to left
      toX = w * (1 - t);  fromX = -w * t; break
    case 'left':   // new in from left, old out to right
      toX = -w * (1 - t); fromX = w * t;  break
    case 'down':   // new in from bottom, old out to top
      toY = h * (1 - t);  fromY = -h * t; break
    case 'up':     // new in from top, old out to bottom
      toY = -h * (1 - t); fromY = h * t;  break
  }

  fromX = Math.round(fromX)
  fromY = Math.round(fromY)
  toX = Math.round(toX)
  toY = Math.round(toY)
  ctx.drawImage(from, fromX, fromY, w, h)
  ctx.drawImage(to, toX, toY, w, h)
}

function renderZoomTransition(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  from: HTMLCanvasElement,
  to: HTMLCanvasElement
): void {
  // Small, stable center zoom. Large scale deltas feel shaky in an editor canvas.
  const fromScale = 1 + t * 0.035
  const toScale = 0.965 + t * 0.035
  
  // Draw old scene (zooming out and fading)
  ctx.globalAlpha = 1 - t
  ctx.save()
  ctx.translate(w / 2, h / 2)
  ctx.scale(fromScale, fromScale)
  ctx.translate(-w / 2, -h / 2)
  ctx.drawImage(from, 0, 0, w, h)
  ctx.restore()
  
  // Draw new scene (zooming in and fading in)
  ctx.globalAlpha = t
  ctx.save()
  ctx.translate(w / 2, h / 2)
  ctx.scale(toScale, toScale)
  ctx.translate(-w / 2, -h / 2)
  ctx.drawImage(to, 0, 0, w, h)
  ctx.restore()
  
  ctx.globalAlpha = 1
}

function renderWipeTransition(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  dir: SlideDir,
  from: HTMLCanvasElement,
  to: HTMLCanvasElement
): void {
  ctx.drawImage(from, 0, 0, w, h)

  const feather = Math.max(12, Math.min(w, h) * 0.018)
  let x = 0, y = 0, ww = w, hh = h

  switch (dir) {
    case 'left':
      ww = w * t
      break
    case 'right':
      x = w * (1 - t)
      ww = w * t
      break
    case 'up':
      hh = h * t
      break
    case 'down':
      y = h * (1 - t)
      hh = h * t
      break
  }

  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, Math.max(0, ww), Math.max(0, hh))
  ctx.clip()
  ctx.drawImage(to, 0, 0, w, h)
  ctx.restore()

  // Feather only the reveal edge to avoid a hard mechanical curtain line.
  if (t > 0 && t < 1) {
    ctx.save()
    const g = dir === 'left' || dir === 'right'
      ? ctx.createLinearGradient(
          dir === 'left' ? ww - feather : x,
          0,
          dir === 'left' ? ww : x + feather,
          0
        )
      : ctx.createLinearGradient(
          0,
          dir === 'up' ? hh - feather : y,
          0,
          dir === 'up' ? hh : y + feather
        )
    if (dir === 'left' || dir === 'up') {
      g.addColorStop(0, 'rgba(0,0,0,0)')
      g.addColorStop(1, 'rgba(0,0,0,0.22)')
    } else {
      g.addColorStop(0, 'rgba(0,0,0,0.22)')
      g.addColorStop(1, 'rgba(0,0,0,0)')
    }
    ctx.fillStyle = g
    if (dir === 'left') ctx.fillRect(Math.max(0, ww - feather), 0, feather, h)
    if (dir === 'right') ctx.fillRect(x, 0, feather, h)
    if (dir === 'up') ctx.fillRect(0, Math.max(0, hh - feather), w, feather)
    if (dir === 'down') ctx.fillRect(0, y, w, feather)
    ctx.restore()
  }
}

function renderMorphTransition(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  from: HTMLCanvasElement,
  to: HTMLCanvasElement
): void {
  // Stable "smart" morph baseline: no directional drift, no hard push.
  // When matching objects change size between scenes, this reads as a controlled
  // grow/blend instead of a whole-slide shake.
  const drawScaled = (img: HTMLCanvasElement, scale: number, alpha: number) => {
    ctx.globalAlpha = alpha
    ctx.save()
    ctx.translate(w / 2, h / 2)
    ctx.scale(scale, scale)
    ctx.translate(-w / 2, -h / 2)
    ctx.drawImage(img, 0, 0, w, h)
    ctx.restore()
  }

  drawScaled(from, 1 + t * 0.025, 1 - t)
  drawScaled(to, 0.965 + t * 0.035, t)

  ctx.globalAlpha = 1
}

/**
 * Easing function for smooth transitions
 */
export function easeInOutCubic(t: number): number {
  t = clamp01(t)
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function clamp01(t: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0))
}
