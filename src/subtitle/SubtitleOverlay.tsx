import { Group, Rect, Text } from 'react-konva'
import type { Project } from '../types/editor'
import { getActiveSubtitleCue } from './timeline'

interface Props {
  project: Project | null
  time: number
}

export default function SubtitleOverlay({ project, time }: Props) {
  const active = getActiveSubtitleCue(project, time)
  if (!project || !active) return null

  const { track, cue } = active
  const style = track.style
  const maxWidth = project.width * (style.maxWidthPct / 100)
  const estimatedCharsPerLine = Math.max(18, Math.floor(maxWidth / (style.fontSize * 0.54)))
  const lines = wrapText(cue.text, estimatedCharsPerLine)
  const lineHeight = 1.18
  const textHeight = Math.max(style.fontSize * lineHeight, lines.length * style.fontSize * lineHeight)
  const boxWidth = maxWidth + style.paddingX * 2
  const boxHeight = textHeight + style.paddingY * 2
  const x = (project.width - boxWidth) / 2
  const y = (() => {
    if (style.position === 'top') return project.height * 0.08
    if (style.position === 'middle') return (project.height - boxHeight) / 2
    return project.height - boxHeight - project.height * 0.08
  })()

  return (
    <Group x={x} y={y} listening={false}>
      <Rect
        width={boxWidth}
        height={boxHeight}
        fill={style.backgroundColor}
        opacity={style.backgroundOpacity}
        cornerRadius={style.radius}
        listening={false}
      />
      <Text
        x={style.paddingX}
        y={style.paddingY}
        width={maxWidth}
        text={lines.join('\n')}
        fontFamily={style.fontFamily}
        fontSize={style.fontSize}
        fontStyle={style.fontWeight}
        fill={style.color}
        align={style.align}
        lineHeight={lineHeight}
        wrap="word"
        listening={false}
        perfectDrawEnabled={false}
      />
    </Group>
  )
}

function wrapText(text: string, maxChars: number) {
  const words = text.replace(/\s+/g, ' ').trim().split(' ')
  const lines: string[] = []
  let line = ''

  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (next.length > maxChars && line) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }

  if (line) lines.push(line)
  return lines.slice(0, 2)
}
