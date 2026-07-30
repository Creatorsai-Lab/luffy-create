import type { EditorElement, ElementAnimation, EasingType, SlideDir } from '../types/editor'
export { getOutlineRevealClips } from './textOutlineReveal'

// ─── Easing ───────────────────────────────────────────────────────────────────

function ease(t: number, fn: EasingType): number {
  t = Math.max(0, Math.min(1, t))
  switch (fn) {
    case 'easeIn':    return t * t
    case 'easeOut':   return t * (2 - t)
    case 'easeInOut': return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
    case 'bounce': {
      const n1 = 7.5625, d1 = 2.75
      if (t < 1 / d1)      return n1 * t * t
      if (t < 2 / d1)      return n1 * (t -= 1.5 / d1) * t + 0.75
      if (t < 2.5 / d1)    return n1 * (t -= 2.25 / d1) * t + 0.9375
      return n1 * (t -= 2.625 / d1) * t + 0.984375
    }
    default: return t
  }
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * t }

function scaleAmount(anim: ElementAnimation, fallback: number) {
  const amount = anim.params?.scaleAmount
  return amount != null && isFinite(amount) ? Math.max(1, Math.min(20, amount)) : fallback
}

function hasConfiguredScaleAmount(anim: ElementAnimation) {
  return anim.params?.scaleAmount != null && isFinite(anim.params.scaleAmount)
}

// ─── Animated props snapshot ──────────────────────────────────────────────────

export interface AnimatedProps {
  x: number; y: number
  opacity: number
  scaleX: number; scaleY: number
  rotation: number
  offsetX: number; offsetY: number
  textProgress: number
  textMode: 'chars' | 'words' | 'bounceWords' | 'outlineReveal' | 'draw' | undefined
  dashOffset: number
  wipeProgress: number
  wipeDir: SlideDir | undefined
  chartAnimProgress: number
  counterValue: number
  counterText: string
  textColor?: string
}

export function getAnimatedProps(el: EditorElement, localTime: number): AnimatedProps {
  const props: AnimatedProps = {
    x: el.x, y: el.y,
    opacity: el.opacity,
    scaleX: 1, scaleY: 1,
    rotation: el.rotation,
    offsetX: 0, offsetY: 0,
    textProgress: 1,
    textMode: undefined,
    dashOffset: 0,
    wipeProgress: 1,
    wipeDir: undefined,
    chartAnimProgress: 1,
    counterValue: 0,
    counterText: '',
    textColor: undefined,
  }

  const anims = el.animations
  if (anims.length === 0) return props

  // Loop animations are identified by type (canonical) OR by timing field.
  // This guards against old saved projects where loop-type animations were
  // incorrectly stored with timing='onEnter'.
  const LOOP_TYPES = new Set(['pulse', 'bounceLoop', 'rotateLoop', 'flowLoop', 'fadeLoop', 'colorPulse'])
  const isLoop = (a: ElementAnimation) => LOOP_TYPES.has(a.type) || a.timing === 'loop'
  const textRevealTypes = new Set(['typewriter', 'typewriterChars', 'typewriterWords', 'textBounceIn', 'outlineRevealIn'])

  const moves  = anims.filter(a => a.type === 'move')
  const enters = anims.filter(a => a.type !== 'move' && !isLoop(a) && a.timing === 'onEnter')
  const exits  = anims.filter(a => a.type !== 'move' && !isLoop(a) && a.timing === 'onExit')
  const loops  = anims.filter(a => isLoop(a))

  // Guard against NaN from undefined/missing fields on older saved animations
  const safe = (v: number | undefined) => (v != null && isFinite(v) ? v : 0)

  // ── Visibility window ──────────────────────────────────────────────────────
  // firstEnterStart: when the EARLIEST enter animation begins
  // lastEnterEnd:    when ALL enter animations have finished
  // firstExitStart:  when the EARLIEST exit animation begins
  // lastExitEnd:     when ALL exit animations have finished
  const firstEnterStart = enters.length > 0
    ? Math.min(...enters.map(a => safe(a.startTime) + safe(a.delay)))
    : -Infinity

  const lastEnterEnd = enters.length > 0
    ? Math.max(...enters.map(a => safe(a.startTime) + safe(a.delay) + safe(a.duration)))
    : 0

  const firstExitStart = exits.length > 0
    ? Math.min(...exits.map(a => safe(a.startTime) + safe(a.delay)))
    : Infinity

  const lastExitEnd = exits.length > 0
    ? Math.max(...exits.map(a => safe(a.startTime) + safe(a.delay) + safe(a.duration)))
    : Infinity

  // Before first enter: element is invisible — return early, no animations run
  if (enters.length > 0 && localTime < firstEnterStart) {
    props.opacity          = 0
    props.textProgress     = 0
    props.chartAnimProgress = 0
    return props
  }

  // After last exit: element is invisible — return early
  if (exits.length > 0 && localTime >= lastExitEnd) {
    props.opacity = 0
    return props
  }

  // ── Enter animations ───────────────────────────────────────────────────────
  for (const anim of enters) {
    const start  = safe(anim.startTime) + safe(anim.delay)
    const end    = start + safe(anim.duration)
    const before = localTime < start
    const after  = localTime >= end
    const raw    = (localTime - start) / anim.duration
    const t      = ease(Math.max(0, Math.min(1, raw)), anim.easing)
    applyAnim(anim, t, before, after, el, props, localTime, undefined, enters.length > 1 && textRevealTypes.has(anim.type))
  }

  // ── Exit animations ────────────────────────────────────────────────────────
  for (const anim of exits) {
    const start  = safe(anim.startTime) + safe(anim.delay)
    const end    = start + safe(anim.duration)
    const before = localTime < start
    const after  = localTime >= end
    const raw    = (localTime - start) / anim.duration
    const t      = ease(Math.max(0, Math.min(1, raw)), anim.easing)
    applyAnim(anim, t, before, after, el, props, localTime)
  }

  // Move is timeline motion, not a visibility enter/exit animation. Keep it out
  // of the enter window so loop effects such as arrow flow can run while moving.
  for (const anim of moves) {
    const start  = safe(anim.startTime) + safe(anim.delay)
    const end    = start + safe(anim.duration)
    const before = localTime < start
    const after  = localTime >= end
    const raw    = (localTime - start) / anim.duration
    const t      = ease(Math.max(0, Math.min(1, raw)), anim.easing)
    applyAnim(anim, t, before, after, el, props, localTime)
  }

  // ── Loop animations ────────────────────────────────────────────────────────
  // Loops run ONLY during the element's stable visible phase:
  //   • After ALL enter animations have completed (loopWindowStart)
  //   • Before ANY exit animation begins (loopWindowEnd)
  // If there are no enter animations, loops start from their own configured time.
  const loopWindowStart = enters.length > 0 ? lastEnterEnd : 0
  const loopWindowEnd   = firstExitStart

  // Skip loop animations if the window is invalid (e.g., exit starts before enters finish)
  const hasValidLoopWindow = loopWindowEnd > loopWindowStart

  for (const anim of loops) {
    const animStart      = safe(anim.startTime) + safe(anim.delay)
    const effectiveStart = Math.max(animStart, loopWindowStart)
    
    // If there's a valid loop window, only run within it
    if (hasValidLoopWindow && localTime < loopWindowStart) continue
    if (hasValidLoopWindow && localTime >= loopWindowEnd)  continue
    
    // For loops with their own window that extends beyond valid loop window
    if (localTime < effectiveStart) continue

    if (anim.type === 'colorPulse') {
      const pulseCount = Math.max(1, Math.round(anim.params?.pulseCount ?? 2))
      const pulseDuration = Math.max(0.05, safe(anim.duration) || 0.4)
      const totalDuration = pulseCount * pulseDuration
      if (localTime >= effectiveStart + totalDuration) continue

      const elapsed = localTime - effectiveStart
      const pulseProgress = (elapsed % pulseDuration) / pulseDuration
      applyAnim(anim, pulseProgress, false, false, el, props, localTime, effectiveStart)
      continue
    }
    
    // Calculate proper progress within the loop ( accounting for delay )
    const timeSinceAnimStart = localTime - animStart
    const loopProgress = anim.duration > 0 ? ((timeSinceAnimStart % anim.duration) / anim.duration) : 0
    applyAnim(anim, loopProgress, false, false, el, props, localTime, effectiveStart)
  }

  return props
}

function applyAnim(
  anim: ElementAnimation,
  t: number,
  before: boolean,
  after: boolean,
  el: EditorElement,
  out: AnimatedProps,
  localTime: number,
  loopStart?: number,
  composeTextReveal = false
) {
  const dist = anim.params?.distance ?? 80

  switch (anim.type) {
    case 'fadeIn':
      if (before) { out.opacity = 0; return }
      if (after)  { out.opacity = el.opacity; return }
      out.opacity = lerp(0, el.opacity, t)
      break

    case 'fadeOut':
      if (after) { out.opacity = 0; return }
      if (before) return
      out.opacity = lerp(el.opacity, 0, t)
      break

    case 'slideIn': {
      // Arrow label = direction of movement: ← Left means element moves left (enters from right)
      const dir = anim.params?.direction ?? 'right'
      if (before) {
        out.opacity = 0
        if (dir === 'left')  out.x = el.x + dist   // enters from right, moves left
        if (dir === 'right') out.x = el.x - dist   // enters from left, moves right
        if (dir === 'up')    out.y = el.y + dist   // enters from below, moves up
        if (dir === 'down')  out.y = el.y - dist   // enters from above, moves down
        return
      }
      if (after) { out.x = el.x; out.y = el.y; out.opacity = el.opacity; return }
      out.opacity = lerp(0, el.opacity, t)
      if (dir === 'left')  out.x = lerp(el.x + dist, el.x, t)
      if (dir === 'right') out.x = lerp(el.x - dist, el.x, t)
      if (dir === 'up')    out.y = lerp(el.y + dist, el.y, t)
      if (dir === 'down')  out.y = lerp(el.y - dist, el.y, t)
      break
    }

    case 'slideOut': {
      const dir = anim.params?.direction ?? 'right'
      if (after) {
        out.opacity = 0
        if (dir === 'left')  out.x = el.x - dist
        if (dir === 'right') out.x = el.x + dist
        if (dir === 'up')    out.y = el.y - dist
        if (dir === 'down')  out.y = el.y + dist
        return
      }
      if (before) return
      out.opacity = lerp(el.opacity, 0, t)
      if (dir === 'left')  out.x = lerp(el.x, el.x - dist, t)
      if (dir === 'right') out.x = lerp(el.x, el.x + dist, t)
      if (dir === 'up')    out.y = lerp(el.y, el.y - dist, t)
      if (dir === 'down')  out.y = lerp(el.y, el.y + dist, t)
      break
    }

    case 'scaleIn':
      {
      const configuredScale = hasConfiguredScaleAmount(anim)
      const targetScale = configuredScale ? scaleAmount(anim, 1) : 1
      if (anim.timing === 'onExit') {
        const exitTarget = configuredScale ? targetScale : 0
        if (after)  { out.scaleX = exitTarget; out.scaleY = exitTarget; out.opacity = 0; return }
        if (before) return
        out.scaleX  = lerp(1, exitTarget, t)
        out.scaleY  = lerp(1, exitTarget, t)
        out.opacity = lerp(el.opacity, 0, t)
      } else {
        if (before) { out.scaleX = 0; out.scaleY = 0; out.opacity = 0; return }
        if (after)  { out.scaleX = targetScale; out.scaleY = targetScale; out.opacity = el.opacity; return }
        out.scaleX  = lerp(0, targetScale, t)
        out.scaleY  = lerp(0, targetScale, t)
        out.opacity = lerp(0, el.opacity, t)
      }
      break
      }

    case 'scaleOut':
      {
      const configuredScale = hasConfiguredScaleAmount(anim)
      const startScale = scaleAmount(anim, 2.5)
      const endScale = configuredScale ? 1 / scaleAmount(anim, 5) : 0
      if (anim.timing === 'onEnter') {
        if (before) { out.scaleX = startScale; out.scaleY = startScale; out.opacity = 0; return }
        if (after)  { out.scaleX = 1; out.scaleY = 1; out.opacity = el.opacity; return }
        out.scaleX  = lerp(startScale, 1, t)
        out.scaleY  = lerp(startScale, 1, t)
        out.opacity = lerp(0, el.opacity, t)
      } else {
        if (after)  { out.scaleX = endScale; out.scaleY = endScale; out.opacity = 0; return }
        if (before) return
        out.scaleX  = lerp(1, endScale, t)
        out.scaleY  = lerp(1, endScale, t)
        out.opacity = lerp(el.opacity, 0, t)
      }
      break
      }

    case 'typewriter':
      if (before) { if (!composeTextReveal) out.opacity = 0; out.textProgress = 0; return }
      if (after)  { out.textProgress = 1; return }
      out.textProgress = t
      break

    case 'drawPath':
      if (before) { out.opacity = 0; out.textProgress = 0; return }
      if (after)  { out.opacity = el.opacity; out.textProgress = 1; return }
      out.textProgress = t
      out.opacity = lerp(0, el.opacity, t)
      break

    case 'spin':
      if (before || after) return
      out.rotation = el.rotation + lerp(0, 360, t)
      break

    case 'move': {
      const dx = anim.params?.deltaX ?? 0
      const dy = anim.params?.deltaY ?? 0
      const startOffsetX = anim.params?.moveMode === 'coordinates' ? (anim.params?.startOffsetX ?? 0) : 0
      const startOffsetY = anim.params?.moveMode === 'coordinates' ? (anim.params?.startOffsetY ?? 0) : 0
      if (before) return
      if (after) {
        out.x = el.x + startOffsetX + dx
        out.y = el.y + startOffsetY + dy
        return
      }
      out.x = lerp(el.x + startOffsetX, el.x + startOffsetX + dx, t)
      out.y = lerp(el.y + startOffsetY, el.y + startOffsetY + dy, t)
      break
    }

    case 'wipeIn': {
      const dir = (anim.params?.direction ?? 'right') as SlideDir
      if (before) { out.opacity = 0; out.wipeProgress = 0; out.wipeDir = dir; return }
      if (after)  { out.wipeProgress = 1; out.wipeDir = undefined; return }
      out.wipeProgress = t
      out.wipeDir = dir
      break
    }

    case 'wipeOut': {
      const dir = (anim.params?.direction ?? 'right') as SlideDir
      if (after)  { out.opacity = 0; out.wipeProgress = 0; out.wipeDir = dir; return }
      if (before) return
      out.wipeProgress = 1 - t
      out.wipeDir = dir
      break
    }

    // ─── Text-specific animations ───────────────────────────────────────────
    case 'typewriterChars':
      if (before) { if (!composeTextReveal) out.opacity = 0; out.textProgress = 0; out.textMode = 'chars'; return }
      if (after)  { out.textProgress = 1; out.textMode = 'chars'; return }
      out.textProgress = t
      out.textMode = 'chars'
      break

    case 'typewriterWords':
      if (before) { if (!composeTextReveal) out.opacity = 0; out.textProgress = 0; out.textMode = 'words'; return }
      if (after)  { out.textProgress = 1; out.textMode = 'words'; return }
      out.textProgress = t
      out.textMode = 'words'
      break

    case 'textBounceIn':
      if (before) { if (!composeTextReveal) out.opacity = 0; out.textProgress = 0; out.textMode = 'bounceWords'; return }
      if (after)  { out.textProgress = 1; out.textMode = 'bounceWords'; return }
      out.textProgress = t
      out.textMode = 'bounceWords'
      break

    case 'textFade':
      if (anim.timing === 'onExit') {
        if (after)  { out.opacity = 0; return }
        if (before) return
        out.opacity = lerp(el.opacity, 0, t)
      } else {
        if (before) { out.opacity = 0; return }
        if (after)  { out.opacity = el.opacity; return }
        out.opacity = lerp(0, el.opacity, t)
      }
      break

    case 'outlineRevealIn':
      if (before) { if (!composeTextReveal) out.opacity = 0; out.textProgress = 0; return }
      if (after)  { out.textProgress = 1; out.textMode = undefined; return }
      out.textProgress = t
      out.textMode = 'outlineReveal'
      break

    case 'outlineRevealOut':
      if (after) { out.opacity = 0; out.textProgress = 0; out.textMode = undefined; return }
      if (before) return
      out.textProgress = 1 - t
      out.textMode = 'outlineReveal'
      break

    // ─── Loop animations ────────────────────────────────────────────────────
    // loopStart is the effectiveStart passed from the loop dispatch section;
    // loopProgress is the normalized progress (0-1) within the current loop cycle
    case 'pulse': {
      if (before) return
      const elapsed = localTime - (loopStart ?? (anim.startTime + anim.delay))
      const phase   = (elapsed % anim.duration) / anim.duration
      const v       = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2)
      out.scaleX    = 0.88 + 0.24 * v
      out.scaleY    = out.scaleX
      break
    }

    case 'bounceLoop': {
      if (before) return
      const elapsed  = localTime - (loopStart ?? (anim.startTime + anim.delay))
      const phase    = (elapsed % anim.duration) / anim.duration
      const v        = Math.sin(phase * Math.PI * 2)
      const loopDist = anim.params?.distance ?? 24
      out.y = el.y + v * loopDist
      break
    }

    case 'rotateLoop': {
      if (before) return
      const elapsed = localTime - (loopStart ?? (anim.startTime + anim.delay))
      const turns   = elapsed / anim.duration
      out.rotation  = el.rotation + turns * 360
      out.offsetX   = el.width / 2
      out.offsetY   = el.height / 2
      break
    }

    // ─── Arrow-specific animations ──────────────────────────────────────────
    case 'drawOff':
      if (before) { out.textProgress = 1; return }
      if (after)  { out.textProgress = 0; out.opacity = 0; return }
      out.textProgress = lerp(1, 0, t)
      out.opacity = lerp(el.opacity, 0, Math.max(0, (t - 0.7) / 0.3))
      break

    case 'flowLoop': {
      if (before) return
      const elapsed = localTime - (loopStart ?? (anim.startTime + anim.delay))
      out.dashOffset = -(elapsed * 60) % 200
      break
    }

    case 'fadeLoop': {
      if (before) return
      const elapsed = localTime - (loopStart ?? (anim.startTime + anim.delay))
      const phase   = (elapsed % anim.duration) / anim.duration
      const v       = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2)
      out.opacity   = lerp(el.opacity * 0.1, el.opacity, v)
      break
    }

    case 'colorPulse': {
      if (before) return
      const baseColor = 'color' in el ? String((el as { color: string }).color) : '#222222'
      const pulseColor = anim.params?.pulseColor ?? '#ffea00'
      const strength = Math.sin(Math.max(0, Math.min(1, t)) * Math.PI)
      out.textColor = mixHexColor(baseColor, pulseColor, strength)
      break
    }

    // ─── Chart-specific animations ──────────────────────────────────────────
    case 'chartBarsRise':
      if (before) { out.opacity = 0; out.chartAnimProgress = 0; return }
      if (after)  { out.opacity = el.opacity; out.chartAnimProgress = 1; return }
      out.opacity = lerp(0, el.opacity, t)
      out.chartAnimProgress = t
      break

    case 'chartLineDraw':
      if (before) { out.opacity = 0; out.chartAnimProgress = 0; return }
      if (after)  { out.opacity = el.opacity; out.chartAnimProgress = 1; return }
      out.opacity = lerp(0, el.opacity, Math.min(1, t * 3))
      out.chartAnimProgress = t
      break

    case 'chartAreaFlow':
      if (before) { out.opacity = 0; out.chartAnimProgress = 0; return }
      if (after)  { out.opacity = el.opacity; out.chartAnimProgress = 1; return }
      out.opacity = lerp(0, el.opacity, Math.min(1, t * 3))
      out.chartAnimProgress = t
      break

    case 'chartPieSpin':
      if (before) { out.opacity = 0; out.chartAnimProgress = 0; return }
      if (after)  { out.opacity = el.opacity; out.chartAnimProgress = 1; return }
      out.opacity = lerp(0, el.opacity, Math.min(1, t * 4))
      out.chartAnimProgress = t
      break
  }
}

function parseHexColor(color: string): [number, number, number] | null {
  const match = color.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!match) return null
  let hex = match[1]
  if (hex.length === 3) hex = hex.split('').map(ch => ch + ch).join('')
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ]
}

function mixHexColor(from: string, to: string, t: number): string {
  const a = parseHexColor(from)
  const b = parseHexColor(to)
  if (!a || !b) return t > 0.5 ? to : from
  const clamped = Math.max(0, Math.min(1, t))
  const parts = a.map((value, index) => Math.round(lerp(value, b[index], clamped)))
  return `#${parts.map(value => value.toString(16).padStart(2, '0')).join('')}`
}

// ─── Background animation helper ─────────────────────────────────────────────

// Convert a #rgb / #rrggbb color to an rgba() string with the given alpha.
function hexA(hex: string, a: number): string {
  const m = hex.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!m) return `rgba(99,102,241,${a})`
  let s = m[1]
  if (s.length === 3) s = s.split('').map(c => c + c).join('')
  const r = parseInt(s.slice(0, 2), 16)
  const g = parseInt(s.slice(2, 4), 16)
  const b = parseInt(s.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${a})`
}

function addThreeStops(grad: CanvasGradient, colors: string[], fallback: [string, string, string]) {
  grad.addColorStop(0, colors[0] ?? fallback[0])
  grad.addColorStop(0.5, colors[1] ?? fallback[1])
  grad.addColorStop(1, colors[2] ?? fallback[2])
}

function pseudo(seed: number) {
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

function drawGrain(ctx: CanvasRenderingContext2D, w: number, h: number, time: number, strength = 1) {
  const tileSize = 180
  const tick = Math.floor(time * 5)
  const tile = document.createElement('canvas')
  tile.width = tileSize
  tile.height = tileSize
  const tileCtx = tile.getContext('2d')
  if (!tileCtx) return

  const image = tileCtx.createImageData(tileSize, tileSize)
  for (let y = 0; y < tileSize; y++) {
    for (let x = 0; x < tileSize; x++) {
      const i = (y * tileSize + x) * 4
      const n = pseudo(x * 2.13 + y * 7.91 + tick * 11.7)
      const fine = pseudo(x * 13.37 + y * 3.71 + tick * 2.3)
      const value = Math.round(105 + n * 150)
      image.data[i] = value
      image.data[i + 1] = value
      image.data[i + 2] = value
      image.data[i + 3] = Math.round((55 + fine * 135) * strength)
    }
  }
  tileCtx.putImageData(image, 0, 0)

  ctx.save()
  ctx.filter = 'none'
  ctx.globalAlpha = 0.42
  ctx.globalCompositeOperation = 'overlay'
  const pattern = ctx.createPattern(tile, 'repeat')
  if (pattern) {
    ctx.fillStyle = pattern
    ctx.fillRect(0, 0, w, h)
  }

  ctx.globalAlpha = 0.18
  ctx.globalCompositeOperation = 'screen'
  const sparkle = ctx.createPattern(tile, 'repeat')
  if (sparkle) {
    ctx.translate((tick % tileSize) * 0.37, (tick % tileSize) * 0.19)
    ctx.fillStyle = sparkle
    ctx.fillRect(-tileSize, -tileSize, w + tileSize * 2, h + tileSize * 2)
  }
  ctx.restore()
}

export function drawAnimatedBg(
  ctx: CanvasRenderingContext2D,
  time: number,
  w: number,
  h: number,
  colors: string[],
  variant: string,
  speed: number
) {
  const t = (time * speed * 0.1) % 1

  if (variant === 'gradient-flow') {
    const angle = t * Math.PI * 3
    const cx = w / 2 + Math.cos(angle) * w * 0.3
    const cy = h / 2 + Math.sin(angle) * h * 0.3
    const grad = ctx.createRadialGradient(cx, cy, 0, w / 2, h / 2, Math.max(w, h) * 0.7)
    const c1 = colors[0] ?? '#6366f1'
    const c2 = colors[1] ?? '#0f0f1a'
    grad.addColorStop(0, c1)
    grad.addColorStop(1, c2)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)
  } else if (variant === 'wave') {
    const c1 = colors[0] ?? '#6366f1'
    const c2 = colors[1] ?? '#22d3ee'
    // Faded blended base: soft vertical gradient between the two colors
    const base = ctx.createLinearGradient(0, 0, 0, h)
    base.addColorStop(0, c2)
    base.addColorStop(1, c1)
    ctx.fillStyle = base
    ctx.fillRect(0, 0, w, h)

    const phase = t * Math.PI * 2
    const bob   = Math.sin(phase * 0.5) * h * 0.04   // slow whole-wave up/down wiggle

    // One soft, semi-transparent wave band, faded at the edges so the two colors blend.
    const drawWave = (amp: number, freq: number, yBase: number, alpha: number, col: string, dir: number) => {
      const g = ctx.createLinearGradient(0, 0, w, 0)
      g.addColorStop(0,   hexA(col, 0))
      g.addColorStop(0.5, hexA(col, alpha))
      g.addColorStop(1,   hexA(col, 0))
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.moveTo(0, h)
      for (let x = 0; x <= w; x += 4) {
        // dir<0 ⇒ crest travels right→left; extra term adds gentle vertical wiggle
        const y = yBase + bob
          + Math.sin((x / w) * Math.PI * freq + dir * phase) * amp
          + Math.sin((x / w) * Math.PI * (freq * 1.7) + dir * phase * 1.3) * amp * 0.35
        x === 0 ? ctx.lineTo(0, y) : ctx.lineTo(x, y)
      }
      ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill()
    }

    drawWave(h * 0.09, 4, h * 0.55, 0.35, c1, -1)
  } else if (variant === 'aurora') {
    // Two soft radial blobs drifting on a dark base — northern-lights feel
    const c1 = colors[0] ?? '#6366f1'
    const c2 = colors[1] ?? '#3d49ee'
    ctx.fillStyle = '#0b1020'; ctx.fillRect(0, 0, w, h)
    const blob = (cx: number, cy: number, col: string, r: number) => {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
      g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
    }
    const a = t * Math.PI * 2
    ctx.globalAlpha = 0.55
    blob(w * (0.50 + 0.18 * Math.cos(a)),       h * (0.4 + 0.2 * Math.sin(a)),       c1, Math.max(w, h) * 0.5)
    blob(w * (0.65 + 0.18 * Math.cos(a + 2.2)), h * (0.6 + 0.2 * Math.sin(a + 2.2)), c2, Math.max(w, h) * 0.5)
    ctx.globalAlpha = 1
  } else if (variant === 'conic-rotate' && typeof ctx.createConicGradient === 'function') {
    const g = ctx.createConicGradient(t * Math.PI * 2, w / 2, h / 2)
    const c1 = colors[0] ?? '#6366f1'
    const c2 = colors[1] ?? '#0f0f1a'
    g.addColorStop(0, c1); g.addColorStop(0.5, c2); g.addColorStop(1, c1)
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
  } else if (variant === 'three-color-drift') {
    const c1 = colors[0] ?? '#6366f1'
    const c2 = colors[1] ?? '#22d3ee'
    const c3 = colors[2] ?? '#f97316'
    const phase = t * Math.PI * 2
    const base = ctx.createLinearGradient(
      w / 2 + Math.cos(phase) * w * 0.55,
      h / 2 + Math.sin(phase) * h * 0.55,
      w / 2 - Math.cos(phase) * w * 0.55,
      h / 2 - Math.sin(phase) * h * 0.55,
    )
    addThreeStops(base, [c1, c2, c3], ['#6366f1', '#22d3ee', '#f97316'])
    ctx.fillStyle = base
    ctx.fillRect(0, 0, w, h)

    const blob = (cx: number, cy: number, color: string, alpha: number) => {
      const r = Math.max(w, h) * 0.52
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
      g.addColorStop(0, hexA(color, alpha))
      g.addColorStop(1, hexA(color, 0))
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
    }
    blob(w * (0.5 + 0.28 * Math.cos(phase * 0.8)), h * (0.5 + 0.22 * Math.sin(phase * 1.1)), c2, 0.42)
    blob(w * (0.5 + 0.25 * Math.cos(phase + 2.1)), h * (0.5 + 0.24 * Math.sin(phase + 1.5)), c3, 0.36)
  } else if (variant === 'sand-grain-gradient') {
    const c1 = colors[0] ?? '#d8b46a'
    const c2 = colors[1] ?? '#f0d9a0'
    const c3 = colors[2] ?? '#8f6b3e'
    const phase = t * Math.PI * 2
    const base = ctx.createLinearGradient(
      Math.cos(phase * 0.45) * w * 0.15,
      0,
      w,
      h + Math.sin(phase * 0.55) * h * 0.18,
    )
    addThreeStops(base, [c1, c2, c3], ['#d8b46a', '#f0d9a0', '#8f6b3e'])
    ctx.fillStyle = base
    ctx.fillRect(0, 0, w, h)

    const light = ctx.createRadialGradient(
      w * (0.45 + 0.1 * Math.cos(phase)),
      h * (0.35 + 0.08 * Math.sin(phase * 0.9)),
      0,
      w * 0.5,
      h * 0.5,
      Math.max(w, h) * 0.85,
    )
    light.addColorStop(0, 'rgba(255,244,203,0.28)')
    light.addColorStop(1, 'rgba(99,67,28,0)')
    ctx.fillStyle = light
    ctx.fillRect(0, 0, w, h)

    drawGrain(ctx, w, h, time, 1)
  } else {
    // gradient-shift (and fallback): linear gradient whose angle sweeps over time
    const ang = t * Math.PI * 2
    const dx = Math.cos(ang) * w / 2, dy = Math.sin(ang) * h / 2
    const grad = ctx.createLinearGradient(w/2 - dx, h/2 - dy, w/2 + dx, h/2 + dy)
    grad.addColorStop(0, colors[0] ?? '#6366f1')
    grad.addColorStop(1, colors[1] ?? '#0f0f1a')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)
  }
}
