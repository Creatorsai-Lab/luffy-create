import { useRef, useCallback } from 'react'
import type Konva from 'konva'
import { useEditorStore } from '../../store/editorStore'
import type { EditorElement, VideoElement } from '../../types/editor'
import type { AnimatedProps } from '../../engine/animator'
import { getVideoClipState } from '../../utils/videoClip'
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

interface Props {
  element:    EditorElement
  animProps:  ReturnType<typeof import('../../engine/animator').getAnimatedProps> | null
  isSelected: boolean
  onSelect:   (multi: boolean) => void
  onDblClick: () => void
  stageScale: number
  localTime?: number   // scene-local seconds — drives video seeking
  syncVideoToTime?: boolean
  videoPlaybackActive?: boolean
}

export default function CanvasElement({ element, animProps, isSelected, onSelect, onDblClick, stageScale, localTime = 0, syncVideoToTime = true, videoPlaybackActive = false }: Props) {
  const { activeTool, updateElement } = useEditorStore()
  const drawingMode = activeTool === 'handDraw'

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

  const props = {
    id:       element.id,
    x:        rawX + (animOffsetX > 0 ? animOffsetX : (elW / 2) * (1 - animScaleX)),
    y:        rawY + (animOffsetY > 0 ? animOffsetY : (elH / 2) * (1 - animScaleY)),
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
    draggable: !element.locked && !drawingMode && element.type !== 'handDraw',
    listening: !element.locked && !drawingMode,
    onClick:  (e: Konva.KonvaEventObject<MouseEvent>) => onSelect(e.evt.shiftKey),
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

        updateElement(element.id, {
          x:        node.x(),
          y:        node.y(),
          width:    newWidth,
          height:   newHeight,
          rotation: node.rotation(),
          ...(nextPerspectivePts ? { perspectivePts: nextPerspectivePts } : {})
        })

        node.scaleX(1)
        node.scaleY(1)
      }
    }
  }

  const wipeProgress = animProps?.wipeProgress ?? 1
  const wipeDir      = animProps?.wipeDir

  switch (element.type) {
    case 'text':   return <TextKonva   el={element} konvaProps={props} textProgress={animProps?.textProgress ?? 1} textMode={animProps?.textMode} wipeProgress={wipeProgress} wipeDir={wipeDir} textColor={animProps?.textColor} />
    case 'shape':  return <ShapeKonva  el={element} konvaProps={props} wipeProgress={wipeProgress} wipeDir={wipeDir} dashOffset={animProps?.dashOffset ?? 0} localTime={localTime} />
    case 'arrow':  return <ArrowKonva  el={element} konvaProps={props} pathProgress={animProps?.textProgress ?? 1} dashOffset={animProps?.dashOffset ?? 0} />
    case 'code':   return <CodeKonva   el={element} konvaProps={props} />
    case 'image':  return <ImageKonva  el={element} konvaProps={props} textProgress={animProps?.textProgress ?? 1} wipeProgress={wipeProgress} wipeDir={wipeDir} localTime={localTime} />
    case 'table':  return <TableKonva  el={element} konvaProps={props} wipeProgress={wipeProgress} wipeDir={wipeDir} />
    case 'chart':  return <ChartKonva  el={element} konvaProps={props} animProgress={animProps?.chartAnimProgress ?? 1} />
    case 'video': {
      const v = element as VideoElement
      const inClip = getVideoClipState(v, localTime).visible
      return (
        <VideoKonva
          el={v}
          konvaProps={{ ...props, opacity: inClip ? props.opacity : 0, listening: inClip }}
          localTime={localTime}
          syncToTime={syncVideoToTime}
          playbackActive={videoPlaybackActive}
        />
      )
    }
    case 'icon':   return <IconKonva   el={element as import('../../types/editor').IconElement} konvaProps={props} textProgress={animProps?.textProgress ?? 1} wipeProgress={wipeProgress} wipeDir={wipeDir} />
    case 'latex':  return <LatexKonva  el={element as import('../../types/editor').LatexElement} konvaProps={props} textProgress={animProps?.textProgress ?? 1} wipeProgress={wipeProgress} wipeDir={wipeDir} />
    case 'counter': return <CounterKonva el={element as import('../../types/editor').CounterElement} konvaProps={props} localTime={localTime} />
    case 'handDraw': return <HandDrawKonva el={element as import('../../types/editor').HandDrawElement} konvaProps={props} />
    case 'audio':  return null
    default:       return null
  }
}
