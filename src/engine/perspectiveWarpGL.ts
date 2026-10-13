// True perspective (projective) warp of an image onto a quad, on the GPU.
//
// Canvas 2D can only do affine transforms, so a 2D mesh of triangles only
// approximates perspective and leaves seams along the triangle edges. Here a
// fragment shader maps every output pixel back through the inverse homography
// to its source pixel — one continuous surface, correct foreshortening, and
// anti-aliased edges. One shared WebGL2 canvas serves every warp; the result is
// copied into the caller's 2D context right away.

export type Mat3 = [number, number, number, number, number, number, number, number, number]

const MAX_OUTPUT_PX = 4096

const VERTEX_SHADER = `#version 300 es
in vec2 aScreen;          // 0..1 across the output canvas
uniform vec4 uBounds;     // output bounds in element-local units: x, y, w, h
out vec2 vLocal;
void main() {
  vLocal = uBounds.xy + aScreen * uBounds.zw;
  gl_Position = vec4(aScreen.x * 2.0 - 1.0, 1.0 - aScreen.y * 2.0, 0.0, 1.0);
}`

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 vLocal;
uniform mat3 uInverse;    // element-local destination -> element-local source
uniform vec4 uSource;     // source rect in element-local units: x, y, w, h
uniform sampler2D uTexture;
out vec4 outColor;
void main() {
  vec3 q = uInverse * vec3(vLocal, 1.0);
  if (q.z <= 0.0) discard;                       // behind the vanishing line
  vec2 t = (q.xy / q.z - uSource.xy) / uSource.zw;
  vec2 fw = max(fwidth(t), vec2(1e-6));
  vec2 edge = min(t, 1.0 - t) / fw;              // distance to the source edge, in pixels
  float coverage = clamp(min(edge.x, edge.y) + 0.5, 0.0, 1.0);
  if (coverage <= 0.0) discard;
  outColor = texture(uTexture, clamp(t, 0.0, 1.0)) * coverage;   // premultiplied
}`

interface WarpGL {
  canvas: HTMLCanvasElement
  gl: WebGL2RenderingContext
  texture: WebGLTexture
  uBounds: WebGLUniformLocation
  uInverse: WebGLUniformLocation
  uSource: WebGLUniformLocation
}

let shared: WarpGL | null | undefined

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'shader')
  return shader
}

function getWarpGL(): WarpGL | null {
  if (shared !== undefined && (!shared || !shared.gl.isContextLost())) return shared
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false })
    if (!gl) return (shared = null)

    const program = gl.createProgram()!
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER))
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER))
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'link')
    gl.useProgram(program)

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW)
    const aScreen = gl.getAttribLocation(program, 'aScreen')
    gl.enableVertexAttribArray(aScreen)
    gl.vertexAttribPointer(aScreen, 2, gl.FLOAT, false, 0, 0)

    const texture = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)

    shared = {
      canvas, gl, texture,
      uBounds: gl.getUniformLocation(program, 'uBounds')!,
      uInverse: gl.getUniformLocation(program, 'uInverse')!,
      uSource: gl.getUniformLocation(program, 'uSource')!,
    }
  } catch {
    shared = null
  }
  return shared
}

/**
 * Draw `src` (covering `srcRect` in element-local units) warped by the
 * homography whose `inverse` maps element-local destination -> source,
 * into `ctx`, whose current transform is element-local.
 * Returns false when WebGL is unavailable or the source can't be uploaded.
 */
export function warpWithGL(
  ctx: CanvasRenderingContext2D,
  src: TexImageSource,
  srcRect: { x: number; y: number; w: number; h: number },
  inverse: Mat3,
  bounds: { x: number; y: number; w: number; h: number },
): boolean {
  const warp = getWarpGL()
  if (!warp) return false
  const { gl, canvas } = warp

  // Render at the destination's real pixel density.
  const m = ctx.getTransform()
  const density = Math.max(0.25, Math.hypot(m.a, m.b), Math.hypot(m.c, m.d))
  const fit = Math.min(1, MAX_OUTPUT_PX / Math.max(bounds.w * density, bounds.h * density))
  const outW = Math.max(1, Math.ceil(bounds.w * density * fit))
  const outH = Math.max(1, Math.ceil(bounds.h * density * fit))
  if (canvas.width !== outW) canvas.width = outW
  if (canvas.height !== outH) canvas.height = outH

  try {
    gl.bindTexture(gl.TEXTURE_2D, warp.texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src)
    gl.generateMipmap(gl.TEXTURE_2D)
  } catch {
    return false   // e.g. a cross-origin image that would taint the canvas
  }

  gl.viewport(0, 0, outW, outH)
  gl.clearColor(0, 0, 0, 0)
  gl.clear(gl.COLOR_BUFFER_BIT)
  gl.uniform4f(warp.uBounds, bounds.x, bounds.y, bounds.w, bounds.h)
  gl.uniform4f(warp.uSource, srcRect.x, srcRect.y, srcRect.w, srcRect.h)
  // GLSL mat3 is column-major; our Mat3 is row-major.
  gl.uniformMatrix3fv(warp.uInverse, true, inverse)
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

  ctx.drawImage(canvas, 0, 0, outW, outH, bounds.x, bounds.y, bounds.w, bounds.h)
  return true
}
