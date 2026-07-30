import type { SlideDir, TransitionType } from '../types/editor'

export type DirectionalTransitionType = 'flashBlur' | 'flickerShake'

export interface DirectionalTransitionState {
  scene: 'from' | 'to'
  offsetX: number
  offsetY: number
  streakX: number
  streakY: number
  light: number
}

export interface DirectionalTransitionGeometry {
  dx: number
  dy: number
  streakDx: number
  streakDy: number
  blur: number
  scale: number
}

export function isDirectionalTransition(type: TransitionType): type is DirectionalTransitionType {
  return type === 'flashBlur' || type === 'flickerShake'
}

export function getDirectionalTransitionGeometry(
  type: DirectionalTransitionType,
  state: DirectionalTransitionState,
  width: number,
  height: number,
  hardness: number,
): DirectionalTransitionGeometry {
  const span = Math.min(width, height)
  const travel = span * (type === 'flashBlur' ? 0.12 : 0.025)
  const dx = state.offsetX * travel
  const dy = state.offsetY * travel
  const streakDx = state.streakX * span * (type === 'flashBlur' ? 0.16 : 0.05)
  const streakDy = state.streakY * span * (type === 'flashBlur' ? 0.16 : 0.05)
  const activity = Math.min(1, Math.max(
    Math.abs(state.offsetX), Math.abs(state.offsetY),
    Math.abs(state.streakX), Math.abs(state.streakY), state.light,
  ))
  const blur = type === 'flashBlur'
    ? activity * (5 + clamp(hardness, 0, 100) * 0.18)
    : 0
  const padX = Math.abs(dx) + Math.abs(streakDx) + blur * 2
  const padY = Math.abs(dy) + Math.abs(streakDy) + blur * 2
  return {
    dx,
    dy,
    streakDx,
    streakDy,
    blur,
    scale: 1 + 2 * Math.max(padX / width, padY / height),
  }
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
    const streak = peak * force
    return {
      scene: p < 0.5 ? 'from' : 'to',
      offsetX: cleanZero(x * motion),
      offsetY: cleanZero(y * motion),
      streakX: cleanZero(x * streak),
      streakY: cleanZero(y * streak),
      light: peak * force * 0.94,
    }
  }

  const envelope = Math.sin(Math.PI * p)
  const phase = p * Math.PI * 2 * (3 + rate * 3)
  const primary = Math.sin(phase) * envelope * force
  const cross = Math.sin(phase * 1.7 + 1.1) * envelope * force * 0.22
  const pulses = 4 + Math.round(rate * 4)
  return {
    scene: p >= 0.82 || Math.floor(p * pulses) % 2 === 1 ? 'to' : 'from',
    offsetX: cleanZero(x * primary - y * cross),
    offsetY: cleanZero(y * primary + x * cross),
    streakX: 0,
    streakY: 0,
    light: Math.pow(Math.abs(Math.sin(phase * 0.5)), 3) *
      envelope * force * 0.54,
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

function cleanZero(value: number) {
  return value === 0 ? 0 : value
}
