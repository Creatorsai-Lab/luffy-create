import type { ShapeElement, TextElement } from '../types/editor'

export interface PerspectivePts {
  tl: [number, number]
  tr: [number, number]
  br: [number, number]
  bl: [number, number]
}

export function makePerspectivePts(w: number, h: number): PerspectivePts {
  return { tl: [0, 0], tr: [w, 0], br: [w, h], bl: [0, h] }
}

type Pt = [number, number]

function expandedTri(d0: Pt, d1: Pt, d2: Pt, amount = 1.15): [Pt, Pt, Pt] {
  const cx = (d0[0] + d1[0] + d2[0]) / 3
  const cy = (d0[1] + d1[1] + d2[1]) / 3
  const expand = (p: Pt): Pt => {
    const dx = p[0] - cx
    const dy = p[1] - cy
    const len = Math.hypot(dx, dy) || 1
    return [p[0] + (dx / len) * amount, p[1] + (dy / len) * amount]
  }
  return [expand(d0), expand(d1), expand(d2)]
}

function bilerp(tl: Pt, tr: Pt, br: Pt, bl: Pt, u: number, v: number): Pt {
  return [
    (1 - v) * ((1 - u) * tl[0] + u * tr[0]) + v * ((1 - u) * bl[0] + u * br[0]),
    (1 - v) * ((1 - u) * tl[1] + u * tr[1]) + v * ((1 - u) * bl[1] + u * br[1]),
  ]
}

function drawTri(
  ctx: CanvasRenderingContext2D,
  src: HTMLCanvasElement | HTMLImageElement,
  sx0: number, sy0: number,
  sx1: number, sy1: number,
  sx2: number, sy2: number,
  d0: Pt, d1: Pt, d2: Pt,
  srcW: number, srcH: number,
) {
  ctx.save()
  const [c0, c1, c2] = expandedTri(d0, d1, d2)
  ctx.beginPath()
  ctx.moveTo(c0[0], c0[1])
  ctx.lineTo(c1[0], c1[1])
  ctx.lineTo(c2[0], c2[1])
  ctx.closePath()
  ctx.clip()

  const det = (sx0 - sx2) * (sy1 - sy2) - (sx1 - sx2) * (sy0 - sy2)
  if (Math.abs(det) < 1e-8) { ctx.restore(); return }

  const a  = ((d0[0] - d2[0]) * (sy1 - sy2) - (d1[0] - d2[0]) * (sy0 - sy2)) / det
  const c  = ((sx0 - sx2) * (d1[0] - d2[0]) - (sx1 - sx2) * (d0[0] - d2[0])) / det
  const e  = d0[0] - a * sx0 - c * sy0
  const b  = ((d0[1] - d2[1]) * (sy1 - sy2) - (d1[1] - d2[1]) * (sy0 - sy2)) / det
  const dv = ((sx0 - sx2) * (d1[1] - d2[1]) - (sx1 - sx2) * (d0[1] - d2[1])) / det
  const f  = d0[1] - b * sx0 - dv * sy0

  ctx.transform(a, b, c, dv, e, f)
  ctx.drawImage(src, 0, 0, srcW, srcH)
  ctx.restore()
}

export function drawPerspectiveWarp(
  ctx: CanvasRenderingContext2D,
  src: HTMLCanvasElement | HTMLImageElement,
  pts: PerspectivePts,
  srcW: number,
  srcH: number,
  N = 1,
) {
  const { tl, tr, br, bl } = pts
  const oldSmoothing = ctx.imageSmoothingEnabled
  const oldQuality = ctx.imageSmoothingQuality
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(tl[0], tl[1])
  ctx.lineTo(tr[0], tr[1])
  ctx.lineTo(br[0], br[1])
  ctx.lineTo(bl[0], bl[1])
  ctx.closePath()
  ctx.clip()
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  for (let row = 0; row < N; row++) {
    for (let col = 0; col < N; col++) {
      const u0 = col / N, u1 = (col + 1) / N
      const v0 = row / N, v1 = (row + 1) / N
      const dTL = bilerp(tl, tr, br, bl, u0, v0)
      const dTR = bilerp(tl, tr, br, bl, u1, v0)
      const dBR = bilerp(tl, tr, br, bl, u1, v1)
      const dBL = bilerp(tl, tr, br, bl, u0, v1)
      const sx0 = u0 * srcW, sx1 = u1 * srcW
      const sy0 = v0 * srcH, sy1 = v1 * srcH
      drawTri(ctx, src, sx0, sy0, sx1, sy0, sx0, sy1, dTL, dTR, dBL, srcW, srcH)
      drawTri(ctx, src, sx1, sy0, sx1, sy1, sx0, sy1, dTR, dBR, dBL, srcW, srcH)
    }
  }
  ctx.imageSmoothingEnabled = oldSmoothing
  ctx.imageSmoothingQuality = oldQuality
  ctx.restore()
}

// ── Shape canvas renderer ──────────────────────────────────────────────────

function hexChannel(hex: string, idx: number): number {
  return parseInt(hex.slice(idx, idx + 2), 16)
}

function adjustHex(color: string, pct: number): string {
  const m = color.match(/^#([0-9a-f]{3,6})$/i)
  if (!m) return color
  const s = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1]
  const adj = (i: number) => {
    const v = hexChannel(s, i)
    const out = pct > 0 ? Math.round(v + (255 - v) * pct) : Math.round(v * (1 + pct))
    return Math.max(0, Math.min(255, out)).toString(16).padStart(2, '0')
  }
  return `#${adj(0)}${adj(2)}${adj(4)}`
}

function topFaceColor(fill: string, faceColor?: string) { return faceColor || adjustHex(fill, 0.35) }
function sideFaceColor(fill: string, faceColor?: string) { return faceColor ? adjustHex(faceColor, -0.25) : adjustHex(fill, -0.35) }

function regPoly(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, sides: number) {
  ctx.beginPath()
  for (let i = 0; i <= sides; i++) {
    const a = -Math.PI / 2 + (i / sides) * Math.PI * 2
    i === 0 ? ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a))
            : ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a))
  }
  ctx.closePath()
}

function addWave(x: number, y: number, seed = 0): [number, number] {
  const wave = Math.sin((x + seed) * 0.05) * 2 + Math.sin((y + seed) * 0.03) * 1.5
  return [x + wave * (0.5 + (seed % 10) * 0.05), y + wave * (0.3 + (seed % 7) * 0.05)]
}

// ── Shared shape path builders ──────────────────────────────────────────────
export interface PathCtx {
  beginPath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void
  closePath(): void
}

/** A heart that fills the w×h box. */
export function heartPath(ctx: PathCtx, w: number, h: number) {
  ctx.beginPath()
  ctx.moveTo(w / 2, h * 0.30)
  ctx.bezierCurveTo(w / 2, h * 0.08, 0,      h * 0.12, 0,      h * 0.38)
  ctx.bezierCurveTo(0,      h * 0.66, w * 0.30, h * 0.82, w / 2, h)
  ctx.bezierCurveTo(w * 0.70, h * 0.82, w,    h * 0.66, w,      h * 0.38)
  ctx.bezierCurveTo(w,      h * 0.12, w / 2, h * 0.08, w / 2, h * 0.30)
  ctx.closePath()
}

function seededRng(seed: number): () => number {
  let t = seed + 0x6d2b79f5
  return () => {
    t = Math.imul(t ^ (t >>> 15), 1 | t)
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Whiteboard-style hand-drawn rounded rectangle. 
 */
export function roughRoundRectPath(ctx: PathCtx, w: number, h: number, seed = 1337) {
  const base = Math.min(w, h) * 0.06       // corner radius
  const a    = Math.min(w, h) * 0.018      // GENTLE bow — much less inward curve
  const rnd  = seededRng(seed)
  const rad  = () => base * (0.6 + rnd() * 0.8)
  const bow  = () => a * (rnd() * 2 - 1)    // SIGNED: some sides bow out, some in (not all inward)

  const rTL = rad(), rTR = rad(), rBR = rad(), rBL = rad()
  const bTop = bow(), bRight = bow(), bBottom = bow(), bLeft = bow()

  ctx.beginPath()
  ctx.moveTo(rTL, 0)
  ctx.quadraticCurveTo(w / 2, bTop,        w - rTR, 0)
  ctx.quadraticCurveTo(w, 0,               w, rTR)
  ctx.quadraticCurveTo(w - bRight, h / 2,  w, h - rBR)
  ctx.quadraticCurveTo(w, h,               w - rBR, h)
  ctx.quadraticCurveTo(w / 2, h - bBottom, rBL, h)
  ctx.quadraticCurveTo(0, h,               0, h - rBL)
  ctx.quadraticCurveTo(bLeft, h / 2,       0, rTL)
  ctx.quadraticCurveTo(0, 0,               rTL, 0)
  ctx.closePath()
}

// Ordered points around a rounded rectangle, each nudged by a small random
// jitter so the outline wobbles like a hand-drawn line (not perfectly straight).
function roughRectPoints(w: number, h: number, seed: number): [number, number][] {
  const rnd = seededRng(seed)
  const m = Math.min(w, h)

  // ── PER-CORNER RADIUS — edit these freely (fraction of the short side) ──
  const rTL = m * 0.09   // top-left
  const rTR = m * 0.07   // top-right
  const rBR = m * 0.09   // bottom-right
  const rBL = m * 0.07   // bottom-left

  const jit = m * 0.004                       // wobble amount (subtle)
  const jx = () => (rnd() * 2 - 1) * jit
  const jy = () => (rnd() * 2 - 1) * jit
  const pts: [number, number][] = []
  const line = (x0: number, y0: number, x1: number, y1: number, n: number) => {
    for (let i = 0; i < n; i++) { const t = i / n; pts.push([x0 + (x1 - x0) * t + jx(), y0 + (y1 - y0) * t + jy()]) }
  }
  // `r` is now the radius of THIS corner
  const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n: number) => {
    for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); pts.push([cx + Math.cos(a) * r + jx(), cy + Math.sin(a) * r + jy()]) }
  }
  line(rTL, 0, w - rTR, 0, 14)                          // top edge
  arc(w - rTR, rTR, rTR, -Math.PI / 2, 0, 4)           // TR corner
  line(w, rTR, w, h - rBR, 14)                          // right edge
  arc(w - rBR, h - rBR, rBR, 0, Math.PI / 2, 4)        // BR corner
  line(w - rBR, h, rBL, h, 14)                          // bottom edge
  arc(rBL, h - rBL, rBL, Math.PI / 2, Math.PI, 4)      // BL corner
  line(0, h - rBL, 0, rTL, 14)                          // left edge
  arc(rTL, rTL, rTL, Math.PI, Math.PI * 1.5, 4)        // TL corner
  return pts
}

/**
 * Hand-drawn sketch rectangle. The outline is stroked segment-by-segment with a
 * width that swells and thins along each side (real pen-pressure feel), and the
 * points wobble so the lines aren't straight. Two passes add sketch depth.
 * Shared by the live canvas and export so they always match.
 */
export function drawSketchRect(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  fill: string, stroke: string, sw: number,
) {
  // Fill uses the smooth rounded path
  roughRoundRectPath(ctx, w, h, 1337)
  if (fill && fill !== 'transparent') { ctx.fillStyle = fill; ctx.fill() }
  if (sw <= 0) return

  ctx.save()
  ctx.strokeStyle = stroke || '#202020'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  const pass = (seed: number, alpha: number, widthScale: number, freq: number) => {
    const pts = roughRectPoints(w, h, seed)
    const wrnd = seededRng(seed * 31 + 7)
    const n = pts.length
    ctx.globalAlpha = alpha
    for (let i = 0; i < n; i++) {
      const A = pts[i], B = pts[(i + 1) % n]
      // width swells/thins along the perimeter: smooth sine + a little noise
      const phase = (i / n) * Math.PI * 2 * freq + seed
      const wv = 0.4 + 0.7 * (0.5 + 0.5 * Math.sin(phase)) + (wrnd() - 0.5) * 0.4
      ctx.lineWidth = Math.max(0.4, sw * widthScale * wv)
      ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke()
    }
  }

  pass(1337, 0.95, 1.0, 2.5)   // main, pressure-varied line
  pass(8888, 0.4,  0.6, 3.5)   // fainter second line for sketch depth
  ctx.restore()
}

export function drawShapeToCtx(el: ShapeElement, ctx: CanvasRenderingContext2D) {
  const w = el.width, h = el.height
  const r = Math.min(w, h) / 2
  const cx = w / 2, cy = h / 2

  ctx.fillStyle = el.fill
  ctx.strokeStyle = el.stroke || 'transparent'
  ctx.lineWidth = el.strokeWidth || 0

  // Identify if the shape is one of the hand-drawn variants
  const isHandStyle = el.shapeType.includes('sketch') || el.shapeType.includes('hand')

  const fillStroke = () => {
    ctx.fill()
    
    if ((el.strokeWidth || 0) > 0) {
      if (isHandStyle) {
        // MULTI-PASS STROKE: Creates the uneven marker bleed effect
        ctx.save()
        
        // Pass 1: Main solid line
        ctx.lineWidth = el.strokeWidth
        ctx.globalAlpha = 0.9
        ctx.stroke()

        // Pass 2: Slightly thinner, offset slightly, lower opacity
        ctx.lineWidth = (el.strokeWidth || 0) * 0.7
        ctx.translate(0.5, -0.5) 
        ctx.globalAlpha = 0.5
        ctx.stroke()

        // Pass 3: Even thinner, offset in a different direction
        ctx.lineWidth = (el.strokeWidth || 0) * 0.4
        ctx.translate(-1, 1)
        ctx.globalAlpha = 0.3
        ctx.stroke()
        
        ctx.restore()
      } else {
        // Standard perfect stroke for regular geometric shapes
        ctx.stroke()
      }
    }
  }

  switch (el.shapeType) {
    case 'rect':
      ctx.beginPath()
      if (el.cornerRadius > 0 && typeof (ctx as unknown as { roundRect?: unknown }).roundRect === 'function') {
        (ctx as unknown as { roundRect: (x:number,y:number,w:number,h:number,r:number)=>void }).roundRect(0, 0, w, h, el.cornerRadius)
      } else {
        ctx.rect(0, 0, w, h)
      }
      fillStroke()
      break

    case 'circle':
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); fillStroke(); break

    case 'triangle': regPoly(ctx, cx, cy, r, 3); fillStroke(); break
    case 'pentagon': regPoly(ctx, cx, cy, r, 5); fillStroke(); break
    case 'hexagon':  regPoly(ctx, cx, cy, r, 6); fillStroke(); break
    case 'octagon':  regPoly(ctx, cx, cy, r, 8); fillStroke(); break

    case 'star': {
      const outer = r, inner = r * 0.4
      ctx.beginPath()
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i / 10) * Math.PI * 2
        const rad = i % 2 === 0 ? outer : inner
        i === 0 ? ctx.moveTo(cx + rad * Math.cos(a), cy + rad * Math.sin(a))
                : ctx.lineTo(cx + rad * Math.cos(a), cy + rad * Math.sin(a))
      }
      ctx.closePath(); fillStroke(); break
    }

    case 'diamond':
      ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(w, cy); ctx.lineTo(cx, h); ctx.lineTo(0, cy)
      ctx.closePath(); fillStroke(); break

    case 'oval':
      ctx.beginPath(); ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2); fillStroke(); break

    case 'cone': {
      const baseRY = Math.max(6, Math.min(h * 0.14, 28))
      const baseY = h - baseRY
      const sw = el.strokeWidth || 0, sk = el.stroke || 'transparent'

      ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(0, baseY)
      ctx.ellipse(cx, baseY, cx, baseRY, 0, Math.PI, 0, false); ctx.closePath()
      ctx.fillStyle = el.fill; ctx.fill()
      if (sw > 0) { ctx.strokeStyle = sk; ctx.lineWidth = sw; ctx.stroke() }

      ctx.beginPath(); ctx.ellipse(cx, baseY, cx, baseRY, 0, 0, Math.PI * 2)
      ctx.fillStyle = topFaceColor(el.fill, el.faceColor); ctx.fill()
      if (sw > 0) ctx.stroke()

      ctx.beginPath(); ctx.ellipse(cx, baseY, cx, baseRY, 0, Math.PI, Math.PI * 2, false)
      ctx.strokeStyle = sideFaceColor(el.fill, el.faceColor)
      ctx.lineWidth = Math.max(1, sw); ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([])
      break
    }

    case 'cube': {
      const depth = el.depth ?? Math.min(w, h) * 0.38
      const ANGLE = Math.PI / 6
      const ox = depth * Math.cos(ANGLE), oy = depth * Math.sin(ANGLE)
      const fw = w - ox, fh = h - oy
      const sw = el.strokeWidth || 0, sk = el.stroke || 'transparent'
      const drawFace = (pts: number[], fill: string) => {
        ctx.beginPath(); ctx.moveTo(pts[0], pts[1])
        for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1])
        ctx.closePath(); ctx.fillStyle = fill; ctx.fill()
        if (sw > 0) { ctx.strokeStyle = sk; ctx.lineWidth = sw; ctx.stroke() }
      }
      drawFace([0, oy, fw, oy, fw, h, 0, h], el.fill)
      drawFace([ox, 0, w, 0, fw, oy, 0, oy], topFaceColor(el.fill, el.faceColor))
      drawFace([fw, oy, w, 0, w, fh, fw, h], sideFaceColor(el.fill, el.faceColor))
      break
    }

    case 'speechBubble': {
      const rad = Math.min(el.cornerRadius || 8, w * 0.15, h * 0.15)
      const bh = h * 0.78
      ctx.beginPath(); ctx.moveTo(rad, 0); ctx.lineTo(w - rad, 0)
      ctx.quadraticCurveTo(w, 0, w, rad); ctx.lineTo(w, bh - rad)
      ctx.quadraticCurveTo(w, bh, w - rad, bh); ctx.lineTo(w * 0.38, bh)
      ctx.lineTo(w * 0.22, h); ctx.lineTo(w * 0.14, bh); ctx.lineTo(rad, bh)
      ctx.quadraticCurveTo(0, bh, 0, bh - rad); ctx.lineTo(0, rad)
      ctx.quadraticCurveTo(0, 0, rad, 0); ctx.closePath(); fillStroke(); break
    }

    case 'roundedSpeech': {
      ctx.beginPath(); ctx.ellipse(cx, h * 0.40, cx, h * 0.40, 0, 0, Math.PI * 2); ctx.closePath(); fillStroke()
      const d1 = Math.max(w * 0.07, 4), d2 = Math.max(w * 0.05, 3)
      ctx.beginPath(); ctx.arc(w * 0.22, h * 0.76, d1, 0, Math.PI * 2); ctx.closePath(); fillStroke()
      ctx.beginPath(); ctx.arc(w * 0.12, h * 0.92, d2, 0, Math.PI * 2); ctx.closePath(); fillStroke()
      break
    }

    case 'rect-hand': {
      const tl = addWave(0, 0, 1), tr2 = addWave(w, 0, 2), br2 = addWave(w, h, 3), bl = addWave(0, h, 4)
      ctx.beginPath(); ctx.moveTo(tl[0],tl[1]); ctx.lineTo(tr2[0],tr2[1]); ctx.lineTo(br2[0],br2[1]); ctx.lineTo(bl[0],bl[1])
      ctx.closePath(); fillStroke(); break
    }

    case 'heart':
      heartPath(ctx, w, h); fillStroke(); break

    case 'rect-sketch':
      drawSketchRect(ctx, w, h, el.fill, el.stroke, el.strokeWidth || 0); break

    case 'circle-hand': {
      ctx.beginPath()
      for (let i = 0; i < 32; i++) {
        const a = (i / 32) * Math.PI * 2
        const [wx, wy] = addWave(cx + Math.cos(a) * r, cy + Math.sin(a) * r, i)
        i === 0 ? ctx.moveTo(wx, wy) : ctx.lineTo(wx, wy)
      }
      ctx.closePath(); fillStroke(); break
    }

    case 'square-hand': {
      const s = Math.min(w, h)
      const tl = addWave(0, 0, 1), tr2 = addWave(s, 0, 2), br2 = addWave(s, s, 3), bl = addWave(0, s, 4)
      ctx.beginPath(); ctx.moveTo(tl[0],tl[1]); ctx.lineTo(tr2[0],tr2[1]); ctx.lineTo(br2[0],br2[1]); ctx.lineTo(bl[0],bl[1])
      ctx.closePath(); fillStroke(); break
    }
  }
}

// ── Text canvas renderer ───────────────────────────────────────────────────

const WEIGHT_MAP_P: Record<string, string> = {
  normal: 'normal', medium: '500', semibold: '600', bold: 'bold'
}

export function drawTextToCtx(el: TextElement, ctx: CanvasRenderingContext2D) {
  const weight = WEIGHT_MAP_P[el.fontWeight] ?? 'normal'
  ctx.font = `${el.italic ? 'italic ' : ''}${weight} ${el.fontSize}px "${el.fontFamily}"`
  ctx.textBaseline = 'top'
  ctx.textAlign = el.align as CanvasTextAlign
  const startX = el.align === 'center' ? el.width / 2 : el.align === 'right' ? el.width : 0
  const lineH = el.fontSize * el.lineHeight

  const lines: string[] = []
  for (const para of el.content.split('\n')) {
    if (!para) { lines.push(''); continue }
    const words = para.split(' ')
    let line = ''
    for (const word of words) {
      const test = line ? line + ' ' + word : word
      if (ctx.measureText(test).width > el.width && line) { lines.push(line); line = word }
      else line = test
    }
    lines.push(line)
  }

  if (el.textStroke && el.textStrokeWidth > 0) {
    ctx.strokeStyle = el.textStroke; ctx.lineWidth = el.textStrokeWidth * 2
    lines.forEach((ln, i) => ctx.strokeText(ln, startX, i * lineH))
  }
  ctx.fillStyle = el.color
  lines.forEach((ln, i) => ctx.fillText(ln, startX, i * lineH))
}
