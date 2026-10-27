/**
 * Shot-change detection from colour histograms of sampled frames. A cut is a
 * frame whose histogram differs from the previous one far more than its
 * neighbours do (so slow camera moves and flicker don't count). Pure.
 */

const BINS = 8

/** 8 bins per RGB channel, each channel normalised to sum 1. */
export function colorHistogram(rgba: Uint8ClampedArray): Float32Array {
  const hist = new Float32Array(BINS * 3)
  const pixels = rgba.length / 4
  for (let i = 0; i < rgba.length; i += 4) {
    hist[(rgba[i] * BINS) >> 8] += 1
    hist[BINS + ((rgba[i + 1] * BINS) >> 8)] += 1
    hist[2 * BINS + ((rgba[i + 2] * BINS) >> 8)] += 1
  }
  for (let i = 0; i < hist.length; i++) hist[i] /= pixels || 1
  return hist
}

/** 0 (identical) … 1 (completely different). */
export function histogramDistance(a: Float32Array, b: Float32Array) {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i])
  return sum / 6
}

/**
 * Indexes i where a cut happens between frame i-1 and frame i.
 * `diffs[i]` is the distance between frame i-1 and i (diffs[0] is ignored).
 */
export function findCuts(diffs: number[], times: number[], opts: { minShot?: number; minDiff?: number } = {}): number[] {
  const minShot = opts.minShot ?? 0.6
  const minDiff = opts.minDiff ?? 0.3
  const cuts: number[] = []
  let lastCut = times[0] ?? 0
  for (let i = 1; i < diffs.length; i++) {
    // Up to 6 differences on each side, excluding this one.
    const start = Math.max(1, i - 6)
    const neighbours = diffs.slice(start, i + 7).filter((_, j) => start + j !== i).sort((a, b) => a - b)
    const median = neighbours[Math.floor(neighbours.length / 2)] ?? 0
    if (diffs[i] >= minDiff && diffs[i] > median * 3 + 0.08 && times[i] - lastCut >= minShot) {
      cuts.push(i)
      lastCut = times[i]
    }
  }
  return cuts
}
