/**
 * Background-removal inference in its own process (Electron utilityProcess),
 * so the editor never waits on it. CPU only, a few threads — made for
 * low-end computers. Loaded on demand and shut down by the main process
 * when idle, so it holds no memory while unused.
 *
 * Requests (from the main process, one at a time per id):
 * - segment:   320×320 RGBA → the subject mask (Silueta), 320×320 bytes.
 * - samEncode: an RGB picture, long side 1024 → keeps its embedding under `key`.
 * - samDecode: a click (in that picture's pixels) → the clicked object's mask, w×h bytes.
 */
import { createRequire } from 'node:module'

type Ort = typeof import('onnxruntime-node')
type Session = import('onnxruntime-node').InferenceSession
type Tensor = import('onnxruntime-node').Tensor

export type CutoutRequest =
  | { id: number; type: 'segment'; rgba: Uint8Array }
  | { id: number; type: 'samEncode'; key: string; rgb: Uint8Array; width: number; height: number }
  | { id: number; type: 'samDecode'; key: string; x: number; y: number; width: number; height: number }

export type CutoutResponse =
  | { id: number; ok: true; mask?: Uint8Array; width?: number; height?: number }
  | { id: number; ok: false; error: string }

const SEG_SIZE = 320
const MEAN = [0.485, 0.456, 0.406]
const STD = [0.229, 0.224, 0.225]

const ortPath = process.env.LUFFY_ORT_PATH || 'onnxruntime-node'
const modelDir = process.env.LUFFY_CUTOUT_MODELS || ''
const threads = Math.max(1, Number(process.env.LUFFY_CUTOUT_THREADS) || 2)
let ort: Ort | null = null
const sessions = new Map<string, Promise<Session>>()
const embeddings = new Map<string, Tensor>()

function session(name: string) {
  ort ??= createRequire(__filename)(ortPath) as Ort
  let s = sessions.get(name)
  if (!s) {
    s = ort.InferenceSession.create(`${modelDir}/${name}`, {
      executionProviders: ['cpu'], intraOpNumThreads: threads, interOpNumThreads: 1, graphOptimizationLevel: 'all',
    })
    s.catch(() => sessions.delete(name))
    sessions.set(name, s)
  }
  return s
}

async function segment(rgba: Uint8Array) {
  const s = await session('silueta.onnx')
  const n = SEG_SIZE * SEG_SIZE
  const data = new Float32Array(3 * n)
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) data[c * n + i] = (rgba[i * 4 + c] / 255 - MEAN[c]) / STD[c]
  }
  const out = await s.run({ [s.inputNames[0]]: new ort!.Tensor('float32', data, [1, 3, SEG_SIZE, SEG_SIZE]) })
  const pred = out[s.outputNames[0]].data as Float32Array
  // U²-Net's output is relative: stretch it to the full 0–255 range.
  let lo = Infinity, hi = -Infinity
  for (const v of pred) { if (v < lo) lo = v; if (v > hi) hi = v }
  const k = hi > lo ? 255 / (hi - lo) : 0
  const mask = new Uint8Array(n)
  for (let i = 0; i < n; i++) mask[i] = Math.round((pred[i] - lo) * k)
  return { mask, width: SEG_SIZE, height: SEG_SIZE }
}

async function samEncode(key: string, rgb: Uint8Array, width: number, height: number) {
  const s = await session('mobilesam_encoder.onnx')
  const input = new ort!.Tensor('float32', Float32Array.from(rgb), [height, width, 3])
  const out = await s.run({ input_image: input })
  embeddings.delete(key)
  embeddings.set(key, out.image_embeddings as Tensor)
  // A few pictures at a time is plenty (one per element being edited).
  while (embeddings.size > 3) embeddings.delete(embeddings.keys().next().value as string)
  return {}
}

async function samDecode(key: string, x: number, y: number, width: number, height: number) {
  const emb = embeddings.get(key)
  if (!emb) throw new Error('Pick the subject again — the picture was not analysed yet.')
  const s = await session('mobilesam_decoder.onnx')
  const T = ort!.Tensor
  const out = await s.run({
    image_embeddings: emb,
    // The click, plus SAM's "no box" padding point.
    point_coords: new T('float32', Float32Array.from([x, y, 0, 0]), [1, 2, 2]),
    point_labels: new T('float32', Float32Array.from([1, -1]), [1, 2]),
    mask_input: new T('float32', new Float32Array(256 * 256), [1, 1, 256, 256]),
    has_mask_input: new T('float32', Float32Array.from([0]), [1]),
    orig_im_size: new T('float32', Float32Array.from([height, width]), [2]),
  })
  const masks = out.masks.data as Float32Array
  const iou = out.iou_predictions.data as Float32Array
  const count = out.masks.dims[1], n = width * height
  const at = Math.min(height - 1, Math.max(0, Math.round(y))) * width + Math.min(width - 1, Math.max(0, Math.round(x)))
  // SAM offers the click's part, a larger part and the whole object: a click means "this object",
  // so take the largest candidate that contains the click and that SAM is confident about.
  let best = -1, bestArea = -1, bestIou = -1
  for (let c = 0; c < count; c++) {
    if (masks[c * n + at] <= 0) continue
    let area = 0
    for (let i = c * n; i < (c + 1) * n; i++) if (masks[i] > 0) area++
    if (iou[c] >= 0.75 && area > bestArea) { best = c; bestArea = area }
  }
  if (best < 0) for (let c = 0; c < count; c++) if (iou[c] > bestIou) { best = c; bestIou = iou[c] }
  const mask = new Uint8Array(n)
  for (let i = 0; i < n; i++) mask[i] = Math.round(255 / (1 + Math.exp(-masks[best * n + i])))
  return { mask, width, height }
}

async function handle(req: CutoutRequest): Promise<CutoutResponse> {
  try {
    const result = req.type === 'segment' ? await segment(req.rgba)
      : req.type === 'samEncode' ? await samEncode(req.key, req.rgb, req.width, req.height)
      : await samDecode(req.key, req.x, req.y, req.width, req.height)
    return { id: req.id, ok: true, ...result }
  } catch (error) {
    return { id: req.id, ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

// Requests run one after another: the CPU threads are shared, and order keeps the editor's frames in sequence.
let queue: Promise<unknown> = Promise.resolve()
process.parentPort.on('message', (event: { data: CutoutRequest }) => {
  const req = event.data
  queue = queue.then(() => handle(req)).then(res => process.parentPort.postMessage(res))
})
