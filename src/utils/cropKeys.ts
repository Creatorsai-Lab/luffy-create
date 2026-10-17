/**
 * A moving crop (auto-reframe): keys hold the crop's centre over source time;
 * the crop keeps its size (`crop.w` × `crop.h`) and never leaves the frame.
 */
import type { CropKey } from '../types/editor'

export interface Crop { x: number; y: number; w: number; h: number }

/** The centre at a source time: linear between keys, held before the first and after the last. */
export function cropCenterAt(keys: readonly CropKey[], sourceTime: number): { cx: number; cy: number } {
  if (sourceTime <= keys[0].t) return keys[0]
  const last = keys[keys.length - 1]
  if (sourceTime >= last.t) return last
  let lo = 0
  let hi = keys.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (keys[mid].t <= sourceTime) lo = mid
    else hi = mid
  }
  const a = keys[lo]
  const b = keys[hi]
  const k = b.t === a.t ? 1 : (sourceTime - a.t) / (b.t - a.t)
  return { cx: a.cx + (b.cx - a.cx) * k, cy: a.cy + (b.cy - a.cy) * k }
}

/** The crop to draw at a source time: the static crop, moved to follow the keys if there are any. */
export function cropAt(crop: Crop | undefined, keys: readonly CropKey[] | undefined, sourceTime: number): Crop | undefined {
  if (!crop || !keys?.length) return crop
  const { cx, cy } = cropCenterAt(keys, sourceTime)
  return {
    x: Math.max(0, Math.min(1 - crop.w, cx - crop.w / 2)),
    y: Math.max(0, Math.min(1 - crop.h, cy - crop.h / 2)),
    w: crop.w,
    h: crop.h,
  }
}
