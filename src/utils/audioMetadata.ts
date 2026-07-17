import type { AssetMeta } from '../types/editor'
import { toFileUrl } from './pathUtils'

const MIN_AUDIO_CLIP_DURATION = 0.1

export function finitePositiveDuration(value: unknown): number | null {
  const duration = Number(value)
  return Number.isFinite(duration) && duration > 0 ? duration : null
}

export function clampAudioDuration(duration: number, maxDuration?: number): number {
  const safeDuration = Math.max(MIN_AUDIO_CLIP_DURATION, duration)
  const safeMax = finitePositiveDuration(maxDuration)
  return safeMax ? Math.max(MIN_AUDIO_CLIP_DURATION, Math.min(safeDuration, safeMax)) : safeDuration
}

export function remainingTimelineDuration(totalDuration: number, absoluteStart: number): number {
  return Math.max(MIN_AUDIO_CLIP_DURATION, totalDuration - Math.max(0, absoluteStart))
}

export function resolveStoredAudioDuration(asset: AssetMeta, maxDuration?: number): number | null {
  const stored = finitePositiveDuration(asset.duration)
  return stored == null ? null : clampAudioDuration(stored, maxDuration)
}

export function readAudioMetadataDuration(src: string): Promise<number | null> {
  return new Promise(resolve => {
    const audio = new Audio()
    let settled = false

    const cleanup = () => {
      audio.removeEventListener('loadedmetadata', onLoaded)
      audio.removeEventListener('error', onError)
      audio.src = ''
    }

    const finish = (duration: number | null) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(duration)
    }

    const onLoaded = () => finish(finitePositiveDuration(audio.duration))
    const onError = () => finish(null)

    audio.preload = 'metadata'
    audio.addEventListener('loadedmetadata', onLoaded, { once: true })
    audio.addEventListener('error', onError, { once: true })
    window.setTimeout(() => finish(null), 5000)
    audio.src = toFileUrl(src)
    audio.load()
  })
}
