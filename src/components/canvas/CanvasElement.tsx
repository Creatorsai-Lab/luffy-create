import type Konva from 'konva'
import { memo } from 'react'
import { useEditorStore } from '../../store/editorStore'
import { isAttachedTo } from '../../utils/connectors'
import type { EditorElement, VideoElement } from '../../types/editor'
import type { AnimatedProps } from '../../engine/animator'
import { getVideoClipState } from '../../utils/videoClip'
import { getCanvasCursor, getCanvasElementInteraction } from '../../utils/canvasInteraction'
import TextKonva   from './elements/TextKonva'
import ShapeKonva  from './elements/ShapeKonva'
import ArrowKonva  from './elements/ArrowKonva'
import CodeKonva   from './elements/CodeKonva'
import ImageKonva  from './elements/ImageKonva'
import TableKonva  from './elements/TableKonva'
import ChartKonva  from './elements/ChartKonva'
import VideoKonva  from './elements/VideoKonva'
import AudioKonva  from './elements/AudioKonva'
import IconKonva   from './elements/IconKonva'
import LatexKonva  from './elements/LatexKonva'
import CounterKonva from './elements/CounterKonva'
import HandDrawKonva from './elements/HandDrawKonva'
import PerspectiveCapture, { CAPTURE_SOURCE_PROPS } from './PerspectiveCapture'
import { cuboidDepth } from '../../engine/shape3d'
import { useShallow } from 'zustand/react/shallow'

const NATIVE_PERSPECTIVE_TYPES = new Set(['shape', 'image', 'video', 'icon'])

interface Props {
  element:    EditorElement
  animProps:  ReturnType<typeof import('../../engine/animator').getAnimatedProps> | null
  isSelected: boolean
  /** On press: multi = Shift (add/remove), member = Ctrl/Alt (just this item, even inside a group). */
  onSelect:   (multi: boolean, member: boolean) => void
  onDblClick: () => void
  stageScale: number
  localTime?: number   // scene-local seconds — drives video seeking
  sceneWidth?: number
  syncVideoToTime?: boolean
  videoPlaybackActive?: boolean
  /** Transitions: the scene keeps playing past this length (its outgoing copy). */
  sceneEnd?: number
  /** Transitions: clip sound multiplier while scenes cross over. */
  mediaVolume?: number
  /** Transitions: key for a second copy of a clip (video pool / registry). */
  mediaKey?: string
  /** Hidden copies draw nothing while their media loads. */
  quietLoading?: boolean
}

/**
 * Re-renders only when what it draws changes: the element, its animation state,
 * zoom, time or video sync. Selection and the click handlers are left out on
 * purpose — nothing drawn depends on them, and the handlers read the store when
 * called. (Re-rendering 1,500 arrows on every selection change was what made
 * big add-ons slow.)
 */
function sameProps(a: Props, b: Props) {
  return a.element === b.element && a.stageScale === b.stageScale &&
    a.localTime === b.localTime && a.sceneWidth === b.sceneWidth && a.syncVideoToTime === b.syncVideoToTime &&
    a.videoPlaybackActive === b.videoPlaybackActive && a.sceneEnd === b.sceneEnd && a.mediaVolume === b.mediaVolume &&
    a.mediaKey === b.mediaKey && a.quietLoading === b.quietLoading && sameAnim(a.animProps, b.animProps)
}

function sameAnim(a: Props['animProps'], b: Props['animProps']) {
  if (a === b) return true
  if (!a || !b) return false
  const ka = Object.keys(a)
  if (ka.length !== Object.keys(b).length) return false
  return ka.every(k => (a as unknown as Record<string, unknown>)[k] === (b as unknown as Record<string, unknown>)[k])
}

export default memo(CanvasElement, sameProps)

function CanvasElement({ element, animProps, isSelected, onSelect, onDblClick, stageScale, localTime = 0, sceneWidth, syncVideoToTime = true, videoPlaybackActive = false, sceneEnd, mediaVolume, mediaKey, quietLoading }: Props) {
  const { activeTool, updateElement } = useEditorStore(useShallow(s => ({ activeTool: s.activeTool, updateElement: s.updateElement })))
  const interaction = getCanvasElementInteraction(activeTool, element.locked, element.type)
  const setCursor = (target: Konva.Node, state: 'canvas' | 'selected' | 'dragging', movable = interaction.draggable) => {
    const container = target.getStage()?.container()
    if (container) container.style.cursor = getCanvasCursor(activeTool, state, movable)
  }

  // Animation-driven scale from center: adjust x/y so the element scales around its center,
  // not the Konva default of top-left corner.
  // When offsetX/offsetY are set (e.g. rotateLoop), use Konva's offset system instead.
  const animScaleX  = animProps?.scaleX  ?? 1
  const animScaleY  = animProps?.scaleY  ?? 1
  const animOffsetX = animProps?.offsetX ?? 0
  const animOffsetY = animProps?.offsetY ?? 0
  const elW = 'width'  in element ? (element as { width:  number }).width  : 0
  const elH = 'height' in element ? (element as { height: number }).height : 0
  const rawX = animProps?.x ?? element.x
  const rawY = animProps?.y ?? element.y

  const scaleBaseX = element.type === 'arrow' ? element.x + elW / 2 : elW / 2
  const scaleBaseY = element.type === 'arrow' ? element.y + elH / 2 : elH / 2
  const props = {
    id:       element.id,
    x:        rawX + (animOffsetX > 0 ? animOffsetX : scaleBaseX * (1 - animScaleX)),
    y:        rawY + (animOffsetY > 0 ? animOffsetY : scaleBaseY * (1 - animScaleY)),
    offsetX:  animOffsetX,
    offsetY:  animOffsetY,
    opacity:  animProps?.opacity  ?? element.opacity,
    scaleX:   element.type === 'text'
      ? animScaleX * ((element as import('../../types/editor').TextElement).stretchX ?? 1)
      : animScaleX,
    scaleY:   element.type === 'text'
      ? animScaleY * ((element as import('../../types/editor').TextElement).stretchY ?? 1)
      : animScaleY,
    rotation: animProps?.rotation ?? element.rotation,
    draggable: interaction.draggable,
    listening: interaction.listening,
    // Select on press (left button only), before a drag can start, so dragging a
    // group member drags the whole group. Right-click keeps the selection.
    onMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (e.evt.button !== 0) return
      onSelect(e.evt.shiftKey, e.evt.ctrlKey || e.evt.metaKey || e.evt.altKey)
      setCursor(e.target, 'selected')
    },
    onMouseEnter: (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (useEditorStore.getState().selectedIds.includes(element.id)) setCursor(e.target, 'selected')
    },
    onMouseLeave: (e: Konva.KonvaEventObject<MouseEvent>) => setCursor(e.target, 'canvas', false),
    onDragStart: (e: Konva.KonvaEventObject<DragEvent>) => setCursor(e.target, 'dragging'),
    // Arrows attached to this element follow it while it is dragged, not only on drop.
    onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => {
      if (element.type === 'arrow') return
      const { project, currentSceneId } = useEditorStore.getState()
      const scene = project?.scenes.find(sc => sc.id === currentSceneId)
      if (scene?.elements.some(other => isAttachedTo(other, element.id))) {
        updateElement(element.id, { x: e.target.x(), y: e.target.y() })
      }
    },
    onDblClick,
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
      if (element.type === 'arrow') {
        const el = element as import('../../types/editor').ArrowElement
        const dx = e.target.x(), dy = e.target.y()
        e.target.x(0); e.target.y(0)
        updateElement(element.id, { x1: el.x1 + dx, y1: el.y1 + dy, x2: el.x2 + dx, y2: el.y2 + dy })
      } else {
        updateElement(element.id, { x: e.target.x(), y: e.target.y() })
      }
      setCursor(e.target, 'selected')
    },
    onTransformEnd: (e: Konva.KonvaEventObject<Event>) => {
      const node = e.target
      const scaleX = node.scaleX()
      const scaleY = node.scaleY()
      
      if (element.type === 'arrow') {
        const el = element as import('../../types/editor').ArrowElement
        const dx = node.x(), dy = node.y()
        const sX = scaleX, sY = scaleY
        const rot = node.rotation() * Math.PI / 180
        const transform = (px: number, py: number) => ({
          x: dx + (px * sX) * Math.cos(rot) - (py * sY) * Math.sin(rot),
          y: dy + (px * sX) * Math.sin(rot) + (py * sY) * Math.cos(rot),
        })
        const p1 = transform(el.x1, el.y1), p2 = transform(el.x2, el.y2)
        node.x(0); node.y(0); node.scaleX(1); node.scaleY(1); node.rotation(0)
        updateElement(element.id, { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y })
      } else {
        // node.width() returns 0 for custom Shape / Group nodes.
        // Use the element's stored dimensions as the base instead.
        const baseW = 'width'  in element ? (element as { width: number }).width  : node.width()
        const baseH = 'height' in element ? (element as { height: number }).height : node.height()
        const newWidth  = Math.max(10, Math.abs(baseW * scaleX))
        const newHeight = Math.max(10, Math.abs(baseH * scaleY))
        const nextPerspectivePts = element.perspectivePts
          ? {
              tl: [element.perspectivePts.tl[0] * (newWidth / baseW), element.perspectivePts.tl[1] * (newHeight / baseH)] as [number, number],
              tr: [element.perspectivePts.tr[0] * (newWidth / baseW), element.perspectivePts.tr[1] * (newHeight / baseH)] as [number, number],
              br: [element.perspectivePts.br[0] * (newWidth / baseW), element.perspectivePts.br[1] * (newHeight / baseH)] as [number, number],
              bl: [element.perspectivePts.bl[0] * (newWidth / baseW), element.perspectivePts.bl[1] * (newHeight / baseH)] as [number, number],
            }
          : undefined

        // A corner drag scales a cuboid uniformly, so its depth scales too;
        // an edge drag changes only width or height.
        const isCuboid = element.type === 'shape' && element.shapeType === 'cube'
        const uniformScale = Math.abs(Math.abs(scaleX) - Math.abs(scaleY)) < 1e-3

        updateElement(element.id, {
          x:        node.x(),
          y:        node.y(),
          width:    newWidth,
          height:   newHeight,
          rotation: node.rotation(),
          ...(nextPerspectivePts ? { perspectivePts: nextPerspectivePts } : {}),
          ...(isCuboid && uniformScale ? { depth3d: cuboidDepth(element) * Math.abs(scaleX) } : {}),
        })

        node.scaleX(1)
        node.scaleY(1)
      }
    }
  }

  const wipeProgress = animProps?.wipeProgress ?? 1
  const wipeDir      = animProps?.wipeDir

  const content = (p: Record<string, unknown>) => {
    switch (element.type) {
      case 'text':   return <TextKonva   el={element} konvaProps={p} textProgress={animProps?.textProgress ?? 1} textMode={animProps?.textMode} wipeProgress={wipeProgress} wipeDir={wipeDir} textColor={animProps?.textColor} />
      // A colour pulse ("flash") recolours a shape's fill and an arrow's line.
      case 'shape':  return <ShapeKonva  el={animProps?.textColor ? { ...element, fill: animProps.textColor } : element} konvaProps={p} wipeProgress={wipeProgress} wipeDir={wipeDir} dashOffset={animProps?.dashOffset ?? 0} localTime={localTime} />
      case 'arrow':  return <ArrowKonva  el={animProps?.textColor ? { ...element, stroke: animProps.textColor, arrowHeadColor: animProps.textColor } : element} konvaProps={p} pathProgress={animProps?.textProgress ?? 1} dashOffset={animProps?.dashOffset ?? 0} />
      case 'code':   return <CodeKonva   el={element} konvaProps={p} localTime={localTime} sceneWidth={sceneWidth} />
      case 'image':  return <ImageKonva  el={element} konvaProps={p} textProgress={animProps?.textProgress ?? 1} wipeProgress={wipeProgress} wipeDir={wipeDir} localTime={localTime} />
      case 'table':  return <TableKonva  el={element} konvaProps={p} wipeProgress={wipeProgress} wipeDir={wipeDir} />
      case 'chart':  return <ChartKonva  el={element} konvaProps={p} animProgress={animProps?.chartAnimProgress ?? 1} />
      case 'video': {
        const v = element as VideoElement
        const inClip = getVideoClipState(v, localTime, { sceneEnd }).visible
        return (
          <VideoKonva
            el={v}
            konvaProps={{ ...p, opacity: inClip ? p.opacity : 0, listening: interaction.listening && inClip }}
            localTime={localTime}
            syncToTime={syncVideoToTime}
            playbackActive={videoPlaybackActive}
            sceneEnd={sceneEnd}
            volumeScale={mediaVolume}
            mediaKey={mediaKey}
            quietLoading={quietLoading}
          />
        )
      }
      case 'icon':   return <IconKonva   el={element as import('../../types/editor').IconElement} konvaProps={p} textProgress={animProps?.textProgress ?? 1} wipeProgress={wipeProgress} wipeDir={wipeDir} />
      case 'latex':  return <LatexKonva  el={element as import('../../types/editor').LatexElement} konvaProps={p} textProgress={animProps?.textProgress ?? 1} wipeProgress={wipeProgress} wipeDir={wipeDir} />
      case 'counter': return <CounterKonva el={element as import('../../types/editor').CounterElement} konvaProps={p} localTime={localTime} />
      case 'handDraw': return <HandDrawKonva el={element as import('../../types/editor').HandDrawElement} konvaProps={p} />
      case 'audio':  return null
      default:       return null
    }
  }

  // Shapes, images, videos and icons draw their own perspective warp. Every other
  // visual type gets perspective by capturing its normal rendering.
  if (element.perspectivePts && !NATIVE_PERSPECTIVE_TYPES.has(element.type) &&
      element.type !== 'arrow' && element.type !== 'audio') {
    return <PerspectiveCapture el={element} konvaProps={props}>{content(CAPTURE_SOURCE_PROPS)}</PerspectiveCapture>
  }
  return content(props)
}
