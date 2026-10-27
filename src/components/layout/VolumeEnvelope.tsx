import type { AudioElement } from '../../types/editor'
import { clipSourceTime, volumeKeyGain } from '../../utils/volumeKeys'

interface Props {
  audio: AudioElement
  clipDuration: number
  widthPx: number
  heightPx: number
}

/** The volume automation curve drawn over an audio clip (top = 2×, middle = 1×, bottom = silent). */
export default function VolumeEnvelope({ audio, clipDuration, widthPx, heightPx }: Props) {
  const keys = audio.volumeKeys ?? []
  if (!keys.length || clipDuration <= 0 || widthPx <= 0) return null
  const speed = audio.speed || 1
  const toX = (sourceTime: number) => ((sourceTime - (audio.startTime ?? 0)) / speed) / clipDuration * widthPx
  const toY = (gain: number) => heightPx * (1 - Math.min(2, gain) / 2)

  // The clip edges plus every key inside the clip.
  const points = [
    [0, volumeKeyGain(keys, clipSourceTime(audio, 0))],
    ...keys.map(k => [toX(k.t), k.v]).filter(([x]) => x > 0 && x < widthPx),
    [widthPx, volumeKeyGain(keys, clipSourceTime(audio, clipDuration))],
  ]
  const line = points.map(([x, v]) => `${x.toFixed(1)},${toY(v).toFixed(1)}`).join(' ')

  return (
    <svg className="absolute inset-0 pointer-events-none" width={widthPx} height={heightPx} aria-hidden>
      <polygon points={`0,${heightPx} ${line} ${widthPx},${heightPx}`} fill="rgba(56,189,248,0.12)" />
      <polyline points={line} fill="none" stroke="#38bdf8" strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  )
}
