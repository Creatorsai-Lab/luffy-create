import type Konva from 'konva'

export function captureStageToCanvas(
  stage: Konva.Stage,
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
) {
  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  ctx.clearRect(0, 0, width, height)
  for (const layer of stage.getLayers()) {
    ctx.drawImage(layer.getNativeCanvasElement(), 0, 0, width, height)
  }
  return canvas
}
