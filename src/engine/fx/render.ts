/**
 * Runs a video's or image's colour adjustments and effects on the GPU, once
 * per frame, and returns the finished picture. One shared WebGL context;
 * programs compiled on first use; ping-pong framebuffers per output size.
 *
 * Order: the source with its colour adjustments and colour look → body
 * effects (person mask) → one combined camera move → warps → everything
 * else in catalogue order → the canvas. Each element's last frame is cached,
 * so redraws while paused cost nothing.
 */
import type { MediaFx } from '../../types/editor'
import { personMaskFor, prepareKeying } from '../keying'
import { FX_DEFS, fxDef, LOOKS } from './catalog'
import { beatPulse, cameraMove, fxParam, fxTime, fxWeight, hasAdjustments, type FxMedia } from './stack'
import { BASE, BLUR, CAMERA, FX, MASK_COPY, PREAMBLE, PRESENT, THRESHOLD } from './shaders'
import { prepareBeats, projectBeats } from './beats'
import type { Project } from '../../types/editor'

const COPY = `vec4 effect(vec2 uv) { return texture2D(u_tex, uv); }`

const VERTEX = `
attribute vec2 a_pos;
varying vec2 uv_;
void main() {
  uv_ = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`

// Framebuffer rows run bottom-up: writing a framebuffer with this vertex stores the picture's top
// at t = 0, like an uploaded picture, so every texture and shader uses the same y-down uv.
const VERTEX_FB = `
attribute vec2 a_pos;
varying vec2 uv_;
void main() {
  uv_ = vec2(a_pos.x * 0.5 + 0.5, a_pos.y * 0.5 + 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`

const UNIFORMS = ['u_tex', 'u_mask', 'u_blur', 'u_blur2', 'u_res', 'u_time', 'u_frame', 'u_w', 'u_beat', 'u_beatIndex', 'u_p', 'u_q', 'u_c1', 'u_c2', 'u_seed'] as const
type Uniform = (typeof UNIFORMS)[number]

interface Program { program: WebGLProgram; u: Record<Uniform, WebGLUniformLocation | null> }
interface Target { fb: WebGLFramebuffer; tex: WebGLTexture; w: number; h: number }

interface State {
  gl: WebGLRenderingContext
  canvas: HTMLCanvasElement
  buffer: WebGLBuffer
  programs: Map<string, Program | null>
  targets: Map<string, Target>
  source: WebGLTexture
  mask: WebGLTexture
}

let state: State | null = null
let unavailable = false

function newTexture(gl: WebGLRenderingContext) {
  const t = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, t)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  return t
}

function init(): State | null {
  if (state) return state
  if (unavailable) return null
  const canvas = document.createElement('canvas')
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: false })
  if (!gl) { unavailable = true; return null }
  const buffer = gl.createBuffer()!
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); state = null })
  state = { gl, canvas, buffer, programs: new Map(), targets: new Map(), source: newTexture(gl), mask: newTexture(gl) }
  return state
}

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('[fx] shader did not compile:', gl.getShaderInfoLog(shader))
    return null
  }
  return shader
}

/** A pass's program; `toCanvas` = it writes the visible canvas (else a framebuffer). */
function program(s: State, name: string, body: string, toCanvas: boolean): Program | null {
  const key = `${name}:${toCanvas ? 1 : 0}`
  if (s.programs.has(key)) return s.programs.get(key)!
  const { gl } = s
  const vs = compile(gl, gl.VERTEX_SHADER, toCanvas ? VERTEX : VERTEX_FB)
  const fs = compile(gl, gl.FRAGMENT_SHADER, `${PREAMBLE}\n${body}\nvoid main() { gl_FragColor = effect(uv_); }`)
  let result: Program | null = null
  if (vs && fs) {
    const p = gl.createProgram()!
    gl.attachShader(p, vs)
    gl.attachShader(p, fs)
    gl.bindAttribLocation(p, 0, 'a_pos')
    gl.linkProgram(p)
    if (gl.getProgramParameter(p, gl.LINK_STATUS)) {
      result = { program: p, u: Object.fromEntries(UNIFORMS.map(n => [n, gl.getUniformLocation(p, n)])) as Program['u'] }
    } else {
      console.error('[fx] program did not link:', gl.getProgramInfoLog(p))
    }
  }
  s.programs.set(key, result)
  return result
}

function target(s: State, name: string, w: number, h: number): Target {
  const k = name
  let t = s.targets.get(k)
  const { gl } = s
  if (!t) {
    const tex = newTexture(gl)
    const fb = gl.createFramebuffer()!
    t = { fb, tex, w: 0, h: 0 }
    s.targets.set(k, t)
  }
  if (t.w !== w || t.h !== h) {
    gl.bindTexture(gl.TEXTURE_2D, t.tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0)
    t.w = w
    t.h = h
  }
  return t
}

interface PassUniforms {
  time?: number
  frame?: number
  w?: number
  beat?: number
  beatIndex?: number
  p?: number[]
  q?: number[]
  c1?: number[]
  c2?: number[]
  seed?: number
}

interface PassInputs {
  tex: WebGLTexture
  /** The input is a framebuffer texture (vs an uploaded picture) — both keep the top at t = 0. */
  fbInput: boolean
  mask?: WebGLTexture
  blur?: WebGLTexture
  blur2?: WebGLTexture
}

function pass(s: State, name: string, body: string, inputs: PassInputs, u: PassUniforms, out: Target | null, w: number, h: number) {
  const p = program(s, name, body, out === null)
  if (!p) return false
  const { gl } = s
  gl.bindFramebuffer(gl.FRAMEBUFFER, out ? out.fb : null)
  gl.viewport(0, 0, w, h)
  gl.useProgram(p.program)
  gl.bindBuffer(gl.ARRAY_BUFFER, s.buffer)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  const bind = (unit: number, texture: WebGLTexture | undefined, uniform: Uniform) => {
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_2D, texture ?? inputs.tex)
    gl.uniform1i(p.u[uniform], unit)
  }
  bind(0, inputs.tex, 'u_tex')
  bind(1, inputs.mask, 'u_mask')
  bind(2, inputs.blur, 'u_blur')
  bind(3, inputs.blur2, 'u_blur2')
  const v4 = (a?: number[]) => [a?.[0] ?? 0, a?.[1] ?? 0, a?.[2] ?? 0, a?.[3] ?? 0] as const
  gl.uniform2f(p.u.u_res, w, h)
  gl.uniform1f(p.u.u_time, u.time ?? 0)
  gl.uniform1f(p.u.u_frame, u.frame ?? 0)
  gl.uniform1f(p.u.u_w, u.w ?? 1)
  gl.uniform1f(p.u.u_beat, u.beat ?? 0)
  gl.uniform1f(p.u.u_beatIndex, u.beatIndex ?? 0)
  gl.uniform4f(p.u.u_p, ...v4(u.p))
  gl.uniform4f(p.u.u_q, ...v4(u.q))
  const c1 = v4(u.c1)
  const c2 = v4(u.c2)
  gl.uniform3f(p.u.u_c1, c1[0], c1[1], c1[2])
  gl.uniform3f(p.u.u_c2, c2[0], c2[1], c2[2])
  gl.uniform1f(p.u.u_seed, u.seed ?? 0.37)
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  return true
}

/**
 * A blurred copy of `input` (spread in pixels of the output), at half or
 * quarter size. `first` = how the picture is taken in: a copy, only its
 * bright parts (glows), or a person mask.
 */
function blurred(s: State, prefix: string, input: WebGLTexture, fbInput: boolean, w: number, h: number, spread: number, first: 'copy' | 'threshold' | 'mask', threshold = 0.6): Target {
  const scale = spread > 24 ? 4 : 2
  const bw = Math.max(2, Math.ceil(w / scale))
  const bh = Math.max(2, Math.ceil(h / scale))
  const a = target(s, `${prefix}-a`, bw, bh)
  const b = target(s, `${prefix}-b`, bw, bh)
  const firstBody = first === 'threshold' ? THRESHOLD : first === 'mask' ? MASK_COPY : COPY
  pass(s, `first-${first}`, firstBody, { tex: input, fbInput }, { p: [threshold] }, a, bw, bh)
  const steps = spread > 48 ? 3 : 2
  const px = Math.max(0.5, spread / scale / (steps * 2.2))
  for (let i = 0; i < steps; i++) {
    pass(s, 'blur', BLUR, { tex: a.tex, fbInput: true }, { p: [px / bw, 0] }, b, bw, bh)
    pass(s, 'blur', BLUR, { tex: b.tex, fbInput: true }, { p: [0, px / bh] }, a, bw, bh)
  }
  return a
}

const hexRgb = (value: unknown, fallback = '#ffffff') => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(value ?? fallback)) ?? /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(fallback)!
  return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255]
}
const num = (fx: MediaFx, key: string) => Number(fxParam(fx, key))
const flag = (fx: MediaFx, key: string) => (fxParam<boolean>(fx, key) ? 1 : 0)
const DIR: Record<string, [number, number]> = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }

/** Each effect's settings → its shader's uniforms. */
function uniformsFor(fx: MediaFx): PassUniforms {
  const sync = fx.beatSync ? 1 : 0
  switch (fx.type) {
    case 'neonOutline': return { p: [num(fx, 'width'), num(fx, 'glow'), flag(fx, 'cycle'), sync], c1: hexRgb(fxParam(fx, 'color')), c2: hexRgb(fxParam(fx, 'color2')) }
    case 'aura': return { p: [num(fx, 'size'), sync], c1: hexRgb(fxParam(fx, 'color')) }
    case 'spotlight': return { p: [num(fx, 'softness')], c1: hexRgb(fxParam(fx, 'color'), '#000000') }
    case 'echo': {
      const trail = String(fxParam(fx, 'direction'))
      const q: [number, number] = trail === 'around' ? [0, 0] : (DIR[trail] ? [-DIR[trail][0], -DIR[trail][1]] : [1, 0])
      return { p: [num(fx, 'count'), num(fx, 'spacing'), flag(fx, 'rainbow'), sync], q, c1: hexRgb('#38bdf8') }
    }
    case 'vhs': return { p: [num(fx, 'noise'), num(fx, 'wobble'), num(fx, 'bleed')] }
    case 'film8mm': return { p: [num(fx, 'warmth'), num(fx, 'flicker'), num(fx, 'dust')] }
    case 'oldFilm': return { p: [num(fx, 'scratches'), num(fx, 'sepia')] }
    case 'dust': return { p: [num(fx, 'amount'), flag(fx, 'scratches')] }
    case 'paper': return { p: [['paper', 'canvas', 'grunge'].indexOf(String(fxParam(fx, 'kind'))), num(fx, 'scale')] }
    case 'halftone': return { p: [num(fx, 'dot'), flag(fx, 'mono')] }
    case 'grain': return { p: [num(fx, 'size'), flag(fx, 'color')] }
    case 'glitch': return { p: [num(fx, 'blocks'), num(fx, 'rgb'), sync] }
    case 'rgbSplit': return { p: [['horizontal', 'vertical', 'radial'].indexOf(String(fxParam(fx, 'axis'))), flag(fx, 'animate'), sync] }
    case 'crt': return { p: [num(fx, 'scanlines'), num(fx, 'curve')] }
    case 'signalLoss': return { p: [sync] }
    case 'wave': return { p: [num(fx, 'frequency'), String(fxParam(fx, 'axis')) === 'vertical' ? 1 : 0] }
    case 'swirl': return { p: [num(fx, 'radius')] }
    case 'bulge': return { p: [['bulge', 'pinch', 'fisheye'].indexOf(String(fxParam(fx, 'mode'))), num(fx, 'radius')] }
    case 'ripple': return { p: [num(fx, 'frequency')] }
    case 'kaleidoscope': return { p: [num(fx, 'segments'), flag(fx, 'spin')] }
    case 'glow': return { c1: hexRgb(fxParam(fx, 'color')) }
    case 'halation': return { c1: hexRgb(fxParam(fx, 'color'), '#ff4a1c') }
    case 'lightLeak': return { c1: hexRgb(fxParam(fx, 'color'), '#ff8a3d') }
    case 'lightSweep': {
      const [dx, dy] = DIR[String(fxParam(fx, 'direction'))] ?? [1, 0]
      return { p: [num(fx, 'width'), dx, dy, sync], c1: hexRgb(fxParam(fx, 'color')) }
    }
    case 'godRays': return { p: [num(fx, 'x'), num(fx, 'y'), num(fx, 'length')], c1: hexRgb(fxParam(fx, 'color')) }
    case 'lensFlare': return { p: [num(fx, 'x'), num(fx, 'y')], c1: hexRgb(fxParam(fx, 'color')) }
    case 'vignette': return { p: [num(fx, 'size'), num(fx, 'softness')], c1: hexRgb(fxParam(fx, 'color'), '#000000') }
    case 'phonk': return { p: [flag(fx, 'mono'), num(fx, 'strobe'), fx.beatSync === false ? 0 : 1], c1: hexRgb(fxParam(fx, 'color'), '#ff1f3d') }
    case 'strobe':
    case 'flash': return { p: [sync], c1: hexRgb(fxParam(fx, 'color')) }
    case 'flicker': return { c1: hexRgb(fxParam(fx, 'color'), '#dcecff') }
    case 'rain': return { p: [num(fx, 'amount'), num(fx, 'wind')], c1: hexRgb(fxParam(fx, 'color'), '#cfe3ff') }
    case 'snow': return { p: [num(fx, 'amount'), num(fx, 'size')] }
    default: return {}
  }
}

/** Glows and blurs: the blurred input each needs (spread as a share of the picture's short side, bright parts only?). */
function blurNeed(fx: MediaFx): { spread: number; first: 'copy' | 'threshold'; threshold?: number } | null {
  switch (fx.type) {
    case 'glow': return { spread: 0.02 + num(fx, 'radius') * 0.08, first: 'threshold', threshold: 0.3 + num(fx, 'threshold') * 0.6 }
    case 'halation': return { spread: 0.015 + num(fx, 'radius') * 0.05, first: 'threshold', threshold: 0.65 }
    case 'defocus': return { spread: 0.01 + fx.intensity * 0.05, first: 'copy' }
    case 'phonk': return { spread: 0.04, first: 'threshold', threshold: 0.5 }
    default: return null
  }
}

const STYLIZE_ORDER = new Map(FX_DEFS.filter(d => d.stage === 'stylize').map((d, i) => [d.type, i]))
const WARP_ORDER = new Map(FX_DEFS.filter(d => d.stage === 'warp').map((d, i) => [d.type, i]))

export interface FxFrame {
  /** Cache key for this element on this stage (copies of a clip use their own key). */
  key: string
  el: FxMedia
  stack: MediaFx[]
  /** The picture to process (possibly already keyed) and the part of it to use, in its pixels. */
  picture: TexImageSource
  pictureW: number
  pictureH: number
  rect: { x: number; y: number; w: number; h: number }
  /** For body effects: the raw frame and rectangle the person mask is found in. */
  maskSource?: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement
  maskRect?: { x: number; y: number; w: number; h: number }
  outW: number
  outH: number
  clipTime: number
  clipDuration: number
  /** Timeline seconds (for beats). */
  globalTime: number
  /** Identifies the source frame (video time; 0 for images). */
  frameTime: number
}

interface Entry { canvas: HTMLCanvasElement; stamp: string }
const entries = new Map<string, Entry>()

/** Forget an element's cached frame. */
export function releaseFx(key: string) {
  entries.delete(key)
}

/**
 * The element's picture with its adjustments and effects at this frame, as a
 * canvas of outW × outH — or null when there is nothing to do (draw the
 * source as it is) or WebGL is unavailable.
 */
export function renderFx(f: FxFrame): HTMLCanvasElement | null {
  const active = f.stack.filter(fx => fxDef(fx.type).stage !== 'item' && fxWeight(fx, f.clipTime, f.clipDuration) > 0)
  if (!active.length && !hasAdjustments(f.el)) return null
  const s = init()
  if (!s) return null
  const W = Math.max(2, Math.min(2048, Math.round(f.outW)))
  const H = Math.max(2, Math.min(2048, Math.round(f.outH)))
  const beats = active.some(fx => fx.beatSync || fx.type === 'phonk') ? projectBeats() : null
  const beat = beatPulse(beats, f.globalTime)
  const el = f.el
  const stamp = [
    f.frameTime.toFixed(4), active.length ? f.clipTime.toFixed(4) : '', beats || active.some(fx => fx.beatSync) ? f.globalTime.toFixed(3) : '',
    W, H, f.rect.x.toFixed(1), f.rect.y.toFixed(1), f.rect.w.toFixed(1), f.rect.h.toFixed(1), JSON.stringify(active),
    el.brightness, el.contrast, el.saturation, el.hueRotate, el.blur, el.glass, el.exposure, el.vibrance, el.temperature, el.tint,
    el.highlights, el.shadows, el.whites, el.blacks, f.picture instanceof HTMLImageElement ? f.picture.src : '', beats ? beats.length : 0,
  ].join('|')
  const cached = entries.get(f.key)
  if (cached?.stamp === stamp) return cached.canvas

  const { gl } = s
  try {
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, s.source)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, f.picture)
  } catch {
    return null
  }

  let cur = target(s, 'A', W, H)
  let other = target(s, 'B', W, H)
  const swap = () => { const t = cur; cur = other; other = t }
  const short = Math.min(W, H)

  // 1. Source + colour adjustments + look.
  const look = active.find(fx => fx.type === 'look')
  const lookId = look ? Math.max(0, LOOKS.findIndex(([id]) => id === fxParam(look, 'look'))) : -1
  pass(s, 'base', BASE, { tex: s.source, fbInput: false }, {
    p: [f.rect.x / f.pictureW, f.rect.y / f.pictureH, f.rect.w / f.pictureW, f.rect.h / f.pictureH],
    q: [(el.exposure ?? 0) / 100 * 2.5, (el.brightness ?? 100) / 100, (el.contrast ?? 100) / 100, (el.saturation ?? 100) / 100],
    c1: [(el.vibrance ?? 0) / 100, (el.temperature ?? 0) / 100, (el.tint ?? 0) / 100],
    c2: [(el.highlights ?? 0) / 100, (el.shadows ?? 0) / 100, (el.whites ?? 0) / 100],
    seed: (el.blacks ?? 0) / 100,
    beatIndex: ((el.hueRotate ?? 0) * Math.PI) / 180,
    time: lookId,
    w: look ? fxWeight(look, f.clipTime, f.clipDuration) : 0,
  }, cur, W, H)

  // The adjustments' blur and glass.
  const blurPx = (el.blur ?? 0) + (el.glass ? 8 : 0)
  if (blurPx > 0) {
    const b = blurred(s, 'adjust', cur.tex, true, W, H, blurPx * (W / Math.max(1, el.width)) * 2.2, 'copy')
    pass(s, 'copy', COPY, { tex: b.tex, fbInput: true }, {}, other, W, H)
    swap()
  }

  const beatFor = (fx: MediaFx) => (fx.beatSync || (fx.type === 'phonk' && fx.beatSync !== false) ? beat : { pulse: 0, index: beat.index })
  const runFx = (fx: MediaFx, extra: Partial<PassInputs> = {}) => {
    const body = FX[fx.type]
    if (!body) return
    const b = beatFor(fx)
    const ok = pass(s, fx.type, body, { tex: cur.tex, fbInput: true, ...extra }, {
      ...uniformsFor(fx),
      time: fxTime(fx, f.clipTime),
      frame: Math.floor(f.clipTime * 30),
      w: fxWeight(fx, f.clipTime, f.clipDuration),
      beat: b.pulse,
      beatIndex: b.index,
      seed: (fx.id.charCodeAt(0) % 17) / 17 + 0.13,
    }, other, W, H)
    if (ok) swap()
  }

  // 2. Body effects, on the person mask.
  const body = active.filter(fx => fxDef(fx.type).stage === 'body')
  if (body.length && f.maskSource && f.maskRect) {
    const mask = personMaskFor(`fx:${f.key}`, f.maskSource, f.maskRect, f.frameTime)
    if (mask) {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, s.mask)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, mask.w, mask.h, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, mask.data)
      const near = blurred(s, 'mask-near', s.mask, false, W, H, short * 0.012, 'mask')
      const far = blurred(s, 'mask-far', s.mask, false, W, H, short * 0.06, 'mask')
      for (const fx of body) runFx(fx, { mask: s.mask, blur: near.tex, blur2: far.tex })
    }
  }

  // 3. One camera move for zooms and shakes.
  const move = cameraMove(active, f.clipTime, f.clipDuration, beatFor)
  if (move.zoom !== 1 || move.cx !== 0.5 || move.cy !== 0.5 || move.rotate !== 0) {
    pass(s, 'camera', CAMERA, { tex: cur.tex, fbInput: true }, { p: [move.zoom, move.cx, move.cy, move.rotate] }, other, W, H)
    swap()
  }

  // 4. Warps, then 5. everything else.
  const warps = active.filter(fx => fxDef(fx.type).stage === 'warp').sort((a, b) => (WARP_ORDER.get(a.type) ?? 0) - (WARP_ORDER.get(b.type) ?? 0))
  for (const fx of warps) runFx(fx)
  const rest = active.filter(fx => fxDef(fx.type).stage === 'stylize').sort((a, b) => (STYLIZE_ORDER.get(a.type) ?? 0) - (STYLIZE_ORDER.get(b.type) ?? 0))
  for (const fx of rest) {
    const need = blurNeed(fx)
    if (need) {
      const b = blurred(s, 'fx', cur.tex, true, W, H, short * need.spread, need.first, need.threshold)
      runFx(fx, { blur: b.tex })
    } else {
      runFx(fx)
    }
  }

  // 6. To the screen canvas, then into this element's own canvas.
  if (s.canvas.width !== W) s.canvas.width = W
  if (s.canvas.height !== H) s.canvas.height = H
  pass(s, 'present', PRESENT, { tex: cur.tex, fbInput: true }, {}, null, W, H)
  const entry = cached ?? { canvas: document.createElement('canvas'), stamp: '' }
  if (entry.canvas.width !== W) entry.canvas.width = W
  if (entry.canvas.height !== H) entry.canvas.height = H
  const ctx = entry.canvas.getContext('2d')!
  ctx.clearRect(0, 0, W, H)
  ctx.drawImage(s.canvas, 0, 0)
  entry.stamp = stamp
  entries.set(f.key, entry)
  if (entries.size > 96) entries.delete(entries.keys().next().value as string)
  return entry.canvas
}

/** Compiles every effect's shader now (an export, or a check). Returns the ones that failed. */
export function warmUpFx(): string[] {
  const s = init()
  if (!s) return ['webgl']
  const failed: string[] = []
  const check = (name: string, body: string, toCanvas = false) => { if (!program(s, name, body, toCanvas)) failed.push(name) }
  check('base', BASE)
  check('camera', CAMERA)
  check('blur', BLUR)
  check('first-threshold', THRESHOLD)
  check('first-mask', MASK_COPY)
  check('first-copy', COPY)
  check('copy', COPY)
  check('present', PRESENT, true)
  for (const [name, body] of Object.entries(FX)) check(name, body)
  return failed
}

/** Before an export: shaders compiled, beats found, the person-cutout model loaded if any effect needs them. */
export async function prepareFx(project: Project) {
  const stacks = project.scenes.flatMap(sc => sc.elements.filter(el => el.type === 'video' || el.type === 'image').map(el => (el as FxMedia).fx ?? []))
  if (!stacks.some(st => st.length)) return
  warmUpFx()
  if (stacks.some(st => st.some(fx => fx.beatSync || fx.type === 'phonk'))) await prepareBeats(project)
  if (stacks.some(st => st.some(fx => fxDef(fx.type).mask))) await prepareKeying([{ keying: { mode: 'person' } }])
}
