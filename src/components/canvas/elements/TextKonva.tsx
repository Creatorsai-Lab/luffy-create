import { useEffect, useRef, useState } from 'react'
import { Text, Group, Shape, Rect } from 'react-konva'
import type Konva from 'konva'
import type { TextElement, SlideDir } from '../../../types/editor'
import { loadFont } from '../../../utils/fontLoader'
import { drawPerspectiveWarp, drawTextToCtx } from '../../../engine/perspectiveUtils'
import {
  getOutlineRevealSourceLayers,
  makeOutlineTextElement,
  outlineRevealStrokeWidth,
} from '../../../engine/textOutlineReveal'
import { hasInnerShadow, innerShadowOrDefault } from '../../../engine/boxShadow'
import { textFillProps } from '../../../engine/textFill'
import { fontWeightToCssValue, fontWeightToKonvaStyle } from '../../../utils/fontWeight'

interface Props {
  el: TextElement
  konvaProps: Record<string, unknown>
  textProgress: number
  textMode?: 'chars' | 'words' | 'bounceWords' | 'outlineReveal' | 'draw'
  wipeProgress?: number
  wipeDir?: SlideDir
  textColor?: string
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

function bounceEase(t: number) {
  const clamped = Math.max(0, Math.min(1, t))
  if (clamped < 0.72) return 1.1 * (1 - Math.pow(1 - clamped / 0.72, 3))
  return 1.1 - 0.1 * (1 - Math.pow(1 - (clamped - 0.72) / 0.28, 2))
}

function clipPolygon(points: Array<[number, number]>) {
  return (ctx: Konva.Context) => {
    ctx.beginPath()
    points.forEach(([x, y], index) => index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y))
    ctx.closePath()
  }
}

function layoutWords(el: TextElement, fontStyle: string) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  ctx.font = `${fontStyle ? `${fontStyle} ` : ''}${el.fontSize}px "${el.fontFamily}"`
  const spaceW = ctx.measureText(' ').width + el.letterSpacing
  const lineH = el.fontSize * el.lineHeight
  const lines: Array<Array<{ text: string; x: number; y: number; width: number }>> = []

  el.content.split('\n').forEach((paragraph, paragraphIndex) => {
    if (paragraphIndex > 0 || lines.length === 0) lines.push([])
    const words = paragraph.split(/\s+/).filter(Boolean)
    let line = lines[lines.length - 1]
    let x = 0
    for (const word of words) {
      const width = ctx.measureText(word).width
      if (line.length > 0 && x + width > el.width) {
        lines.push([])
        line = lines[lines.length - 1]
        x = 0
      }
      line.push({ text: word, x, y: (lines.length - 1) * lineH, width })
      x += width + spaceW
    }
  })

  return lines.flatMap(line => {
    const lineWidth = line.length > 0 ? line[line.length - 1].x + line[line.length - 1].width : 0
    const alignOffset = el.align === 'center' ? (el.width - lineWidth) / 2 : el.align === 'right' ? el.width - lineWidth : 0
    return line.map(word => ({ ...word, x: word.x + alignOffset }))
  })
}

export default function TextKonva({ el, konvaProps, textProgress, textMode, wipeProgress = 1, wipeDir, textColor }: Props) {
  const nodeRef = useRef<Konva.Text | null>(null)
  const [offscreen, setOffscreen] = useState<{
    fill: HTMLCanvasElement
    outline: HTMLCanvasElement
  } | null>(null)
  const perspectiveRevealRef = useRef<HTMLCanvasElement | null>(null)
  const [textH, setTextH] = useState(el.height)
  const effectiveColor = textColor ?? el.color

  // Measure rendered text height so the background box hugs the text vertically.
  useEffect(() => {
    const h = nodeRef.current?.height()
    if (h && Math.abs(h - textH) > 0.5) setTextH(h)
  })

  useEffect(() => {
    loadFont(el.fontFamily, fontWeightToCssValue(el.fontWeight), el.italic).then(() => {
      nodeRef.current?.getLayer()?.batchDraw()
    }).catch(() => {})
  }, [el.fontFamily, el.fontWeight, el.italic])

  useEffect(() => {
    if (!el.perspectivePts) return
    loadFont(el.fontFamily, fontWeightToCssValue(el.fontWeight), el.italic).then(() => {
      const makeCanvas = () => {
        const canvas = document.createElement('canvas')
        canvas.width = el.width
        canvas.height = Math.max(el.height, textH) + el.fontSize * 4
        return canvas
      }
      const fill = makeCanvas()
      const outline = makeCanvas()
      drawTextToCtx({ ...el, color: effectiveColor }, fill.getContext('2d')!)
      drawTextToCtx(makeOutlineTextElement(el, effectiveColor), outline.getContext('2d')!)
      setOffscreen({ fill, outline })
    }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el.content, effectiveColor, el.fontSize, el.fontFamily, el.fontWeight, el.italic, el.align,
      el.lineHeight, el.letterSpacing, el.textStroke, el.textStrokeWidth,
      el.fillMode, el.gradientColor1, el.gradientColor2, el.gradientColor3,
      el.gradientOpacity1, el.gradientOpacity2, el.gradientOpacity3, el.gradientUseColor3,
      el.width, el.height, textH, !!el.perspectivePts])

  const content = (() => {
    if (textMode === 'bounceWords' || textMode === 'outlineReveal') return el.content
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
    fontStyle: [el.italic ? 'italic' : '', fontWeightToKonvaStyle(el.fontWeight)].join(' ').trim(),
    textDecoration: el.underline ? 'underline' : '',
    align: el.align,
    lineHeight: el.lineHeight,
    letterSpacing: el.letterSpacing,
    wrap: 'word' as const,
    perfectDrawEnabled: false,
    ...(textColor ? { fill: effectiveColor } : textFillProps({ ...el, color: effectiveColor }, el.width)),
    ...effectProps,
  }
  const innerShadow = innerShadowOrDefault(el.innerShadow)
  const innerOffset = {
    x: Math.cos((innerShadow.angle * Math.PI) / 180) * innerShadow.distance,
    y: Math.sin((innerShadow.angle * Math.PI) / 180) * innerShadow.distance,
  }
  const textInnerShadowNode = hasInnerShadow(el.innerShadow) ? (
    <Text
      {...textStyleProps}
      text={content}
      x={-innerOffset.x}
      y={-innerOffset.y}
      fill="rgba(0,0,0,0)"
      shadowColor={innerShadow.color}
      shadowBlur={innerShadow.blur}
      shadowOffsetX={innerOffset.x}
      shadowOffsetY={innerOffset.y}
      shadowOpacity={innerShadow.opacity}
      shadowEnabled
      strokeEnabled={false}
      listening={false}
      globalCompositeOperation="source-atop"
      fillPriority="color"
      fillLinearGradientColorStops={undefined}
      fillLinearGradientStartPoint={undefined}
      fillLinearGradientEndPoint={undefined}
    />
  ) : null

  const bounceWordsNode = textMode === 'bounceWords' ? (
    <Group>
      {layoutWords(el, textStyleProps.fontStyle).map((word, index, words) => {
        const stagger = words.length <= 1 ? 0 : index / Math.max(1, words.length - 1) * 0.45
        const local = Math.max(0, Math.min(1, (textProgress - stagger) / 0.55))
        const eased = bounceEase(local)
        const y = word.y + (1 - eased) * 42
        const wordWidth = word.width + el.fontSize
        const wordFillProps = textColor
          ? { fill: effectiveColor, fillPriority: 'color' as const }
          : textFillProps({ ...el, color: effectiveColor }, wordWidth)
        return (
          <Text
            key={`${word.text}-${index}`}
            {...textStyleProps}
            {...wordFillProps}
            text={word.text}
            x={word.x}
            y={y}
            width={wordWidth}
            opacity={Math.min(1, local * 1.4)}
            align="left"
            wrap="none"
          />
        )
      })}
    </Group>
  ) : null

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
          if (textMode !== 'outlineReveal' || textProgress >= 1) {
            drawPerspectiveWarp(raw, offscreen.fill, el.perspectivePts!, el.width, el.height)
            return
          }

          const layers = getOutlineRevealSourceLayers(
            textProgress,
            el.width,
            Math.max(el.height, textH),
            el.fontSize,
          )
          const masked = perspectiveRevealRef.current ?? document.createElement('canvas')
          perspectiveRevealRef.current = masked
          if (masked.width !== offscreen.fill.width) masked.width = offscreen.fill.width
          if (masked.height !== offscreen.fill.height) masked.height = offscreen.fill.height
          const maskedCtx = masked.getContext('2d')!
          maskedCtx.setTransform(1, 0, 0, 1, 0, 0)
          maskedCtx.clearRect(0, 0, masked.width, masked.height)
          maskedCtx.globalCompositeOperation = 'source-over'
          for (const layer of layers) {
            maskedCtx.save()
            maskedCtx.beginPath()
            layer.points.forEach(([x, y], index) =>
              index === 0 ? maskedCtx.moveTo(x, y) : maskedCtx.lineTo(x, y)
            )
            maskedCtx.closePath()
            maskedCtx.clip()
            maskedCtx.globalAlpha = layer.opacity
            maskedCtx.drawImage(offscreen[layer.source], 0, 0)
            maskedCtx.restore()
          }
          drawPerspectiveWarp(raw, masked, el.perspectivePts!, el.width, el.height)
        }}
      />
    )
  }

  if (textMode === 'outlineReveal' && textProgress < 1) {
    const [outlineLayer, fillLayer] = getOutlineRevealSourceLayers(
      textProgress,
      el.width,
      Math.max(el.height, textH),
      el.fontSize,
    )
    const outlineStyleProps = {
      ...textStyleProps,
      fill: 'transparent',
      fillPriority: 'color' as const,
      fillEnabled: false,
      stroke: effectiveColor,
      strokeWidth: outlineRevealStrokeWidth(el.fontSize),
      strokeEnabled: true,
      shadowEnabled: false,
      opacity: 0.55,
    }

    return (
      <Group {...(konvaProps as Record<string, unknown>)}>
        {bgNode}
        <Group clipFunc={clipPolygon(outlineLayer.points)}>
          <Text {...outlineStyleProps} text={content} listening={false} />
        </Group>
        <Group clipFunc={clipPolygon(fillLayer.points)}>
          <Text ref={nodeRef} {...textStyleProps} text={content} />
          {textInnerShadowNode}
        </Group>
      </Group>
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
        {bounceWordsNode ?? <Text ref={nodeRef} {...textStyleProps} text={content} />}
        {textInnerShadowNode}
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
        {bounceWordsNode ?? <Text ref={nodeRef} {...textStyleProps} text={content} />}
        {textInnerShadowNode}
      </Group>
    )
  }

  // Normal: wrap in a Group so the background box can sit behind the text.
  if (bgNode) {
    return (
      <Group {...(konvaProps as Record<string, unknown>)}>
        {bgNode}
        {bounceWordsNode ?? <Text ref={nodeRef} {...textStyleProps} text={content} />}
        {textInnerShadowNode}
      </Group>
    )
  }

  if (textInnerShadowNode) {
    return (
      <Group {...(konvaProps as Record<string, unknown>)}>
        {bounceWordsNode ?? <Text ref={nodeRef} {...textStyleProps} text={content} />}
        {textInnerShadowNode}
      </Group>
    )
  }

  if (bounceWordsNode) {
    return (
      <Group {...(konvaProps as Record<string, unknown>)}>
        {bounceWordsNode}
      </Group>
    )
  }

  return <Text ref={nodeRef} {...konvaProps} {...textStyleProps} text={content} />
}
