import { useEffect, useState } from 'react'
import { Group, Layer, Stage } from 'react-konva'
import type { SubtitleStyle } from '../types/editor'
import { SubtitleCaption } from './SubtitleOverlay'

export default function SubtitleStylePreview({ style }: { style: SubtitleStyle }) {
  const [time, setTime] = useState(0)
  const width = 340
  const height = 96
  const sceneWidth = 960
  const scale = width / sceneWidth

  useEffect(() => {
    const started = performance.now()
    const timer = window.setInterval(() => setTime(((performance.now() - started) / 1000) % 2.2), 40)
    return () => window.clearInterval(timer)
  }, [style.animation])

  return (
    <div className="mb-4 h-24 overflow-hidden rounded-lg border border-editor-border bg-editor-base">
      <Stage width={width} height={height} listening={false}>
        <Layer listening={false}>
          <Group scaleX={scale} scaleY={scale}>
            <SubtitleCaption width={sceneWidth} height={height / scale} text="caption style preview"
              start={0} end={1.25} time={time} style={style} />
          </Group>
        </Layer>
      </Stage>
    </div>
  )
}
