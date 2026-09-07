import { Group, Text } from 'react-konva'
import type { Project, SubtitleStyle } from '../types/editor'
import { getActiveSubtitleCue } from './timeline'
import { normalizeSubtitleStyle } from './types'
import { getCaptionOrigin, getSubtitleBlockState, getSubtitleCurveOffset, getSubtitleWordState, layoutSubtitleLines } from './presentation'
import { fontWeightToKonvaStyle } from '../utils/fontWeight'

interface Props {
  project: Project | null
  time: number
}

interface CaptionProps {
  width: number
  height: number
  text: string
  start: number
  end: number
  time: number
  style: SubtitleStyle
}

export default function SubtitleOverlay({ project, time }: Props) {
  const active = getActiveSubtitleCue(project, time)
  if (!project || !active) return null
  return (
    <SubtitleCaption
      width={project.width}
      height={project.height}
      text={active.cue.text}
      start={active.cue.start}
      end={active.cue.end}
      time={time}
      style={active.track.style}
    />
  )
}

export function SubtitleCaption({ width, height, text, start, end, time, style: rawStyle }: CaptionProps) {
  const style = normalizeSubtitleStyle(rawStyle)
  const maxWidth = Math.max(80, width * (style.maxWidthPct / 100))
  const maxChars = Math.max(8, Math.floor(maxWidth / (style.fontSize * 0.54)))
  const lines = layoutSubtitleLines(text, maxChars)
  if (!lines.length) return null

  const lineHeight = 1.08
  const metrics = lines.map(line => {
    const words = line.text.split(' ')
    const widths = words.map(word => Math.max(style.fontSize * 0.35, word.length * style.fontSize * 0.54))
    const naturalWidth = widths.reduce((sum, value) => sum + value, 0) + Math.max(0, words.length - 1) * style.fontSize * 0.3
    return { words, widths, naturalWidth }
  })
  const boxWidth = Math.min(maxWidth, Math.max(...metrics.map(line => line.naturalWidth)))
  const curveSpace = style.captionLook === 'normal' ? 0 : style.fontSize * 0.28 * ((style.curveIntensity ?? 50) / 100)
  const linePitch = style.fontSize * lineHeight + curveSpace
  const boxHeight = lines.length * linePitch
  const { x, y } = getCaptionOrigin(width, height, boxWidth, boxHeight, style.positionX, style.positionY)

  const words = lines.reduce((sum, line) => sum + line.text.split(' ').length, 0)
  const duration = Math.max(0.01, end - start)
  const entranceDuration = style.animation === 'smoothReveal'
    ? Math.min(0.65, duration)
    : Math.min(duration * 0.85, Math.max(0.38, words * 0.11))
  const progress = Math.max(0, Math.min(1, (time - start) / Math.max(0.01, entranceDuration)))
  const block = getSubtitleBlockState(style.animation, progress)
  const textFillProps = subtitleTextFillProps(style, boxWidth)
  const fontStyle = [style.italic ? 'italic' : '', fontWeightToKonvaStyle(style.fontWeight)].join(' ').trim()
  let wordIndex = 0

  return (
    <Group
      x={x + boxWidth / 2}
      y={y + boxHeight / 2 + block.offsetY}
      offsetX={boxWidth / 2}
      offsetY={boxHeight / 2}
      scaleX={block.scale}
      scaleY={block.scale}
      opacity={block.opacity}
      listening={false}
    >
      {lines.map((line, lineIndex) => {
        const { words: lineWords, widths, naturalWidth } = metrics[lineIndex]
        const scaleX = Math.min(1, boxWidth / Math.max(1, naturalWidth))
        let cursor = (boxWidth - naturalWidth) / 2
        const firstWord = wordIndex
        wordIndex += lineWords.length

        return (
          <Group key={`${lineIndex}-${line.text}`} x={boxWidth / 2}
            y={lineIndex * linePitch + (style.captionLook === 'curveOut' ? curveSpace : 0)}
            offsetX={boxWidth / 2} scaleX={scaleX}>
            {lineWords.map((word, index) => {
              const wordWidth = widths[index]
              const state = getSubtitleWordState(style.animation, progress, firstWord + index, words)
              const curveY = getSubtitleCurveOffset(style.captionLook, style.curveIntensity, index, lineWords.length, style.fontSize)
              const wordX = cursor
              cursor += wordWidth + style.fontSize * 0.3
              return (
                <Text key={`${firstWord + index}-${word}`} x={wordX + wordWidth / 2} y={curveY + state.offsetY}
                  offsetX={wordWidth / 2} width={wordWidth} text={word} fontFamily={style.fontFamily}
                  fontSize={style.fontSize} fontStyle={fontStyle} {...textFillProps}
                  scaleX={state.scale} scaleY={state.scale} opacity={state.opacity}
                  lineHeight={lineHeight} wrap="none" listening={false} perfectDrawEnabled={false}
                  shadowColor={state.emphasis ? style.color : undefined}
                  shadowBlur={state.emphasis ? style.fontSize * 0.16 : 0}
                />
              )
            })}
          </Group>
        )
      })}
    </Group>
  )
}

function subtitleTextFillProps(style: SubtitleStyle, width: number) {
  if (style.fillMode !== 'linearGradient') return { fill: style.color, fillPriority: 'color' as const }
  const stops: Array<string | number> = [
    0,
    colorWithAlpha(style.gradientColor1 ?? style.color, style.gradientOpacity1 ?? 1),
    style.gradientUseColor3 ? 0.5 : 1,
    colorWithAlpha(style.gradientColor2 ?? '#8b5cf6', style.gradientOpacity2 ?? 1),
  ]
  if (style.gradientUseColor3) stops.push(1, colorWithAlpha(style.gradientColor3 ?? '#22d3ee', style.gradientOpacity3 ?? 1))
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
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`
}
