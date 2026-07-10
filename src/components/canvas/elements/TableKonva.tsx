import { Group, Rect, Text, Line } from 'react-konva'
import type { TableElement } from '../../../types/editor'

interface Props {
  el: TableElement
  konvaProps: Record<string, unknown>
}

export default function TableKonva({ el, konvaProps }: Props) {
  const { rows, cols, cells, cellWidth, cellHeight,
          borderColor, borderWidth, headerBg, cellBg,
          textColor, fontSize, showHeader } = el

  const totalW = cols * cellWidth
  const totalH = rows * cellHeight

  return (
    <Group {...konvaProps} width={totalW} height={totalH}>
      {/* Cells */}
      {Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => {
          const isHeader = showHeader && r === 0
          return (
            <Group key={`${r}-${c}`} x={c * cellWidth} y={r * cellHeight}>
              <Rect
                width={cellWidth} height={cellHeight}
                fill={isHeader ? headerBg : cellBg}
                stroke={borderColor} strokeWidth={borderWidth}
              />
              <Text
                x={6} y={(cellHeight - fontSize * 1.4) / 2}
                width={cellWidth - 12}
                text={cells[r]?.[c] ?? ''}
                fontSize={fontSize}
                fontFamily="system-ui, sans-serif"
                fontStyle={isHeader ? 'bold' : 'normal'}
                fill={textColor}
                ellipsis
                wrap="none"
              />
            </Group>
          )
        })
      )}
    </Group>
  )
}
