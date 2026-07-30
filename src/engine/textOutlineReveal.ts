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
