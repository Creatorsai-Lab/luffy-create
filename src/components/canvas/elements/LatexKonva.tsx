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
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    renderLatex(el.latex, el.color, el.fontSize).then(r => {
      if (cancelled) return
      if (!r) { setImg(null); setError(true); return }
      setError(false)
      setNatural({ width: r.width, height: r.height })
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
    return <Rect {...konvaProps} width={el.width} height={el.height} fill="transparent" />
  }

  // Where the equation is drawn inside the box: the whole box (classic), or —
  // with `fitContent` (blocks) — its natural size, shrunk only to fit, never stretched.
  let dx = 0, dy = 0, dw = el.width, dh = el.height
  if (el.fitContent && natural) {
    const scale = Math.min(1, el.width / natural.width, el.height / natural.height)
    dw = natural.width * scale
    dh = natural.height * scale
    dx = el.contentAlign === 'left' ? 0 : (el.width - dw) / 2
    dy = (el.height - dh) / 2
  }
  const image = <KonvaImage image={img} x={dx} y={dy} width={dw} height={dh} />
  // An invisible rect keeps the whole box clickable and selectable.
  const hitBox = <Rect width={el.width} height={el.height} fill="transparent" />

  // Directional wipe reveal (wipeIn / wipeOut): the clip grows from the entering edge.
  if (wipeDir && wipeProgress < 1) {
    const clipX = dx + (wipeDir === 'left' ? dw * (1 - wipeProgress) : 0)
    const clipY = dy + (wipeDir === 'up' ? dh * (1 - wipeProgress) : 0)
    const clipW = (wipeDir === 'left' || wipeDir === 'right') ? dw * wipeProgress : dw
    const clipH = (wipeDir === 'up' || wipeDir === 'down') ? dh * wipeProgress : dh
    return (
      <Group {...konvaProps}>
        {hitBox}
        <Group clipX={clipX} clipY={clipY} clipWidth={Math.max(0, clipW)} clipHeight={Math.max(0, clipH)}>{image}</Group>
      </Group>
    )
  }

  // Typewriter / draw-style reveal → left-to-right wipe of the equation image
  if (textProgress < 1) {
    return (
      <Group {...konvaProps}>
        {hitBox}
        <Group clipX={dx} clipY={dy} clipWidth={Math.max(0, dw * textProgress)} clipHeight={dh}>{image}</Group>
      </Group>
    )
  }

  return <Group {...konvaProps}>{hitBox}{image}</Group>
}
