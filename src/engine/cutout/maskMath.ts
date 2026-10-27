/**
 * Pure mask maths for background removal (no DOM, unit-tested): resizing,
 * the guided filter that snaps a coarse mask to the picture's real edges,
 * connected regions and growing (to follow a picked subject through a
 * video), run-length storage, and combining the automatic mask with
 * keep/remove picks. Masks are bytes 0–255, row by row.
 */

export interface Mask { data: Uint8Array; w: number; h: number }

/** Bilinear resize of a byte mask. */
export function resizeMask(src: Uint8Array, sw: number, sh: number, dw: number, dh: number): Uint8Array {
  const out = new Uint8Array(dw * dh)
  const sx = sw / dw, sy = sh / dh
  for (let y = 0; y < dh; y++) {
    const fy = Math.max(0, Math.min(sh - 1, (y + 0.5) * sy - 0.5))
    const y0 = Math.floor(fy), y1 = Math.min(sh - 1, y0 + 1), ty = fy - y0
    for (let x = 0; x < dw; x++) {
      const fx = Math.max(0, Math.min(sw - 1, (x + 0.5) * sx - 0.5))
      const x0 = Math.floor(fx), x1 = Math.min(sw - 1, x0 + 1), tx = fx - x0
      const a = src[y0 * sw + x0] + (src[y0 * sw + x1] - src[y0 * sw + x0]) * tx
      const b = src[y1 * sw + x0] + (src[y1 * sw + x1] - src[y1 * sw + x0]) * tx
      out[y * dw + x] = Math.round(a + (b - a) * ty)
    }
  }
  return out
}

/** A rectangle (in pixels of a w×h mask) cut out and resized to dw×dh. */
export function cropMask(m: Mask, x: number, y: number, cw: number, ch: number, dw: number, dh: number): Uint8Array {
  const out = new Uint8Array(dw * dh)
  for (let j = 0; j < dh; j++) {
    const fy = Math.max(0, Math.min(m.h - 1, y + (j + 0.5) * (ch / dh) - 0.5))
    const y0 = Math.floor(fy), y1 = Math.min(m.h - 1, y0 + 1), ty = fy - y0
    for (let i = 0; i < dw; i++) {
      const fx = Math.max(0, Math.min(m.w - 1, x + (i + 0.5) * (cw / dw) - 0.5))
      const x0 = Math.floor(fx), x1 = Math.min(m.w - 1, x0 + 1), tx = fx - x0
      const a = m.data[y0 * m.w + x0] + (m.data[y0 * m.w + x1] - m.data[y0 * m.w + x0]) * tx
      const b = m.data[y1 * m.w + x0] + (m.data[y1 * m.w + x1] - m.data[y1 * m.w + x0]) * tx
      out[j * dw + i] = Math.round(a + (b - a) * ty)
    }
  }
  return out
}

/** Mean over a (2r+1)² window at every pixel (edges clamp), via an integral image. */
function boxMean(a: Float32Array, w: number, h: number, r: number): Float32Array {
  const W = w + 1
  const sum = new Float64Array(W * (h + 1))
  for (let y = 0; y < h; y++) {
    let row = 0
    for (let x = 0; x < w; x++) {
      row += a[y * w + x]
      sum[(y + 1) * W + x + 1] = sum[y * W + x + 1] + row
    }
  }
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1)
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1)
      out[y * w + x] = (sum[y1 * W + x1] - sum[y0 * W + x1] - sum[y1 * W + x0] + sum[y0 * W + x0]) / ((y1 - y0) * (x1 - x0))
    }
  }
  return out
}

/**
 * Guided filter (He et al.): the mask follows the edges of `guide` (luminance
 * 0–1, same size). Turns an upscaled low-resolution mask into one whose edges
 * sit on the picture's real edges — hair, mirrors, fingers. `r` is the window
 * radius in pixels, `eps` how strongly flat areas are smoothed.
 */
export function guidedFilter(guide: Float32Array, mask: Uint8Array, w: number, h: number, r: number, eps = 1e-3): Uint8Array {
  const n = w * h
  const p = new Float32Array(n)
  for (let i = 0; i < n; i++) p[i] = mask[i] / 255
  const ip = new Float32Array(n), ii = new Float32Array(n)
  for (let i = 0; i < n; i++) { ip[i] = guide[i] * p[i]; ii[i] = guide[i] * guide[i] }
  const mI = boxMean(guide, w, h, r), mp = boxMean(p, w, h, r)
  const mIp = boxMean(ip, w, h, r), mII = boxMean(ii, w, h, r)
  const a = new Float32Array(n), b = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const varI = mII[i] - mI[i] * mI[i]
    a[i] = (mIp[i] - mI[i] * mp[i]) / (varI + eps)
    b[i] = mp[i] - a[i] * mI[i]
  }
  const ma = boxMean(a, w, h, r), mb = boxMean(b, w, h, r)
  const out = new Uint8Array(n)
  for (let i = 0; i < n; i++) out[i] = Math.max(0, Math.min(255, Math.round((ma[i] * guide[i] + mb[i]) * 255)))
  return out
}

/** Luminance 0–1 of RGBA pixels. */
export function luminance(rgba: Uint8ClampedArray | Uint8Array, n: number): Float32Array {
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = (0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]) / 255
  return out
}

/** The edge-refine window for a mask of this size (≈ 1/120 of the long side, at least 2 px). */
export function refineRadius(w: number, h: number) {
  return Math.max(2, Math.round(Math.max(w, h) / 120))
}

/** Grows the "on" (≥ 128) area by r pixels (square window). */
export function dilate(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const tmp = new Uint8Array(w * h), out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    // Two sweeps per row: distance to the nearest "on" pixel on the left, then the right.
    let last = -Infinity
    for (let x = 0; x < w; x++) { if (mask[y * w + x] >= 128) last = x; if (x - last <= r) tmp[y * w + x] = 255 }
    last = Infinity
    for (let x = w - 1; x >= 0; x--) { if (mask[y * w + x] >= 128) last = x; if (last - x <= r) tmp[y * w + x] = 255 }
  }
  for (let x = 0; x < w; x++) {
    let last = -Infinity
    for (let y = 0; y < h; y++) { if (tmp[y * w + x]) last = y; if (y - last <= r) out[y * w + x] = 255 }
    last = Infinity
    for (let y = h - 1; y >= 0; y--) { if (tmp[y * w + x]) last = y; if (last - y <= r) out[y * w + x] = 255 }
  }
  return out
}

/** Connected regions of the "on" (≥ 128) area (4-neighbour): a label per pixel (0 = off) and the count. */
export function regions(mask: Uint8Array, w: number, h: number): { labels: Int32Array; count: number } {
  const labels = new Int32Array(w * h)
  const stack: number[] = []
  let count = 0
  for (let start = 0; start < w * h; start++) {
    if (mask[start] < 128 || labels[start]) continue
    count++
    labels[start] = count
    stack.push(start)
    while (stack.length) {
      const i = stack.pop()!
      const x = i % w, y = (i - x) / w
      const visit = (j: number) => { if (mask[j] >= 128 && !labels[j]) { labels[j] = count; stack.push(j) } }
      if (x > 0) visit(i - 1)
      if (x < w - 1) visit(i + 1)
      if (y > 0) visit(i - w)
      if (y < h - 1) visit(i + w)
    }
  }
  return { labels, count }
}

/**
 * The regions of `base` that touch `near` (both byte masks): follows a picked
 * subject from one video frame to the next, which moves only a little.
 * Returns 255 on the chosen regions, 0 elsewhere.
 */
export function regionsTouching(base: Uint8Array, near: Uint8Array, w: number, h: number): Uint8Array {
  const { labels, count } = regions(base, w, h)
  const chosen = new Uint8Array(count + 1)
  for (let i = 0; i < w * h; i++) if (labels[i] && near[i] >= 128) chosen[labels[i]] = 1
  const out = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) if (chosen[labels[i]]) out[i] = 255
  return out
}

/**
 * Picks applied to the automatic mask: with keep objects, only what is near
 * them stays (and the objects themselves, even if the automatic mask missed
 * them); remove objects are taken out. All masks the same size.
 */
export function applyPicks(base: Uint8Array, keep: Uint8Array | null, remove: Uint8Array | null, w: number, h: number, nearRadius: number): Uint8Array {
  const out = new Uint8Array(base)
  if (keep) {
    const near = dilate(keep, w, h, nearRadius)
    for (let i = 0; i < out.length; i++) out[i] = Math.max(near[i] ? out[i] : 0, keep[i])
  }
  if (remove) for (let i = 0; i < out.length; i++) out[i] = Math.round(out[i] * (1 - remove[i] / 255))
  return out
}

/** Union (max) of byte masks of the same size; null when there are none. */
export function unionMasks(masks: Uint8Array[]): Uint8Array | null {
  if (!masks.length) return null
  const out = new Uint8Array(masks[0])
  for (const m of masks.slice(1)) for (let i = 0; i < out.length; i++) if (m[i] > out[i]) out[i] = m[i]
  return out
}

/** Run-length bytes (value, run ≤ 255) — masks are mostly long runs of 0 and 255. */
export function rleEncode(data: Uint8Array): Uint8Array {
  const out: number[] = []
  let i = 0
  while (i < data.length) {
    const v = data[i]
    let run = 1
    while (run < 255 && i + run < data.length && data[i + run] === v) run++
    out.push(v, run)
    i += run
  }
  return Uint8Array.from(out)
}

export function rleDecode(rle: Uint8Array, length: number): Uint8Array {
  const out = new Uint8Array(length)
  let o = 0
  for (let i = 0; i + 1 < rle.length && o < length; i += 2) {
    out.fill(rle[i], o, Math.min(length, o + rle[i + 1]))
    o += rle[i + 1]
  }
  return out
}

/** Blends two masks (t = 0 → a, 1 → b). */
export function blendMasks(a: Uint8Array, b: Uint8Array, t: number): Uint8Array {
  if (t <= 0) return a
  if (t >= 1) return b
  const out = new Uint8Array(a.length)
  for (let i = 0; i < a.length; i++) out[i] = Math.round(a[i] + (b[i] - a[i]) * t)
  return out
}

/** Temporal smoothing of a frame with its neighbours (1-2-1), so edges don't flicker. */
export function smoothInTime(prev: Uint8Array | null, cur: Uint8Array, next: Uint8Array | null): Uint8Array {
  if (!prev && !next) return cur
  const out = new Uint8Array(cur.length)
  for (let i = 0; i < cur.length; i++) {
    const p = prev ? prev[i] : cur[i], n = next ? next[i] : cur[i]
    out[i] = Math.round((p + 2 * cur[i] + n) / 4)
  }
  return out
}
