import { Group, Rect, Shape } from 'react-konva'
import type { Box } from '../../utils/groups'

/**
 * Shown on a selected locked item instead of resize handles: a dashed outline
 * and a padlock badge on its top-right corner. Sizes are in screen pixels.
 */
export default function LockedMark({ box, scale, color }: { box: Box; scale: number; color: string }) {
  const r = 11 / scale
  return (
    <Group listening={false}>
      <Rect x={box.x} y={box.y} width={box.width} height={box.height}
        stroke={color} strokeWidth={1.5 / scale} dash={[6 / scale, 4 / scale]} />
      <Group x={box.x + box.width} y={box.y}>
        <Rect x={-r} y={-r} width={r * 2} height={r * 2} cornerRadius={r} fill={color} />
        <Shape
          sceneFunc={(ctx, shape) => {
            // Padlock: a shackle arc over a rounded body.
            const u = r / 11
            ctx.beginPath()
            ctx.arc(0, -1.5 * u, 3.2 * u, Math.PI, 0)
            ctx.moveTo(-3.2 * u, -1.5 * u)
            ctx.lineTo(-3.2 * u, 0.5 * u)
            ctx.moveTo(3.2 * u, -1.5 * u)
            ctx.lineTo(3.2 * u, 0.5 * u)
            ctx.strokeShape(shape)
            ctx.beginPath()
            ctx.rect(-5 * u, 0.2 * u, 10 * u, 6.5 * u)
            ctx.fillShape(shape)
          }}
          stroke="#ffffff"
          strokeWidth={1.6 / scale}
          fill="#ffffff"
        />
      </Group>
    </Group>
  )
}
