import type { TextElement } from '../types/editor'

const clamp01 = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))

export function getOutlineRevealClips(progress: number, width: number) {
  const p = clamp01(progress)
  const safeWidth = Math.max(0, Number.isFinite(width) ? width : 0)
  const traceWidth = safeWidth * clamp01(p / 0.72)
  const fillWidth = safeWidth * clamp01((p - 0.28) / 0.72)
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
