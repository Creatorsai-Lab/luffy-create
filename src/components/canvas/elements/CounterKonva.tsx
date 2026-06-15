import { useEffect, useRef, useState, useMemo } from 'react'
import { Group, Text, Rect } from 'react-konva'
import type Konva from 'konva'
import type { CounterElement } from '../../../types/editor'
import { loadFont } from '../../../utils/fontLoader'

interface Props {
  el: CounterElement
  konvaProps: Record<string, unknown>
  localTime: number   // scene-local seconds for counter animation
}

export default function CounterKonva({ el, konvaProps, localTime }: Props) {
  const nodeRef = useRef<Konva.Text | null>(null)
  const [textH, setTextH] = useState(el.height)
  const [currentValue, setCurrentValue] = useState('')

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

  // Calculate counter value based on local time and speed
  const calculatedValue = useMemo(() => {
    try {
      if (el.mode === 'number') {
        const start = Number(el.start)
        const end = Number(el.end)
        const duration = (end - start) * (el.speedMs / 1000)
        if (duration <= 0) return String(end)
        
        if (localTime >= duration) return String(end)
        
        const progress = localTime / duration
        const current = start + (end - start) * progress
        return String(Math.round(current))
      } else if (el.mode === 'english') {
        const startChar = String(el.start).charCodeAt(0) || 65  // A = 65
        const endChar = String(el.end).charCodeAt(0) || 90    // Z = 90
        
        if (startChar > endChar) return String(el.end)
        
        const totalChars = endChar - startChar
        const duration = totalChars * (el.speedMs / 1000)
        if (duration <= 0) return String(el.end)
        
        if (localTime >= duration) return String(el.end)
        
        const progress = localTime / duration
        const currentCharCode = startChar + Math.round(progress * totalChars)
        return String.fromCharCode(currentCharCode)
      } else if (el.mode === 'hindi') {
        // For Hindi, use simple sequence
        const hindiChars = ['अ', 'आ', 'इ', 'ई', 'उ', 'ऊ', 'ए', 'ऐ', 'ओ', 'औ', 'क', 'ख', 'ग', 'घ', 'ङ', 'च', 'छ', 'ज', 'झ', 'ञ', 'ट', 'ठ', 'ड', 'ढ', 'ण', 'त', 'थ', 'द', 'ध', 'न', 'प', 'फ', 'ब', 'भ', 'म', 'य', 'र', 'ल', 'व', 'श', 'ष', 'स', 'ह', 'क्ष', 'ज्ञ', 'त्र']
        
        const startIndex = hindiChars.indexOf(String(el.start))
        const endIndex = hindiChars.indexOf(String(el.end))
        
        if (startIndex === -1 || endIndex === -1 || startIndex > endIndex) return String(el.end)
        
        const totalChars = endIndex - startIndex
        const duration = totalChars * (el.speedMs / 1000)
        if (duration <= 0) return String(el.end)
        
        if (localTime >= duration) return String(el.end)
        
        const progress = localTime / duration
        const currentIndex = startIndex + Math.round(progress * totalChars)
        return hindiChars[currentIndex]
      }
      
      return String(el.start)
    } catch (e) {
      console.error('Counter calculation error:', e)
      return String(el.start)
    }
  }, [el, localTime])

  const weight = el.fontWeight === 'bold' ? '700' : el.fontWeight === 'semibold' ? '600' : el.fontWeight === 'medium' ? '500' : '400'

  const effectProps = {
    shadowEnabled: (el.shadowBlur ?? 0) > 0,
    shadowColor: el.shadowColor || 'rgba(0,0,0,0.5)',
    shadowBlur: el.shadowBlur ?? 0,
    shadowOffsetX: el.shadowOffsetX ?? 0,
    shadowOffsetY: el.shadowOffsetY ?? 0,
  }

  const textStyleProps = {
    width: el.width,
    fontSize: el.fontSize,
    fontFamily: el.fontFamily,
    fontStyle: el.italic ? 'italic' : '',
    fontWeight: weight,
    fill: el.color,
    align: 'center' as const,
    lineHeight: el.lineHeight,
    perfectDrawEnabled: false,
    ...effectProps,
  }

  // Background rendering (similar to TextKonva)
  const bgEnabled = el.bgEnabled ?? false
  const bgPadX = el.bgPadX ?? 16
  const bgPadY = el.bgPadY ?? 10
  const bgRadius = el.bgRadius ?? 0
  const bgShadowOn = (el.bgShadowBlur ?? 0) > 0 || !!(el.bgShadowOffsetX || el.bgShadowOffsetY)

  return (
    <Group {...(konvaProps as Record<string, unknown>)}>
      {/* Background box (if enabled) - using Rect like TextKonva */}
      {bgEnabled && (
        <Rect
          x={-bgPadX}
          y={-bgPadY}
          width={el.width + bgPadX * 2}
          height={textH + bgPadY * 2}
          fill={el.bgColor || '#000000'}
          opacity={el.bgOpacity ?? 1}
          cornerRadius={bgRadius}
          shadowColor={el.bgShadowColor || '#000000'}
          shadowBlur={el.bgShadowBlur ?? 0}
          shadowOffsetX={el.bgShadowOffsetX ?? 0}
          shadowOffsetY={el.bgShadowOffsetY ?? 0}
          shadowEnabled={bgShadowOn}
          listening={false}
          perfectDrawEnabled={false}
        />
      )}
      
      {/* Foreground text */}
      <Text
        ref={nodeRef}
        {...textStyleProps}
        text={calculatedValue}
      />
    </Group>
  )
}
