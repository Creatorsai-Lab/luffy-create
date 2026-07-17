import type { Background } from '../types/editor'
import { drawAnimatedBg } from './animator'
import { applyCanvasAdjustments, buildCssFilter } from './imageFilters'

// Draw a checkerboard to signal transparency (like image editors do).
function drawCheckerboard(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const cell = Math.max(12, Math.round(Math.min(w, h) / 40))
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#c9c9c9'
  for (let y = 0; y < h; y += cell) {
    for (let x = 0; x < w; x += cell) {
      if (((x / cell) + (y / cell)) % 2 === 0) ctx.fillRect(x, y, cell, cell)
    }
  }
}

function fillGradient(ctx: CanvasRenderingContext2D, bg: Extract<Background, { type: 'gradient' }>, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  const kind = bg.gradientType ?? 'linear'
  let grd: CanvasGradient
  if (kind === 'radial') {
    grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.6)
  } else if (kind === 'conic' && typeof ctx.createConicGradient === 'function') {
    grd = ctx.createConicGradient((bg.angle * Math.PI) / 180, cx, cy)
  } else {
    const angle = (bg.angle * Math.PI) / 180
    const dx = Math.cos(angle) * w / 2, dy = Math.sin(angle) * h / 2
    grd = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy)
  }
  grd.addColorStop(bg.fromStop ?? 0, bg.from)
  if (bg.via) grd.addColorStop(0.5, bg.via)        // optional middle color
  grd.addColorStop(bg.toStop ?? 1, bg.to)
  ctx.fillStyle = grd
  ctx.fillRect(0, 0, w, h)
}

/**
 * Render any non-image background (and image when `bgImage` supplied) to a 2D
 * context. Shared by the editor canvas and the preview modal so they match.
 */
export function drawBackground(
  ctx: CanvasRenderingContext2D,
  bg: Background,
  w: number,
  h: number,
  time: number,
  bgImage?: HTMLImageElement | null,
) {
  switch (bg.type) {
    case 'transparent':
      drawCheckerboard(ctx, w, h)
      break
    case 'solid':
      ctx.fillStyle = bg.color; ctx.fillRect(0, 0, w, h); break
    case 'gradient':
      fillGradient(ctx, bg, w, h); break
    case 'grid':
      ctx.fillStyle = bg.bgColor; ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = bg.lineColor; ctx.lineWidth = 1
      for (let x = 0; x <= w; x += bg.cellSize) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke() }
      for (let y = 0; y <= h; y += bg.cellSize) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke() }
      break
    case 'dots':
      ctx.fillStyle = bg.bgColor; ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = bg.dotColor
      for (let x = bg.spacing / 2; x < w; x += bg.spacing)
        for (let y = bg.spacing / 2; y < h; y += bg.spacing)
          { ctx.beginPath(); ctx.arc(x, y, bg.radius, 0, Math.PI * 2); ctx.fill() }
      break
    case 'animated':
      drawAnimatedBg(ctx, time, w, h, bg.colors, bg.variant, bg.speed); break
    case 'image':
      if (bgImage) {
        ctx.save()
        ctx.globalAlpha = bg.opacity ?? 1
        ctx.filter = buildCssFilter({ ...bg, width: w, height: h }) || 'none'
        if (bg.fit === 'fill') { ctx.drawImage(bgImage, 0, 0, w, h) }
        else {
          const s = Math.max(w / bgImage.width, h / bgImage.height)
          const sw = bgImage.width * s, sh = bgImage.height * s
          ctx.drawImage(bgImage, (w - sw) / 2, (h - sh) / 2, sw, sh)
        }
        if (bg.glass) {
          ctx.filter = 'none'
          ctx.fillStyle = 'rgba(255,255,255,0.18)'
          ctx.fillRect(0, 0, w, h)
        }
        applyCanvasAdjustments(ctx, { ...bg, width: w, height: h })
        ctx.restore()
      } else { ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0, 0, w, h) }
      break
  }
}
