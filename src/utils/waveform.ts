// Peak waveform data for timeline audio clips.
//
// The source is reduced to a fixed number of peaks per second (not per file),
// so detail is the same for short and long files and holds up when zooming.
// Each peak is the largest absolute sample across ALL channels in its slice —
// a short word or transient is never averaged away.

export const PEAKS_PER_SECOND = 200

export interface WaveformData {
  /** Peak amplitude per slice, normalized so the loudest peak in the file is 1. */
  peaks: Float32Array
  /** Source duration in seconds. */
  duration: number
}

type CacheEntry = WaveformData | null | Promise<WaveformData | null>
const cache = new Map<string, CacheEntry>()

export function getWaveform(url: string): Promise<WaveformData | null> {
  const hit = cache.get(url)
  if (hit !== undefined) {
    return hit instanceof Promise ? hit : Promise.resolve(hit)
  }

  const promise = decodeAudio(url).then(result => {
    cache.set(url, result)
    return result
  })

  cache.set(url, promise)
  return promise
}

async function decodeAudio(url: string): Promise<WaveformData | null> {
  try {
    const res = await fetch(url)
    const arrayBuffer = await res.arrayBuffer()
    const ctx = new AudioContext()
    let audioBuffer: AudioBuffer
    try {
      audioBuffer = await ctx.decodeAudioData(arrayBuffer)
    } finally {
      ctx.close()
    }

    const total = audioBuffer.length
    const samplesPerPeak = audioBuffer.sampleRate / PEAKS_PER_SECOND
    const peakCount = Math.max(1, Math.ceil(total / samplesPerPeak))
    const peaks = new Float32Array(peakCount)

    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
      const data = audioBuffer.getChannelData(ch)
      for (let i = 0; i < peakCount; i++) {
        const start = Math.floor(i * samplesPerPeak)
        const end = Math.min(total, Math.floor((i + 1) * samplesPerPeak))
        let max = peaks[i]
        for (let j = start; j < end; j++) {
          const v = data[j] < 0 ? -data[j] : data[j]
          if (v > max) max = v
        }
        peaks[i] = max
      }
    }

    let fileMax = 0
    for (let i = 0; i < peakCount; i++) if (peaks[i] > fileMax) fileMax = peaks[i]
    if (fileMax > 0) for (let i = 0; i < peakCount; i++) peaks[i] /= fileMax

    return { peaks, duration: audioBuffer.duration }
  } catch {
    return null
  }
}

/**
 * Largest peak in the source range [from, to) seconds. Ranges past the end of
 * the source return 0 (real silence), never a placeholder height.
 */
export function peakInRange(data: WaveformData, from: number, to: number): number {
  const { peaks } = data
  const i0 = Math.max(0, Math.floor(from * PEAKS_PER_SECOND))
  const i1 = Math.min(peaks.length, Math.max(i0 + 1, Math.ceil(to * PEAKS_PER_SECOND)))
  let max = 0
  for (let i = i0; i < i1; i++) if (peaks[i] > max) max = peaks[i]
  return max
}
