import { Move, Trash2 } from 'lucide-react'
import { v4 as uuid } from 'uuid'
import { useEditorStore } from '../../store/editorStore'
import type { EditorElement, ElementAnimation, MoveDirection } from '../../types/editor'
import { PanelHeader, Row, Slider } from './TextPanel'
import {
  MOVE_DIRECTIONS,
  computeMoveDelta,
  durationFromMove,
  isMoveAnimation,
} from '../../utils/moveAnimation'

const DEFAULT_DIRECTION: MoveDirection = 'right'
const DEFAULT_SPEED = 420

function getMoveAnim(el: EditorElement) {
  return el.animations.find(isMoveAnimation)
}

export default function MovePanel() {
  const {
    project,
    getSelectedEls,
    addAnimation,
    updateAnimation,
    removeAnimation,
  } = useEditorStore()

  const selected = getSelectedEls()
  const el = selected.find(item => item.type !== 'audio')
  const moveAnim = el ? getMoveAnim(el) : undefined

  const direction = moveAnim?.params?.moveDirection ?? DEFAULT_DIRECTION
  const speed = moveAnim?.params?.speed ?? DEFAULT_SPEED
  const delay = moveAnim?.delay ?? 0
  const moveOutside = moveAnim?.params?.moveOutside ?? false
  const deltaX = moveAnim?.params?.deltaX ?? 0
  const deltaY = moveAnim?.params?.deltaY ?? 0

  function buildMoveAnimation(
    target: EditorElement,
    patch: {
      direction?: MoveDirection
      speed?: number
      delay?: number
      moveOutside?: boolean
    } = {},
  ): ElementAnimation | null {
    if (!project) return null
    const nextDirection = patch.direction ?? direction
    const nextSpeed = patch.speed ?? speed
    const nextDelay = patch.delay ?? delay
    const nextOutside = patch.moveOutside ?? moveOutside
    const delta = computeMoveDelta(project, target, nextDirection, nextOutside)
    const duration = durationFromMove(delta.deltaX, delta.deltaY, nextSpeed)

    return {
      id: moveAnim?.id ?? uuid(),
      type: 'move',
      timing: 'onEnter',
      startTime: 0,
      duration,
      delay: nextDelay,
      easing: 'linear',
      params: {
        moveDirection: nextDirection,
        deltaX: delta.deltaX,
        deltaY: delta.deltaY,
        speed: nextSpeed,
        moveOutside: nextOutside,
      },
    }
  }

  function applyMove(patch?: Parameters<typeof buildMoveAnimation>[1]) {
    if (!el) return
    const anim = buildMoveAnimation(el, patch)
    if (!anim) return
    if (moveAnim) updateAnimation(el.id, moveAnim.id, anim)
    else addAnimation(el.id, anim)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PanelHeader icon={<Move size={12} />} title="Move" />

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {!el && (
          <p className="text-xs text-[#d9d9d9] leading-relaxed text-center py-4">
            Nothing is selected. Please select an item on the slide.
          </p>
        )}

        {el && (
          <div className="flex flex-col gap-2">
            <div className="rounded border border-editor-border bg-editor-elevated px-2 py-2">
              <div className="text-[10px] uppercase text-editor-secondary">Selected item</div>
              <div className="text-xs text-editor-text truncate">{el.name}</div>
            </div>

            {!moveAnim && (
              <button
                onClick={() => applyMove()}
                className="w-full text-xs py-2 bg-editor-accent text-white rounded hover:bg-editor-accent-hover transition-colors"
              >
                Create Move
              </button>
            )}

            <Row label="Direction">
              <select
                value={direction}
                onChange={e => applyMove({ direction: e.target.value as MoveDirection })}
                className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1.5"
              >
                {MOVE_DIRECTIONS.map(item => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </Row>

            <Row label="Speed">
              <Slider
                value={speed}
                min={60}
                max={2000}
                step={20}
                display={`${Math.round(speed)} px/s`}
                onChange={value => applyMove({ speed: value })}
              />
            </Row>

            <Row label="Delay">
              <input
                type="number"
                min={0}
                max={60}
                step={0.1}
                value={delay}
                onChange={e => applyMove({ delay: Math.max(0, Number(e.target.value)) })}
                className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1.5 nodrag"
              />
            </Row>

            <label className="flex items-center gap-2 text-xs text-editor-text py-1">
              <input
                type="checkbox"
                checked={moveOutside}
                onChange={e => applyMove({ moveOutside: e.target.checked })}
                className="accent-editor-accent"
              />
              <span>Item goes outside from scene</span>
            </label>

            {moveAnim && (
              <div className="rounded border border-editor-border bg-editor-elevated px-2 py-2 text-[10px] text-[#d9d9d9]">
                <div>Delta: {Math.round(deltaX)}px, {Math.round(deltaY)}px</div>
                <div>Duration: {moveAnim.duration.toFixed(2)}s</div>
              </div>
            )}

            {moveAnim && (
              <button
                onClick={() => removeAnimation(el.id, moveAnim.id)}
                className="flex items-center justify-center gap-1.5 text-xs py-1.5 bg-editor-elevated border border-editor-border rounded text-[#d9d9d9] hover:text-red-400 transition-colors"
              >
                <Trash2 size={11} /> Remove Move
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
