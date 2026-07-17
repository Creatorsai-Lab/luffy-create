import { Group, Rect, Text } from 'react-konva'
import type { Project } from '../types/editor'
import { getActiveSubtitleCue } from './timeline'
import { normalizeSubtitleStyle } from './types'
import { fontWeightToKonvaStyle } from '../utils/fontWeight'

interface Props {
  project: Project | null
  time: number
}

export default function SubtitleOverlay({ project, time }: Props) {
  const active = getActiveSubtitleCue(project, time)
  if (!project || !active) return null

  const { track, cue } = active
  const style = normalizeSubtitleStyle(track.style)
  const marginTop = style.marginTop ?? 80
  const marginRight = style.marginRight ?? 120
  const marginBottom = style.marginBottom ?? 80
  const marginLeft = style.marginLeft ?? 120
  const availableWidth = Math.max(120, project.width - marginLeft - marginRight)
  const maxWidth = Math.min(project.width * (style.maxWidthPct / 100), Math.max(80, availableWidth - style.paddingX * 2))
  const estimatedCharsPerLine = Math.max(18, Math.floor(maxWidth / (style.fontSize * 0.54)))
  const lines = wrapText(cue.text, estimatedCharsPerLine)
  const lineHeight = 1.18
  const textHeight = Math.max(style.fontSize * lineHeight, lines.length * style.fontSize * lineHeight)
  const boxWidth = Math.min(availableWidth, maxWidth + style.paddingX * 2)
  const boxHeight = textHeight + style.paddingY * 2
  const x = marginLeft + (availableWidth - boxWidth) / 2
  const y = (() => {
    const availableHeight = Math.max(80, project.height - marginTop - marginBottom)
    if (style.position === 'top') return marginTop
    if (style.position === 'middle') return marginTop + (availableHeight - boxHeight) / 2
    return project.height - boxHeight - marginBottom
  })()
  const progress = Math.max(0, Math.min(1, (time - cue.start) / Math.max(0.01, Math.min(0.45, cue.end - cue.start))))
  const eased = 1 - Math.pow(1 - progress, 3)
  const opacity = style.animation === 'fade' ? eased : 1
  const offsetY = style.animation === 'slideUp' ? (1 - eased) * 36 : 0
  const scale = style.animation === 'pop' ? 0.88 + eased * 0.12 : 1
  const textFillProps = subtitleTextFillProps(style, maxWidth)

  return (
    <Group
      x={x + boxWidth / 2}
      y={y + boxHeight / 2 + offsetY}
      offsetX={boxWidth / 2}
      offsetY={boxHeight / 2}
      scaleX={scale}
      scaleY={scale}
      opacity={opacity}
      listening={false}
    >
      {style.backgroundEnabled && (
        <Rect
          width={boxWidth}
          height={boxHeight}
          fill={style.backgroundColor}
          opacity={style.backgroundOpacity}
          cornerRadius={style.radius}
          listening={false}
        />
      )}
      <Text
        x={style.paddingX}
        y={style.paddingY}
        width={maxWidth}
        text={lines.join('\n')}
        fontFamily={style.fontFamily}
        fontSize={style.fontSize}
        fontStyle={[style.italic ? 'italic' : '', fontWeightToKonvaStyle(style.fontWeight)].join(' ').trim()}
        {...textFillProps}
        align={style.align}
        lineHeight={lineHeight}
        wrap="word"
        listening={false}
        perfectDrawEnabled={false}
      />
    </Group>
  )
}

function subtitleTextFillProps(style: ReturnType<typeof normalizeSubtitleStyle>, width: number) {
  if (style.fillMode !== 'linearGradient') return { fill: style.color, fillPriority: 'color' as const }
  const stops: Array<string | number> = [
    0,
    colorWithAlpha(style.gradientColor1 ?? style.color, style.gradientOpacity1 ?? 1),
    style.gradientUseColor3 ? 0.5 : 1,
    colorWithAlpha(style.gradientColor2 ?? '#8b5cf6', style.gradientOpacity2 ?? 1),
  ]
  if (style.gradientUseColor3) {
    stops.push(1, colorWithAlpha(style.gradientColor3 ?? '#22d3ee', style.gradientOpacity3 ?? 1))
  }
  return {
    fillPriority: 'linear-gradient' as const,
    fillLinearGradientStartPoint: { x: 0, y: 0 },
    fillLinearGradientEndPoint: { x: width, y: 0 },
    fillLinearGradientColorStops: stops,
  }
}

function colorWithAlpha(hex: string, alpha: number) {
  const clean = hex.replace('#', '')
  const normalized = clean.length === 3 ? clean.split('').map(ch => ch + ch).join('') : clean.slice(0, 6)
  const n = Number.parseInt(normalized, 16)
  if (!Number.isFinite(n)) return hex
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`
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
