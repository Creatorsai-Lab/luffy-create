import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { Layer, Shape, Stage } from 'react-konva'
import type Konva from 'konva'
import { getAnimatedProps } from '../../engine/animator'
import { drawBackground } from '../../engine/backgroundRenderer'
import CanvasElement from './CanvasElement'
import GroupPerspective from './GroupPerspective'
import SubtitleOverlay from '../../subtitle/SubtitleOverlay'
import { elementsBox, groupPerspectivePts, warpedGroups } from '../../utils/groups'
import { getVideoClipState } from '../../utils/videoClip'
import { toFileUrl } from '../../utils/pathUtils'
import type { Background, EditorElement, ImageBg, Project, Scene, VideoElement } from '../../types/editor'

/**
 * A read-only stage showing one scene at a moment: the Preview window, and the
 * outgoing scene of a transition in the editor and export. With `keepPlaying`
 * the scene runs on past its end (videos continue into footage after the cut).
 */
export default function SceneStage({
  refSetter,
  project,
  scene,
  localTime,
  globalTime,
  width,
  height,
  scale,
  isPlaying,
  style,
  keepPlaying = false,
  mediaVolume = 1,
  mediaKeySuffix,
  quietLoading = false,
  subtitles = true,
}: {
  refSetter?: (stage: Konva.Stage | null) => void
  project: Project
  scene: Scene
  localTime: number
  globalTime: number
  width: number
  height: number
  scale: number
  isPlaying: boolean
  style?: CSSProperties
  keepPlaying?: boolean
  /** Multiplies the scene's clip sound (fading through a transition). */
  mediaVolume?: number
  /** Gives this copy's videos their own pool / registry keys (`<id><suffix>`). */
  mediaKeySuffix?: string
  quietLoading?: boolean
  subtitles?: boolean
}) {
  const sorted = [...scene.elements].sort((a, b) => a.zIndex - b.zIndex)
  const sceneEnd = keepPlaying ? scene.duration : undefined

  return (
    <div style={{ width: '100%', height: '100%', pointerEvents: 'none', ...style }}>
      <Stage ref={refSetter} width={width} height={height} scaleX={scale} scaleY={scale} listening={false}>
        <Layer listening={false}>
          <SceneBackground bg={scene.background} w={project.width} h={project.height} time={globalTime} />
        </Layer>
        <Layer listening={false}>
          {(() => {
            const shown = (e: EditorElement) => e.visible && (e.type !== 'video' || getVideoClipState(e as VideoElement, localTime, { sceneEnd }).visible)
            const renderElement = (el: EditorElement) => (
              <CanvasElement
                key={el.id}
                element={el}
                animProps={getAnimatedProps(el, localTime)}
                isSelected={false}
                onSelect={noop}
                onDblClick={noop}
                stageScale={scale}
                localTime={localTime}
                sceneWidth={project.width}
                syncVideoToTime
                videoPlaybackActive={isPlaying}
                sceneEnd={sceneEnd}
                mediaVolume={mediaVolume}
                mediaKey={mediaKeySuffix ? `${el.id}${mediaKeySuffix}` : undefined}
                quietLoading={quietLoading}
                globalTime={globalTime}
                sceneDuration={scene.duration}
              />
            )
            // Groups in perspective play as one warped picture, like on the canvas and in export.
            const warped = warpedGroups(scene)
            const drawn = new Set<string>()
            return sorted.filter(shown).map(el => {
              const members = el.groupId ? warped.get(el.groupId) : undefined
              if (!members) return renderElement(el)
              if (drawn.has(el.groupId!)) return null
              drawn.add(el.groupId!)
              const box = elementsBox(members)
              return (
                <GroupPerspective key={`group-perspective-${el.groupId}`} box={box} nodeId={members[0].id} draggable={false}
                  pts={groupPerspectivePts(scene.groups![el.groupId!].perspective!, box)} onPress={noop} onMoved={noop}>
                  {members.filter(shown).map(renderElement)}
                </GroupPerspective>
              )
            })
          })()}
          {subtitles && <SubtitleOverlay project={project} time={globalTime} />}
        </Layer>
      </Stage>
    </div>
  )
}

function noop() {}

export function SceneBackground({ bg, w, h, time }: { bg: Background; w: number; h: number; time: number }) {
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null)
  const bgSrc = bg.type === 'image' ? (bg as ImageBg).src : ''

  useEffect(() => {
    if (!bgSrc) { setBgImage(null); return }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => setBgImage(img)
    img.onerror = () => setBgImage(null)
    img.src = toFileUrl(bgSrc)
  }, [bgSrc])

  const sceneFunc = useCallback((ctx: Konva.Context) => {
    const raw = (ctx as unknown as { _context: CanvasRenderingContext2D })._context
    drawBackground(raw, bg, w, h, time, bgImage)
  }, [bg, w, h, time, bgImage])

  return <Shape width={w} height={h} sceneFunc={sceneFunc} listening={false} />
}
