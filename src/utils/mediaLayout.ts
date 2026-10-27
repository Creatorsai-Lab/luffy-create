/**
 * Video/image geometry. Two things:
 *  - `layoutMedia`: tile several clips (side by side, stacked, grid).
 *  - `placeInRegion`: put one clip in an area of the frame ("the upper half",
 *    "bottom right at 400×300", "full screen") — cover (crop to fill),
 *    contain (fit whole) or stretch.
 * Boxes that don't match a clip's shape are filled by cropping it, centred on
 * what it showed before, so nothing is stretched unless asked. Pure — no store access.
 */

export type MediaLayout = 'sideBySide' | 'stacked' | 'grid' | 'split'
export type MediaFit = 'cover' | 'contain' | 'stretch'

export interface Crop { x: number; y: number; w: number; h: number }

export interface Box { x: number; y: number; width: number; height: number }

export interface LayoutItem {
  id: string
  width: number
  height: number
  crop?: Crop
  /** Width / height of the source file, when known (e.g. a loaded video); else derived from the box and crop. */
  aspect?: number
}

export interface LayoutOptions {
  /** Space between tiles, px. */
  gap?: number
}

export interface LayoutPatch {
  id: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  crop?: Crop
}

export interface Placement {
  /** The area of the frame to use (scene px). */
  region: Box
  /** The clip's own size inside the region; a missing side follows the clip's shape. Without either it uses the region. */
  width?: number
  height?: number
  /** Where in the region a smaller clip sits (default: centre). */
  horizontal?: 'left' | 'center' | 'right'
  vertical?: 'top' | 'middle' | 'bottom'
  fit?: MediaFit
}

/** Width / height of the whole source file: the element shows its crop region undistorted. */
export function fullAspect(item: LayoutItem) {
  if (item.aspect && Number.isFinite(item.aspect) && item.aspect > 0) return item.aspect
  const crop = item.crop ?? { x: 0, y: 0, w: 1, h: 1 }
  return (item.width / crop.w) / Math.max(1e-6, item.height / crop.h)
}

/** The crop that fills a box of `aspect` from a source, centred on the old crop's centre. */
export function coverCrop(item: LayoutItem, aspect: number): Crop | undefined {
  const old = item.crop ?? { x: 0, y: 0, w: 1, h: 1 }
  const full = fullAspect(item)
  let w = 1
  let h = 1
  if (full > aspect) w = aspect / full
  else h = full / aspect
  if (w > 0.999 && h > 0.999) return undefined
  const cx = old.x + old.w / 2
  const cy = old.y + old.h / 2
  return {
    x: round(clamp(cx - w / 2, 0, 1 - w)),
    y: round(clamp(cy - h / 2, 0, 1 - h)),
    w: round(w),
    h: round(h),
  }
}

/** The layout a plain "split screen" means for this frame: stacked in portrait, side by side otherwise. */
export function splitFor(frame: { width: number; height: number }): Exclude<MediaLayout, 'split'> {
  return frame.height > frame.width ? 'stacked' : 'sideBySide'
}

const fillBox = (item: LayoutItem, box: Box): LayoutPatch => ({
  id: item.id,
  x: round(box.x), y: round(box.y), width: round(box.width), height: round(box.height),
  rotation: 0,
  crop: coverCrop(item, box.width / box.height),
})

export function layoutMedia(items: LayoutItem[], frame: { width: number; height: number }, layout: MediaLayout, opts: LayoutOptions = {}): LayoutPatch[] {
  if (!items.length) return []
  const W = frame.width
  const H = frame.height
  const gap = clamp(opts.gap ?? 0, 0, Math.min(W, H) / 4)
  const kind = layout === 'split' ? splitFor(frame) : layout

  switch (kind) {
    case 'sideBySide': {
      const width = (W - gap * (items.length - 1)) / items.length
      return items.map((item, i) => fillBox(item, { x: i * (width + gap), y: 0, width, height: H }))
    }

    case 'stacked': {
      const height = (H - gap * (items.length - 1)) / items.length
      return items.map((item, i) => fillBox(item, { x: 0, y: i * (height + gap), width: W, height }))
    }

    case 'grid': {
      const cols = Math.ceil(Math.sqrt(items.length))
      const rows = Math.ceil(items.length / cols)
      const width = (W - gap * (cols - 1)) / cols
      const height = (H - gap * (rows - 1)) / rows
      return items.map((item, i) => {
        const row = Math.floor(i / cols)
        // A short last row is centred.
        const inRow = row === rows - 1 ? items.length - row * cols : cols
        const offset = (W - (inRow * width + (inRow - 1) * gap)) / 2
        return fillBox(item, { x: offset + (i % cols) * (width + gap), y: row * (height + gap), width, height })
      })
    }
  }
}

/**
 * One clip in an area of the frame.
 *  - cover (default): fills its box exactly; the clip is cropped to the box's shape.
 *  - contain: the whole clip, as large as fits in its box.
 *  - stretch: fills its box exactly, distorting the clip.
 * With only a width (or height) the other side follows the clip's shape and the whole clip shows.
 */
export function placeInRegion(item: LayoutItem, placement: Placement): LayoutPatch {
  const region = placement.region
  const aspect = fullAspect(item)
  const fit = placement.fit ?? 'cover'
  let width = placement.width
  let height = placement.height
  let crop: Crop | undefined = item.crop

  if (width != null && height == null) height = width / aspect
  else if (height != null && width == null) width = height * aspect
  const oneSide = (placement.width == null) !== (placement.height == null)

  let box: { width: number; height: number }
  if (oneSide) {
    box = { width: width!, height: height! }
    crop = undefined // the whole picture, at its own shape
  } else {
    const target = width != null && height != null ? { width, height } : { width: region.width, height: region.height }
    if (fit === 'contain') {
      const scale = Math.min(target.width / aspect, target.height)
      box = { width: scale * aspect, height: scale }
      crop = undefined
    } else {
      box = target
      if (fit === 'cover') crop = coverCrop(item, target.width / target.height)
    }
  }

  const h = placement.horizontal ?? 'center'
  const v = placement.vertical ?? 'middle'
  const x = h === 'left' ? region.x : h === 'right' ? region.x + region.width - box.width : region.x + (region.width - box.width) / 2
  const y = v === 'top' ? region.y : v === 'bottom' ? region.y + region.height - box.height : region.y + (region.height - box.height) / 2
  return {
    id: item.id,
    x: round(x), y: round(y), width: round(Math.max(1, box.width)), height: round(Math.max(1, box.height)),
    rotation: 0,
    crop,
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function round(value: number) {
  return Math.round(value * 1000) / 1000
}
