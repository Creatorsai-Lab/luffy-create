import { Group, Rect } from 'react-konva'
import type { EditorElement } from '../../types/editor'

/** Six pastel colours; each item keeps the same one (picked from its id). */
export const HIGHLIGHT_COLORS = ['#ff9aa2', '#ffb347', '#fdfd96', '#77dd77', '#89cff0', '#cdb4db']

export function highlightColor(id: string) {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return HIGHLIGHT_COLORS[Math.abs(hash) % HIGHLIGHT_COLORS.length]
}

/** The items a highlight covers: everything visual on the scene, audio excluded. */
export function highlightableElements(elements: EditorElement[]) {
  return elements.filter(el => el.type !== 'audio')
}

/**
 * Shows where every item on the scene is — including ones that are not on
 * screen at the current time because of an animation delay — as half-transparent
 * coloured boxes, so items underneath stay visible. Editor-only; not exported.
 */
export default function HighlightOverlay({ elements }: { elements: EditorElement[] }) {
  return (
    <Group listening={false}>
      {highlightableElements(elements)
        .slice()
        .sort((a, b) => a.zIndex - b.zIndex)
        .map(el => {
          const color = highlightColor(el.id)
          const box = el.type === 'arrow'
            ? (() => {
                const pad = Math.max(4, el.strokeWidth / 2 + 2)
                const x = Math.min(el.x1, el.x2) - pad
                const y = Math.min(el.y1, el.y2) - pad
                return { x, y, width: Math.abs(el.x2 - el.x1) + pad * 2, height: Math.abs(el.y2 - el.y1) + pad * 2, rotation: 0 }
              })()
            : { x: el.x, y: el.y, width: el.width, height: el.height, rotation: el.rotation }
          return (
            <Rect
              key={el.id}
              {...box}
              fill={color}
              opacity={0.5}
              stroke={color}
              strokeWidth={2}
              strokeScaleEnabled={false}
              // Hidden items (eye off in Layers) get a dashed outline.
              dash={el.visible ? undefined : [8, 6]}
              perfectDrawEnabled={false}
            />
          )
        })}
    </Group>
  )
}
