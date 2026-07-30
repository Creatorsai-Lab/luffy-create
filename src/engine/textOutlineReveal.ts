import type { TextElement } from '../types/editor'

const clamp01 = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))

export function getOutlineRevealClips(progress: number, width: number) {
  const p = clamp01(progress)
  const safeWidth = Math.max(0, Number.isFinite(width) ? width : 0)
  const traceWidth = safeWidth * clamp01(p / 0.9)
  const fillWidth = safeWidth * clamp01((p - 0.1) / 0.9)
  return {
    fillWidth,
    outlineX: fillWidth,
    outlineWidth: Math.max(0, traceWidth - fillWidth),
  }
}

export function getOutlineRevealClipBox(progress: number, width: number, height: number, fontSize: number) {
  const safeFontSize = Math.max(0, Number.isFinite(fontSize) ? fontSize : 0)
  return {
    ...getOutlineRevealClips(progress, width),
    clipY: -safeFontSize,
    clipHeight: Math.max(0, Number.isFinite(height) ? height : 0) + safeFontSize * 2,
  }
}

export function getOutlineRevealSourceLayers(progress: number, width: number, height: number, fontSize: number) {
  const box = getOutlineRevealClipBox(progress, width, height, fontSize)
  const safeWidth = Math.max(0, Number.isFinite(width) ? width : 0)
  const edge = (x: number) => {
    const edgeProgress = safeWidth > 0 ? clamp01(x / safeWidth) : 0
    const edgeStrength = Math.min(1, edgeProgress * 5, (1 - edgeProgress) * 5)
    const slant = Math.min(safeWidth * 0.12, box.clipHeight * 0.35) * edgeStrength
    return {
      top: Math.max(0, Math.min(safeWidth, x + slant / 2)),
      bottom: Math.max(0, Math.min(safeWidth, x - slant / 2)),
    }
  }
  const fill = edge(box.fillWidth)
  const trace = edge(box.fillWidth + box.outlineWidth)
  const bottom = box.clipY + box.clipHeight
  return [
    {
      source: 'outline' as const,
      points: [
        [fill.top, box.clipY],
        [trace.top, box.clipY],
        [trace.bottom, bottom],
        [fill.bottom, bottom],
      ] as Array<[number, number]>,
      opacity: 0.55,
    },
    {
      source: 'fill' as const,
      points: [
        [0, box.clipY],
        [fill.top, box.clipY],
        [fill.bottom, bottom],
        [0, bottom],
      ] as Array<[number, number]>,
      opacity: 1,
    },
  ]
}

export function outlineRevealStrokeWidth(fontSize: number) {
  return Math.max(1, (Number.isFinite(fontSize) ? fontSize : 0) * 0.018)
}

export function makeOutlineTextElement(el: TextElement, color: string): TextElement {
  return {
    ...el,
    fillMode: 'solid',
    color: 'transparent',
    textStroke: color,
    textStrokeWidth: outlineRevealStrokeWidth(el.fontSize) / 2,
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
  }
}
