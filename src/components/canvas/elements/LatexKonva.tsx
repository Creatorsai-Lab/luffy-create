import { useEffect, useState } from 'react'
import { Image as KonvaImage, Rect, Text, Group } from 'react-konva'
import type { LatexElement, SlideDir } from '../../../types/editor'
import { renderLatex, latexToDataUrl } from '../../../engine/latexRenderer'

interface Props {
  el: LatexElement
  konvaProps: Record<string, unknown>
  textProgress?: number
  wipeProgress?: number
  wipeDir?: SlideDir
}

export default function LatexKonva({ el, konvaProps, textProgress = 1, wipeProgress = 1, wipeDir }: Props) {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    renderLatex(el.latex, el.color, el.fontSize).then(r => {
      if (cancelled) return
      if (!r) { setImg(null); setError(true); return }
      setError(false)
      const image = new window.Image()
      image.onload = () => { if (!cancelled) setImg(image) }
      image.onerror = () => { if (!cancelled) setError(true) }
      image.src = latexToDataUrl(r.svg)
    })
    return () => { cancelled = true }
  }, [el.latex, el.color, el.fontSize])

  if (error) {
    return (
      <Text {...konvaProps} width={el.width} height={el.height}
        text="LaTeX error" fontSize={16} fill="#ff6666" align="center" />
    )
  }

  if (!img) {
    return <Rect {...konvaProps} width={el.width} height={el.height} fill="transparent" listening />
  }

  const image = <KonvaImage image={img} width={el.width} height={el.height} />

  // Directional wipe reveal (wipeIn / wipeOut)
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
    return (
      <Group {...konvaProps} clipX={clipX} clipY={clipY} clipWidth={Math.max(0, clipW)} clipHeight={Math.max(0, clipH)}>
        {image}
      </Group>
    )
  }

  // Typewriter / draw-style reveal → left-to-right wipe of the equation image
  if (textProgress < 1) {
    return (
      <Group {...konvaProps} clipX={0} clipY={0} clipWidth={Math.max(0, el.width * textProgress)} clipHeight={el.height}>
        {image}
      </Group>
    )
  }

  return <KonvaImage {...konvaProps} image={img} width={el.width} height={el.height} />
}
