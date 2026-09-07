import { useMemo } from 'react'
import { Group, Text } from 'react-konva'
import type { Project, SubtitleStyle } from '../types/editor'
import { getActiveSubtitleCue } from './timeline'
import { normalizeSubtitleStyle } from './types'
import { getCaptionOrigin, getSubtitleBlockState, getSubtitleWarpScale, getSubtitleWordState, layoutMeasuredSubtitleWords, layoutSubtitleLines } from './presentation'
import { fontWeightToCssValue, fontWeightToKonvaStyle } from '../utils/fontWeight'

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
  const lineHeight = 1.08
  const fontStyle = [style.italic ? 'italic' : '', fontWeightToKonvaStyle(style.fontWeight)].join(' ').trim()
  const metrics = useMemo(() => {
    const context = document.createElement('canvas').getContext('2d')!
    context.font = `${style.italic ? 'italic ' : ''}${fontWeightToCssValue(style.fontWeight)} ${style.fontSize}px "${style.fontFamily}"`
    const measure = (value: string) => context.measureText(value).width
    return layoutSubtitleLines(text, maxChars).map(line => ({ ...line, ...layoutMeasuredSubtitleWords(line.text, measure) }))
  }, [text, maxChars, style.fontFamily, style.fontSize, style.fontWeight, style.italic])
  if (!metrics.length) return null

  const boxWidth = Math.min(maxWidth, Math.max(...metrics.map(line => line.naturalWidth)))
  const warpStrength = (style.warpIntensity ?? 50) / 100
  const linePitch = style.fontSize * lineHeight * (style.captionLook === 'normal' ? 1 : 1 + warpStrength * 0.85)
  const boxHeight = metrics.length * linePitch
  const { x, y } = getCaptionOrigin(width, height, boxWidth, boxHeight, style.positionX, style.positionY)

  const words = metrics.reduce((sum, line) => sum + line.words.length, 0)
  const duration = Math.max(0.01, end - start)
  const entranceDuration = style.animation === 'smoothReveal'
    ? Math.min(0.65, duration)
    : Math.min(duration * 0.85, Math.max(0.38, words * 0.11))
  const progress = Math.max(0, Math.min(1, (time - start) / Math.max(0.01, entranceDuration)))
  const block = getSubtitleBlockState(style.animation, progress)
  const textFillProps = subtitleTextFillProps(style, boxWidth)
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
      {metrics.map((line, lineIndex) => {
        const { words: lineWords, naturalWidth, characterCount } = line
        const scaleX = Math.min(1, boxWidth / Math.max(1, naturalWidth))
        const lineX = (boxWidth - naturalWidth) / 2
        const firstWord = wordIndex
        wordIndex += lineWords.length

        return (
          <Group key={`${lineIndex}-${line.text}`} x={boxWidth / 2}
            y={lineIndex * linePitch}
            offsetX={boxWidth / 2} scaleX={scaleX}>
            {lineWords.map((word, index) => {
              const state = getSubtitleWordState(style.animation, progress, firstWord + index, words)
              const wordX = lineX + word.x
              if (style.captionLook !== 'normal') {
                return (
                  <Group key={`${firstWord + index}-${word.text}`} x={wordX + word.width / 2}
                    y={linePitch / 2 + state.offsetY} offsetX={word.width / 2}
                    offsetY={style.fontSize * lineHeight / 2} scaleX={state.scale}
                    scaleY={state.scale} opacity={state.opacity}>
                    {word.characters.map(character => (
                      <Text key={`${character.index}-${character.text}`} x={character.x + character.width / 2}
                        y={style.fontSize * lineHeight / 2} offsetX={character.width / 2}
                        offsetY={style.fontSize * lineHeight / 2} text={character.text}
                        fontFamily={style.fontFamily} fontSize={style.fontSize} fontStyle={fontStyle}
                        {...textFillProps} scaleY={getSubtitleWarpScale(style.captionLook, style.warpIntensity, character.index, characterCount)}
                        lineHeight={lineHeight} wrap="none" listening={false} perfectDrawEnabled={false}
                        shadowColor={state.emphasis ? style.color : undefined}
                        shadowBlur={state.emphasis ? style.fontSize * 0.16 : 0}
                      />
                    ))}
                  </Group>
                )
              }
              return (
                <Text key={`${firstWord + index}-${word.text}`} x={wordX + word.width / 2} y={linePitch / 2 + state.offsetY}
                  offsetX={word.width / 2} offsetY={style.fontSize * lineHeight / 2}
                  width={word.width} text={word.text} fontFamily={style.fontFamily}
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
