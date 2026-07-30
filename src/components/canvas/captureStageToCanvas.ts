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

export function refreshStageSnapshot(
  cache: Map<string, HTMLCanvasElement>,
  key: string,
  stage: Konva.Stage,
  width: number,
  height: number,
  createCanvas = () => document.createElement('canvas'),
) {
  const canvas = cache.get(key) ?? createCanvas()
  captureStageToCanvas(stage, canvas, width, height)
  rememberRecentSnapshot(cache, key, canvas)
  return canvas
}

export function rememberRecentSnapshot<T>(
  cache: Map<string, T>,
  key: string,
  value: T,
  limit = 2,
) {
  cache.delete(key)
  cache.set(key, value)
  const removed: string[] = []
  while (cache.size > Math.max(1, limit)) {
    const oldest = cache.keys().next().value as string
    cache.delete(oldest)
    removed.push(oldest)
  }
  return removed
}
