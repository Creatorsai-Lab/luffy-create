export interface AudioFadeMultiplierParams {
  duration: number
  fadeIn?: number
  fadeInVolume?: number
  fadeOut?: number
  fadeOutVolume?: number
  clipTime: number
}

export interface FfmpegFadeVolumeParams {
  duration: number
  baseVolume: number
  fadeIn?: number
  fadeInVolume?: number
  fadeOut?: number
  fadeOutVolume?: number
}

const DEFAULT_FADE_IN_VOLUME = 1
const DEFAULT_FADE_OUT_VOLUME = 0

export function clampFadeVolume(value: number | undefined) {
  if (!Number.isFinite(value)) return 1
  return Math.max(0, Math.min(2, Number(value)))
}

export function audioFadeMultiplierAt(params: AudioFadeMultiplierParams) {
  const duration = Math.max(0, params.duration)
  const clipTime = Math.max(0, Math.min(duration, params.clipTime))
  const fadeIn = clampFadeDuration(params.fadeIn, duration)
  const fadeOut = clampFadeDuration(params.fadeOut, duration)

  let multiplier = 1

  if (fadeIn > 0 && clipTime <= fadeIn) {
    multiplier *= (clipTime / fadeIn) * clampFadeVolume(params.fadeInVolume ?? DEFAULT_FADE_IN_VOLUME)
  }

  if (fadeOut > 0 && clipTime >= duration - fadeOut) {
    const progress = Math.min(1, Math.max(0, (clipTime - (duration - fadeOut)) / fadeOut))
    const target = clampFadeVolume(params.fadeOutVolume ?? DEFAULT_FADE_OUT_VOLUME)
    multiplier *= 1 + (target - 1) * progress
  }

  return roundGain(multiplier)
}

export function buildFfmpegFadeVolumeExpression(params: FfmpegFadeVolumeParams) {
  const baseVolume = Math.max(0, Math.min(1, finiteOr(params.baseVolume, 1)))
  const duration = Math.max(0, finiteOr(params.duration, 0))
  const fadeIn = clampFadeDuration(params.fadeIn, duration)
  const fadeOut = clampFadeDuration(params.fadeOut, duration)
  const fadeInVolume = clampFadeVolume(params.fadeInVolume ?? DEFAULT_FADE_IN_VOLUME)
  const fadeOutVolume = clampFadeVolume(params.fadeOutVolume ?? DEFAULT_FADE_OUT_VOLUME)

  const parts: string[] = []
  if (fadeIn > 0) {
    parts.push(`if(lte(t\\,${fixed(fadeIn)})\\,min(t/${fixed(fadeIn)}\\,1)*${fixed(fadeInVolume, 4)}\\,1)`)
  }

  if (fadeOut > 0 && duration > 0) {
    const start = Math.max(0, duration - fadeOut)
    parts.push(`if(gte(t\\,${fixed(start)})\\,1+(${fixed(fadeOutVolume, 4)}-1)*min((t-${fixed(start)})/${fixed(fadeOut)}\\,1)\\,1)`)
  }

  if (parts.length === 0) {
    return baseVolume === 1 ? null : `volume=${fixed(baseVolume, 4)}`
  }

  return `volume='${fixed(baseVolume, 4)}*${parts.join('*')}':eval=frame`
}

function clampFadeDuration(value: number | undefined, duration: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(Math.max(0, duration), Number(value)))
}

function finiteOr(value: number | undefined, fallback: number) {
  return Number.isFinite(value) ? Number(value) : fallback
}

function fixed(value: number, digits = 3) {
  return value.toFixed(digits)
}

function roundGain(value: number) {
  return Math.round(value * 10000) / 10000
}
