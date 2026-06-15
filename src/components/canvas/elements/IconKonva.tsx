import { useEffect, useRef, useState } from 'react'
import { Image as KonvaImage, Shape } from 'react-konva'
import type Konva from 'konva'
import type { IconElement, SlideDir } from '../../../types/editor'
import { buildIconSvg, svgToDataUrl } from '../../../engine/iconData'
import { drawPerspectiveWarp } from '../../../engine/perspectiveUtils'

interface Props {
  el: IconElement
  konvaProps: Record<string, unknown>
  textProgress?: number
  wipeProgress?: number
  wipeDir?: SlideDir
}

const imageCache = new Map<string, HTMLImageElement>()

function loadIconImage(iconName: string, color: string, strokeWidth: number): Promise<HTMLImageElement> {
  const key = `${iconName}:${color}:${strokeWidth}`
  if (imageCache.has(key)) return Promise.resolve(imageCache.get(key)!)

  return new Promise(resolve => {
    const svg = buildIconSvg(iconName, color, strokeWidth, 64)
    if (!svg) { resolve(new Image()); return }

    const img = new Image()
    img.onload = () => { imageCache.set(key, img); resolve(img) }
    img.onerror = () => resolve(new Image())
    img.src = svgToDataUrl(svg)
  })
}

export default function IconKonva({ el, konvaProps, textProgress = 1, wipeProgress = 1, wipeDir }: Props) {
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [offscreen, setOffscreen] = useState<HTMLCanvasElement | null>(null)
  const nodeRef = useRef<Konva.Image | null>(null)

  useEffect(() => {
    loadIconImage(el.iconName, el.color, el.strokeWidth).then(img => {
      setImage(img)
      nodeRef.current?.getLayer()?.batchDraw()
    })
  }, [el.iconName, el.color, el.strokeWidth])

  useEffect(() => {
    if (!el.perspectivePts || !image || !image.width) return
    const canvas = document.createElement('canvas')
    canvas.width = el.width; canvas.height = el.height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(image, 0, 0, el.width, el.height)
    setOffscreen(canvas)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image, el.width, el.height, !!el.perspectivePts])

  if (el.perspectivePts && offscreen) {
    return (
      <Shape
        {...konvaProps}
        width={el.width}
        height={el.height}
        hitFunc={(ctx, shape) => {
          ctx.beginPath(); ctx.rect(0, 0, el.width, el.height); ctx.closePath(); ctx.fillStrokeShape(shape)
        }}
        sceneFunc={(ctx, _shape) => {
          const raw = (ctx as unknown as { _context: CanvasRenderingContext2D })._context
          drawPerspectiveWarp(raw, offscreen, el.perspectivePts!, el.width, el.height)
        }}
      />
    )
  }

  const clipProps = (() => {
    if (wipeDir && wipeProgress < 1) {
      // Wipe animation: the clip rectangle grows from the starting edge
      // Direction indicates which side the wipe "enters" from
      // left: wipe enters from left (clip starts at x=0, grows right)
      // right: wipe enters from right (clip starts at x=width*(1-progress), grows left)
      // up: wipe enters from top (clip starts at y=0, grows down)
      // down: wipe enters from bottom (clip starts at y=height*(1-progress), grows up)
      const clipX = wipeDir === 'left' ? el.width * (1 - wipeProgress) : 0
      const clipY = wipeDir === 'up'   ? el.height * (1 - wipeProgress) : 0
      const clipW = (wipeDir === 'left' || wipeDir === 'right') ? el.width * wipeProgress : el.width
      const clipH = (wipeDir === 'up'   || wipeDir === 'down')  ? el.height * wipeProgress : el.height
      return { clipX, clipY, clipWidth: Math.max(0, clipW), clipHeight: Math.max(0, clipH) }
    }
    return {}
  })()

  return (
    <KonvaImage
      ref={nodeRef}
      {...konvaProps}
      {...clipProps}
      image={image ?? undefined}
      width={el.width}
      height={el.height}
    />
  )
}
