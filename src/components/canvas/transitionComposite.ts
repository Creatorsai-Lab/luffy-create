/**
 * Shared pieces for drawing a transition frame from live stages: copying a
 * stage's (or some layers') pixels at full resolution, and picking which
 * picture is "from" and which "to" for cuts, intros (from black) and outros
 * (to black).
 */
import type Konva from 'konva'
import { renderTransition, solidCanvas } from '../../engine/transitionRenderer'
import type { TransitionFrameState } from '../../utils/transitionTiming'

/** Copies the layers' own canvases (device pixels, so it stays sharp) into `canvas`, sized to the first layer. */
export function captureLayers(layers: Konva.Layer[], canvas: HTMLCanvasElement): HTMLCanvasElement {
  const first = layers[0]?.getNativeCanvasElement()
  const w = Math.max(1, first?.width ?? 1)
  const h = Math.max(1, first?.height ?? 1)
  if (canvas.width !== w) canvas.width = w
  if (canvas.height !== h) canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  ctx.clearRect(0, 0, w, h)
  for (const layer of layers) {
    if (layer.isVisible()) ctx.drawImage(layer.getNativeCanvasElement(), 0, 0, w, h)
  }
  return canvas
}

export type BlendState = Extract<TransitionFrameState, { kind: 'transition' }>

/**
 * Draws the transition frame into `ctx` (width × height device pixels):
 * `main` is the scene the playhead is in, `other` the outgoing scene of a cut.
 */
export function drawBlend(ctx: CanvasRenderingContext2D, width: number, height: number, state: BlendState, main: CanvasImageSource, other: CanvasImageSource | null) {
  const black = solidCanvas('#000000')
  const from = state.phase === 'cut' ? other ?? main : state.phase === 'intro' ? black : main
  const to = state.phase === 'outro' ? black : main
  renderTransition({
    ctx, width, height,
    progress: state.progress,
    transition: state.transition,
    fromCanvas: from,
    toCanvas: to,
    seed: ((state.toSceneIndex + 2) * 0.6180339887) % 1,
  })
}

/** How loud each side's clips play: the outgoing sound fades out while the incoming fades in. */
export function blendVolumes(state: BlendState) {
  const p = Math.max(0, Math.min(1, state.progress))
  return { from: 1 - p, to: p }
}
