/**
 * Auto-reframe: from face boxes sampled over a clip to a crop path that keeps
 * the speaker framed, like a camera operator would — still when they sit
 * still, a smooth pan when they move, a cut when the shot cuts. Pure: face
 * detection happens elsewhere (src/ai/smart/faces.ts).
 */
import type { CropKey } from '../../types/editor'

/** A face, 0–1 of the source frame (top-left corner and size). */
export interface FaceBox { x: number; y: number; w: number; h: number; score: number }
export interface FaceSample { t: number; faces: FaceBox[] }

export type ReframeMode = 'auto' | 'follow' | 'steady'

export interface ReframeOptions {
  /** Crop size, 0–1 of the source frame. */
  cropW: number
  cropH: number
  mode?: ReframeMode
}

export interface ReframeResult {
  keys: CropKey[]
  /** Share of samples with the speaker's face. */
  coverage: number
  /** True when the crop moves (follows); false when one still framing per shot was enough. */
  moving: boolean
  cuts: number
}

type Point = { t: number; cx: number; cy: number; size: number }

const MIN_SCORE = 0.5
/** A jump this far (0–1 of the frame) that stays is a shot change: the crop cuts instead of panning. */
const CUT_JUMP = 0.22

/** The speaker's face in each sample (null where none was found): the biggest face, followed while it stays near. */
export function trackMainFace(samples: FaceSample[]): Array<Point | null> {
  let prev: Point | null = null
  let lostFor = 0
  return samples.map(({ t, faces }) => {
    const candidates = faces.filter(f => f.score >= MIN_SCORE && f.w > 0 && f.h > 0)
      .map(f => ({ t, cx: f.x + f.w / 2, cy: f.y + f.h / 2, size: Math.sqrt(f.w * f.h) }))
    if (!candidates.length) {
      lostFor++
      return null
    }
    let pick = candidates.slice().sort((a, b) => b.size - a.size)[0]
    if (prev && lostFor < 8) {
      // Stay with the same person unless someone far bigger takes over the shot.
      const p = prev
      const near = candidates
        .map(c => ({ c, d: Math.hypot(c.cx - p.cx, c.cy - p.cy) }))
        .filter(({ d }) => d < 0.25)
        .sort((a, b) => a.d - b.d)[0]?.c
      if (near && !(pick !== near && pick.size > near.size * 1.8)) pick = near
    }
    prev = pick
    lostFor = 0
    return pick
  })
}

export function reframePath(samples: FaceSample[], opts: ReframeOptions): ReframeResult | null {
  const track = trackMainFace(samples)
  const found = track.filter((p): p is Point => Boolean(p))
  if (!found.length) return null
  const { cropW, cropH } = opts
  const mode = opts.mode ?? 'auto'

  // Where the crop should be centred for each sample: on the face, a little low so there is room above the head.
  const firstFound = found[0]
  let last = firstFound
  const targets = track.map((p, i) => {
    if (p) last = p
    const face = p ?? last
    return { t: samples[i].t, cx: clampCenter(face.cx, cropW), cy: clampCenter(face.cy + cropH * 0.1, cropH) }
  })

  // Shots: split where the framing jumps and stays there.
  const shots: Array<typeof targets> = [[]]
  targets.forEach((p, i) => {
    const prev = targets[i - 1]
    const next = targets[i + 1]
    const jump = (a: { cx: number; cy: number }, b: { cx: number; cy: number }) => Math.hypot(a.cx - b.cx, a.cy - b.cy) > CUT_JUMP
    if (prev && jump(p, prev) && (!next || !jump(next, p))) shots.push([])
    shots[shots.length - 1].push(p)
  })

  const keys: CropKey[] = []
  let moving = false
  for (const shot of shots) {
    const spreadX = Math.max(...shot.map(p => p.cx)) - Math.min(...shot.map(p => p.cx))
    const spreadY = Math.max(...shot.map(p => p.cy)) - Math.min(...shot.map(p => p.cy))
    const steady = mode === 'steady' || (mode === 'auto' && spreadX <= cropW * 0.3 && spreadY <= cropH * 0.3)
    const start = shot[0].t
    const end = shot[shot.length - 1].t
    // The crop jumps at a cut: the last key of the previous shot sits just before it.
    if (keys.length) keys.push({ ...keys[keys.length - 1], t: round(start - 0.001) })

    if (steady) {
      const cx = median(shot.map(p => p.cx))
      const cy = median(shot.map(p => p.cy))
      keys.push({ t: round(start), cx: round(cx), cy: round(cy) })
      if (end > start) keys.push({ t: round(end), cx: round(cx), cy: round(cy) })
      continue
    }

    // Follow: the camera stays put while the face is inside a dead zone, then eases after it…
    moving = true
    const zoneX = cropW * 0.12
    const zoneY = cropH * 0.12
    let cam = { cx: shot[0].cx, cy: shot[0].cy }
    const path = shot.map(p => {
      const dx = p.cx - cam.cx
      const dy = p.cy - cam.cy
      if (Math.abs(dx) > zoneX) cam = { ...cam, cx: cam.cx + (dx - Math.sign(dx) * zoneX) * 0.6 }
      if (Math.abs(dy) > zoneY) cam = { ...cam, cy: cam.cy + (dy - Math.sign(dy) * zoneY) * 0.6 }
      return { t: p.t, ...cam }
    })
    // …and the path is smoothed so it glides instead of stepping.
    const smooth = path.map((p, i) => {
      const window = path.slice(Math.max(0, i - 2), i + 3)
      return { t: p.t, cx: avg(window.map(q => q.cx)), cy: avg(window.map(q => q.cy)) }
    })
    keys.push(...smooth.map(p => ({ t: round(p.t), cx: round(clampCenter(p.cx, cropW)), cy: round(clampCenter(p.cy, cropH)) })))
  }

  return { keys: simplify(keys), coverage: found.length / samples.length, moving, cuts: shots.length - 1 }
}

/** Drops keys that lie on the line between their neighbours. */
function simplify(keys: CropKey[]): CropKey[] {
  if (keys.length < 3) return keys
  const out = [keys[0]]
  for (let i = 1; i < keys.length - 1; i++) {
    const a = out[out.length - 1]
    const b = keys[i]
    const c = keys[i + 1]
    const k = c.t === a.t ? 0 : (b.t - a.t) / (c.t - a.t)
    const off = Math.hypot(a.cx + (c.cx - a.cx) * k - b.cx, a.cy + (c.cy - a.cy) * k - b.cy)
    if (off > 0.002 || c.t - b.t < 0.01 || b.t - a.t < 0.01) out.push(b)
  }
  out.push(keys[keys.length - 1])
  return out
}

function clampCenter(c: number, size: number) {
  return Math.max(size / 2, Math.min(1 - size / 2, c))
}

function median(values: number[]) {
  const s = values.slice().sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function avg(values: number[]) {
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

function round(value: number) {
  return Math.round(value * 10000) / 10000
}
