import type { SceneTransition, SlideDir } from '../types/editor'
import {
  getDirectionalTransitionGeometry,
  getDirectionalTransitionState,
  type DirectionalTransitionType,
} from './directionalTransitions'
import { ease, transitionDef } from './transitions/catalog'
import { renderGlTransition } from './transitions/glRenderer'

export interface TransitionRenderOptions {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  /** Linear progress 0–1 through the transition (easing is applied here). */
  progress: number
  transition: SceneTransition
  fromCanvas: CanvasImageSource
  toCanvas: CanvasImageSource
  /** Varies glitch blocks and light leaks between cuts; the same seed draws the same frame. */
  seed?: number
}

/**
 * Draws one frame of a scene transition into `ctx`. The editor, Preview and
 * export all call this, so a transition looks the same everywhere.
 */
export function renderTransition(opts: TransitionRenderOptions): void {
  const { ctx, width, height, progress, transition, fromCanvas, toCanvas } = opts
  const p = clamp01(progress)
  const def = transitionDef(transition.type)

  ctx.save()
  ctx.globalAlpha = 1
  ctx.filter = 'none'
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, width, height)

  if (transition.type === 'none') {
    ctx.drawImage(toCanvas, 0, 0, width, height)
  } else if (def.render === 'directional') {
    renderDirectionalTransition(
      ctx, width, height, transition.type as DirectionalTransitionType, p, transition.direction ?? 'right',
      transition.speed ?? 1, transition.hardness ?? 50, fromCanvas, toCanvas,
    )
  } else {
    const eased = ease(p, transition.easing)
    const gl = renderGlTransition({
      type: transition.type,
      progress: eased,
      direction: transition.direction,
      intensity: transition.intensity ?? def.intensity,
      softness: transition.softness ?? def.softness,
      color: transition.color ?? def.color0,
      seed: opts.seed,
    }, fromCanvas as TexImageSource, toCanvas as TexImageSource, width, height)
    if (gl) ctx.drawImage(gl, 0, 0, width, height)
    else renderFadeTransition(ctx, width, height, eased, fromCanvas, toCanvas)
  }

  ctx.restore()
}

const solids = new Map<string, HTMLCanvasElement>()

/** A small canvas of one colour — the black the video fades in from at the start and out to at the end. */
export function solidCanvas(color = '#000000'): HTMLCanvasElement {
  let canvas = solids.get(color)
  if (!canvas) {
    canvas = document.createElement('canvas')
    canvas.width = 16
    canvas.height = 16
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = color
    ctx.fillRect(0, 0, 16, 16)
    solids.set(color, canvas)
  }
  return canvas
}

// ─── Transition Implementations ──────────────────────────────────────────────

function renderFadeTransition(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  from: CanvasImageSource,
  to: CanvasImageSource
): void {
  // Keep the outgoing scene fully drawn and dissolve the incoming scene over it.
  // Fading both layers against the cleared canvas creates a dark blink.
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
  from: CanvasImageSource,
  to: CanvasImageSource,
): void {
  const state = getDirectionalTransitionState(type, progress, direction, speed, hardness)
  const image = state.scene === 'from' ? from : to
  const geometry = getDirectionalTransitionGeometry(type, state, w, h, hardness)

  const draw = (x: number, y: number) => {
    ctx.save()
    ctx.translate(w / 2 + x, h / 2 + y)
    ctx.scale(geometry.scale, geometry.scale)
    ctx.translate(-w / 2, -h / 2)
    ctx.drawImage(image, 0, 0, w, h)
    ctx.restore()
  }

  ctx.globalAlpha = 1
  ctx.filter = type === 'flashBlur'
    ? `blur(${geometry.blur.toFixed(2)}px)`
    : 'none'
  draw(geometry.dx, geometry.dy)

  if (type === 'flashBlur') {
    ctx.filter = `blur(${geometry.blur.toFixed(2)}px)`
    for (let sample = 1; sample <= 5; sample++) {
      const amount = sample / 5
      ctx.globalAlpha = 0.1 * (1 - amount * 0.45)
      draw(
        geometry.dx - geometry.streakDx * amount,
        geometry.dy - geometry.streakDy * amount,
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
