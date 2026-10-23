/**
 * Green screen and AI background removal for videos and images, applied per
 * frame where they are drawn (so it shows in the editor, previews and export).
 *
 * - chroma: a WebGL shader makes the key colour transparent, with a soft edge
 *   and spill removal (the screen's colour cast taken off the subject).
 * - person: MediaPipe's selfie segmenter (on-device, Apache-2.0, bundled in
 *   /models) finds the person; the shader turns its mask into a feathered
 *   alpha, and the background can be blurred or filled instead of removed.
 *
 * Results are cached per element and frame, so redraws while paused are free.
 */
import { ImageSegmenter } from '@mediapipe/tasks-vision'
import Konva from 'konva'
import type { MediaKeying } from '../types/editor'
import { hexToRgb, KEYING_DEFAULTS } from '../utils/keying'

/** A rectangle of the source, in source pixels. */
export interface SourceRect { x: number; y: number; w: number; h: number }

type Source = HTMLVideoElement | HTMLImageElement | HTMLCanvasElement

/** Keying that changes the picture (off when missing or unknown). */
export function keyingActive(keying: MediaKeying | undefined): keying is MediaKeying {
  return keying?.mode === 'chroma' || keying?.mode === 'person'
}

// ── Pausing (e.g. while picking the screen colour from the canvas) ───────────

const paused = new Set<string>()

/** Shows an element's original picture until resumed, so its screen colour can be picked. */
export function pauseKeying(elementId: string, pause: boolean) {
  if (pause) paused.add(elementId)
  else paused.delete(elementId)
  redrawStages()
}

function redrawStages() {
  for (const stage of Konva.stages) stage.batchDraw()
}

// ── Person segmentation ──────────────────────────────────────────────────────

let segmenter: Promise<ImageSegmenter> | null = null
let segmenterReady: ImageSegmenter | null = null
let segmenterError: string | null = null

function loadSegmenter(): Promise<ImageSegmenter> {
  if (!segmenter) {
    const at = (path: string) => new URL(path, document.baseURI).href
    segmenter = ImageSegmenter.createFromOptions(
      { wasmLoaderPath: at('mediapipe/vision_wasm_internal.js'), wasmBinaryPath: at('mediapipe/vision_wasm_internal.wasm') },
      {
        baseOptions: { modelAssetPath: at('models/selfie_segmenter.tflite'), delegate: 'CPU' },
        runningMode: 'IMAGE',
        outputCategoryMask: false,
        outputConfidenceMasks: true,
      },
    ).then(ready => {
      segmenterReady = ready
      segmenterError = null
      redrawStages()
      return ready
    }).catch(error => {
      segmenter = null
      segmenterError = error instanceof Error ? error.message : String(error)
      throw new Error(`Background removal could not start: ${segmenterError}`)
    })
  }
  return segmenter
}

/** Why the AI cut-out isn't working, if it failed to start. */
export function personKeyingError() {
  return segmenterError
}

/** Loads what the elements' keying needs before frames are captured (export). */
export async function prepareKeying(elements: Iterable<{ keying?: MediaKeying }>) {
  for (const el of elements) {
    if (el.keying?.mode === 'person') {
      await loadSegmenter()
      return
    }
  }
}

const SEG_SIZE = 384
let segCanvas: HTMLCanvasElement | null = null

/** The person mask of a source rectangle, 0–255 per pixel, at most SEG_SIZE on its long side. */
function personMask(source: Source, rect: SourceRect): { data: Uint8Array; w: number; h: number } | null {
  if (!segmenterReady) {
    loadSegmenter().catch(() => {})
    return null
  }
  const scale = Math.min(1, SEG_SIZE / Math.max(rect.w, rect.h))
  const w = Math.max(16, Math.round(rect.w * scale))
  const h = Math.max(16, Math.round(rect.h * scale))
  segCanvas ??= document.createElement('canvas')
  if (segCanvas.width !== w) segCanvas.width = w
  if (segCanvas.height !== h) segCanvas.height = h
  const ctx = segCanvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(source, rect.x, rect.y, rect.w, rect.h, 0, 0, w, h)
  const result = segmenterReady.segment(segCanvas)
  try {
    const masks = result.confidenceMasks ?? []
    // The selfie model has one mask (person); multi-class models list the person last.
    const mask = masks[masks.length - 1]
    if (!mask) return null
    const values = mask.getAsFloat32Array()
    const data = new Uint8Array(values.length)
    for (let i = 0; i < values.length; i++) data[i] = Math.max(0, Math.min(255, Math.round(values[i] * 255)))
    return { data, w: mask.width, h: mask.height }
  } finally {
    result.close()
  }
}

const maskCache = new Map<string, { stamp: string; mask: { data: Uint8Array; w: number; h: number } }>()

/**
 * The person mask of a frame for an element (cached per element and frame,
 * so keying and body effects share one segmentation). Null while the model
 * loads — the stage redraws when it is ready.
 */
export function personMaskFor(key: string, source: Source, rect: SourceRect, time: number) {
  const stamp = `${time.toFixed(4)}|${rect.x.toFixed(1)},${rect.y.toFixed(1)},${rect.w.toFixed(1)},${rect.h.toFixed(1)}|${source instanceof HTMLImageElement ? source.src : ''}`
  const hit = maskCache.get(key)
  if (hit?.stamp === stamp) return hit.mask
  const mask = personMask(source, rect)
  if (!mask) return null
  maskCache.set(key, { stamp, mask })
  if (maskCache.size > 64) maskCache.delete(maskCache.keys().next().value as string)
  return mask
}

// ── WebGL ────────────────────────────────────────────────────────────────────

const VERTEX = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`

const FRAGMENT = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_image;
uniform sampler2D u_mask;
uniform vec4 u_crop;       // the drawn rectangle, in source uv
uniform vec2 u_texel;      // one source pixel, in uv
uniform float u_mode;      // 0 chroma, 1 person
uniform vec2 u_key;        // key colour's chroma (Cb, Cr)
uniform float u_similarity;
uniform float u_smoothness;
uniform float u_spill;
uniform float u_feather;
uniform vec2 u_maskTexel;

vec2 chroma(vec3 c) {
  return vec2(-0.1687 * c.r - 0.3313 * c.g + 0.5 * c.b, 0.5 * c.r - 0.4187 * c.g - 0.0813 * c.b);
}

void main() {
  vec2 uv = u_crop.xy + v_uv * u_crop.zw;
  vec4 color = texture2D(u_image, uv);
  float alpha = 1.0;
  if (u_mode < 0.5) {
    // Averaging the distance over 3x3 pixels calms noisy, compressed screen edges.
    float d = 0.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        d += distance(chroma(texture2D(u_image, uv + vec2(float(x), float(y)) * u_texel).rgb), u_key);
      }
    }
    d /= 9.0;
    float base = d - u_similarity;
    alpha = pow(clamp(base / u_smoothness, 0.0, 1.0), 1.5);
    float keep = pow(clamp(base / u_spill, 0.0, 1.0), 1.5);
    float luma = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
    color.rgb = mix(vec3(luma), color.rgb, keep);
  } else {
    float m = 0.0;
    float reach = 1.0 + u_feather * 5.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        m += texture2D(u_mask, v_uv + vec2(float(x), float(y)) * u_maskTexel * reach).r;
      }
    }
    m /= 9.0;
    float edge = 0.04 + u_feather * 0.4;
    alpha = smoothstep(0.5 - edge, 0.5 + edge, m);
  }
  alpha *= color.a;
  gl_FragColor = vec4(color.rgb * alpha, alpha);
}`

interface Gl {
  gl: WebGLRenderingContext
  canvas: HTMLCanvasElement
  image: WebGLTexture
  mask: WebGLTexture
  u: Record<string, WebGLUniformLocation | null>
}

let glState: Gl | null = null

function getGl(): Gl | null {
  if (glState) return glState
  const canvas = document.createElement('canvas')
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: false })
  if (!gl) return null
  const compile = (type: number, code: string) => {
    const shader = gl.createShader(type)!
    gl.shaderSource(shader, code)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'shader')
    return shader
  }
  const program = gl.createProgram()!
  gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX))
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT))
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'program')
  gl.useProgram(program)

  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  const pos = gl.getAttribLocation(program, 'a_pos')
  gl.enableVertexAttribArray(pos)
  gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0)

  const texture = (unit: number) => {
    const t = gl.createTexture()!
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_2D, t)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    return t
  }
  const image = texture(0)
  const mask = texture(1)
  const u: Gl['u'] = {}
  for (const name of ['u_image', 'u_mask', 'u_crop', 'u_texel', 'u_mode', 'u_key', 'u_similarity', 'u_smoothness', 'u_spill', 'u_feather', 'u_maskTexel']) {
    u[name] = gl.getUniformLocation(program, name)
  }
  gl.uniform1i(u.u_image, 0)
  gl.uniform1i(u.u_mask, 1)
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
  canvas.addEventListener('webglcontextlost', () => { glState = null })
  glState = { gl, canvas, image, mask, u }
  return glState
}

// ── Per-element frames ───────────────────────────────────────────────────────

interface Entry {
  canvas: HTMLCanvasElement
  stamp: string
  mask: { data: Uint8Array; w: number; h: number; time: number } | null
}

const entries = new Map<string, Entry>()
const MAX_SIDE = 1920
let blurCanvas: HTMLCanvasElement | null = null

/** Forget an element's cached frame (e.g. when it is removed). */
export function releaseKeying(elementId: string) {
  entries.delete(elementId)
}

/**
 * The keyed picture of `rect` of `source` for an element: a canvas the size of
 * the rectangle (at most 1920 px on its long side) with the background made
 * transparent or replaced. Null when the original should be drawn: keying off,
 * paused, or the cut-out model still loading (the stage redraws once it's ready).
 * `time` identifies the frame (video time; images pass 0).
 */
export function keyedFrame(elementId: string, keying: MediaKeying | undefined, source: Source, sourceWidth: number, sourceHeight: number, rect: SourceRect, time: number): HTMLCanvasElement | null {
  if (!keyingActive(keying) || paused.has(elementId) || rect.w < 2 || rect.h < 2) return null
  const scale = Math.min(1, MAX_SIDE / Math.max(rect.w, rect.h))
  const outW = Math.round(rect.w * scale)
  const outH = Math.round(rect.h * scale)
  const stamp = `${time.toFixed(4)}|${rect.x.toFixed(1)},${rect.y.toFixed(1)},${rect.w.toFixed(1)},${rect.h.toFixed(1)}|${outW}x${outH}|${JSON.stringify(keying)}|${source instanceof HTMLImageElement ? source.src : ''}`
  const cached = entries.get(elementId)
  if (cached?.stamp === stamp) return cached.canvas

  let mask: Entry['mask'] = null
  if (keying.mode === 'person') {
    const shared = personMaskFor(elementId, source, rect, time)
    const found = shared ? { ...shared, data: new Uint8Array(shared.data) } : null
    if (!found) return null
    // Blend with the previous frame's mask when this frame follows it, to calm flicker.
    const prev = cached?.mask
    if (prev && prev.w === found.w && prev.h === found.h && Math.abs(prev.time - time) > 0 && Math.abs(prev.time - time) < 0.1) {
      for (let i = 0; i < found.data.length; i++) found.data[i] = Math.round(found.data[i] * 0.7 + prev.data[i] * 0.3)
    }
    mask = { ...found, time }
  }

  const g = getGl()
  if (!g) return null
  const { gl, u } = g
  if (g.canvas.width !== outW) g.canvas.width = outW
  if (g.canvas.height !== outH) g.canvas.height = outH
  gl.viewport(0, 0, outW, outH)
  try {
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, g.image)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
  } catch {
    return null // a source WebGL may not read
  }
  gl.uniform4f(u.u_crop, rect.x / sourceWidth, rect.y / sourceHeight, rect.w / sourceWidth, rect.h / sourceHeight)
  gl.uniform2f(u.u_texel, 1 / sourceWidth, 1 / sourceHeight)

  if (keying.mode === 'chroma') {
    const [r, g2, b] = hexToRgb(keying.color ?? KEYING_DEFAULTS.color)
    gl.uniform1f(u.u_mode, 0)
    gl.uniform2f(u.u_key, -0.1687 * r - 0.3313 * g2 + 0.5 * b, 0.5 * r - 0.4187 * g2 - 0.0813 * b)
    const p = chromaParams(keying)
    gl.uniform1f(u.u_similarity, p.similarity)
    gl.uniform1f(u.u_smoothness, p.smoothness)
    gl.uniform1f(u.u_spill, p.spill)
  } else if (mask) {
    gl.uniform1f(u.u_mode, 1)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, g.mask)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, mask.w, mask.h, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, mask.data)
    gl.uniform1f(u.u_feather, keying.feather ?? KEYING_DEFAULTS.feather)
    gl.uniform2f(u.u_maskTexel, 1 / mask.w, 1 / mask.h)
  }
  gl.clearColor(0, 0, 0, 0)
  gl.clear(gl.COLOR_BUFFER_BIT)
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

  const entry = cached ?? { canvas: document.createElement('canvas'), stamp: '', mask: null }
  if (entry.canvas.width !== outW) entry.canvas.width = outW
  if (entry.canvas.height !== outH) entry.canvas.height = outH
  const ctx = entry.canvas.getContext('2d')!
  ctx.clearRect(0, 0, outW, outH)
  if (keying.mode === 'person' && keying.background === 'color') {
    ctx.fillStyle = keying.backgroundColor ?? KEYING_DEFAULTS.backgroundColor
    ctx.fillRect(0, 0, outW, outH)
  } else if (keying.mode === 'person' && keying.background === 'blur') {
    drawBlurred(ctx, source, rect, outW, outH, keying.backgroundBlur ?? KEYING_DEFAULTS.backgroundBlur)
  }
  // Read the WebGL picture now, before anything else draws into it.
  ctx.drawImage(g.canvas, 0, 0)
  entry.stamp = stamp
  entry.mask = mask
  entries.set(elementId, entry)
  return entry.canvas
}

/** UI strength/softness/spill (0–1) → shader distances in chroma space. */
export function chromaParams(keying: MediaKeying) {
  return {
    similarity: 0.02 + (keying.strength ?? KEYING_DEFAULTS.strength) * 0.4,
    smoothness: 0.005 + (keying.softness ?? KEYING_DEFAULTS.softness) * 0.25,
    spill: 0.005 + (keying.spill ?? KEYING_DEFAULTS.spill) * 0.4,
  }
}

/** A soft blur of the source behind the person: drawn small, blurred a little, then scaled up. */
function drawBlurred(ctx: CanvasRenderingContext2D, source: Source, rect: SourceRect, outW: number, outH: number, amount: number) {
  const shrink = 4 + amount * 28
  const w = Math.max(4, Math.round(outW / shrink))
  const h = Math.max(4, Math.round(outH / shrink))
  blurCanvas ??= document.createElement('canvas')
  if (blurCanvas.width !== w) blurCanvas.width = w
  if (blurCanvas.height !== h) blurCanvas.height = h
  const small = blurCanvas.getContext('2d')!
  small.filter = 'blur(1px)'
  small.drawImage(source, rect.x, rect.y, rect.w, rect.h, 0, 0, w, h)
  small.filter = 'none'
  ctx.save()
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(blurCanvas, 0, 0, w, h, 0, 0, outW, outH)
  ctx.restore()
}
