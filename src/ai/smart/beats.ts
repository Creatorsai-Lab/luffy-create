/**
 * Beat tracking for "cut to the beat". Onsets are rises in short-frame
 * loudness; the tempo is the strongest autocorrelation lag between 70 and 180
 * BPM (gently preferring ~120); the beat phase is the offset whose grid lands
 * on the most onset energy. Pure — no browser APIs.
 */
import { frameLoudness } from './speech'

const HOP = 0.01

export interface BeatGrid {
  bpm: number
  /** Beat times in seconds from the start of the samples. */
  beats: number[]
}

export function detectBeats(samples: Float32Array, sampleRate: number): BeatGrid | null {
  const db = frameLoudness(samples, sampleRate)
  if (db.length < 400) return null // under ~4 s: not enough to find a tempo

  // Onset strength: half-wave rectified loudness rise, lightly smoothed.
  const onset = new Float32Array(db.length)
  for (let i = 1; i < db.length; i++) onset[i] = Math.max(0, db[i] - db[i - 1])
  const smooth = new Float32Array(onset.length)
  for (let i = 1; i < onset.length - 1; i++) smooth[i] = (onset[i - 1] + 2 * onset[i] + onset[i + 1]) / 4
  const mean = smooth.reduce((s, v) => s + v, 0) / smooth.length
  for (let i = 0; i < smooth.length; i++) smooth[i] = Math.max(0, smooth[i] - mean)

  // Tempo: autocorrelation over plausible beat periods.
  const minLag = Math.round(60 / 180 / HOP)
  const maxLag = Math.round(60 / 70 / HOP)
  let bestLag = 0
  let bestScore = 0
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0
    for (let i = lag; i < smooth.length; i++) sum += smooth[i] * smooth[i - lag]
    const bpm = 60 / (lag * HOP)
    const prior = Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.9) ** 2)
    const score = (sum / (smooth.length - lag)) * prior
    if (score > bestScore) {
      bestScore = score
      bestLag = lag
    }
  }
  if (!bestLag || bestScore <= 0) return null

  // Refine the period to sub-frame precision with a parabola through the peak.
  const ac = (lag: number) => {
    let sum = 0
    for (let i = lag; i < smooth.length; i++) sum += smooth[i] * smooth[i - lag]
    return sum / (smooth.length - lag)
  }
  const [y0, y1, y2] = [ac(bestLag - 1), ac(bestLag), ac(bestLag + 1)]
  const shift = y0 - 2 * y1 + y2 !== 0 ? (0.5 * (y0 - y2)) / (y0 - 2 * y1 + y2) : 0
  const period = bestLag + Math.max(-0.5, Math.min(0.5, shift))

  // Phase: the grid offset that collects the most onset energy.
  let bestPhase = 0
  let bestEnergy = -1
  for (let phase = 0; phase < Math.ceil(period); phase++) {
    let energy = 0
    for (let t = phase; t < smooth.length; t += period) energy += smooth[Math.round(t)] ?? 0
    if (energy > bestEnergy) {
      bestEnergy = energy
      bestPhase = phase
    }
  }

  const beats: number[] = []
  for (let t = bestPhase; t < db.length; t += period) beats.push(Math.round(t * HOP * 1000) / 1000)
  return { bpm: Math.round((60 / (period * HOP)) * 10) / 10, beats }
}

/**
 * New scene durations whose boundaries land on beats: each boundary moves to
 * the nearest usable beat (every `beatsPerCut` beats), keeping scenes at least
 * `minDuration` long. `offset` is where the music starts on the timeline.
 */
export function snapDurationsToBeats(durations: number[], beats: number[], opts: { beatsPerCut?: number; offset?: number; minDuration?: number } = {}): number[] {
  const step = Math.max(1, Math.round(opts.beatsPerCut ?? 1))
  const offset = opts.offset ?? 0
  const minDuration = opts.minDuration ?? 0.5
  const grid = beats.filter((_, i) => i % step === 0).map(b => b + offset)
  const spacing = grid.length > 1 ? grid[1] - grid[0] : Infinity
  const out: number[] = []
  let start = 0
  let boundary = 0
  durations.forEach(duration => {
    boundary += duration
    // Only boundaries the music actually plays under are snapped.
    const covered = grid.length > 0 && boundary >= grid[0] - spacing && boundary <= grid[grid.length - 1] + spacing
    const candidates = covered ? grid.filter(t => t - start >= minDuration) : []
    const snapped = !candidates.length ? Math.max(boundary, start + minDuration)
      : candidates.reduce((best, t) => (Math.abs(t - boundary) < Math.abs(best - boundary) ? t : best), candidates[0])
    out.push(Math.round((snapped - start) * 1000) / 1000)
    start = snapped
  })
  return out
}
