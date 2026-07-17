import { useEffect, useRef, useState } from 'react'
import { Group, Rect, Text } from 'react-konva'
import type { AudioElement } from '../../../types/editor'
import { toFileUrl } from '../../../utils/pathUtils'
import { clampAudioVolume } from '../../../utils/audioEffects'

interface Props {
  el: AudioElement
  konvaProps: Record<string, unknown>
}

export default function AudioKonva({ el, konvaProps }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [duration, setDuration] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)

  useEffect(() => {
    const audio = new Audio(toFileUrl(el.src))
    
    audio.addEventListener('loadedmetadata', () => {
      setDuration(audio.duration)
    })

    audio.addEventListener('play', () => setIsPlaying(true))
    audio.addEventListener('pause', () => setIsPlaying(false))
    audio.addEventListener('ended', () => setIsPlaying(false))

    // Update audio properties
    audio.volume = Math.min(1, clampAudioVolume(el.volume))
    audio.loop = el.loop

    audioRef.current = audio

    return () => {
      audio.pause()
      audio.src = ''
      audioRef.current = null
    }
  }, [el.src, el.volume, el.loop])

  const displayDuration = duration > 0 ? Math.round(duration * 100) / 100 : '?'

  return (
    <Group {...konvaProps}>
      <Rect
        width={el.width}
        height={el.height}
        fill={isPlaying ? '#6366f1' : '#4a3f7d'}
        stroke="#8b5cf6"
        strokeWidth={2}
        cornerRadius={4}
      />
      
      {/* Waveform visualization background */}
      <Rect
        x={2}
        y={2}
        width={el.width - 4}
        height={el.height - 4}
        fill="transparent"
        strokeWidth={0}
      />

      {/* Audio name/info */}
      <Text
        x={0}
        y={el.height / 2 - 8}
        width={el.width}
        text={el.name}
        fontSize={11}
        fill="#ffffff"
        align="center"
        verticalAlign="middle"
      />

      {/* Duration indicator */}
      <Text
        x={0}
        y={el.height / 2 + 2}
        width={el.width}
        text={`${displayDuration}s`}
        fontSize={9}
        fill="#b8a4e8"
        align="center"
        verticalAlign="middle"
      />
    </Group>
  )
}
