import { useEffect, useRef, useState } from 'react'
import { Text, Group, Shape, Rect } from 'react-konva'
import type Konva from 'konva'
import type { TextElement, SlideDir } from '../../../types/editor'
import { loadFont } from '../../../utils/fontLoader'
import { drawPerspectiveWarp, drawTextToCtx } from '../../../engine/perspectiveUtils'

interface Props {
  el: TextElement
  konvaProps: Record<string, unknown>
  textProgress: number
  textMode?: 'chars' | 'words' | 'draw'
  wipeProgress?: number
  wipeDir?: SlideDir
  textColor?: string
}

const WEIGHT_MAP: Record<string, string> = {
  normal: 'normal', medium: '500', semibold: '600', bold: 'bold'
}

function resolveEffectProps(el: TextElement, effectiveColor: string) {
  const effects = el.effects ?? []

  let shadowEnabled  = el.shadowBlur > 0
  let shadowColor    = el.shadowColor || 'rgba(0,0,0,0.5)'
  let shadowBlur     = el.shadowBlur
  let shadowOffsetX  = el.shadowOffsetX
  let shadowOffsetY  = el.shadowOffsetY
  let stroke         = el.textStroke || undefined
  let strokeWidth    = el.textStrokeWidth || 0
  let strokeEnabled  = !!(el.textStroke && el.textStrokeWidth > 0)
  let fillEnabled    = true

  if (effects.includes('shadow')) {
    shadowEnabled = true
    shadowColor   = 'rgba(0,0,0,0.75)'
    shadowBlur    = Math.max(shadowBlur, 15)
    shadowOffsetX = shadowOffsetX || 3
    shadowOffsetY = shadowOffsetY || 3
  }
  if (effects.includes('glow')) {
    shadowEnabled = true
    shadowColor   = effectiveColor
    shadowBlur    = 22
    shadowOffsetX = 0
    shadowOffsetY = 0
  }
  if (effects.includes('outline')) {
    stroke        = stroke || '#000000'
    strokeWidth   = Math.max(strokeWidth, 2)
    strokeEnabled = true
  }
  if (effects.includes('hollow')) {
    fillEnabled   = false
    stroke        = stroke || effectiveColor
    strokeWidth   = Math.max(strokeWidth, 2)
    strokeEnabled = true
  }

  return { shadowEnabled, shadowColor, shadowBlur, shadowOffsetX, shadowOffsetY, stroke, strokeWidth, strokeEnabled, fillEnabled }
}

export default function TextKonva({ el, konvaProps, textProgress, textMode, wipeProgress = 1, wipeDir, textColor }: Props) {
  const nodeRef = useRef<Konva.Text | null>(null)
  const [offscreen, setOffscreen] = useState<HTMLCanvasElement | null>(null)
  const [textH, setTextH] = useState(el.height)
  const effectiveColor = textColor ?? el.color

  // Measure rendered text height so the background box hugs the text vertically.
  useEffect(() => {
    const h = nodeRef.current?.height()
    if (h && Math.abs(h - textH) > 0.5) setTextH(h)
  })

  useEffect(() => {
    const weight = el.fontWeight === 'bold' ? '700' : el.fontWeight === 'semibold' ? '600' : el.fontWeight === 'medium' ? '500' : '400'
    loadFont(el.fontFamily, weight).then(() => {
      nodeRef.current?.getLayer()?.batchDraw()
    }).catch(() => {})
  }, [el.fontFamily, el.fontWeight])

  useEffect(() => {
    if (!el.perspectivePts) return
    const weight = el.fontWeight === 'bold' ? '700' : el.fontWeight === 'semibold' ? '600' : el.fontWeight === 'medium' ? '500' : '400'
    loadFont(el.fontFamily, weight).then(() => {
      const canvas = document.createElement('canvas')
      canvas.width = el.width; canvas.height = el.height + el.fontSize * 4
      drawTextToCtx({ ...el, color: effectiveColor }, canvas.getContext('2d')!)
      setOffscreen(canvas)
    }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el.content, effectiveColor, el.fontSize, el.fontFamily, el.fontWeight, el.italic, el.align,
      el.lineHeight, el.letterSpacing, el.textStroke, el.textStrokeWidth,
      el.width, el.height, !!el.perspectivePts])

  const content = (() => {
    if (textProgress >= 1 || textMode === 'draw') return el.content
    if (textMode === 'words') {
      const words = el.content.split(' ')
      const count = Math.max(1, Math.ceil(words.length * textProgress))
      return words.slice(0, count).join(' ')
    }
    return el.content.slice(0, Math.floor(el.content.length * textProgress))
  })()

  const effectProps = resolveEffectProps(el, effectiveColor)

  const textStyleProps = {
    width: el.width,
    fontSize: el.fontSize,
    fontFamily: el.fontFamily,
    fontStyle: [el.italic ? 'italic' : '', WEIGHT_MAP[el.fontWeight] ?? 'normal'].join(' ').trim(),
    textDecoration: el.underline ? 'underline' : '',
    fill: effectiveColor,
    align: el.align,
    lineHeight: el.lineHeight,
    letterSpacing: el.letterSpacing,
    wrap: 'word' as const,
    perfectDrawEnabled: false,
    ...effectProps,
  }

  // Text background box — sits behind the text, hugs it with padding.
  const bgPadX = el.bgPadX ?? 16
  const bgPadY = el.bgPadY ?? 10
  const bgShadowOn = (el.bgShadowBlur ?? 0) > 0 || !!(el.bgShadowOffsetX || el.bgShadowOffsetY)
  const bgNode = el.bgEnabled ? (
    <Rect
      x={-bgPadX}
      y={-bgPadY}
      width={el.width + bgPadX * 2}
      height={textH + bgPadY * 2}
      fill={el.bgColor || '#000000'}
      opacity={el.bgOpacity ?? 1}
      cornerRadius={el.bgRadius ?? 0}
      shadowColor={el.bgShadowColor || '#000000'}
      shadowBlur={el.bgShadowBlur ?? 0}
      shadowOffsetX={el.bgShadowOffsetX ?? 0}
      shadowOffsetY={el.bgShadowOffsetY ?? 0}
      shadowEnabled={bgShadowOn}
      listening={false}
      perfectDrawEnabled={false}
    />
  ) : null

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
      <Group
        {...(konvaProps as Record<string, unknown>)}
        clipX={clipX}
        clipY={clipY}
        clipWidth={Math.max(0, clipW)}
        clipHeight={Math.max(0, clipH)}
      >
        {bgNode}
        <Text ref={nodeRef} {...textStyleProps} text={content} />
      </Group>
    )
  }

  if (textMode === 'draw' && textProgress < 1) {
    const clipW = Math.max(1, el.width * textProgress)
    return (
      <Group
        {...(konvaProps as Record<string, unknown>)}
        clipX={0}
        clipY={-el.fontSize}
        clipWidth={clipW}
        clipHeight={el.height + el.fontSize * 2}
      >
        {bgNode}
        <Text ref={nodeRef} {...textStyleProps} text={content} />
      </Group>
    )
  }

  // Normal: wrap in a Group so the background box can sit behind the text.
  if (bgNode) {
    return (
      <Group {...(konvaProps as Record<string, unknown>)}>
        {bgNode}
        <Text ref={nodeRef} {...textStyleProps} text={content} />
      </Group>
    )
  }

  return (
    <Text
      ref={nodeRef}
      {...konvaProps}
      {...textStyleProps}
      text={content}
    />
  )
}
