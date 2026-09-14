import { Activity, Trash2 } from 'lucide-react'
import { v4 as uuid } from 'uuid'
import { useEditorStore } from '../../store/editorStore'
import type {
  EditorElement, ElementAnimation, MotionZoomPosition, MoveDirection, Project,
} from '../../types/editor'
import {
  MOVE_DIRECTIONS, computeCenterMoveDelta, computeMoveDelta, durationFromMove, elementCenter, isMotionAnimation,
} from '../../utils/moveAnimation'
import { NumberInput, PanelHeader, Row, Slider } from './TextPanel'

type MotionType = 'move' | 'zoomIn' | 'zoomOut'
type MotionAnimation = ElementAnimation & { type: MotionType }

const MOTION_OPTIONS: { value: MotionType; label: string }[] = [
  { value: 'move', label: 'Move' },
  { value: 'zoomIn', label: 'Zoom In' },
  { value: 'zoomOut', label: 'Zoom Out' },
]
const ZOOM_POSITIONS: { value: MotionZoomPosition; label: string }[] = [
  { value: 'center', label: 'Center' },
  { value: 'topLeft', label: 'Top Left' },
  { value: 'topRight', label: 'Top Right' },
  { value: 'bottomRight', label: 'Bottom Right' },
  { value: 'bottomLeft', label: 'Bottom Left' },
]

export default function MotionPanel() {
  const { project, currentSceneId, getSelectedEls, addAnimation, updateAnimation, removeAnimation } = useEditorStore()
  const element = getSelectedEls().find(item => item.type !== 'audio')
  const sceneDuration = project?.scenes.find(scene => scene.id === currentSceneId)?.duration ?? 10
  const motions = element?.animations.filter(isMotionAnimation) ?? []

  const addMotion = (type: MotionType) => {
    if (!element || !project) return
    if (type === 'move') {
      const { deltaX, deltaY } = computeMoveDelta(project, element, 'right', false)
      addAnimation(element.id, {
        id: uuid(), type, timing: 'onEnter', startTime: 0,
        duration: durationFromMove(deltaX, deltaY, 420), delay: 0, easing: 'linear',
        params: { moveMode: 'direction', moveDirection: 'right', deltaX, deltaY, speed: 420, moveOutside: false },
      })
    } else {
      addAnimation(element.id, {
        id: uuid(), type, timing: 'onEnter', startTime: 0,
        duration: Math.min(0.7, sceneDuration), delay: 0, easing: 'easeInOut',
        params: { zoomPosition: 'center', zoomScale: type === 'zoomIn' ? 1.5 : 1 },
      })
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PanelHeader icon={<Activity size={12} />} title="Motion" />
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {!element ? (
          <p className="py-4 text-center text-xs leading-relaxed text-[#d9d9d9]">
            Nothing is selected. Please select an item on the slide.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="rounded border border-editor-border bg-editor-elevated-highlight px-2 py-2">
              <div className="text-[10px] uppercase text-editor-text-secondary">Selected item</div>
              <div className="truncate text-xs text-editor-text">{element.name}</div>
            </div>

            <Row label="Motion option">
              <select
                value=""
                onChange={event => addMotion(event.target.value as MotionType)}
                className="w-full rounded border border-editor-border bg-editor-elevated-highlight px-2 py-1.5 text-xs text-editor-text"
              >
                <option value="" disabled>Add motion…</option>
                {MOTION_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </Row>

            {motions.length === 0 && (
              <p className="rounded border border-dashed border-editor-border p-3 text-center text-[11px] text-editor-text-secondary">
                Choose a motion to add it to this item.
              </p>
            )}

            {motions.map(animation => animation.type === 'move' ? (
              <MoveCard
                key={animation.id}
                animation={animation}
                element={element}
                project={project}
                sceneDuration={sceneDuration}
                onChange={next => updateAnimation(element.id, animation.id, next)}
                onRemove={() => removeAnimation(element.id, animation.id)}
              />
            ) : (
              <ZoomCard
                key={animation.id}
                animation={animation}
                sceneDuration={sceneDuration}
                onChange={next => updateAnimation(element.id, animation.id, next)}
                onRemove={() => removeAnimation(element.id, animation.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ZoomCard({ animation, sceneDuration, onChange, onRemove }: {
  animation: MotionAnimation
  sceneDuration: number
  onChange: (animation: ElementAnimation) => void
  onRemove: () => void
}) {
  const startTime = Math.max(0, animation.startTime + animation.delay)
  const change = (patch: Partial<ElementAnimation>) => onChange({ ...animation, ...patch, delay: 0 })
  const label = animation.type === 'zoomIn' ? 'Zoom In' : 'Zoom Out'
  const remaining = Math.max(0.1, sceneDuration - startTime)
  const zoomScale = animation.params?.zoomScale ?? (animation.type === 'zoomIn' ? 1.5 : 1)
  const zoomRange = animation.type === 'zoomIn'
    ? { min: 1, max: 10, step: 0.5 }
    : { min: 0.3, max: 1, step: 0.1 }

  return (
    <MotionCard title={label} description="Smooth zoom that holds its selected size." onRemove={onRemove}>
      <div className="grid grid-cols-2 gap-2">
        <Row label="Delay (s)">
          <NumberInput
            value={startTime} min={0} max={sceneDuration} step={0.1}
            onChange={value => {
              const nextStart = Math.max(0, Math.min(sceneDuration, value))
              change({ startTime: nextStart, duration: Math.min(animation.duration, Math.max(0.1, sceneDuration - nextStart)) })
            }}
          />
        </Row>
        <Row label="Duration (s)">
          <NumberInput
            value={animation.duration} min={0.1} max={remaining} step={0.1}
            onChange={value => change({ duration: Math.max(0.1, Math.min(remaining, value)) })}
          />
        </Row>
      </div>
      <Row label="Zoom">
        <Slider
          value={zoomScale}
          min={zoomRange.min}
          max={zoomRange.max}
          step={zoomRange.step}
          display={`${zoomScale.toFixed(1)}x`}
          onChange={value => change({ params: { ...animation.params, zoomScale: value } })}
        />
      </Row>
      <Row label="Position">
        <select
          value={animation.params?.zoomPosition ?? 'center'}
          onChange={event => change({ params: { ...animation.params, zoomPosition: event.target.value as MotionZoomPosition } })}
          className="w-full rounded border border-editor-border bg-editor-elevated-highlight px-2 py-1.5 text-xs text-editor-text"
        >
          {ZOOM_POSITIONS.map(position => <option key={position.value} value={position.value}>{position.label}</option>)}
        </select>
      </Row>
    </MotionCard>
  )
}

interface MovePatch {
  direction?: MoveDirection
  speed?: number
  startTime?: number
  moveOutside?: boolean
  moveMode?: 'direction' | 'coordinates'
  startCenterX?: number
  startCenterY?: number
  endCenterX?: number
  endCenterY?: number
}

function MoveCard({ animation, element, project, sceneDuration, onChange, onRemove }: {
  animation: MotionAnimation
  element: EditorElement
  project: Project
  sceneDuration: number
  onChange: (animation: ElementAnimation) => void
  onRemove: () => void
}) {
  const params = animation.params ?? {}
  const direction = params.moveDirection ?? 'right'
  const speed = params.speed ?? 420
  const moveOutside = params.moveOutside ?? false
  const moveMode = params.moveMode ?? 'direction'
  const center = elementCenter(element)
  const edgeDelta = computeMoveDelta(project, element, direction, moveOutside)
  const startCenterX = params.startCenterX ?? center.x
  const startCenterY = params.startCenterY ?? center.y
  const endCenterX = params.endCenterX ?? center.x + edgeDelta.deltaX
  const endCenterY = params.endCenterY ?? center.y + edgeDelta.deltaY
  const startTime = Math.max(0, animation.startTime + animation.delay)

  const change = (patch: MovePatch) => {
    const nextMode = patch.moveMode ?? moveMode
    const nextDirection = patch.direction ?? direction
    const nextOutside = patch.moveOutside ?? moveOutside
    const nextSpeed = patch.speed ?? speed
    const nextStartX = patch.startCenterX ?? startCenterX
    const nextStartY = patch.startCenterY ?? startCenterY
    const nextEndX = patch.endCenterX ?? endCenterX
    const nextEndY = patch.endCenterY ?? endCenterY
    const coordinates = nextMode === 'coordinates'
      ? computeCenterMoveDelta(element, nextStartX, nextStartY, nextEndX, nextEndY)
      : null
    const delta = coordinates ?? computeMoveDelta(project, element, nextDirection, nextOutside)
    onChange({
      ...animation,
      startTime: patch.startTime ?? startTime,
      duration: durationFromMove(delta.deltaX, delta.deltaY, nextSpeed),
      delay: 0,
      easing: 'linear',
      params: {
        ...params,
        moveMode: nextMode, moveDirection: nextDirection, moveOutside: nextOutside, speed: nextSpeed,
        deltaX: delta.deltaX, deltaY: delta.deltaY,
        startOffsetX: coordinates?.startOffsetX, startOffsetY: coordinates?.startOffsetY,
        startCenterX: coordinates?.startCenterX, startCenterY: coordinates?.startCenterY,
        endCenterX: coordinates?.endCenterX, endCenterY: coordinates?.endCenterY,
      },
    })
  }

  return (
    <MotionCard title="Move" description="Move the item by direction or exact center coordinates." onRemove={onRemove}>
      <Row label="Delay (s)">
        <NumberInput value={startTime} min={0} max={sceneDuration} step={0.1} onChange={value => change({ startTime: Math.max(0, Math.min(sceneDuration, value)) })} />
      </Row>
      <Row label="Mode">
        <select
          value={moveMode}
          onChange={event => change({ moveMode: event.target.value as MovePatch['moveMode'] })}
          className="w-full rounded border border-editor-border bg-editor-elevated-highlight px-2 py-1.5 text-xs text-editor-text"
        >
          <option value="direction">Direction</option>
          <option value="coordinates">Start / End coordinates</option>
        </select>
      </Row>

      {moveMode === 'coordinates' && (
        <div className="rounded border border-editor-border bg-editor-panel/70 px-2 py-2">
          <div className="mb-2 text-[10px] uppercase text-editor-text-secondary">Center coordinates</div>
          <div className="grid grid-cols-2 gap-2">
            <Coordinate label="Start X" value={startCenterX} max={project.width * 2} onChange={value => change({ startCenterX: value })} />
            <Coordinate label="Start Y" value={startCenterY} max={project.height * 2} onChange={value => change({ startCenterY: value })} />
            <Coordinate label="End X" value={endCenterX} max={project.width * 2} onChange={value => change({ endCenterX: value })} />
            <Coordinate label="End Y" value={endCenterY} max={project.height * 2} onChange={value => change({ endCenterY: value })} />
          </div>
          <button
            onClick={() => change({ startCenterX: center.x, startCenterY: center.y })}
            className="mt-2 w-full rounded border border-editor-border bg-editor-elevated-highlight py-1.5 text-[10px] text-[#d9d9d9] transition-colors hover:text-editor-text"
          >
            Use current center as start
          </button>
        </div>
      )}

      <Row label="Direction">
        <select
          value={direction}
          disabled={moveMode === 'coordinates'}
          onChange={event => change({ direction: event.target.value as MoveDirection })}
          className="w-full rounded border border-editor-border bg-editor-elevated-highlight px-2 py-1.5 text-xs text-editor-text disabled:opacity-50"
        >
          {MOVE_DIRECTIONS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </Row>
      <Row label="Speed">
        <Slider value={speed} min={60} max={2000} step={20} display={`${Math.round(speed)} px/s`} onChange={value => change({ speed: value })} />
      </Row>
      <label className="flex items-center gap-2 py-1 text-xs text-editor-text">
        <input type="checkbox" checked={moveOutside} onChange={event => change({ moveOutside: event.target.checked })} className="accent-editor-accent" />
        <span>Item goes outside from scene</span>
      </label>
      <div className="text-[10px] text-editor-text-secondary">
        Delta: {Math.round(params.deltaX ?? 0)}px, {Math.round(params.deltaY ?? 0)}px · Duration: {animation.duration.toFixed(2)}s
      </div>
    </MotionCard>
  )
}

function MotionCard({ title, description, onRemove, children }: {
  title: string
  description: string
  onRemove: () => void
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2 rounded border border-editor-border bg-editor-elevated-highlight/35 p-2">
      <div className="flex items-start justify-between gap-2">
        <div><div className="text-xs font-medium text-editor-text">{title}</div><div className="text-[10px] text-editor-text-secondary">{description}</div></div>
        <button onClick={onRemove} className="flex items-center gap-1 rounded border border-editor-border px-1.5 py-1 text-[10px] text-editor-text-secondary hover:text-red-400">
          <Trash2 size={10} /> Remove
        </button>
      </div>
      {children}
    </section>
  )
}

function Coordinate({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (value: number) => void }) {
  return <label className="text-[10px] text-[#d9d9d9]">{label}<NumberInput value={value} min={-max / 2} max={max} onChange={onChange} /></label>
}
