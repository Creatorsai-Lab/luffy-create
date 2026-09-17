/**
 * GIF decoder engine — parses animated GIFs into individual frames with timing
 * information so they can be rendered frame-accurately on a Konva canvas and
 * during FFmpeg export.
 *
 * Uses `gifuct-js` for LZW decompression and frame parsing.
 */
import { parseGIF, decompressFrames } from 'gifuct-js'
import { toFileUrl } from '../utils/pathUtils'

// ── Public types ─────────────────────────────────────────────────────────────

export interface GifFrame {
  /** A pre-composited full-size canvas for this frame. */
  canvas: HTMLCanvasElement
  /** Display delay in milliseconds (GIF spec default = 100ms when 0). */
  delay: number
  /** Cumulative time in ms at which this frame *starts* displaying. */
  startMs: number
}

export interface GifData {
  frames: GifFrame[]
  /** Total animation loop duration in milliseconds. */
  totalDuration: number
  width: number
  height: number
}

// ── Cache ────────────────────────────────────────────────────────────────────

const cache = new Map<string, GifData>()

/** Remove a cached entry (e.g. when the element is unmounted). */
export function evictGif(src: string) {
  cache.delete(src)
}

// ── Main API ─────────────────────────────────────────────────────────────────

/**
 * Decode a GIF file into an array of pre-composited full-frame canvases.
 * Results are cached by `src` so subsequent calls return instantly.
 */
export async function decodeGif(src: string): Promise<GifData> {
  const hit = cache.get(src)
  if (hit) return hit

  // 1. Fetch the raw bytes
  const url = toFileUrl(src)
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to fetch GIF: ${response.status} ${url}`)
  const buffer = await response.arrayBuffer()

  // 2. Parse & decompress with gifuct-js
  const gif = parseGIF(buffer)
  const rawFrames = decompressFrames(gif, true) // true = build full image patch

  if (rawFrames.length === 0) throw new Error('GIF has no frames')

  const gifWidth = gif.lsd.width
  const gifHeight = gif.lsd.height

  // 3. Composite frames — GIF frames are differential; we must handle disposal
  //    modes to build a correct full-frame image for each frame.
  const compositeCanvas = document.createElement('canvas')
  compositeCanvas.width = gifWidth
  compositeCanvas.height = gifHeight
  const compositeCtx = compositeCanvas.getContext('2d')!

  // Scratch canvas for constructing each frame's patch as ImageData
  const patchCanvas = document.createElement('canvas')
  const patchCtx = patchCanvas.getContext('2d')!

  const frames: GifFrame[] = []
  let cumulativeMs = 0

  // Keep a snapshot for "restore to previous" disposal
  let previousSnapshot: ImageData | null = null

  for (let i = 0; i < rawFrames.length; i++) {
    const raw = rawFrames[i]

    // gifuct-js returns the raw GIF delay in centiseconds (1/100th of a second).
    // delay=10 means 10 centiseconds = 100ms. Multiply by 10 for ms.
    // A delay of 0 is treated as 100ms per the GIF spec.
    const delayMs = (raw.delay <= 0 ? 10 : raw.delay) * 10

    // Save the current composite state before drawing this frame (for "restoreToPrevious")
    const disposal = raw.disposalType

    if (disposal === 3) {
      // "Restore to previous" — save snapshot before drawing
      previousSnapshot = compositeCtx.getImageData(0, 0, gifWidth, gifHeight)
    }

    // Draw this frame's patch onto the composite canvas
    const frameW = raw.dims.width
    const frameH = raw.dims.height
    const frameX = raw.dims.left
    const frameY = raw.dims.top

    // Build ImageData from the patch pixel data
    patchCanvas.width = frameW
    patchCanvas.height = frameH
    const imageData = patchCtx.createImageData(frameW, frameH)
    imageData.data.set(raw.patch)
    patchCtx.putImageData(imageData, 0, 0)

    // First frame — clear to transparent
    if (i === 0) {
      compositeCtx.clearRect(0, 0, gifWidth, gifHeight)
    }

    // Draw the patch onto the composite
    compositeCtx.drawImage(patchCanvas, frameX, frameY)

    // Snapshot the fully composited frame
    const frameCanvas = document.createElement('canvas')
    frameCanvas.width = gifWidth
    frameCanvas.height = gifHeight
    const frameCtx = frameCanvas.getContext('2d')!
    frameCtx.drawImage(compositeCanvas, 0, 0)

    frames.push({
      canvas: frameCanvas,
      delay: delayMs,
      startMs: cumulativeMs,
    })
    cumulativeMs += delayMs

    // Apply disposal AFTER snapshotting the frame
    if (disposal === 2) {
      // "Restore to background" — clear the frame area
      compositeCtx.clearRect(frameX, frameY, frameW, frameH)
    } else if (disposal === 3 && previousSnapshot) {
      // "Restore to previous" — put back the saved snapshot
      compositeCtx.putImageData(previousSnapshot, 0, 0)
      previousSnapshot = null
    }
    // disposal 0 or 1 = "do not dispose" / "leave in place" → keep composite as-is
  }

  const result: GifData = {
    frames,
    totalDuration: cumulativeMs,
    width: gifWidth,
    height: gifHeight,
  }

  cache.set(src, result)
  return result
}

/**
 * Get the correct frame canvas for a given time in milliseconds.
 * Automatically loops the animation.
 */
export function getGifFrameAtTime(gifData: GifData, timeMs: number): HTMLCanvasElement {
  if (gifData.frames.length === 0) {
    throw new Error('GifData has no frames')
  }
  if (gifData.frames.length === 1) {
    return gifData.frames[0].canvas
  }

  // Loop the time within the total animation duration
  const loopedMs = gifData.totalDuration > 0
    ? ((timeMs % gifData.totalDuration) + gifData.totalDuration) % gifData.totalDuration
    : 0

  // Binary search for the frame whose startMs <= loopedMs < startMs + delay
  let lo = 0
  let hi = gifData.frames.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1
    if (gifData.frames[mid].startMs <= loopedMs) {
      lo = mid
    } else {
      hi = mid - 1
    }
  }

  return gifData.frames[lo].canvas
}
