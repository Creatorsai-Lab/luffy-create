/**
 * Speech/silence detection on mono samples. Loudness is measured in short
 * frames; the threshold adapts to the recording (its noise floor and its loud
 * level), so it works for quiet and loud clips alike. Pure — no browser APIs.
 */

export type TimeRange = [number, number]

export interface SpeechOptions {
  /** Gaps shorter than this stay part of the speech around them (seconds). */
  minSilence?: number
  /** Speech shorter than this is treated as noise (seconds). */
  minSpeech?: number
  /** Loudness (dBFS) above which a frame counts as speech; worked out from the recording when missing. */
  threshold?: number
}

const FRAME = 0.02
const HOP = 0.01

/** Loudness in dBFS per 10 ms hop. */
export function frameLoudness(samples: Float32Array, sampleRate: number): Float32Array {
  const frame = Math.max(1, Math.round(FRAME * sampleRate))
  const hop = Math.max(1, Math.round(HOP * sampleRate))
  const count = Math.max(0, Math.floor((samples.length - frame) / hop) + 1)
  const out = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    let sum = 0
    const start = i * hop
    for (let j = start; j < start + frame; j++) sum += samples[j] * samples[j]
    out[i] = 10 * Math.log10(sum / frame + 1e-12)
  }
  return out
}

export function detectSpeech(samples: Float32Array, sampleRate: number, opts: SpeechOptions = {}): TimeRange[] {
  return speechFromLoudness(frameLoudness(samples, sampleRate), opts)
}

/**
 * The level that separates speech from silence: above the noise floor, but at
 * least 12 dB under the loud level (so a clip that is nearly all talking keeps
 * its talking) and never below -55 dBFS. Null when there is no sound at all.
 */
export function autoThreshold(db: Float32Array): number | null {
  if (!db.length) return null
  const sorted = Float32Array.from(db).sort()
  const floor = sorted[Math.floor(sorted.length * 0.05)]
  const loud = sorted[Math.floor(sorted.length * 0.95)]
  const threshold = Math.max(Math.min(floor + 8, loud - 12), loud - 30, -55)
  return loud < threshold ? null : threshold
}

/** Speech regions from per-10 ms loudness (see frameLoudness), so settings can change without measuring again. */
export function speechFromLoudness(db: Float32Array, opts: SpeechOptions = {}): TimeRange[] {
  const minSilence = opts.minSilence ?? 0.5
  const minSpeech = opts.minSpeech ?? 0.12
  const threshold = opts.threshold ?? autoThreshold(db)
  if (threshold == null) return []

  const regions: TimeRange[] = []
  let start = -1
  for (let i = 0; i <= db.length; i++) {
    const on = i < db.length && db[i] > threshold
    if (on && start < 0) start = i
    if (!on && start >= 0) {
      regions.push([start * HOP, i * HOP + FRAME])
      start = -1
    }
  }

  // Close short gaps (between words), then drop blips.
  const merged: TimeRange[] = []
  for (const region of regions) {
    const last = merged[merged.length - 1]
    if (last && region[0] - last[1] < minSilence) last[1] = region[1]
    else merged.push([region[0], region[1]])
  }
  return merged.filter(([a, b]) => b - a >= minSpeech).map(([a, b]) => [round(a), round(b)])
}

/** The silent stretches between speech inside [from, to], each at least `minSilence` long. */
export function silencesBetween(speech: TimeRange[], from: number, to: number, minSilence: number): TimeRange[] {
  const out: TimeRange[] = []
  let cursor = from
  for (const [a, b] of speech) {
    if (b <= from) continue
    if (a >= to) break
    if (a - cursor >= minSilence) out.push([cursor, a])
    cursor = Math.max(cursor, b)
  }
  if (to - cursor >= minSilence) out.push([cursor, to])
  return out
}

/** Returns t moved to the quietest 10 ms frame within ±0.12 s (to put a cut between words, not inside one). */
export function quietSnapper(db: Float32Array) {
  return (t: number) => {
    const center = Math.round(t / HOP)
    if (center < 0 || center >= db.length) return t
    let best = center
    for (let i = Math.max(0, center - 12); i <= Math.min(db.length - 1, center + 12); i++) {
      if (db[i] < db[best] - 0.5) best = i
    }
    return best / 100
  }
}

function round(n: number) {
  return Math.round(n * 1000) / 1000
}
