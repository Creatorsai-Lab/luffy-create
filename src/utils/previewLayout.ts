export function fitPreviewToViewport(
  sourceWidth: number,
  sourceHeight: number,
  viewportWidth: number,
  viewportHeight: number,
) {
  const scale = Math.min(viewportWidth / sourceWidth, viewportHeight / sourceHeight)
  return {
    width: Math.round(sourceWidth * scale),
    height: Math.round(sourceHeight * scale),
  }
}
