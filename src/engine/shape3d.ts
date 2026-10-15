// True 3D cuboid and cone, rotated about X / Y / Z and drawn with an
// orthographic projection fitted to the element box.
//
// The cuboid takes its width and height from the box and has its own depth
// (equal sides make a true cube); the cone takes its radius and height from
// the box. Faces are painted back-to-front, so see-through faces show what is
// behind them. Every face can have its own color and opacity; faces without an
// override derive their color from the shape's fill.

import type { Face3D, ShapeElement } from '../types/editor'
import { adjustHex } from '../utils/color'

export const CUBE_FACES = ['front', 'back', 'top', 'bottom', 'left', 'right'] as const
export const CONE_FACES = ['slant', 'base'] as const

const DEFAULT_ROTATION = {
  cube: { x: 25, y: -35, z: 0 },   // shows front, top and right faces
  cone: { x: -20, y: 0, z: 0 },    // slightly from below, base visible
}

type Vec3 = [number, number, number]
type Pt = [number, number]

export function is3DShape(el: ShapeElement) {
  return el.shapeType === 'cube' || el.shapeType === 'cone'
}

/** Cuboid depth (front-to-back), in the same units as width/height. */
export function cuboidDepth(el: ShapeElement) {
  return el.depth3d ?? Math.min(el.width, el.height)
}

export function get3DRotation(el: ShapeElement) {
  const d = el.shapeType === 'cone' ? DEFAULT_ROTATION.cone : DEFAULT_ROTATION.cube
  return { x: el.rotateX ?? d.x, y: el.rotateY ?? d.y, z: el.rotateZ ?? d.z }
}

// ── Face colors ──────────────────────────────────────────────────────────────

/** Shade applied to each face's default color, so an untouched solid reads as 3D. */
const DEFAULT_SHADE: Record<Face3D, number> = {
  front: 0, back: -0.2, top: 0.35, bottom: -0.45, left: -0.2, right: -0.35,
  slant: 0, base: 0.35,
}

export function faceFill(el: ShapeElement, face: Face3D): { color: string; opacity: number } {
  const override = el.faces3d?.[face]
  const base = el.fill && el.fill !== 'transparent' ? el.fill : '#6366f1'
  // Legacy projects: the old single "face color" tinted the top/base faces.
  const legacy = el.faceColor && (face === 'top' || face === 'base') ? el.faceColor : null
  return {
    color: override?.color ?? legacy ?? adjustHex(base, DEFAULT_SHADE[face]),
    opacity: override?.opacity ?? el.fillOpacity ?? 1,
  }
}

// ── Geometry ─────────────────────────────────────────────────────────────────

/** Rotation applied as yaw (Y), then pitch (X), then roll (Z), in degrees. */
function rotator(rx: number, ry: number, rz: number) {
  const [a, b, c] = [rx, ry, rz].map(d => (d * Math.PI) / 180)
  const [ca, sa, cb, sb, cc, sc] = [Math.cos(a), Math.sin(a), Math.cos(b), Math.sin(b), Math.cos(c), Math.sin(c)]
  return ([x, y, z]: Vec3): Vec3 => {
    const x1 = x * cb + z * sb, z1 = -x * sb + z * cb                 // yaw
    const y2 = y * ca - z1 * sa, z2 = y * sa + z1 * ca               // pitch
    return [x1 * cc - y2 * sc, x1 * sc + y2 * cc, z2]                // roll
  }
}

/** Uniformly fit model-space points (y up) into the w×h box (y down), centered. */
function fitter(points: Vec3[], w: number, h: number) {
  const xs = points.map(p => p[0]), ys = points.map(p => -p[1])
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
  const s = Math.min(w / Math.max(1e-6, maxX - minX), h / Math.max(1e-6, maxY - minY))
  const ox = (w - (maxX - minX) * s) / 2 - minX * s
  const oy = (h - (maxY - minY) * s) / 2 - minY * s
  return ([x, y]: Vec3): Pt => [ox + x * s, oy - y * s]
}

const CUBE_VERTS: Vec3[] = [
  [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5],
  [-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5],
]
const CUBE_FACE_GEOMETRY: Record<(typeof CUBE_FACES)[number], { verts: number[]; normal: Vec3 }> = {
  front:  { verts: [4, 5, 6, 7], normal: [0, 0, 1] },
  back:   { verts: [1, 0, 3, 2], normal: [0, 0, -1] },
  top:    { verts: [7, 6, 2, 3], normal: [0, 1, 0] },
  bottom: { verts: [0, 1, 5, 4], normal: [0, -1, 0] },
  left:   { verts: [0, 4, 7, 3], normal: [-1, 0, 0] },
  right:  { verts: [5, 1, 2, 6], normal: [1, 0, 0] },
}

const CONE_SEGMENTS = 72

function convexHull(points: Pt[]): Pt[] {
  const pts = [...points].sort((p, q) => p[0] - q[0] || p[1] - q[1])
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const half = (list: Pt[]) => {
    const out: Pt[] = []
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop()
      out.push(p)
    }
    out.pop()
    return out
  }
  return [...half(pts), ...half([...pts].reverse())]
}

// ── Drawing ──────────────────────────────────────────────────────────────────

export interface Shape3DStroke {
  style: string | CanvasGradient
  width: number
  dash?: number[]
  dashOffset?: number
}

/** Polygons that make up the drawn solid, back to front, with their fills. */
interface Polygon { pts: Pt[]; color: string; opacity: number; shade?: { from: Pt; to: Pt } }

function cubePolygons(el: ShapeElement, w: number, h: number): Polygon[] {
  const r = get3DRotation(el)
  const rotate = rotator(r.x, r.y, r.z)
  // A cuboid: width and height follow the box, depth is its own setting.
  const d = cuboidDepth(el)
  const verts = CUBE_VERTS.map(([x, y, z]) => rotate([x * w, y * h, z * d]))
  const project = fitter(verts, w, h)
  const faces = CUBE_FACES.map(face => {
    const g = CUBE_FACE_GEOMETRY[face]
    const fill = faceFill(el, face)
    return {
      ...fill,
      facing: rotate(g.normal)[2] > 1e-6,
      depth: g.verts.reduce((sum, i) => sum + verts[i][2], 0) / 4,
      pts: g.verts.map(i => project(verts[i])),
    }
  })
  const seeThrough = faces.some(f => f.facing && f.opacity < 1)
  return faces
    .filter(f => f.facing || seeThrough)
    .sort((a, b) => a.depth - b.depth)
}

function conePolygons(el: ShapeElement, w: number, h: number): Polygon[] {
  const r = get3DRotation(el)
  const rotate = rotator(r.x, r.y, r.z)
  const height = Math.max(0.05, h / Math.max(1, w))   // radius 0.5, height from the box aspect
  const apex = rotate([0, height / 2, 0])
  const center = rotate([0, -height / 2, 0])
  const ring = Array.from({ length: CONE_SEGMENTS }, (_, i) => {
    const t = (i / CONE_SEGMENTS) * Math.PI * 2
    return rotate([0.5 * Math.cos(t), -height / 2, 0.5 * Math.sin(t)])
  })
  const project = fitter([apex, ...ring], w, h)
  const apex2 = project(apex), center2 = project(center)
  const ring2 = ring.map(project)

  // Light the slant from one side, across the projected axis.
  const axis: Pt = [apex2[0] - center2[0], apex2[1] - center2[1]]
  const len = Math.hypot(axis[0], axis[1])
  const hull = convexHull([apex2, ...ring2])
  let shade: Polygon['shade']
  if (len > 1) {
    const n: Pt = [-axis[1] / len, axis[0] / len]
    const along = hull.map(p => (p[0] - center2[0]) * n[0] + (p[1] - center2[1]) * n[1])
    const lo = Math.min(...along), hi = Math.max(...along)
    shade = { from: [center2[0] + n[0] * lo, center2[1] + n[1] * lo], to: [center2[0] + n[0] * hi, center2[1] + n[1] * hi] }
  }

  const slant: Polygon = { pts: hull, ...faceFill(el, 'slant'), shade }
  const base: Polygon = { pts: ring2, ...faceFill(el, 'base') }
  const baseFacing = rotate([0, -1, 0])[2] > 1e-6
  return baseFacing ? [slant, base] : [base, slant]
}

function solidPolygons(el: ShapeElement, w: number, h: number) {
  return el.shapeType === 'cone' ? conePolygons(el, w, h) : cubePolygons(el, w, h)
}

function tracePolygon(ctx: CanvasRenderingContext2D, pts: Pt[]) {
  ctx.beginPath()
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
  ctx.closePath()
}

/** Draw the 3D cube/cone into the element's local w×h box. */
export function draw3DShape(
  ctx: CanvasRenderingContext2D,
  el: ShapeElement,
  w: number,
  h: number,
  stroke?: Shape3DStroke,
) {
  const polygons = solidPolygons(el, w, h)
  const m = ctx.getTransform()
  const hairline = 1 / Math.max(0.01, Math.hypot(m.a, m.b))   // one device pixel

  ctx.save()
  for (const poly of polygons) {
    tracePolygon(ctx, poly.pts)
    let fill: string | CanvasGradient = poly.color
    if (poly.shade) {
      const g = ctx.createLinearGradient(poly.shade.from[0], poly.shade.from[1], poly.shade.to[0], poly.shade.to[1])
      g.addColorStop(0, adjustHex(poly.color, 0.18))
      g.addColorStop(0.45, poly.color)
      g.addColorStop(1, adjustHex(poly.color, -0.32))
      fill = g
    }
    ctx.globalAlpha = poly.opacity
    ctx.fillStyle = fill
    ctx.fill()
    ctx.lineJoin = 'round'
    // Seal anti-aliasing seams between neighbouring opaque faces.
    if (poly.opacity >= 1) {
      ctx.strokeStyle = fill
      ctx.lineWidth = hairline
      ctx.stroke()
    }
    // Edges are stroked with their face, so nearer faces cover hidden edges.
    if (stroke && stroke.width > 0) {
      ctx.globalAlpha = 1
      ctx.strokeStyle = stroke.style
      ctx.lineWidth = stroke.width
      ctx.setLineDash(stroke.dash ?? [])
      ctx.lineDashOffset = stroke.dashOffset ?? 0
      ctx.stroke()
      ctx.setLineDash([])
    }
  }
  ctx.restore()
}
