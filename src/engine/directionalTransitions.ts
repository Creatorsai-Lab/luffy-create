import type { SlideDir } from '../types/editor'

export type DirectionalTransitionType = 'flashBlur' | 'flickerShake'

export interface DirectionalTransitionState {
  scene: 'from' | 'to'
  offsetX: number
  offsetY: number
  streakX: number
  streakY: number
  light: number
}

export function getDirectionalTransitionState(
  type: DirectionalTransitionType,
  progress: number,
  direction: SlideDir = 'right',
  speed = 1,
  hardness = 50,
): DirectionalTransitionState {
  const p = clamp(progress, 0, 1)
  const rate = clamp(speed, 0.25, 3)
  const force = clamp(hardness, 0, 100) / 100
  const [x, y] = directionVector(direction)
  if (p === 0) return zero('from')
  if (p === 1) return zero('to')

  if (type === 'flashBlur') {
    const peak = Math.pow(Math.sin(Math.PI * p), 0.7 + rate * 0.8)
    const motion = peak * force * (p < 0.5 ? -1 : 1)
    const streak = peak * (0.15 + force * 0.85)
    return {
      scene: p < 0.5 ? 'from' : 'to',
      offsetX: x * motion,
      offsetY: y * motion,
      streakX: x * streak,
      streakY: y * streak,
      light: Math.min(0.94, peak * (0.35 + force * 0.59)),
    }
  }

  const envelope = Math.sin(Math.PI * p)
  const phase = p * Math.PI * 2 * (3 + rate * 3)
  const primary = Math.sin(phase) * envelope * force
  const cross = Math.sin(phase * 1.7 + 1.1) * envelope * force * 0.22
  const pulses = 4 + Math.round(rate * 4)
  return {
    scene: p >= 0.82 || Math.floor(p * pulses) % 2 === 1 ? 'to' : 'from',
    offsetX: x * primary - y * cross,
    offsetY: y * primary + x * cross,
    streakX: 0,
    streakY: 0,
    light: Math.pow(Math.abs(Math.sin(phase * 0.5)), 3) *
      envelope * (0.12 + force * 0.42),
  }
}

function zero(scene: DirectionalTransitionState['scene']): DirectionalTransitionState {
  return { scene, offsetX: 0, offsetY: 0, streakX: 0, streakY: 0, light: 0 }
}

function directionVector(direction: SlideDir): [number, number] {
  if (direction === 'left') return [-1, 0]
  if (direction === 'up') return [0, -1]
  if (direction === 'down') return [0, 1]
  return [1, 0]
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min))
}
