/**
 * Geometry of a code block, shared by its renderer (CodeKonva) and by blocks
 * that place things over code lines (the code walkthrough's highlights).
 */
export const CODE_PADDING = 12
export const CODE_LINE_NUM_W = 28
export const CODE_HEADER_H = 35
export const CODE_LINE_HEIGHT = 1.65
/** Width of one character of the code font (Consolas) per px of font size. */
export const CODE_CHAR_WIDTH = 0.55

export const codeLineHeight = (fontSize: number) => fontSize * CODE_LINE_HEIGHT

/** Top of the band of a (0-based, unwrapped) line, relative to the block; the band is one line height tall and centred on the glyphs. */
export function codeLineTop(fontSize: number, index: number) {
  const lineH = codeLineHeight(fontSize)
  const baseline = CODE_HEADER_H + CODE_PADDING + fontSize + index * lineH
  return baseline - fontSize * 0.32 - lineH / 2
}

/** Height a block needs to show `lines` lines without wrapping. */
export function codeBlockHeight(fontSize: number, lines: number) {
  return CODE_HEADER_H + CODE_PADDING * 2 + lines * codeLineHeight(fontSize)
}

/** Width a block needs for its longest line (monospace estimate) plus gutter and padding. */
export function codeBlockWidth(fontSize: number, longestLine: number, lineNumbers: boolean) {
  const gutter = lineNumbers ? CODE_LINE_NUM_W + 10 : 0
  return CODE_PADDING * 2 + gutter + longestLine * fontSize * CODE_CHAR_WIDTH + fontSize
}
