/**
 * Draws shader transitions with one shared WebGL context (browsers allow only
 * a handful of contexts, and the editor, Preview and export all use this).
 * Each transition's program is compiled on first use and cached. The caller
 * draws the returned canvas into its own 2D canvas straight away, before the
 * next transition renders into it.
 */
import type { SlideDir, TransitionType } from '../../types/editor'
import { PREAMBLE, SHADERS } from './shaders'

const VERTEX = `
attribute vec2 a_pos;
varying vec2 uv_;
void main() {
  uv_ = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`

const UNIFORMS = ['u_from', 'u_to', 'progress', 'ratio', 'move', 'intensity', 'softness', 'tint', 'px', 'seed'] as const

interface Program {
  program: WebGLProgram
  u: Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>
}

interface State {
  gl: WebGLRenderingContext
  canvas: HTMLCanvasElement
  from: WebGLTexture
  to: WebGLTexture
  vertex: WebGLShader
  buffer: WebGLBuffer
  programs: Map<TransitionType, Program | null>
}

let state: State | null = null
let unavailable = false

export interface GlTransitionParams {
  type: TransitionType
  /** Eased progress 0–1. */
  progress: number
  direction?: SlideDir
  intensity?: number
  softness?: number
  color?: string
  seed?: number
}

export function hasShader(type: TransitionType) {
  return Boolean(SHADERS[type])
}

/** The unit vector pictures move along, in uv (y down): the new scene enters from the `direction` edge. */
export function moveVector(direction: SlideDir | undefined): [number, number] {
  switch (direction ?? 'right') {
    case 'left': return [1, 0]
    case 'up': return [0, 1]
    case 'down': return [0, -1]
    default: return [-1, 0]
  }
}

function init(): State | null {
  if (state) return state
  if (unavailable) return null
  const canvas = document.createElement('canvas')
  const gl = canvas.getContext('webgl', { alpha: false, premultipliedAlpha: false, antialias: false, preserveDrawingBuffer: false })
  if (!gl) {
    unavailable = true
    return null
  }
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX)
  if (!vertex) {
    unavailable = true
    return null
  }
  const buffer = gl.createBuffer()!
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  const texture = () => {
    const t = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, t)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    return t
  }
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault()
    state = null
  })
  state = { gl, canvas, from: texture(), to: texture(), vertex, buffer, programs: new Map() }
  return state
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type)!
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('[transitions] shader did not compile:', gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function programFor(s: State, type: TransitionType): Program | null {
  if (s.programs.has(type)) return s.programs.get(type)!
  const body = SHADERS[type]
  let result: Program | null = null
  const fragment = body ? compile(s.gl, s.gl.FRAGMENT_SHADER, `${PREAMBLE}\n${body}\nvoid main() { gl_FragColor = transition(uv_); }`) : null
  if (fragment) {
    const { gl } = s
    const program = gl.createProgram()!
    gl.attachShader(program, s.vertex)
    gl.attachShader(program, fragment)
    gl.bindAttribLocation(program, 0, 'a_pos')
    gl.linkProgram(program)
    if (gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const u = Object.fromEntries(UNIFORMS.map(name => [name, gl.getUniformLocation(program, name)])) as Program['u']
      result = { program, u }
    } else {
      console.error('[transitions] program did not link:', gl.getProgramInfoLog(program))
    }
  }
  s.programs.set(type, result)
  return result
}

/** Compiles every shader now (e.g. before an export), so the first frames don't stall. Returns the ones that failed. */
export function warmUpShaders(types: TransitionType[]): TransitionType[] {
  const s = init()
  if (!s) return types
  return types.filter(type => hasShader(type) && !programFor(s, type))
}

function hexToRgb(color: string | undefined, fallback: [number, number, number]): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color?.trim() ?? '')
  return m ? [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255] : fallback
}

/**
 * Renders one frame of a shader transition between two pictures at
 * width × height. Returns the WebGL canvas holding it, or null when WebGL or
 * this shader isn't available (the caller falls back to a 2D dissolve).
 */
export function renderGlTransition(params: GlTransitionParams, from: TexImageSource, to: TexImageSource, width: number, height: number): HTMLCanvasElement | null {
  const s = init()
  if (!s) return null
  const p = programFor(s, params.type)
  if (!p) return null
  const { gl } = s
  const w = Math.max(1, Math.round(width))
  const h = Math.max(1, Math.round(height))
  if (s.canvas.width !== w) s.canvas.width = w
  if (s.canvas.height !== h) s.canvas.height = h
  gl.viewport(0, 0, w, h)
  gl.useProgram(p.program)
  gl.bindBuffer(gl.ARRAY_BUFFER, s.buffer)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

  try {
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, s.from)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, from)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, s.to)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, to)
  } catch {
    return null // a picture WebGL may not read
  }

  const [mx, my] = moveVector(params.direction)
  const white: [number, number, number] = params.type === 'dipBlack' ? [0, 0, 0] : [1, 1, 1]
  const [r, g, b] = hexToRgb(params.color, white)
  gl.uniform1i(p.u.u_from, 0)
  gl.uniform1i(p.u.u_to, 1)
  gl.uniform1f(p.u.progress, Math.max(0, Math.min(1, params.progress)))
  gl.uniform1f(p.u.ratio, w / h)
  gl.uniform2f(p.u.move, mx, my)
  gl.uniform1f(p.u.intensity, params.intensity ?? 0.6)
  gl.uniform1f(p.u.softness, params.softness ?? 0.2)
  gl.uniform3f(p.u.tint, r, g, b)
  gl.uniform2f(p.u.px, 1 / w, 1 / h)
  gl.uniform1f(p.u.seed, params.seed ?? 0.37)
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  return s.canvas
}
