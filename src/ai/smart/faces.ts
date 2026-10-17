/**
 * Face detection for auto-reframe: MediaPipe's BlazeFace (short range), run
 * fully offline from files bundled with the app (/mediapipe/*.wasm and
 * /models/blaze_face_short_range.tflite). Browser only — the analysis that
 * uses the results (reframe.ts) is pure and tested in Node.
 */
import { FaceDetector } from '@mediapipe/tasks-vision'
import { toFileUrl } from '../../utils/pathUtils'
import type { FaceBox, FaceSample } from './reframe'

let detector: Promise<FaceDetector> | null = null

function getDetector(): Promise<FaceDetector> {
  if (!detector) {
    const at = (path: string) => new URL(path, document.baseURI).href
    detector = FaceDetector.createFromOptions(
      { wasmLoaderPath: at('mediapipe/vision_wasm_internal.js'), wasmBinaryPath: at('mediapipe/vision_wasm_internal.wasm') },
      {
        baseOptions: { modelAssetPath: at('models/blaze_face_short_range.tflite'), delegate: 'CPU' },
        runningMode: 'IMAGE',
        minDetectionConfidence: 0.5,
      },
    ).catch(error => {
      detector = null
      throw new Error(`Face detection could not start: ${error instanceof Error ? error.message : String(error)}`)
    })
  }
  return detector
}

/**
 * Faces in [from, to] of a video file, sampled every `step` seconds (source
 * seconds), plus the file's width / height.
 */
export async function detectFaces(path: string, from: number, to: number, onProgress?: (share: number) => void): Promise<{ aspect: number; samples: FaceSample[] }> {
  const faces = await getDetector()
  const video = document.createElement('video')
  video.crossOrigin = 'anonymous'
  video.muted = true
  video.preload = 'auto'
  video.src = toFileUrl(path)
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve()
    video.onerror = () => reject(new Error('Could not open the video for face detection.'))
  })

  const W = video.videoWidth
  const H = video.videoHeight
  const scale = Math.min(1, 960 / Math.max(W, H))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(W * scale)
  canvas.height = Math.round(H * scale)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const tile = document.createElement('canvas')
  const tileCtx = tile.getContext('2d')!

  // Square tiles across the long side: the model looks at a small square input,
  // so a speaker in a wide shot is found far more reliably in a tile.
  const cw = canvas.width
  const ch = canvas.height
  const side = Math.min(cw, ch)
  const tiles = Math.abs(cw - ch) < side * 0.2 ? [] : [0, 0.5, 1].map(k => cw > ch
    ? { x: Math.round((cw - side) * k), y: 0 }
    : { x: 0, y: Math.round((ch - side) * k) })
  tile.width = side
  tile.height = side

  const detectIn = (source: HTMLCanvasElement, ox: number, oy: number): FaceBox[] =>
    faces.detect(source).detections.flatMap(d => {
      const b = d.boundingBox
      if (!b) return []
      return [{ x: (b.originX + ox) / cw, y: (b.originY + oy) / ch, w: b.width / cw, h: b.height / ch, score: d.categories[0]?.score ?? 0 }]
    })

  const duration = Math.max(0, to - from)
  // About 4 looks a second, at most ~400 for a long clip.
  const step = Math.max(0.25, duration / 400)
  const samples: FaceSample[] = []
  try {
    for (let t = from; t <= to + 1e-6; t += step) {
      await new Promise<void>(resolve => {
        video.onseeked = () => resolve()
        video.currentTime = Math.min(Math.max(0, t), Math.max(0, video.duration - 0.01))
      })
      ctx.drawImage(video, 0, 0, cw, ch)
      const found = detectIn(canvas, 0, 0)
      for (const { x, y } of tiles) {
        tileCtx.drawImage(canvas, x, y, side, side, 0, 0, side, side)
        found.push(...detectIn(tile, x, y))
      }
      samples.push({ t: Math.round(t * 1000) / 1000, faces: dedupe(found) })
      onProgress?.(duration ? (t - from) / duration : 1)
    }
    return { aspect: W / H, samples }
  } finally {
    video.removeAttribute('src')
    video.load()
  }
}

/** The same face found in the whole frame and in a tile: keep the most confident box. */
function dedupe(boxes: FaceBox[]): FaceBox[] {
  const out: FaceBox[] = []
  for (const box of boxes.sort((a, b) => b.score - a.score)) {
    if (!out.some(o => iou(o, box) > 0.3)) out.push(box)
  }
  return out
}

function iou(a: FaceBox, b: FaceBox) {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
  const inter = x * y
  return inter / (a.w * a.h + b.w * b.h - inter)
}
