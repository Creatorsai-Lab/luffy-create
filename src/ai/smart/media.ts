/**
 * Browser-side media access for smart edits: decoded audio and sampled video
 * frames. Kept apart from the analysis code so that stays testable in Node.
 */
import { toFileUrl } from '../../utils/pathUtils'
import { colorHistogram, histogramDistance } from './shots'
import { frameLoudness } from './speech'

export const ANALYSIS_SAMPLE_RATE = 16000

export interface MonoAudio {
  samples: Float32Array
  sampleRate: number
}

const audioCache = new Map<string, Promise<MonoAudio | null>>()

/** The file's audio, mixed to mono at 16 kHz (enough for speech and beats, and small). */
export function decodeMono(path: string): Promise<MonoAudio | null> {
  let hit = audioCache.get(path)
  if (!hit) {
    hit = (async () => {
      try {
        const response = await fetch(toFileUrl(path))
        const data = await response.arrayBuffer()
        // decodeAudioData resamples to the context's rate.
        const ctx = new OfflineAudioContext(1, 1, ANALYSIS_SAMPLE_RATE)
        const buffer = await ctx.decodeAudioData(data)
        const mono = new Float32Array(buffer.length)
        for (let c = 0; c < buffer.numberOfChannels; c++) {
          const channel = buffer.getChannelData(c)
          for (let i = 0; i < mono.length; i++) mono[i] += channel[i] / buffer.numberOfChannels
        }
        return { samples: mono, sampleRate: buffer.sampleRate }
      } catch {
        return null // no audio track, or a format the browser can't decode
      }
    })()
    audioCache.set(path, hit)
    hit.then(result => { if (!result) audioCache.delete(path) })
  }
  return hit
}

const loudnessCache = new Map<string, Promise<Float32Array | null>>()

/** The file's loudness per 10 ms (dBFS), for panels that redo speech detection as settings change. */
export function sourceLoudness(path: string): Promise<Float32Array | null> {
  let hit = loudnessCache.get(path)
  if (!hit) {
    hit = decodeMono(path).then(audio => (audio ? frameLoudness(audio.samples, audio.sampleRate) : null))
    loudnessCache.set(path, hit)
    hit.then(result => { if (!result) loudnessCache.delete(path) })
  }
  return hit
}

/**
 * Shot changes in [from, to] of a video file, in source seconds. Frames are
 * sampled every `step` seconds; each detected change is then narrowed down to
 * ~1/30 s by sampling between the two frames.
 */
export async function detectShotChanges(
  path: string,
  from: number,
  to: number,
  findCuts: (diffs: number[], times: number[]) => number[],
  step = 0.25
): Promise<number[]> {
  const video = document.createElement('video')
  video.crossOrigin = 'anonymous'
  video.muted = true
  video.preload = 'auto'
  video.src = toFileUrl(path)
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve()
    video.onerror = () => reject(new Error('Could not open the video for analysis.'))
  })

  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 36
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const frameAt = async (t: number) => {
    await new Promise<void>(resolve => {
      video.onseeked = () => resolve()
      video.currentTime = Math.min(Math.max(0, t), Math.max(0, video.duration - 0.01))
    })
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    return colorHistogram(ctx.getImageData(0, 0, canvas.width, canvas.height).data)
  }

  try {
    const times: number[] = []
    const hists: Float32Array[] = []
    for (let t = from; t <= to; t += step) {
      times.push(t)
      hists.push(await frameAt(t))
    }
    const diffs = hists.map((h, i) => (i ? histogramDistance(hists[i - 1], h) : 0))

    const cuts: number[] = []
    for (const i of findCuts(diffs, times)) {
      // Binary search between the two frames for where the picture changes.
      let lo = times[i - 1]
      let hi = times[i]
      const before = hists[i - 1]
      while (hi - lo > 1 / 30) {
        const mid = (lo + hi) / 2
        if (histogramDistance(before, await frameAt(mid)) > diffs[i] / 2) hi = mid
        else lo = mid
      }
      cuts.push(Math.round(hi * 1000) / 1000)
    }
    return cuts
  } finally {
    video.removeAttribute('src')
    video.load()
  }
}
