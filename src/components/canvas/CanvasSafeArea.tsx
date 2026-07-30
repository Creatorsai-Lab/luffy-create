import { Rect } from 'react-konva'
import { useCanvasStore } from '../../store/canvasStore'

interface Props {
  width: number
  height: number
}

export default function CanvasSafeArea({ width, height }: Props) {
  const { showSafeArea, safeAreaMargin } = useCanvasStore()

  if (!showSafeArea) return null

  return (
    <Rect
      x={safeAreaMargin}
      y={92 + safeAreaMargin}
      width={width - safeAreaMargin * 2.8}
      height={height - safeAreaMargin * 4.3}
      stroke="#00b97c"
      strokeWidth={2}
      dash={[8, 5]}
      listening={false}
    />
  )
}
