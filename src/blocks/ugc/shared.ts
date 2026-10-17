/** Small builders shared by the UGC blocks. */
import type { AnimationTiming, AnimationType, EasingType, ElementAnimation, FontWeight, ShapeElement, TextElement } from '../../types/editor'
import { makeAnimation, makeShape, makeText } from '../../utils/defaults'

export const FONT_OPTIONS = ['Montserrat', 'Poppins', 'Inter', 'Bebas Neue', 'Playfair Display', 'Roboto'].map(f => ({ value: f, label: f }))

export function text(key: string, content: string, opts: {
  x: number; y: number; width: number; height: number; fontSize: number; fontFamily: string
  weight?: FontWeight; color?: string; align?: 'left' | 'center' | 'right'; lineHeight?: number
}): TextElement {
  return Object.assign(makeText(opts.x, opts.y), {
    name: key, blockKey: key, content,
    width: opts.width, height: opts.height,
    fontSize: opts.fontSize, fontFamily: opts.fontFamily, fontWeight: opts.weight ?? 'bold',
    color: opts.color ?? '#ffffff', align: opts.align ?? 'left', lineHeight: opts.lineHeight ?? 1.15,
  })
}

export function rect(key: string, opts: { x: number; y: number; width: number; height: number; fill: string; radius?: number; opacity?: number }): ShapeElement {
  return Object.assign(makeShape('rect', opts.x, opts.y), {
    name: key, blockKey: key,
    width: opts.width, height: opts.height, fill: opts.fill,
    stroke: 'transparent', strokeWidth: 0, cornerRadius: opts.radius ?? 0, opacity: opts.opacity ?? 1,
  })
}

export function anim(type: AnimationType, delay: number, duration: number, extra: {
  timing?: AnimationTiming; easing?: EasingType; params?: ElementAnimation['params']
} = {}): ElementAnimation {
  return {
    ...makeAnimation(), type, delay: Math.max(0, delay), duration,
    timing: extra.timing ?? (type.endsWith('Out') ? 'onExit' : 'onEnter'),
    easing: extra.easing ?? 'easeOut',
    params: extra.params,
  }
}

/** The entrance animation of a block's main parts. */
export function entrance(style: string, delay: number, duration = 0.6): ElementAnimation {
  if (style === 'pop') return anim('scaleIn', delay, duration * 0.8, { easing: 'bounce' })
  if (style === 'fade') return anim('fadeIn', delay, duration)
  return anim('slideIn', delay, duration, { params: { direction: 'up', distance: 60 } })
}
