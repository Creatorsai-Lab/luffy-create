import { useMemo } from 'react'
import { Group, Text } from 'react-konva'
import type { Project, SubtitleCue, SubtitleStyle, SubtitleTrack } from '../types/editor'
import { getActiveSubtitleCue } from './timeline'
import { normalizeSubtitleStyle, normalizeSubtitleTrack } from './types'
import {
  fitSubtitleRow,
  getCaptionOrigin,
  getSubtitleBlockState,
  getSubtitleRenderRows,
  getSubtitleWarpScale,
  getSubtitleStackWordStates,
  layoutMeasuredSubtitleWords,
  layoutSubtitleStack,
  type SubtitleRenderRow,
} from './presentation'
import { fontWeightToCssValue, fontWeightToKonvaStyle } from '../utils/fontWeight'

interface Props { project: Project | null; time: number }
interface CaptionProps { width: number; height: number; text: string; start: number; end: number; time: number; style: SubtitleStyle }
interface StackProps { width: number; height: number; cue: SubtitleCue; track: SubtitleTrack; time: number; rows: SubtitleRenderRow[] }

export default function SubtitleOverlay({ project, time }: Props) {
  const active = getActiveSubtitleCue(project, time)
  if (!project || !active) return null
  const track = normalizeSubtitleTrack(active.track)
  return <SubtitleCaptionStack width={project.width} height={project.height} cue={active.cue} track={track}
    time={time} rows={getSubtitleRenderRows(track, active.cue)} />
}

/** Single-row caption kept for the small style preview. */
export function SubtitleCaption({ width, height, text, start, end, time, style }: CaptionProps) {
  const track = normalizeSubtitleTrack({ id: 'preview', name: 'Preview', language: 'en', enabled: true, cues: [], style })
  const cue = { id: 'preview', start, end, text }
  return <SubtitleCaptionStack width={width} height={height} cue={cue} track={track} time={time}
    rows={[{ language: 'en', text, translated: false }]} />
}

function SubtitleCaptionStack({ width, height, cue, track, time, rows }: StackProps) {
  const style = normalizeSubtitleStyle(track.style)
  const maxWidth = Math.max(1, width * Math.min(90, style.maxWidthPct) / 100)
  const rowGap = track.translation?.style.rowGap ?? 8
  const metrics = useMemo(() => {
    const context = document.createElement('canvas').getContext('2d')!
    return rows.map(row => {
      const translatedStyle = row.translated ? track.translation?.style : undefined
      const rowStyle: SubtitleStyle = {
        ...style,
        fontFamily: translatedStyle?.fontFamily || style.fontFamily,
        fontSize: style.fontSize * (translatedStyle?.sizePct ?? 100) / 100,
        ...(translatedStyle?.color ? { color: translatedStyle.color, fillMode: 'solid' as const } : {}),
      }
      const measureAtSize = (text: string, size: number) => {
        context.font = `${rowStyle.italic ? 'italic ' : ''}${fontWeightToCssValue(rowStyle.fontWeight)} ${size}px "${rowStyle.fontFamily}"`
        return context.measureText(text).width
      }
      const fitted = fitSubtitleRow(row.text, rowStyle.fontSize, maxWidth, measureAtSize)
      const measured = layoutMeasuredSubtitleWords(fitted.text, text => measureAtSize(text, fitted.fontSize))
      const warp = rowStyle.captionLook === 'normal' ? 1 : 1 + (rowStyle.warpIntensity ?? 50) / 100 * 0.85
      return { ...row, style: { ...rowStyle, fontSize: fitted.fontSize }, ...fitted, ...measured, height: fitted.height * warp }
    })
  }, [maxWidth, rows, style, track.translation?.style])
  if (!metrics.length) return null

  const stack = layoutSubtitleStack(metrics.map(row => ({ width: row.width * row.scaleX, height: row.height })), rowGap)
  const origin = getCaptionOrigin(width, height, stack.width, stack.height, style.positionX, style.positionY)
  const maxWords = Math.max(...metrics.map(row => row.words.length))
  const duration = Math.max(0.01, cue.end - cue.start)
  const entranceDuration = style.animation === 'smoothReveal'
    ? Math.min(0.65, duration)
    : Math.min(duration * 0.85, Math.max(0.38, maxWords * 0.11))
  const progress = Math.max(0, Math.min(1, (time - cue.start) / Math.max(0.01, entranceDuration)))
  const block = getSubtitleBlockState(style.animation, progress)
  const wordStates = getSubtitleStackWordStates(style.animation ?? 'wordPop', progress, metrics.map(row => row.words.length))

  return (
    <Group x={origin.x + stack.width / 2} y={origin.y + stack.height / 2 + block.offsetY}
      offsetX={stack.width / 2} offsetY={stack.height / 2} scaleX={block.scale} scaleY={block.scale}
      opacity={block.opacity} listening={false}>
      {metrics.map((row, rowIndex) => {
        const visualWidth = row.width * row.scaleX
        const rowX = (stack.width - visualWidth) / 2
        const fontStyle = [row.style.italic ? 'italic' : '', fontWeightToKonvaStyle(row.style.fontWeight)].join(' ').trim()
        const fill = subtitleTextFillProps(row.style, row.width)
        return (
          <Group key={`${row.language}-${row.text}`} x={rowX + visualWidth / 2} y={stack.rows[rowIndex].y}
            offsetX={row.width / 2} scaleX={row.scaleX}>
            {row.words.map((word, index) => {
              const state = wordStates[rowIndex][index]
              const common = { fontFamily: row.style.fontFamily, fontSize: row.style.fontSize, fontStyle, ...fill,
                lineHeight: 1.08, wrap: 'none' as const, listening: false, perfectDrawEnabled: false,
                shadowColor: state.emphasis ? row.style.color : undefined,
                shadowBlur: state.emphasis ? row.style.fontSize * 0.16 : 0 }
              if (row.style.captionLook !== 'normal') return (
                <Group key={`${index}-${word.text}`} x={word.x + word.width / 2} y={row.height / 2 + state.offsetY}
                  offsetX={word.width / 2} offsetY={row.style.fontSize * 0.54} scaleX={state.scale} scaleY={state.scale} opacity={state.opacity}>
                  {word.characters.map(character => <Text key={`${character.index}-${character.text}`}
                    x={character.x + character.width / 2} y={row.style.fontSize * 0.54} offsetX={character.width / 2}
                    offsetY={row.style.fontSize * 0.54} text={character.text} {...common}
                    scaleY={getSubtitleWarpScale(row.style.captionLook, row.style.warpIntensity, character.index, row.characterCount)} />)}
                </Group>
              )
              return <Text key={`${index}-${word.text}`} x={word.x + word.width / 2} y={row.height / 2 + state.offsetY}
                offsetX={word.width / 2} offsetY={row.style.fontSize * 0.54} width={word.width} text={word.text}
                {...common} scaleX={state.scale} scaleY={state.scale} opacity={state.opacity} />
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
    0, colorWithAlpha(style.gradientColor1 ?? style.color, style.gradientOpacity1 ?? 1),
    style.gradientUseColor3 ? 0.5 : 1, colorWithAlpha(style.gradientColor2 ?? '#8b5cf6', style.gradientOpacity2 ?? 1),
  ]
  if (style.gradientUseColor3) stops.push(1, colorWithAlpha(style.gradientColor3 ?? '#22d3ee', style.gradientOpacity3 ?? 1))
  return { fillPriority: 'linear-gradient' as const, fillLinearGradientStartPoint: { x: 0, y: 0 },
    fillLinearGradientEndPoint: { x: width, y: 0 }, fillLinearGradientColorStops: stops }
}

function colorWithAlpha(hex: string, alpha: number) {
  const clean = hex.replace('#', '')
  const normalized = clean.length === 3 ? clean.split('').map(ch => ch + ch).join('') : clean.slice(0, 6)
  const n = Number.parseInt(normalized, 16)
  if (!Number.isFinite(n)) return hex
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.max(0, Math.min(1, alpha))})`
}
