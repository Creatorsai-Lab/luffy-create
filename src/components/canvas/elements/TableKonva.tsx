import { Group, Rect, Text } from 'react-konva'
import type { SlideDir, TableElement } from '../../../types/editor'

interface Props {
  el: TableElement
  konvaProps: Record<string, unknown>
  wipeProgress?: number
  wipeDir?: SlideDir
}

export default function TableKonva({ el, konvaProps, wipeProgress = 1, wipeDir }: Props) {
  const { rows, cols, cells, cellWidth, cellHeight,
          borderColor, borderWidth, borderRadius = 0,
          cellBorderColor = borderColor, cellBorderWidth = borderWidth,
          headerBg, cellBg,
          textColor, fontSize, showHeader } = el

  const totalW = cols * cellWidth
  const totalH = rows * cellHeight
  const radius = Math.max(0, Math.min(borderRadius, totalW / 2, totalH / 2))
  const padding = 8
  const textWidth = Math.max(1, cellWidth - padding * 2)
  const textHeight = Math.max(1, cellHeight - padding * 2)
  const wipeActive = wipeProgress < 1 && wipeDir != null
  const clipX = wipeDir === 'left' ? totalW * (1 - wipeProgress) : 0
  const clipY = wipeDir === 'up' ? totalH * (1 - wipeProgress) : 0
  const clipW = (wipeDir === 'left' || wipeDir === 'right') ? totalW * wipeProgress : totalW
  const clipH = (wipeDir === 'up' || wipeDir === 'down') ? totalH * wipeProgress : totalH

  const tableNode = (
    <>
      <Group clipFunc={ctx => clipRoundedRect(ctx, totalW, totalH, radius)}>
        {/* Cells */}
        {Array.from({ length: rows }, (_, r) =>
          Array.from({ length: cols }, (_, c) => {
            const isHeader = showHeader && r === 0
            return (
              <Group key={`${r}-${c}`} x={c * cellWidth} y={r * cellHeight}>
                <Rect
                  width={cellWidth} height={cellHeight}
                  fill={isHeader ? headerBg : cellBg}
                  stroke={cellBorderColor} strokeWidth={cellBorderWidth}
                />
                <Text
                  x={padding} y={padding}
                  width={textWidth}
                  height={textHeight}
                  text={cells[r]?.[c] ?? ''}
                  fontSize={fontSize}
                  fontFamily="system-ui, sans-serif"
                  fontStyle={isHeader ? 'bold' : 'normal'}
                  fill={textColor}
                  align={el.textAlign ?? 'center'}
                  verticalAlign="middle"
                  wrap="word"
                  lineHeight={1.15}
                />
              </Group>
            )
          })
        )}
      </Group>
      <Rect
        width={totalW}
        height={totalH}
        cornerRadius={radius}
        stroke={borderColor}
        strokeWidth={borderWidth}
        listening={false}
      />
    </>
  )

  return (
    <Group {...konvaProps} width={totalW} height={totalH}>
      {wipeActive ? (
        <Group
          clipX={clipX}
          clipY={clipY}
          clipWidth={Math.max(0, clipW)}
          clipHeight={Math.max(0, clipH)}
        >
          {tableNode}
        </Group>
      ) : tableNode}
    </Group>
  )
}

function clipRoundedRect(ctx: CanvasRenderingContext2D, width: number, height: number, radius: number) {
  if (radius <= 0) {
    ctx.rect(0, 0, width, height)
    return
  }

  ctx.beginPath()
  ctx.moveTo(radius, 0)
  ctx.lineTo(width - radius, 0)
  ctx.quadraticCurveTo(width, 0, width, radius)
  ctx.lineTo(width, height - radius)
  ctx.quadraticCurveTo(width, height, width - radius, height)
  ctx.lineTo(radius, height)
  ctx.quadraticCurveTo(0, height, 0, height - radius)
  ctx.lineTo(0, radius)
  ctx.quadraticCurveTo(0, 0, radius, 0)
  ctx.closePath()
}
