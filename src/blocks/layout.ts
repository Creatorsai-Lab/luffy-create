/**
 * Layout helpers shared by blocks: a scale unit that works for 16:9 and 9:16,
 * text measurement, and word wrapping.
 */
import type { FontWeight } from '../types/editor'
import type { BlockFrame } from './registry'

/** 1 at 1080 px on the short side, so sizes read the same on 16:9 and 9:16. */
export const unit = (frame: BlockFrame) => Math.min(frame.width, frame.height) / 1080
export const isPortrait = (frame: BlockFrame) => frame.height > frame.width

const WEIGHTS: Record<FontWeight, number> = { thin: 100, normal: 400, semibold: 600, bold: 700 }
let ctx: CanvasRenderingContext2D | null | undefined

/**
 * Width of a line of text. Uses a canvas when there is one (the app); a
 * character-width estimate otherwise (tests). Callers leave a little slack,
 * since a web font may still be loading when a block is built.
 */
export function textWidth(text: string, fontSize: number, fontFamily: string, weight: FontWeight = 'normal') {
  if (ctx === undefined) {
    try { ctx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null } catch { ctx = null }
  }
  if (ctx) {
    ctx.font = `${WEIGHTS[weight]} ${fontSize}px "${fontFamily}", sans-serif`
    return ctx.measureText(text).width
  }
  return text.length * fontSize * (weight === 'bold' ? 0.6 : 0.55)
}

/** Greedy word wrap into lines no wider than `maxWidth`. */
export function wrapWords(words: string[], maxWidth: number, measure: (text: string) => number): string[][] {
  const lines: string[][] = []
  let line: string[] = []
  for (const word of words) {
    const next = [...line, word]
    if (line.length && measure(next.join(' ')) > maxWidth) {
      lines.push(line)
      line = [word]
    } else {
      line = next
    }
  }
  if (line.length) lines.push(line)
  return lines
}

/** Lines of a free text wrapped to a width (for single text elements). */
export function lineCount(text: string, maxWidth: number, measure: (text: string) => number) {
  return text.split('\n').reduce((n, paragraph) => n + Math.max(1, wrapWords(paragraph.split(/\s+/).filter(Boolean), maxWidth, measure).length), 0)
}
