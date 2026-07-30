import type { TransitionType, SlideDir } from '../types/editor'
import { getDirectionalTransitionState, type DirectionalTransitionType } from './directionalTransitions'

export interface TransitionRenderOptions {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  progress: number  // 0 to 1
  type: TransitionType
  direction?: SlideDir
  speed?: number
  hardness?: number
  fromCanvas: HTMLCanvasElement
  toCanvas: HTMLCanvasElement
}

/**
 * Renders a transition between two scene canvases
 * @param opts Transition rendering options
 */
export function renderTransition(opts: TransitionRenderOptions): void {
  const {
    ctx, width, height, progress, type, direction, speed, hardness,
    fromCanvas, toCanvas,
  } = opts
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

    case 'flashBlur':
    case 'flickerShake':
      renderDirectionalTransition(
        ctx, width, height, type, p, direction ?? 'right',
        speed ?? 1, hardness ?? 50, fromCanvas, toCanvas,
      )
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
  // Keep the outgoing scene fully drawn and dissolve the incoming scene over it.
  // Fading both layers against the cleared canvas creates a dark blink.
  ctx.globalAlpha = 1
  ctx.drawImage(from, 0, 0, w, h)

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
  const toScale = 0.985 + t * 0.015

  // Keep the source scene stable. The zoom transition should feel like the
  // incoming scene eases forward, not like both scenes lurch at the cut.
  ctx.globalAlpha = 1
  ctx.drawImage(from, 0, 0, w, h)

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
  // Morph is a layout merge, not an extra camera move. If matching media is
  // resized/repositioned between scenes, this dissolve reveals that real layout
  // change without adding a separate whole-canvas zoom.
  ctx.globalAlpha = 1
  ctx.drawImage(from, 0, 0, w, h)

  ctx.globalAlpha = t
  ctx.drawImage(to, 0, 0, w, h)

  ctx.globalAlpha = 1
}

function renderDirectionalTransition(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  type: DirectionalTransitionType,
  progress: number,
  direction: SlideDir,
  speed: number,
  hardness: number,
  from: HTMLCanvasElement,
  to: HTMLCanvasElement,
): void {
  const state = getDirectionalTransitionState(type, progress, direction, speed, hardness)
  const image = state.scene === 'from' ? from : to
  const span = Math.min(w, h)
  const travel = span * (type === 'flashBlur' ? 0.075 : 0.035)
  const dx = state.offsetX * travel
  const dy = state.offsetY * travel
  const activity = Math.min(1, Math.max(
    Math.abs(state.offsetX), Math.abs(state.offsetY),
    Math.abs(state.streakX), Math.abs(state.streakY), state.light,
  ))
  const scale = 1 + activity * 0.05

  const draw = (x: number, y: number) => {
    ctx.save()
    ctx.translate(w / 2 + x, h / 2 + y)
    ctx.scale(scale, scale)
    ctx.translate(-w / 2, -h / 2)
    ctx.drawImage(image, 0, 0, w, h)
    ctx.restore()
  }

  ctx.globalAlpha = 1
  ctx.filter = type === 'flashBlur'
    ? `blur(${(activity * (2 + Math.max(0, Math.min(100, hardness)) * 0.08)).toFixed(2)}px)`
    : 'none'
  draw(dx, dy)

  if (type === 'flashBlur') {
    ctx.filter = `blur(${(activity * 5).toFixed(2)}px)`
    for (let sample = 1; sample <= 5; sample++) {
      const amount = sample / 5
      ctx.globalAlpha = 0.1 * (1 - amount * 0.45)
      draw(
        dx - state.streakX * span * 0.08 * amount,
        dy - state.streakY * span * 0.08 * amount,
      )
    }
  }

  ctx.globalAlpha = 1
  ctx.filter = 'none'
  if (state.light > 0) {
    ctx.fillStyle = `rgba(255,255,255,${state.light})`
    ctx.fillRect(0, 0, w, h)
  }
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
